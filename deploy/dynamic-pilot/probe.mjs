import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { request } from "node:https";
import { setTimeout } from "node:timers/promises";

const origin = new URL(process.env.APP_ORIGIN);
const ca = await readFile("/tls/cert.pem");
const client = new Map();
const email = "owner@example.test";
const enquiry = "Disposable HTTPS enquiry survives replacement.";
const phase = process.argv[2];
const expected = process.env.EXPECTED_REVISION;
const proofPath = "/fixture-data/probe.json";

function send(path, { body, host = origin.host, requestOrigin = origin.origin } = {}) {
  const form = body && new URLSearchParams(body).toString();
  const cookies = [...client].map(([name, token]) => `${name}=${token}`);
  const headers = {
    Host: host,
    Cookie: ["__Host-bapx-admin=synthetic-platform-cookie", ...cookies].join("; "),
    Authorization: "Bearer synthetic-platform-token",
    "Proxy-Authorization": "Bearer synthetic-proxy-token",
    Forwarded: "host=unrelated.example.test",
    ...(form && {
      Origin: requestOrigin,
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(form),
    }),
  };
  return new Promise((resolve, reject) => {
    const req = request({
      host: "edge", port: origin.port, servername: origin.hostname, ca,
      path, method: form ? "POST" : "GET", headers,
    }, (response) => {
      let html = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { html += chunk; });
      response.on("error", reject);
      response.on("end", () => {
        for (const value of response.headers["set-cookie"] ?? []) {
          const [name, token] = value.split(";")[0].split("=");
          if (token) client.set(name, token);
          else client.delete(name);
        }
        resolve({ code: response.statusCode, html, headers: response.headers });
      });
    });
    req.setTimeout(3000, () => req.destroy(new Error(`HTTPS fixture timed out at ${path.split("?")[0]}`)));
    req.on("error", reject);
    req.end(form);
  });
}

async function ready() {
  for (let attempt = 0; attempt < 45; attempt++) {
    try {
      const health = await send("/healthz");
      if (health.code === 204 && health.headers["x-bapx-fixture-revision"] === expected) {
        if (phase === "upgrade" || phase === "restart") {
          assert.equal(health.headers["x-bapx-app-revision"], expected, "Unexpected application revision");
        }
        return;
      }
    } catch (error) {
      if (error.code !== "ECONNREFUSED" && error.code !== "ECONNRESET") throw error;
    }
    await setTimeout(200);
  }
  throw new Error("Isolated HTTPS route did not become ready");
}

function hidden(html, name) {
  const value = html.match(new RegExp(`name="${name}" value="([^"]+)"`))?.[1];
  assert.ok(value, `Expected ${name} input`);
  return value;
}

function secureCookie(response, kind) {
  const value = response.headers["set-cookie"]?.find((cookie) => cookie.startsWith(`__Host-bapx-app-${kind}=`));
  assert.ok(value, `Expected app ${kind} cookie`);
  assert.match(value, /; Path=\//);
  assert.match(value, /; HttpOnly(?:;|$)/);
  assert.match(value, /; SameSite=Lax(?:;|$)/);
  assert.match(value, /; Secure(?:;|$)/);
  assert.doesNotMatch(value, /; Domain=/i);
}

const upgradedEnquiry = "Candidate writes persist through rollback.";

async function submit(message) {
  const home = await send("/");
  assert.equal(home.code, 200);
  const created = await send("/forms/enquiry", { body: {
    _csrf: hidden(home.html, "_csrf"), _revision: hidden(home.html, "_revision"),
    name: "Disposable sample", email, message,
  } });
  assert.equal(created.code, 303);
  const admin = await send("/admin");
  assert.equal(admin.code, 200);
  const paths = [...admin.html.matchAll(/href="(\/admin\?submission=[^"]+)#original-submission"/g)];
  for (const [, path] of paths) {
    if ((await send(path)).html.includes(message)) return path;
  }
  throw new Error("Missing stored enquiry link");
}

async function assertEnquiry(path, message) {
  const response = await send(path);
  assert.equal(response.code, 200);
  assert.ok(response.html.includes(message), "Stored enquiry was not readable");
}

await ready();
assert.equal((await send("/healthz", { host: "unrelated.example.test" })).code, 404);
const signedOut = await send("/admin");
assert.equal(signedOut.code, 401);
assert.equal(signedOut.headers["cache-control"], "no-store");

if (phase === "seed") {
  const denied = await send("/auth/email", { body: { email }, requestOrigin: "https://unrelated.example.test" });
  assert.equal(denied.code, 403);
  const signIn = await send("/auth/email", { body: { email } });
  assert.equal(signIn.code, 200);
  secureCookie(signIn, "email");
  const { link } = JSON.parse(await readFile("/fixture-data/mail.json", "utf8"));
  const confirmation = new URL(link);
  assert.equal(confirmation.origin, origin.origin);
  const verifyPage = await send(confirmation.pathname + confirmation.search);
  assert.equal(verifyPage.code, 200);
  const verified = await send("/auth/email/verify", { body: { token: hidden(verifyPage.html, "token") } });
  assert.equal(verified.code, 303);
  secureCookie(verified, "session");

  const cookie = client.get("__Host-bapx-app-session");
  const path = await submit(enquiry);
  await writeFile(proofPath, JSON.stringify({ cookie, path }), { mode: 0o600 });
  console.log("Baseline saved an enquiry behind verified TLS. Foreign credentials stayed at the proxy.");
} else {
  const proof = JSON.parse(await readFile(proofPath, "utf8"));
  client.set("__Host-bapx-app-session", proof.cookie);
  await assertEnquiry(proof.path, enquiry);
  if (phase === "upgrade") {
    const password = (await readFile("/owner-password", "utf8")).trim();
    const signedIn = await send("/auth/password/signin", { body: { email, password } });
    assert.equal(signedIn.code, 303);
    secureCookie(signedIn, "session");
    proof.newPath = await submit(upgradedEnquiry);
    proof.newCookie = client.get("__Host-bapx-app-session");
    await writeFile(proofPath, JSON.stringify(proof), { mode: 0o600 });
    console.log("Candidate preserved the original enquiry and saved a second one after password sign-in.");
  } else {
    assert.ok(["restart", "rollback"].includes(phase));
    client.set("__Host-bapx-app-session", proof.newCookie);
    await assertEnquiry(proof.newPath, upgradedEnquiry);
    console.log(`After ${phase}, both enquiries and their sessions were readable at revision ${expected}.`);
  }
}
