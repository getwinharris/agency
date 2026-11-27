import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { request as http } from "node:http";
import { request as https } from "node:https";

const origin = "https://dynamic-check.example.test";
const hostname = new URL(origin).hostname;
assert.ok(process.env.BAPX_SAMPLE_PROBE_ADDRESS, "Set the isolated fixture address");
const address = new URL(process.env.BAPX_SAMPLE_PROBE_ADDRESS);
const phase = process.argv[2];
const proofFile = process.argv[3];
const revision = process.argv[4];
const cookieName = "__Host-bapx-app-session";
assert.ok(["seed", "reopen"].includes(phase) && proofFile && /^[a-f0-9]{40}$/.test(revision));

function request(path, options = {}) {
  const { body, session, host = hostname, submittedFrom = origin } = options;
  const form = body && new URLSearchParams(body).toString();
  return new Promise((resolve, reject) => {
    const send = address.protocol === "https:" ? https : http;
    const req = send(new URL(path, address), {
      method: form ? "POST" : "GET",
      headers: {
        Host: host,
        Cookie: ["__Host-bapx-admin=synthetic", session].filter(Boolean).join("; "),
        Authorization: "Bearer synthetic",
        ...(form && {
          Origin: submittedFrom,
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(form),
        }),
      },
      timeout: 8_000,
    }, (response) => {
      let page = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { page += chunk; });
      response.on("error", reject);
      response.on("end", () => resolve({ code: response.statusCode, headers: response.headers, page }));
    });
    req.on("timeout", () => req.destroy(new Error("Sample request timed out")));
    req.on("error", reject);
    req.end(form);
  });
}

function sessionOf(response) {
  assert.equal(response.code, 303);
  const cookie = response.headers["set-cookie"]?.find((line) => line.startsWith(cookieName + "="));
  assert.ok(cookie, "Expected an app session cookie");
  for (const attribute of ["Path=/", "HttpOnly", "SameSite=Lax", "Secure"]) {
    assert.ok(cookie.split("; ").includes(attribute), "App session cookie policy changed");
  }
  assert.doesNotMatch(cookie, /;\s*Domain=/i);
  return cookie.split(";")[0];
}

function hidden(page, name) {
  const value = page.match(new RegExp(`name="${name}" value="([^"]+)"`))?.[1];
  assert.ok(value, `Missing form field ${name}`);
  return value;
}

const health = await request("/healthz");
assert.equal(health.code, 204);
assert.equal(health.headers["x-bapx-app-revision"], revision);
assert.equal((await request("/admin")).code, 401);
if (address.protocol === "http:") {
  assert.equal((await request("/healthz", { host: "unrelated.example.test" })).code, 404);
}

if (phase === "seed") {
  const id = randomBytes(8).toString("hex");
  const email = `sample-${id}@example.test`;
  const message = `Disposable sample enquiry ${id}`;
  const signup = { email, password: randomBytes(24).toString("hex") };
  assert.equal((await request("/auth/password/signup", {
    body: signup, submittedFrom: "https://unrelated.example.test",
  })).code, 403);
  const customer = sessionOf(await request("/auth/password/signup", { body: signup }));
  assert.equal((await request("/admin", { session: customer })).code, 403);

  const { code, page } = await request("/", { session: customer });
  assert.equal(code, 200);
  assert.equal((await request("/forms/enquiry", {
    session: customer,
    body: {
      name: "Disposable sample", email, message,
      _csrf: hidden(page, "_csrf"), _revision: hidden(page, "_revision"),
    },
  })).code, 303);

  const password = (await readFile(process.env.BAPX_SAMPLE_OWNER_FILE, "utf8")).trim();
  const owner = sessionOf(await request("/auth/password/signin", { body: { email: "owner@example.test", password } }));
  const dashboard = await request("/admin", { session: owner });
  assert.equal(dashboard.code, 200);
  let enquiryPath;
  for (const [, path] of dashboard.page.matchAll(/href="(\/admin\?submission=[^"]+)#original-submission"/g)) {
    const enquiry = await request(path, { session: owner });
    if (enquiry.page.includes(message)) {
      enquiryPath = path;
      break;
    }
  }
  assert.ok(enquiryPath, "Owner could not open the new enquiry");
  await writeFile(proofFile, JSON.stringify({ owner, customer, enquiryPath, message }), { flag: "wx", mode: 0o600 });
  console.log(`Verified signup, enquiry and app Admin separation at ${revision}.`);
} else {
  const { owner, customer, enquiryPath, message } = JSON.parse(await readFile(proofFile, "utf8"));
  assert.equal((await request("/admin", { session: customer })).code, 403);
  assert.equal((await request("/admin", { session: `${owner}; ${customer}` })).code, 401);
  const enquiry = await request(enquiryPath, { session: owner });
  assert.equal(enquiry.code, 200);
  assert.ok(enquiry.page.includes(message), "The saved enquiry was missing");
  console.log(`Both sessions and the saved enquiry survived replacement at ${revision}.`);
}
