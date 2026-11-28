import { execFileSync } from "node:child_process";
import {
  mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const workflow = ".github/workflows/web.yml";
const compose = "deploy/compose.web.yml";
const rustWeb = "core/src/web.rs";
const driver = "deploy/deploy-web.sh";
const publisher = "deploy/publish-site.sh";
const dockerfile = "deploy/web.Dockerfile";
const docsRegistry = "gui/apps/www/src/docs/pages.ts";
const workspaceConfig = "gui/pnpm-workspace.yaml";
const indexPath = "docs/project-index.json";
const command = "bapx-cli repo inventory";

function run(file, args, options) {
  return execFileSync(file, args, { cwd: root, encoding: "utf8", ...options });
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function compare(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function sorted(values) {
  return [...new Set(values)].sort(compare);
}

function requireMatch(label, expected, actual) {
  if (!expected.length || expected.join("\n") !== actual.join("\n")) {
    throw new Error(`${label} disagree.\nExpected: ${expected.join(", ")}\nObserved: ${actual.join(", ")}`);
  }
}

function requireSource(path, markers) {
  const source = read(path);
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`Update the architecture map for ${path} (missing: ${marker}).`);
    }
  }
}

function parseRouters(labels) {
  const host = "Host\\(`([a-z0-9.-]+)`\\)";
  const path = "Path\\(`(/[a-zA-Z0-9/_-]+)`\\)";
  const accountHost = "Host\\(`bapx\\.in`\\)";
  const prefixPattern = "PathPrefix\\(`(/api/(?:auth|admin)/)`\\)";
  const method = "Method\\(`([A-Z]+)`\\)";
  const extract = (rule, term) => [...rule.matchAll(new RegExp(term, "g"))].map((match) => match[1]);
  const exact = (rule, term) => new RegExp(`^${term}$`).test(rule);
  const invalid = `The agency-web routers in ${compose} must declare HTTPS hosts and scoped endpoint rules.`;
  const routers = [];
  for (const key of Object.keys(labels)) {
    const name = /^traefik\.http\.routers\.(.*)\.rule$/.exec(key)?.[1];
    if (name === undefined) continue;
    const prefix = `traefik.http.routers.${name}`;
    const rule = labels[key];
    const terms = rule.split("&&").map((term) => term.trim());
    const hostOnly = new RegExp(`^\\s*${host}(\\s*\\|\\|\\s*${host})*\\s*$`).test(rule);
    const prefixed = new RegExp(`^${accountHost}\\s*&&\\s*${prefixPattern}$`).test(rule);
    const qualified = terms.length === 3 && [host, path, method].every(
      (term) => terms.some((part) => exact(part, term)),
    );
    const hosts = sorted(extract(rule, host));
    if (!/^[a-z0-9-]+$/.test(name) || labels[`${prefix}.service`] !== "agency-web"
        || labels[`${prefix}.tls`] !== "true" || labels[`${prefix}.entrypoints`] !== "websecure"
        || !(hostOnly || qualified || prefixed) || !hosts.length) {
      throw new Error(invalid);
    }
    routers.push({
      name,
      hosts,
      path: extract(rule, path)[0] ?? null,
      method: extract(rule, method)[0] ?? null,
      pathPrefix: extract(rule, prefixPattern)[0] ?? null,
    });
  }
  if (!routers.length) throw new Error(invalid);
  return routers.sort((left, right) => compare(left.name, right.name));
}

function validateAccountIngress(labels) {
  const router = (name, field) => labels[`traefik.http.routers.agency-${name}.${field}`];
  const priority = (name) => {
    const value = router(name, "priority");
    return /^-?[0-9]+$/.test(value) ? Number(value) : Number.NaN;
  };
  const accountRoutes = [
    ["account", "PathPrefix(`/api/auth/`)", "", "web"],
    ["account-admin", "PathPrefix(`/api/admin/`)", "", "web"],
    ["account-login", "Path(`/api/auth/sign-in`) && Method(`POST`)", "agency-admin-rate", "account"],
    ["account-signup", "Path(`/api/auth/signup`) && Method(`POST`)", "agency-admin-rate", "account"],
  ];
  return router("web", "middlewares") === "agency-public"
    && labels["traefik.http.middlewares.agency-public.headers.customrequestheaders.Cookie"] === ""
    && accountRoutes.every(([name, rule, middleware, lowerPriority]) =>
      router(name, "rule") === `Host(\`bapx.in\`) && ${rule}`
      && (router(name, "middlewares") ?? "") === middleware
      && priority(name) > priority(lowerPriority));
}

function validateIngress(service) {
  const labels = service.labels;
  const password = service.environment?.BAPX_ADMIN_PASSWORD_FILE;
  const volumes = service.volumes ?? [];
  const volume = (name, target, readOnly) => volumes.some(
    (entry) => entry.type === "volume" && entry.source === name
      && entry.target === target && (entry.read_only === true) === readOnly,
  );
  if (service.read_only !== true || labels["traefik.enable"] !== "true"
      || service.ports?.length
      || !validateAccountIngress(labels)
      || labels["traefik.http.routers.agency-app.rule"] !== "Host(`app.bapx.in`)"
      || labels["traefik.http.routers.agency-app.tls.certresolver"] !== "letsencrypt"
      || labels["traefik.http.routers.agency-app.middlewares"] !== "agency-app-headers"
      || labels["traefik.http.middlewares.agency-app-headers.headers.customrequestheaders.Cookie"] !== ""
      || labels["traefik.http.middlewares.agency-app-headers.headers.customrequestheaders.Authorization"] !== ""
      || !labels["traefik.http.routers.agency-sandbox-check.middlewares"]?.split(",").includes("agency-sandbox-headers")
      || labels["traefik.http.middlewares.agency-sandbox-headers.headers.customrequestheaders.Cookie"] !== ""
      || labels["traefik.http.middlewares.agency-sandbox-headers.headers.customrequestheaders.Authorization"] !== ""
      || !volume("agency-web-data", "/var/lib/bapx-web", false)
      || !volume("agency-web-sites", "/var/lib/bapx-sites", true)
      || !password || !volumes.some(
        (entry) => entry.type === "bind" && entry.target === password && entry.read_only === true,
      )) {
    throw new Error(`Public ingress, storage or pilot request isolation differs from the map in ${compose}.`);
  }
}

function rustConstant(source, name) {
  return new RegExp(`^(?:pub\\(super\\) )?const ${name}: &str = "([^"]+)";$`, "m").exec(source)?.[1];
}

function rustPublicHosts() {
  const source = read(rustWeb);
  const body = /^fn public_host\([\s\S]*?^}/m.exec(source)?.[0].replace(/\s/g, "");
  const matcher = /matches!\(host,([^)]*)\)/.exec(body ?? "")?.[1];
  if (!matcher) throw new Error(`Cannot read public_host in ${rustWeb}.`);
  return sorted(matcher.split("|").map((part) => {
    const literal = /^"([a-z0-9.-]+)"$/.exec(part)?.[1];
    const value = /^[A-Z_]+$/.test(part) ? rustConstant(source, part) : literal;
    if (!value) throw new Error(`Unknown public_host matcher in ${rustWeb}.`);
    return value;
  }));
}

function ciLoopValues(ci, variable, test) {
  let values = [];
  const found = [];
  for (const line of ci.split("\n")) {
    const loop = new RegExp(`^\\s*for ${variable} in (.*); do$`).exec(line);
    if (loop) values = loop[1].trim().split(/\s+/);
    if (/^\s*done$/.test(line)) values = [];
    if (test(line)) found.push(...values);
  }
  return sorted(found);
}

function validateRoutes(routers, ci) {
  const hosts = (name) => routers.find((router) => router.name === name)?.hosts ?? [];
  const publicHosts = sorted([...hosts("agency-web"), ...hosts("agency-app")]);
  const adminHosts = hosts("agency-admin");
  const pilotHosts = hosts("agency-sandbox-check");
  const firstParty = sorted([...publicHosts, ...adminHosts]);
  const admin = rustConstant(read("core/src/web/admin.rs"), "HOST");
  const slug = /^slug=([a-z0-9-]+)$/m.exec(read(publisher))?.[1];
  const suffix = rustConstant(read("core/src/site_release.rs"), "SITE_SUFFIX");
  if (!slug || !suffix) throw new Error("Could not read the publisher slug and Rust site suffix.");
  requireMatch("Traefik and Rust public hosts", publicHosts, rustPublicHosts());
  requireMatch("Traefik and Rust Admin hosts", adminHosts, admin ? [admin] : []);
  requireMatch("Traefik static pilot and the publisher's Rust site host", pilotHosts, [slug + suffix]);
  requireMatch("Traefik router hosts and the mapped public, Admin, and pilot hosts",
    sorted(routers.flatMap((router) => router.hosts)), sorted([...firstParty, ...pilotHosts]));
  requireMatch("Traefik first-party routes and Public web CI health checks",
    firstParty, ciLoopValues(ci, "host", (line) => line.includes("/healthz")));
  const smokeDriver = read(driver);
  const vpsRoutes = /^\s*done <<'ROUTES'\n([\s\S]*?)^ROUTES$/m.exec(smokeDriver)?.[1] ?? "";
  const vpsAppCheck = /^check_app\(\) \{\n([\s\S]*?)^}/m.exec(smokeDriver)?.[1] ?? "";
  const vpsAppHosts = [...vpsAppCheck.matchAll(/ host=([a-z0-9.-]+) redirect$/gm)].map((result) => result[1]);
  const vpsRouteHosts = vpsRoutes.trim().split("\n").map((route) => route.trim().split(/\s+/)[0]).filter(Boolean);
  requireMatch("Traefik first-party routes and Hostinger HTTPS smoke checks", firstParty,
    sorted([...vpsRouteHosts, ...vpsAppHosts]));
  return { publicHosts, adminHosts };
}

function publishedGuides(ci, tracked) {
  const listing = /^const guides = \[\n([\s\S]*?)^\];$/m.exec(read(docsRegistry))?.[1] ?? "";
  const guides = listing.split("\n").filter((line) => line.trim()).map((line) => {
    const match = /^\s*\{ slug: "([a-z0-9-]+)", label: "[^"]+", source: "([a-zA-Z0-9_./-]+\.md)"(?:, section: "[^"]+")? \},?$/.exec(line);
    if (!match) throw new Error(`Could not inventory every guide in ${docsRegistry}.`);
    return { slug: match[1], source: match[2] };
  });
  if (!guides.length) throw new Error(`Could not inventory every guide in ${docsRegistry}.`);
  const slugs = sorted(guides.map(({ slug }) => slug));
  if (slugs.length !== guides.length) throw new Error(`Duplicate guide slugs in ${docsRegistry}.`);
  requireMatch("Published Docs slugs and Public web CI smoke checks", slugs,
    ciLoopValues(ci, "slug", (line) => /^\s*curl --fail /.test(line)
      && line.includes("-H 'Host: docs.bapx.in'") && line.includes('"http://127.0.0.1:8080/$slug/"')));
  const pagesStage = /^FROM .* pages\n([\s\S]*?)(?=^FROM |$(?![\s\S]))/m.exec(read(dockerfile))?.[1] ?? "";
  const imageInputs = [...pagesStage.matchAll(/^COPY ([^ -].*)$/gm)]
    .flatMap(([, inputs]) => inputs.trim().split(/\s+/).slice(0, -1));
  const pr = /^  pull_request:\n((?:^ {4}[^\n]*\n|^\n)*)/m.exec(ci)?.[1] ?? "";
  const paths = /^    paths:\n((?:^ {6,}[^\n]*\n|^\n)*)/m.exec(pr)?.[1] ?? "";
  const prInputs = paths.split("\n").filter((line) => line.trim() && !line.trimStart().startsWith("#"))
    .map((line) => {
      const exact = /^      - '([a-zA-Z0-9_./-]+)'$/.exec(line)?.[1];
      const directory = /^      - '([a-zA-Z0-9_./-]+\/)\*\*'$/.exec(line)?.[1];
      if (!exact && !directory) throw new Error(`Unsupported Public web PR path filter: ${line}.`);
      return exact ?? directory;
    });
  const covers = (inputs, source) => inputs.some(
    (input) => source === input || (input.endsWith("/") && source.startsWith(input)),
  );
  for (const { slug, source } of guides) {
    if (!tracked.has(source) || !statSync(join(root, source), { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Guide ${slug} references a missing or untracked source: ${source}.`);
    }
    if (!covers(imageInputs, source)) {
      throw new Error(`Guide ${slug} source is missing from the web image pages stage: ${source}.`);
    }
    if (!covers(prInputs, source)) {
      throw new Error(`Guide ${slug} source is missing from Public web PR path coverage: ${source}.`);
    }
  }
  return guides.sort((left, right) => compare(left.slug, right.slug));
}

function projectSources() {
  const workspace = /^packages:\n((?:^ +[^\n]*\n|^\s*(?:#.*)?\n)*)/m.exec(read(workspaceConfig))?.[1] ?? "";
  const patterns = workspace.split("\n").filter((line) => line.trim() && !line.trimStart().startsWith("#"));
  if (!patterns.length) throw new Error(`Could not read packages in ${workspaceConfig}.`);
  const filters = patterns.map((pattern) => {
    const include = /^  - "([a-zA-Z0-9_/-]+\/\*)"$/.exec(pattern)?.[1];
    if (include) return `:(glob)gui/${include}/package.json`;
    if (pattern === '  - "!**/.bundled-stage-*"') return ":(glob,exclude)gui/**/.bundled-stage-*/package.json";
    throw new Error(`Unsupported workspace package filter in ${workspaceConfig}: ${pattern}.`);
  });
  const tracked = sorted(run("git", ["ls-files", "-z", "--", ".github/workflows", "gui/apps/www/src", "core/src/web",
    ":(glob)core/src/*.rs", ":(glob)core/src/*/mod.rs", ":(glob)skills/**/SKILL.md",
    "gui/package.json", ...filters,
  ]).split("\0").filter(Boolean));
  return {
    workflows: tracked.filter((file) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file)),
    rust_entry_points: tracked.filter((file) => /^core\/src\/([^/]+\.rs|[^/]+\/mod\.rs)$/.test(file)),
    web_runtime_sources: tracked.filter((file) => file.startsWith("core/src/web/")),
    web_sources: tracked.filter((file) => file.startsWith("gui/apps/www/src/")),
    workspace_packages: tracked.filter((file) => file.startsWith("gui/") && file.endsWith("/package.json")),
    bundled_skills: tracked.filter((file) => file.startsWith("skills/") && file.endsWith("/SKILL.md")),
  };
}

function renderIndex(routers, guides, sources) {
  const routes = routers.flatMap(({ name, hosts, method, path, pathPrefix }) => hosts.map((host) => ({
    host, router: name, method, path, source: compose,
    ...(pathPrefix === null ? {} : { path_prefix: pathPrefix }),
  })));
  routes.sort((left, right) => compare(left.host, right.host)
    || compare(left.path ?? "", right.path ?? "") || compare(left.method ?? "", right.method ?? "")
    || compare(left.router, right.router));
  return JSON.stringify({
    generated_by: `${command} generate`,
    scope: "Tracked source and declared routes. Verify live behavior separately.",
    routes,
    docs: { registry: docsRegistry, guides },
    release: { workflow, smoke_driver: driver, image: dockerfile },
    workspace_config: workspaceConfig,
    sources,
  }, null, 2) + "\n";
}

function renderMap(routers, { publicHosts, adminHosts }) {
  const edges = routers.flatMap(({ name, hosts, method, path, pathPrefix }) => hosts.map((host) => {
    const router = name.replaceAll("-", "_");
    const hostId = host.replaceAll(".", "_dot_").replaceAll("-", "_dash_");
    const qualifier = [method, path, pathPrefix].filter(Boolean).map((part) => ` ${part}`).join("");
    let target = "pilotRouter";
    if (name.startsWith("agency-account")) target = "accountRouter";
    else if (name === "agency-app") target = "appRouter";
    else if (publicHosts.includes(host)) target = "webRouter";
    else if (adminHosts.includes(host)) target = "adminRouter";
    return `    ingress_${router}_${hostId}["${host}${qualifier} · ${name}"] --> ${target}`;
  }));
  return `%% Generated by ${command} generate. Topology is derived from source, independent of live status.
flowchart TD
  workspace["Agency workspace · AGENTS.md and docs/project-index.json"]

  subgraph build["Source and build"]
    webSource["Landing, Docs, MediaHub, accounts and Admin · gui/apps/www/src/build.ts"]
    docsSources["Published Markdown registry · gui/apps/www/src/docs/pages.ts"]
    assets["Static build · pnpm build:web → gui/apps/www/dist"]
    rust["Rust Core build · core/src/main.rs"]
    image["One image · deploy/web.Dockerfile"]
    docsSources --> webSource --> assets
    assets -->|"Copied to /srv/bapx-web"| image
    rust --> image
  end

  subgraph release["First-party web release · .github/workflows/web.yml"]
    main["Push to main"]
    checks["App and Core CI"]
    webChecks["Build and smoke-test the exact web SHA"]
    registry["GHCR image by immutable digest"]
    artifact["agency-web-release · SHA, digest and Compose checksum"]
    ssh["Actions deploy job · pinned SSH · deploy/deploy-web-ssh.sh"]
    rollout["Hostinger systemd rollout · deploy/deploy-web.sh"]
    receipt["Verified deployment receipt and previous healthy image"]
    browserQA["Independent browser QA on the deployed SHA · AGENTS.md"]
    main --> checks --> webChecks
    webChecks --> registry
    webChecks --> artifact
    webChecks --> ssh
    registry --> rollout
    artifact --> rollout
    ssh --> rollout --> receipt
    receipt --> browserQA
  end

  subgraph public["Public web on Hostinger · deploy/compose.web.yml"]
    webRouter["Traefik TLS · first-party public routes"]
    appRouter["Traefik TLS · exact App entry"]
    accountRouter["Traefik TLS · apex account and operator API"]
    adminRouter["Traefik TLS · operator routes"]
    pilotRouter["Traefik TLS · static pilot route"]
    webRuntime["bapx-core serve-web · core/src/web.rs"]
    routing["Landing and privacy · App account entry · Docs guides · MediaHub cases"]
    readiness["First-party /healthz · exact release SHA"]
    briefs["MediaHub brief intake · core/src/web/inquiry.rs"]
    adminApi["Admin sign-in and authenticated API · core/src/web/admin.rs"]
    accountApi["Apex signup, role checks and sign-in · core/src/web/accounts.rs"]
    staticPilot["Published assets · core/src/web/published.rs"]
    webData["Private writable volume · accounts, briefs, notes and published copy"]
    adminSecret["Private read-only bind · Admin sign-in credential"]
    webRouter --> webRuntime
    appRouter -->|"Strip Cookie and Authorization"| webRuntime
    accountRouter -->|"Forward host-only session"| webRuntime
    adminRouter --> webRuntime
    pilotRouter -->|"Strip Cookie and Authorization"| webRuntime
    webRuntime --> routing
    webRuntime --> readiness
    webRuntime --> briefs
    webRuntime --> adminApi
    webRuntime --> accountApi
    webRuntime --> staticPilot
    briefs -->|"Persist accepted briefs"| webData
    adminApi -->|"Read briefs and update operator data"| webData
    accountApi -->|"Persist invitations and accounts"| webData
    accountApi -->|"Verify operator role"| adminApi
    adminSecret --> adminApi
${edges.join("\n")}
  end

  subgraph native["Private desktop and native Core"]
    desktopCI["Desktop packages CI · .github/workflows/desktop-packages.yml"]
    package["macOS, Windows and Linux builds · gui/apps/desktop/"]
    desktop["Electron and bb-app local UI, server and host daemon"]
    coreApi["Private Core API · core/src/lib.rs and core/docs/setup.md"]
    workspaceGrant["Approved member workspace · core/src/workspace_access.rs"]
    harnesses["Native agent harnesses · core/src/runtime/"]
    journal["Private sessions, history and agent account credentials"]
    skills["Agent Skills · skills/ and local .agents/skills/"]
    desktopCI --> package --> desktop
    desktop -->|"Private bearer-authenticated HTTP/SSE"| coreApi
    workspaceGrant -->|"Resolve a dedicated private Core"| coreApi
    coreApi --> harnesses
    coreApi --> journal
    skills -->|"Native discovery"| harnesses
  end

  subgraph sandbox["Opt-in business workspace pilot · core/docs/business-sandbox.md"]
    sandboxPolicy["Private worker policy · account, business and project grants"]
    sandboxRunner["Loopback business sandbox · core/src/business_sandbox/"]
    sandboxVolume["Project-scoped durable volume and per-job scratch"]
    sandboxPolicy -->|"Authorizes and revokes jobs"| sandboxRunner
    sandboxRunner -->|"Run on a disposable Linux worker"| sandboxVolume
  end

  subgraph customers["Customer workspace and publishing"]
    projects["Private projects · users/account/business/projects/project/"]
    dist["Approved project dist/ snapshot"]
    publish["Operator publish-site · deploy/publish-site.sh and core/src/site_release.rs"]
    siteData["Separate named volume · immutable site revisions"]
    starter["Opt-in standalone app and site-local /admin · starters/app-admin/"]
    appData["Private per-project accounts, credentials and form records"]
    projects --> dist --> publish -->|"Write completed revisions"| siteData
    projects --> starter --> appData
  end

  workspace --> webSource
  workspace --> rust
  workspace --> desktopCI
  workspace --> skills
  workspace --> projects
  image --> webChecks
  rollout -->|"Replace only agency-web, verify routes, restore healthy release on failure"| webRuntime
  readiness -->|"Host TLS smoke checks"| receipt
  rust --> coreApi
  rust --> sandboxRunner
  siteData -->|"Read-only mount"| staticPilot
`;
}

function outputs() {
  let config;
  try {
    const json = run("docker", ["compose", "--env-file", "/dev/null",
      "--project-name", "agency-map", "--file", compose, "config", "--format", "json",
      "--no-env-resolution", "--no-path-resolution",
    ], { env: { ...process.env, BAPX_WEB_IMAGE: "agency-web:map", LC_ALL: "C" } });
    config = JSON.parse(json);
  } catch (error) {
    throw new Error(`Could not read ${compose} with Docker Compose. ${error.message}`);
  }
  const service = config.services?.["agency-web"] ?? {};
  const routers = parseRouters(service.labels ?? {});
  const ci = read(workflow);
  const routeGroups = validateRoutes(routers, ci);
  const tracked = new Set(run("git", ["ls-files", "-z"]).split("\0"));
  const guides = publishedGuides(ci, tracked);
  validateIngress(service);
  requireSource(workflow, ["branches: [main]", "needs: [app, core]", "needs: web",
    "name: agency-web-release", "docker push", "StrictHostKeyChecking=yes"]);
  requireSource(dockerfile, ["RUN corepack pnpm build:web", "/build/gui/apps/www/dist /srv/bapx-web",
    'ENTRYPOINT ["/usr/local/bin/bapx-core", "serve-web"]']);
  requireSource("core/src/main.rs", ["return cloudroom::web::serve().await;",
    "cloudroom::serve(cloudroom::config::Config::from_env()?).await",
    "return cloudroom::business_sandbox::serve(policy.as_ref()).await;"]);
  requireSource(driver, ["gh run download", 'check_public "$sha"', "restore_pending"]);
  return [
    ["map.mmd", renderMap(routers, routeGroups)],
    [indexPath, renderIndex(routers, guides, projectSources())],
  ];
}

function stale(path, expected) {
  try {
    return read(path) !== expected;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return true;
  }
}

function writeOutputs(reports) {
  mkdirSync(join(root, "docs"), { recursive: true });
  const temporary = mkdtempSync(join(root, ".agency-inventory-"));
  try {
    for (const [path, content] of reports) {
      writeFileSync(join(temporary, path.split("/").at(-1)), content, { mode: 0o644 });
    }
    for (const [path] of reports) {
      renameSync(join(temporary, path.split("/").at(-1)), join(root, path));
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function runInventory([action, ...extra]) {
  const usage = `Usage: ${command} <generate | check | map | index>\n\n`
    + "generate  Write the architecture map and project index.\n"
    + "check     Validate source and check both generated files for drift.\n"
    + "map       Print the architecture map.\n"
    + "index     Print the JSON project index.\n";
  if (action === "--help" && !extra.length) {
    process.stdout.write(usage);
    return;
  }
  if (extra.length || !["generate", "check", "map", "index"].includes(action)) {
    throw new Error(usage.trimEnd());
  }
  const reports = outputs();
  if (action === "generate") {
    writeOutputs(reports);
  } else if (action === "check") {
    const changed = reports.filter(([path, expected]) => stale(path, expected)).map(([path]) => path);
    if (changed.length) throw new Error(`${changed.join(", ")} stale. Run ${command} generate.`);
  } else {
    process.stdout.write(reports[action === "map" ? 0 : 1][1]);
  }
}
