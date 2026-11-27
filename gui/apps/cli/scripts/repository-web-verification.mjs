import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { setTimeout } from "node:timers/promises";
import { parseArgs } from "node:util";

const usage = `Usage: bapx-cli repo verify web --revision <full Git SHA> (--live | --origin <loopback HTTP origin>)`;

export const webHealthHosts = [
  "admin.bapx.in", "bapx.in", "docs.bapx.in", "mediahub.bapx.in", "www.bapx.in",
];

const landingMarkers = [
  '<h1 id="headline">', 'id="how-it-works"', "data-demo-step", "data-demo-agent-picker",
  "data-demo-agent-unavailable", "bapx-agent-roster", 'id="faq"',
];
const guides = {
  "build-from-source": [],
  "desktop-packaging": ["<table>"],
  "private-core": ['id="1-install-tools-and-build"', '<pre tabindex="0"><code'],
  "project-skills": ['id="install-an-agency-skill-in-native-agents"'],
  "release-notes": [">Verified web deployments</h2>", ">Pending</h2>", />Served SHA <code>[a-f0-9]{40}<\/code><\/li>/],
};
export const webGuideSlugs = Object.keys(guides);

function localOrigin(value) {
  const url = URL.parse(value);
  if (!url || url.protocol !== "http:" || !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)
      || url.href !== `${url.origin}/`) {
    throw new Error("--origin must be a loopback HTTP origin, such as http://127.0.0.1:8080.");
  }
  return url.origin;
}

function get(origin, host, path) {
  const send = origin ? httpRequest : httpsRequest;
  const url = new URL(path, origin ?? `https://${host}`);
  return new Promise((resolve, reject) => {
    const request = send(url, { headers: { Host: host }, signal: AbortSignal.timeout(6000) }, async (response) => {
      try {
        const chunks = [];
        for await (const chunk of response) chunks.push(chunk);
        resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) });
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
    request.end();
  });
}

function requireStatus(response, host, path, status) {
  if (response.status !== status) {
    throw new Error(`${host}${path}: expected HTTP ${status}, received ${response.status}.`);
  }
}

async function health(origin, host, revision) {
  const path = "/healthz";
  let response;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await get(origin, host, path);
      if (!origin || attempt === 10 || ![408, 429, 500, 502, 503, 504].includes(response.status)) break;
    } catch (error) {
      if (!origin || attempt === 10 || !["ECONNREFUSED", "ECONNRESET"].includes(error.code)) throw error;
    }
    await setTimeout(1000);
  }
  requireStatus(response, host, path, 200);
  let result;
  try {
    result = JSON.parse(response.body.toString());
  } catch {
    throw new Error(`${host}${path}: expected a JSON health response.`);
  }
  if (result?.ready !== true || result.service !== "bapx-web" || result.revision !== revision) {
    throw new Error(`${host}${path}: expected ready bapx-web at ${revision}, observed revision ${JSON.stringify(result?.revision ?? null)}.`);
  }
  console.log(`${host} ${revision}`);
}

async function verifyWeb(origin, revision) {
  const page = async (host, path, markers = [], status = 200) => {
    const response = await get(origin, host, path);
    requireStatus(response, host, path, status);
    const text = response.body.toString();
    for (const marker of markers) {
      if (!(marker instanceof RegExp ? marker.test(text) : text.includes(marker))) {
        throw new Error(`${host}${path}: missing ${marker}.`);
      }
    }
    return response.body;
  };
  const asset = async (host, path, name) => {
    const actual = await page(host, path);
    const expected = await readFile(new URL(`../../www/public/brand/${name}`, import.meta.url));
    if (!actual.equals(expected)) throw new Error(`${host}${path}: asset differs from ${name} in this checkout.`);
  };

  for (const host of webHealthHosts) await health(origin, host, revision);
  for (const host of ["bapx.in", "www.bapx.in"]) await page(host, "/", landingMarkers);
  for (const icon of ["codex", "claude-code", "cursor", "hermes", "opencode", "pi"]) {
    await page("bapx.in", `/brand/agents/${icon}.svg`, ["<svg"]);
  }
  await page("docs.bapx.in", "/", ["bapX Agents documentation", '<a href="/release-notes/">release changelog</a>']);
  for (const [slug, markers] of Object.entries(guides)) await page("docs.bapx.in", `/${slug}/`, markers);
  if (!(await page("docs.bapx.in", "/docs.css")).length) throw new Error("docs.bapx.in/docs.css: empty stylesheet.");
  await page("mediahub.bapx.in", "/clients/nebo-lifestyle-clinic/", [/Nebo Lifestyle Clinic/i]);
  await page("admin.bapx.in", "/", ['<h1 id="login-title">Sign in</h1>']);
  await page("admin.bapx.in", "/api/admin/session", [], 401);
  for (const path of ["/sign-in/", "/signup/", "/account/"]) await page("bapx.in", path);
  for (const path of ["/api/auth/session", "/api/admin/session"]) await page("bapx.in", path, [], 401);
  await page("docs.bapx.in", "/api/auth/session", [], 404);
  await page("bapx.in", "/admin/", [], 404);

  const alias = await get(origin, "bapx.in", "/favicon.svg");
  const target = new URL("/brand/favicon.svg", "https://bapx.in");
  if (alias.status !== 308 || !alias.headers.location
      || new URL(alias.headers.location, "https://bapx.in/favicon.svg").href !== target.href) {
    throw new Error("bapx.in/favicon.svg: expected a permanent redirect to /brand/favicon.svg.");
  }
  await asset("bapx.in", target.pathname, "favicon.svg");
  for (const icon of ["favicon.ico", "favicon-96x96.png"]) await asset("admin.bapx.in", `/${icon}`, icon);
  await asset("admin.bapx.in", "/brand/bapx-logo-main.svg", "bapx-logo-main.svg");
  console.log("Public web smoke checks passed.");
}

export async function runVerification([command, ...args]) {
  if (command === undefined || command === "--help" || (command === "web" && args.length === 1 && args[0] === "--help")) {
    console.log(usage);
    return;
  }
  if (command !== "web") throw new Error(usage);
  const { values } = parseArgs({ args, options: { revision: { type: "string" }, origin: { type: "string" }, live: { type: "boolean" } } });
  if (!/^[a-f0-9]{40}$/.test(values.revision ?? "") || Boolean(values.live) === (values.origin !== undefined)) {
    throw new Error(usage);
  }
  await verifyWeb(values.live ? null : localOrigin(values.origin), values.revision);
}
