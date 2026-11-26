import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "./app.mjs";

const ownerEmail = "owner@example.test";
const emailCustomer = "customer@example.test";
const googleCustomer = "google-customer@example.test";
const formsV1 = [{
  id: "enquiry", title: "Project enquiry",
  fields: [{ id: "message", label: "Original brief", type: "textarea", required: true }],
}];
const formsV2 = [{
  id: "enquiry", title: "Revised project enquiry",
  fields: [{ id: "message", label: "Revised brief", type: "textarea", required: true }],
}];

function getInput(html, name) {
  const input = html.match(new RegExp(`name="${name}" value="([A-Za-z0-9_-]+)"`));
  assert.ok(input, `Expected input ${name}`);
  return input[1];
}

function expectStatus(response, status) {
  assert.equal(response.status, status, response.body.match(/<h1>.*?<\/h1>\s*<p>(.*?)<\/p>/s)?.[1]);
  return response;
}

function browser(origin) {
  const cookies = new Map();

  async function request(path, { input, headers } = {}) {
    const response = await fetch(new URL(path, origin), {
      method: input ? "POST" : "GET",
      headers: {
        Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
        ...(input && { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" }),
        ...headers,
      },
      body: input && new URLSearchParams(input),
      redirect: "manual",
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [name, value] = cookie.split(";", 1)[0].split("=");
      if (value) cookies.set(name, value);
      else cookies.delete(name);
    }
    return { status: response.status, headers: response.headers, body: await response.text() };
  }

  return {
    get: request,
    post(path, input, headers) { return request(path, { input, headers }); },
    cookieHeader() { return [...cookies].map(([name, value]) => `${name}=${value}`).join("; "); },
  };
}

function providerFixture() {
  const mailbox = new Map();
  const authorizations = new Map();
  const google = {
    start({ state, nonce, challenge }) {
      const code = `fixture-${authorizations.size + 1}`;
      authorizations.set(code, { nonce, challenge });
      return `https://accounts.example.test/?${new URLSearchParams({ state, code })}`;
    },
    async verify({ code, verifier, nonce }) {
      const authorization = authorizations.get(code);
      assert.ok(authorization, "fixture provider received a known code");
      assert.equal(nonce, authorization.nonce);
      assert.equal(createHash("sha256").update(verifier).digest("base64url"), authorization.challenge);
      return { email: googleCustomer, subject: "fixture-google-account" };
    },
  };
  return {
    mailbox,
    google,
    async sendEmail({ email, link }) {
      mailbox.set(email, new URL(link));
      return `fixture-email-${mailbox.size}`;
    },
  };
}

async function signUpByEmail(client, mailbox, email, otherBrowser) {
  expectStatus(await client.post("/auth/email", { email }), 200);
  const link = mailbox.get(email);
  assert.ok(link, `Expected confirmation mail for ${email}`);
  if (otherBrowser) expectStatus(await otherBrowser.get(link), 401);
  const confirmation = expectStatus(await client.get(link), 200);
  const token = getInput(confirmation.body, "token");
  expectStatus(await client.post("/auth/email/verify", { token }), 303);
  expectStatus(await client.post("/auth/email/verify", { token }), 401);
}

async function signInWithGoogle(client, otherBrowser) {
  const authorization = expectStatus(await client.get("/auth/google"), 303);
  const query = new URL(authorization.headers.get("location")).search;
  const callback = `/auth/google/callback${query}`;
  if (otherBrowser) expectStatus(await otherBrowser.get(callback), 401);
  expectStatus(await client.get(callback), 303);
  expectStatus(await client.get(callback), 401);
}

test("sample app verifies signup methods, handles enquiries and preserves records across a form redeploy and rollback", { timeout: 20_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "bapx-app-admin-"));
  const servers = new Set();
  const errors = [];
  const provider = providerFixture();
  const sampleData = join(directory, "sample-app");

  async function stop(server) {
    if (!server.listening) return;
    const closed = once(server, "close");
    server.close();
    server.closeAllConnections();
    await closed;
  }

  t.after(async () => {
    await Promise.all([...servers].map(stop));
    await rm(directory, { recursive: true, force: true });
  });

  async function launch({ forms, port = 0, appId = "sample-app", dataDir = sampleData }) {
    const config = { appId, dataDir, appName: "Disposable sample", ownerEmail, forms };
    const server = await createApp({ config, ...provider, reportError: (error) => errors.push(error) });
    servers.add(server);
    server.listen(port, "127.0.0.1");
    await once(server, "listening");
    config.port = server.address().port;
    config.host = `127.0.0.1:${config.port}`;
    config.origin = `http://${config.host}`;
    return { server, ...config };
  }

  async function snapshot() {
    return JSON.parse(await readFile(join(sampleData, "state.json"), "utf8"));
  }

  const initial = await launch({ forms: formsV1 });
  const anonymous = browser(initial.origin);
  const owner = browser(initial.origin);
  const customer = browser(initial.origin);
  const google = browser(initial.origin);
  expectStatus(await anonymous.get("/healthz"), 204);
  expectStatus(await anonymous.get("/admin"), 401);
  expectStatus(await anonymous.post("/auth/email", { email: ownerEmail }, { Origin: "https://other.example.test" }), 403);

  await signUpByEmail(owner, provider.mailbox, ownerEmail, anonymous);
  await signUpByEmail(customer, provider.mailbox, emailCustomer, anonymous);
  await signInWithGoogle(google, anonymous);
  expectStatus(await customer.get("/admin"), 403);
  expectStatus(await google.get("/admin"), 403);
  const originalHome = expectStatus(await customer.get("/"), 200).body;
  assert.match(originalHome, /Original brief/);
  assert.doesNotMatch(originalHome, /href="\/admin"/);
  const originalRevision = getInput(originalHome, "_revision");
  const customerCsrf = getInput(originalHome, "_csrf");
  const originalText = "<strong>Disposable project quote</strong>";
  expectStatus(await customer.post("/forms/enquiry", {
    _revision: originalRevision, _csrf: customerCsrf, message: originalText,
  }), 303);
  const withEnquiry = await snapshot();
  const [firstEntry] = withEnquiry.submissions;
  const staffId = withEnquiry.users.find((user) => user.email === googleCustomer).id;
  assert.deepEqual(withEnquiry.users.map((user) => [user.email, user.signupMethod, user.role]), [
    [ownerEmail, "email", "owner"], [emailCustomer, "email", "customer"], [googleCustomer, "google", "customer"],
  ]);
  assert.ok(withEnquiry.users.every((user) => Number.isFinite(Date.parse(user.verifiedAt))));
  assert.deepEqual(withEnquiry.signIns, []);

  const googleCsrf = getInput(expectStatus(await google.get("/"), 200).body, "_csrf");
  expectStatus(await google.post("/auth/signout", { _csrf: googleCsrf }), 303);
  await signInWithGoogle(google);
  const afterReturn = await snapshot();
  assert.deepEqual(afterReturn.users, withEnquiry.users);
  assert.deepEqual(afterReturn.signIns.map(({ userId, method }) => [userId, method]), [[staffId, "google"]]);

  const ownerPage = expectStatus(await owner.get(`/admin?submission=${firstEntry.id}`), 200).body;
  assert.match(ownerPage, /Verified sign-ups by original method/);
  assert.match(ownerPage, /<th scope="col">Email<\/th><th scope="col">Google<\/th>/);
  assert.match(ownerPage, /Sign-ins/);
  const activityRows = [...ownerPage.matchAll(/<time datetime="\d{4}-\d{2}-\d{2}">[^<]+<\/time><\/th><td>(\d+)<\/td><td>(\d+)<\/td><td>(\d+)<\/td>/g)];
  const totals = activityRows.reduce(([email, google, returns], row) => [
    email + Number(row[1]), google + Number(row[2]), returns + Number(row[3]),
  ], [0, 0, 0]);
  assert.deepEqual(totals, [2, 1, 1]);
  assert.match(ownerPage, /#original-submission/);
  assert.match(ownerPage, /&lt;strong&gt;Disposable project quote&lt;\/strong&gt;/);
  const ownerCsrf = getInput(ownerPage, "_csrf");
  expectStatus(await owner.post(`/admin/roles/${staffId}`, { _csrf: ownerCsrf, role: "staff" }), 303);
  expectStatus(await owner.post(`/admin/submissions/${firstEntry.id}`, {
    _csrf: ownerCsrf, status: "in_progress", assignee: staffId, note: "Review the scope.",
  }), 303);
  const staffPage = expectStatus(await google.get(`/admin?submission=${firstEntry.id}`), 200).body;
  assert.match(staffPage, /Review the scope/);
  assert.match(staffPage, new RegExp(`value="${staffId}" selected`));
  assert.doesNotMatch(staffPage, /Original signup method/);
  const staffCsrf = getInput(staffPage, "_csrf");
  expectStatus(await google.post(`/admin/roles/${staffId}`, { _csrf: staffCsrf, role: "customer" }), 403);
  const csv = expectStatus(await owner.get("/admin?export=csv&q=project+quote&status=in_progress"), 200);
  assert.match(csv.headers.get("content-type"), /^text\/csv/);
  assert.match(csv.body, /"in_progress","google-customer@example\.test"/);
  assert.match(csv.body, /Original brief/);
  assert.doesNotMatch(expectStatus(await owner.get("/admin?export=csv&status=closed"), 200).body, /Original brief/);
  const beforeRestart = await snapshot();

  const other = await launch({ forms: formsV1, dataDir: join(directory, "other-app"), appId: "other-app" });
  const otherBrowser = browser(other.origin);
  expectStatus(await otherBrowser.get("/admin", { headers: { Cookie: google.cookieHeader() } }), 401);
  expectStatus(await otherBrowser.get("/admin", { headers: { Cookie: customer.cookieHeader() } }), 401);
  expectStatus(await otherBrowser.post(`/admin/submissions/${firstEntry.id}`, {
    _csrf: staffCsrf, status: "closed", assignee: "",
  }, { Cookie: google.cookieHeader(), Origin: initial.origin }), 403);
  expectStatus(await otherBrowser.post(`/admin/submissions/${firstEntry.id}`, {
    _csrf: staffCsrf, status: "closed", assignee: "",
  }, { Cookie: google.cookieHeader() }), 401);
  expectStatus(await google.get("/workspace"), 404);

  await stop(initial.server);
  const changed = await launch({ forms: formsV2, port: initial.port });
  const changedHome = expectStatus(await customer.get("/"), 200).body;
  assert.match(changedHome, /Revised brief/);
  expectStatus(await customer.post("/forms/enquiry", {
    _revision: originalRevision, _csrf: customerCsrf, message: "Stale form",
  }), 409);
  expectStatus(await customer.post("/forms/enquiry", {
    _revision: getInput(changedHome, "_revision"), _csrf: customerCsrf, message: "Submitted after redeploy.",
  }), 303);
  assert.match(expectStatus(await owner.get(`/admin?submission=${firstEntry.id}`), 200).body, /Original brief/);
  const afterEdit = await snapshot();
  assert.deepEqual(afterEdit.users, beforeRestart.users);
  assert.deepEqual(afterEdit.submissions[0], beforeRestart.submissions[0]);
  assert.equal(afterEdit.submissions[1].fields[0].label, "Revised brief");

  await stop(changed.server);
  const removed = await launch({ forms: [], port: initial.port });
  assert.match(expectStatus(await customer.get("/"), 200).body, /There are no active forms/);
  const archived = expectStatus(await owner.get(`/admin?form=enquiry&submission=${firstEntry.id}`), 200).body;
  assert.match(archived, /Archived/);
  assert.match(archived, /Original brief/);
  assert.deepEqual(await snapshot(), afterEdit);

  await stop(removed.server);
  await launch({ forms: formsV1, port: initial.port });
  assert.match(expectStatus(await customer.get("/"), 200).body, /Original brief/);
  assert.deepEqual(await snapshot(), afterEdit);
  for (const [submission, fieldLabel] of [[firstEntry, /Original brief/], [afterEdit.submissions[1], /Revised brief/]]) {
    const page = expectStatus(await owner.get(`/admin?submission=${submission.id}`), 200).body;
    assert.match(page, fieldLabel);
    assert.match(page, /google-customer@example\.test/);
  }
  assert.deepEqual(errors, []);
});
