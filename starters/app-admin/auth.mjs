import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { emailAddress } from "./config.mjs";
import { hashPassword, matchesPassword, normalizePassword, passwordThrottle } from "./passwords.mjs";
import { renderPage } from "./views.mjs";

const challengeLifetime = 10 * 60_000;
const sessionLifetime = 14 * 24 * 60 * 60_000;
const tokenFormat = /^[A-Za-z0-9_-]{43}$/;
const makeToken = () => randomBytes(32).toString("base64url");
const digest = (value) => createHash("sha256").update(value).digest("base64url");

export function appAccounts(state) {
  // A mailbox proven by another account takes precedence without inheriting an unverified password.
  const confirmed = new Set(state.users.map((user) => user.email));
  return [...state.users, ...(state.passwordRegistrations ?? []).filter((user) => !confirmed.has(user.email))];
}

function passwordRegistration(email, passwordHash, role = "customer") {
  return { id: randomUUID(), email, role, signupMethod: "email", subject: email, passwordHash, verifiedAt: null };
}

function rollbackOwners(state) {
  const verified = state.users.find((user) => user.role === "owner");
  const provisioned = state.passwordRegistrations?.find((user) => user.role === "owner");
  return verified && provisioned ? { verified, provisioned } : null;
}

function reconcileOwner(state) {
  const owners = rollbackOwners(state);
  if (!owners) return state;
  const { verified, provisioned } = owners;
  if (verified.email !== provisioned.email) throw new Error("The verified and provisioned owner addresses differ.");
  const replacedId = verified.id;
  const ownerId = provisioned.id;
  // The older release could verify the same mailbox under a second owner ID.
  verified.id = ownerId;
  verified.passwordHash = provisioned.passwordHash;
  state.passwordRegistrations = state.passwordRegistrations.filter((user) => user.id !== ownerId);
  for (const record of [...state.sessions, ...state.signIns, ...state.submissions]) {
    if (record.userId === replacedId) record.userId = ownerId;
  }
  for (const submission of state.submissions) {
    if (submission.lead.assigneeId === replacedId) submission.lead.assigneeId = ownerId;
  }
  return state;
}

export async function initializeOwnerPassword(config, store) {
  const state = await store.read();
  const reconciled = rollbackOwners(state) ? await store.update(reconcileOwner) : state;
  if (!config.ownerPasswordFile) return;
  const findOwner = (state) => appAccounts(state).find((user) => user.role === "owner");
  const owner = findOwner(reconciled);
  if (owner && owner.email !== config.ownerEmail) throw new Error("The configured owner differs from the existing app owner.");
  if (owner?.passwordHash) return;
  const password = normalizePassword((await readFile(config.ownerPasswordFile, "utf8")).replace(/\r?\n$/, ""));
  if (!password) throw new Error("The owner password file must contain a password of 15 to 128 characters.");
  const passwordHash = await hashPassword(password);
  await store.update((state) => {
    const current = findOwner(state);
    if (current) {
      if (current.email !== config.ownerEmail) throw new Error("The configured owner differs from the existing app owner.");
      current.passwordHash ??= passwordHash;
      return;
    }
    if (appAccounts(state).some((user) => user.email === config.ownerEmail)) {
      throw new Error("The configured owner address is already used by another app account.");
    }
    (state.passwordRegistrations ??= []).push(passwordRegistration(config.ownerEmail, passwordHash, "owner"));
  });
}

function cookieName(config, kind) {
  return `${config.origin.startsWith("https:") ? "__Host-" : ""}bapx-app-${kind}`;
}

function readCookie(config, request, kind) {
  const name = cookieName(config, kind);
  const matches = (request.headers.cookie ?? "").split(";").map((cookie) => cookie.trim())
    .filter((cookie) => cookie.startsWith(`${name}=`));
  const value = matches[0]?.slice(name.length + 1);
  return matches.length === 1 && tokenFormat.test(value) ? value : null;
}

function authCookie(config, kind, token, lifetime) {
  const secure = config.origin.startsWith("https:") ? "; Secure" : "";
  return `${cookieName(config, kind)}=${token}; Path=/; Max-Age=${Math.floor(lifetime / 1000)}; HttpOnly; SameSite=Lax${secure}`;
}

export function sessionFor(config, request, state) {
  const token = readCookie(config, request, "session");
  if (!token) return null;
  const key = digest(token);
  const record = state.sessions.find((session) => session.key === key && session.expiresAt > Date.now());
  const user = record && appAccounts(state).find((item) => item.id === record.userId);
  if (!user) return null;
  return { key, userId: user.id, role: user.role, email: user.email, csrf: record.csrf, emailVerified: Boolean(user.verifiedAt) };
}

function issueSession(config, state, user, method) {
  const now = Date.now();
  if (method) {
    state.signIns.push({ userId: user.id, method, occurredAt: new Date(now).toISOString() });
  }
  const token = makeToken();
  state.sessions = state.sessions.filter((session) => session.expiresAt > now);
  state.sessions.push({ key: digest(token), userId: user.id, csrf: makeToken(), expiresAt: now + sessionLifetime });
  return authCookie(config, "session", token, sessionLifetime);
}

function startVerifiedSession(config, state, { email, method, subject }) {
  const user = state.users.find((item) => item.signupMethod === method && item.subject === subject);
  if (user) return issueSession(config, state, user, method);
  if (state.users.some((item) => item.email === email)) return null;
  const owner = appAccounts(state).find((item) => item.role === "owner");
  if ((owner && owner.email === email) || (method === "google" && email === config.ownerEmail)) return null;
  const role = !owner && method === "email" && email === config.ownerEmail ? "owner" : "customer";
  const verified = { id: randomUUID(), email, role, signupMethod: method, subject, verifiedAt: new Date().toISOString() };
  state.users.push(verified);
  return issueSession(config, state, verified);
}

function takeChallenge(state, kind, key, browser) {
  const challenge = state.challenges.find((entry) => entry.kind === kind && entry.key === key);
  if (!challenge || challenge.browser !== browser || challenge.used || challenge.expiresAt <= Date.now()) return null;
  challenge.used = true;
  return challenge;
}

function reserveChallenge(state, entry) {
  state.challenges = state.challenges.filter((challenge) => challenge.expiresAt > entry.createdAt);
  const providerEntries = state.challenges.filter((challenge) => challenge.kind === entry.kind);
  const recent = providerEntries.filter((challenge) => challenge.createdAt > entry.createdAt - 60_000);
  if (providerEntries.length >= 500 || recent.length >= 50 ||
      providerEntries.filter((challenge) => challenge.browser === entry.browser).length >= 5 ||
      (entry.email && recent.some((challenge) => challenge.email === entry.email))) return false;
  state.challenges.push(entry);
  return true;
}

export function authHandlers({ config, store, sendEmail, google }) {
  const throttle = passwordThrottle();

  async function passwordAuth(input, signup) {
    const email = emailAddress(input.get("email"));
    const password = normalizePassword(input.get("password"));
    if (!email || !password) return { invalid: true };
    return throttle.run(email, async () => {
      if (signup) {
        const passwordHash = await hashPassword(password);
        return store.update((state) => {
          if (email === config.ownerEmail || appAccounts(state).some((user) => user.email === email)) return {};
          const user = passwordRegistration(email, passwordHash);
          (state.passwordRegistrations ??= []).push(user);
          return { cookie: issueSession(config, state, user) };
        });
      }
      const user = appAccounts(await store.read()).find((item) => item.email === email);
      if (!await matchesPassword(password, user?.passwordHash)) return {};
      return store.update((state) => {
        const active = appAccounts(state).find((item) => item.id === user.id);
        if (!active || active.passwordHash?.key !== user.passwordHash.key) return {};
        return { cookie: issueSession(config, state, active, "password") };
      });
    });
  }

  async function beginEmail(request, input) {
    const email = emailAddress(input.get("email"));
    if (!email) return null;
    const token = makeToken();
    const browserToken = readCookie(config, request, "email") ?? makeToken();
    const key = digest(token);
    const now = Date.now();
    const reserved = await store.update((state) => {
      const session = sessionFor(config, request, state);
      const verification = session && !session.emailVerified && session.email === email && input.get("_csrf") === session.csrf;
      if (!verification && session) return false;
      return reserveChallenge(state, {
        kind: verification ? "email-password-verification" : "email", key, email,
        browser: digest(browserToken), createdAt: now,
        expiresAt: now + challengeLifetime, delivery: { status: "pending" },
        ...(verification ? { verificationSession: session.key } : {}),
      });
    });
    if (reserved) {
      let delivery;
      try {
        const providerId = await sendEmail({ email, link: `${config.origin}/auth/email/verify?token=${token}` });
        delivery = { status: "accepted", providerId };
      } catch {
        delivery = { status: "failed" };
      }
      await store.update((state) => {
        const entry = state.challenges.find((challenge) => challenge.key === key);
        if (entry) entry.delivery = delivery;
      });
    }
    return authCookie(config, "email", browserToken, challengeLifetime);
  }

  function emailPage(request, token) {
    if (!tokenFormat.test(token) || !readCookie(config, request, "email")) return null;
    return renderPage("Confirm your email", `<main><h1>Confirm your email</h1>
      <form method="post" action="/auth/email/verify">
      <input type="hidden" name="token" value="${token}">
      <button>Confirm and continue</button></form></main>`);
  }

  async function verifyEmail(request, input) {
    const token = input.get("token");
    const browser = readCookie(config, request, "email");
    if (!tokenFormat.test(token) || !browser) return null;
    return store.update((state) => {
      const key = digest(token);
      const browserKey = digest(browser);
      const entry = takeChallenge(state, "email-password-verification", key, browserKey) ??
        takeChallenge(state, "email", key, browserKey);
      if (!entry || entry.delivery.status === "failed") return null;
      if (entry.verificationSession) {
        const session = sessionFor(config, request, state);
        if (!session || session.key !== entry.verificationSession || session.emailVerified) return null;
        const index = state.passwordRegistrations?.findIndex((user) => user.id === session.userId && user.email === entry.email) ?? -1;
        if (index < 0) return null;
        const [user] = state.passwordRegistrations.splice(index, 1);
        user.verifiedAt = new Date().toISOString();
        state.users.push(user);
        return { verified: true };
      }
      const cookie = startVerifiedSession(config, state, { email: entry.email, method: "email", subject: entry.email });
      return cookie ? { cookie } : null;
    });
  }

  async function beginGoogle(request) {
    if (!google) return null;
    const stateToken = makeToken();
    const browserToken = readCookie(config, request, "google") ?? makeToken();
    const verifier = makeToken();
    const nonce = makeToken();
    const now = Date.now();
    const accepted = await store.update((state) => reserveChallenge(state, {
      kind: "google", key: digest(stateToken), verifier, nonce, browser: digest(browserToken),
      createdAt: now, expiresAt: now + challengeLifetime,
    }));
    if (!accepted) return null;
    return { location: google.start({ state: stateToken, nonce, challenge: digest(verifier) }),
      cookie: authCookie(config, "google", browserToken, challengeLifetime) };
  }

  async function verifyGoogle(request, query) {
    const stateToken = query.get("state");
    const code = query.get("code");
    const browser = readCookie(config, request, "google");
    if (!google || !tokenFormat.test(stateToken) || !code || code.length > 4096 || !browser) return null;
    const entry = await store.update((state) => takeChallenge(state, "google", digest(stateToken), digest(browser)));
    if (!entry) return null;
    let identity;
    try {
      identity = await google.verify({ code, verifier: entry.verifier, nonce: entry.nonce });
    } catch {
      return null;
    }
    const email = emailAddress(identity?.email);
    if (!email || !identity.subject) return null;
    return store.update((state) => startVerifiedSession(config, state, { email, method: "google", subject: identity.subject }));
  }

  async function signout(session) {
    await store.update((state) => {
      state.sessions = state.sessions.filter((entry) => entry.key !== session.key);
    });
    return authCookie(config, "session", "", 0);
  }

  return { passwordAuth, beginEmail, emailPage, verifyEmail, beginGoogle, verifyGoogle, signout };
}
