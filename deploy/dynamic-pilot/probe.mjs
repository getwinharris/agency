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
      if ((await send("/healthz")).code === 204) return;
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

  const home = await send("/");
  assert.equal(home.code, 200);
  const created = await send("/forms/enquiry", { body: {
    _csrf: hidden(home.html, "_csrf"), _revision: hidden(home.html, "_revision"),
    name: "Disposable sample", email, message: enquiry,
  } });
  assert.equal(created.code, 303);
  const admin = await send("/admin");
  assert.equal(admin.code, 200);
  const path = admin.html.match(/href="(\/admin\?submission=[^"]+)#original-submission"/)?.[1];
  assert.ok(path, "Missing stored enquiry link");
  await writeFile("/fixture-data/probe.json", JSON.stringify({
    cookie: client.get("__Host-bapx-app-session"), path,
  }), { mode: 0o600 });
  console.log("Owner signed in behind verified TLS and saved an enquiry. Foreign credentials stayed at the proxy.");
} else {
  assert.equal(phase, "after-replacement");
  const { cookie, path } = JSON.parse(await readFile("/fixture-data/probe.json", "utf8"));
  client.set("__Host-bapx-app-session", cookie);
  const original = await send(path);
  assert.equal(original.code, 200);
  assert.ok(original.html.includes(enquiry));
  console.log(`Replaced app container retained owner session and original enquiry ${new URL(path, origin).searchParams.get("submission")}.`);
}
