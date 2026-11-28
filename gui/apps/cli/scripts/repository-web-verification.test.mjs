import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const launcher = fileURLToPath(new URL("../bin/bapx-cli", import.meta.url));
const revision = "a".repeat(40);
const homepage = '<h1 id="headline">bapX</h1><div id="how-it-works"></div><div id="workflow"></div><section data-landing-tour><button data-tour-send></button><select data-tour-target></select><select data-tour-agent></select></section><div id="agent-access"></div><h2 id="faq">FAQ</h2>';
const routes = new Map();
for (const host of ["admin.bapx.in", "app.bapx.in", "bapx.in", "docs.bapx.in", "mediahub.bapx.in", "www.bapx.in"]) {
  routes.set(`${host}/healthz`, [200, JSON.stringify({ ready: true, service: "bapx-web", revision })]);
}
routes.set("app.bapx.in/?next=https://example.invalid/", [307, "", { Location: "https://bapx.in/account/" }]);
for (const path of ["/api/auth/session", "/api/admin/session", "/v1/sessions"]) {
  routes.set(`app.bapx.in${path}`, [404, "Not found"]);
}
for (const host of ["bapx.in", "www.bapx.in"]) {
  routes.set(`${host}/`, [200, homepage]);
  routes.set(`${host}/download/`, [200, 'Get the bapX app <a href="/pricing/">Pricing</a>']);
  routes.set(`${host}/pricing/`, [200, "Solo, local only; ₹500/month"]);
}
for (const icon of ["codex", "claude-code", "cursor", "hermes", "opencode", "pi"]) {
  routes.set(`bapx.in/brand/agents/${icon}.svg`, [200, "<svg></svg>"]);
}
routes.set("docs.bapx.in/", [200, 'bapX Agents documentation <a href="/release-notes/">release changelog</a>']);
routes.set("docs.bapx.in/build-from-source/", [200, "Source guide"]);
routes.set("docs.bapx.in/desktop-packaging/", [200, "<table>"]);
routes.set("docs.bapx.in/private-core/", [200, '<h2 id="1-install-tools-and-build">Install</h2><pre tabindex="0"><code>cargo</code></pre>']);
routes.set("docs.bapx.in/project-skills/", [200, '<h2 id="install-an-agency-skill-in-native-agents">Install</h2>']);
routes.set("docs.bapx.in/release-notes/", [200, `<h2>Verified web deployments</h2><li>Served SHA <code>${revision}</code></li><h2>Pending</h2>`]);
routes.set("docs.bapx.in/docs.css", [200, "body {}"]);
routes.set("mediahub.bapx.in/clients/nebo-lifestyle-clinic/", [200, "Nebo Lifestyle Clinic"]);
routes.set("admin.bapx.in/", [200, '<h1 id="login-title">Sign in</h1>']);
for (const path of ["/sign-in/", "/signup/", "/account/"]) routes.set(`bapx.in${path}`, [200, "Account"]);
for (const path of ["bapx.in/api/auth/session", "bapx.in/api/admin/session", "admin.bapx.in/api/admin/session"]) {
  routes.set(path, [401, "Sign in"]);
}
routes.set("docs.bapx.in/api/auth/session", [404, "Not found"]);
routes.set("bapx.in/admin/", [404, "Not found"]);
routes.set("bapx.in/favicon.svg", [308, "", { Location: "/brand/favicon.svg" }]);
for (const [path, name] of [
  ["bapx.in/brand/favicon.svg", "favicon.svg"],
  ["admin.bapx.in/favicon.ico", "favicon.ico"],
  ["admin.bapx.in/favicon-96x96.png", "favicon-96x96.png"],
  ["admin.bapx.in/brand/bapx-logo-main.svg", "bapx-logo-main.svg"],
]) routes.set(path, [200, readFileSync(new URL(`../../www/public/brand/${name}`, import.meta.url))]);

test("checkout CLI verifies a loopback image and fails on release drift", async (t) => {
  const requested = new Set();
  const responses = new Map(routes);
  const server = createServer((request, response) => {
    const path = `${request.headers.host}${request.url}`;
    requested.add(path);
    const [status, body, headers] = responses.get(path) ?? [500, "Unexpected route"];
    response.writeHead(status, headers).end(body);
  });
  server.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const invoke = (...args) => run(launcher, ["repo", "verify", "web", "--revision", revision, ...args], { timeout: 10000 });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const { stdout } = await invoke("--origin", origin);
  assert.match(stdout, /Public web smoke checks passed/);
  assert.deepEqual(requested, new Set(responses.keys()));

  for (const [label, path, result, message] of [
    ["wrong revision", "www.bapx.in/healthz", [200, JSON.stringify({ ready: true, service: "bapx-web", revision: "b".repeat(40) })], /www\.bapx\.in\/healthz: expected ready bapx-web/],
    ["escaping App redirect", "app.bapx.in/?next=https://example.invalid/", [307, "", { Location: "https://example.invalid/" }], /expected redirect to the bapX account/],
    ["App exposes a native session route", "app.bapx.in/v1/sessions", [200, "Opened"], /expected HTTP 404, received 200/],
    ["incomplete landing", "bapx.in/", [200, '<h1 id="headline">bapX</h1>'], /missing id="how-it-works"/],
    ["readiness marker differs from Hostinger", "bapx.in/", [200, homepage.replace('<h1 id="headline">', '<h1 id="headline" aria-label="bapX">')], /missing <h1 id="headline">/],
    ["missing workspace control", "www.bapx.in/", [200, homepage.replace(" data-tour-agent", "")], /missing data-tour-agent/],
    ["workspace fixture leak", "www.bapx.in/", [200, homepage + '<div data-workspace-fixture></div>'], /unexpected local workspace fixture/],
    ["missing Pricing navigation", "bapx.in/download/", [200, "Get the bapX app"], /missing href="\/pricing\/"/],
    ["incorrect Pricing copy", "www.bapx.in/pricing/", [200, "Solo, local only; ₹700/month"], /missing ₹500\/month/],
    ["anonymous Admin access", "bapx.in/api/admin/session", [200, "Opened"], /expected HTTP 401, received 200/],
    ["escaping favicon redirect", "bapx.in/favicon.svg", [308, "", { Location: "https://docs.bapx.in/brand/favicon.svg" }], /expected a permanent redirect/],
    ["wrong favicon bytes", "admin.bapx.in/favicon.ico", [200, "changed"], /asset differs from favicon.ico/],
  ]) {
    await t.test(label, async () => {
      responses.set(path, result);
      try {
        await assert.rejects(invoke("--origin", origin), (error) => {
          assert.equal(error.code, 1);
          assert.match(error.stderr, message);
          return true;
        });
      } finally {
        responses.set(path, routes.get(path));
      }
    });
  }
  await assert.rejects(invoke("--origin", "https://bapx.in"), /must be a loopback HTTP origin/);
  await assert.rejects(invoke("--live", "--origin", origin), /Usage: bapx-cli repo verify web/);
});
