import { createHash, randomBytes, randomUUID } from "node:crypto";
import { emailAddress } from "./config.mjs";
import { renderPage } from "./views.mjs";

const challengeLifetime = 10 * 60_000;
const sessionLifetime = 14 * 24 * 60 * 60_000;
const tokenFormat = /^[A-Za-z0-9_-]{43}$/;
const makeToken = () => randomBytes(32).toString("base64url");
const digest = (value) => createHash("sha256").update(value).digest("base64url");

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
  const user = record && state.users.find((item) => item.id === record.userId);
  if (!user) return null;
  return { key, userId: user.id, role: user.role, email: user.email, csrf: record.csrf };
}

function startSession(config, state, { email, method, subject }) {
  const now = Date.now();
  let user = state.users.find((item) => item.signupMethod === method && item.subject === subject);
  if (user) {
    state.signIns.push({ userId: user.id, method, occurredAt: new Date(now).toISOString() });
  } else {
    // A second provider does not silently take ownership of an existing account.
    if (state.users.some((item) => item.email === email)) return null;
    if (method === "google" && email === config.ownerEmail) return null;
    const role = method === "email" && email === config.ownerEmail &&
      !state.users.some((item) => item.role === "owner") ? "owner" : "customer";
    user = { id: randomUUID(), email, role, signupMethod: method, subject, verifiedAt: new Date(now).toISOString() };
    state.users.push(user);
  }
  const token = makeToken();
  state.sessions = state.sessions.filter((session) => session.expiresAt > now);
  state.sessions.push({ key: digest(token), userId: user.id, csrf: makeToken(), expiresAt: now + sessionLifetime });
  return authCookie(config, "session", token, sessionLifetime);
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
  async function beginEmail(request, input) {
    const email = emailAddress(input.get("email"));
    if (!email) return null;
    const token = makeToken();
    const browserToken = readCookie(config, request, "email") ?? makeToken();
    const key = digest(token);
    const now = Date.now();
    const reserved = await store.update((state) => reserveChallenge(state, {
      kind: "email", key, email, browser: digest(browserToken), createdAt: now,
      expiresAt: now + challengeLifetime, delivery: { status: "pending" },
    }));
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
      const entry = takeChallenge(state, "email", digest(token), digest(browser));
      if (!entry || entry.delivery.status === "failed") return null;
      return startSession(config, state, { email: entry.email, method: "email", subject: entry.email });
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
    return store.update((state) => startSession(config, state, { email, method: "google", subject: identity.subject }));
  }

  async function signout(session) {
    await store.update((state) => {
      state.sessions = state.sessions.filter((entry) => entry.key !== session.key);
    });
    return authCookie(config, "session", "", 0);
  }

  return { beginEmail, emailPage, verifyEmail, beginGoogle, verifyGoogle, signout };
}
