import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const launcher = "gui/apps/cli/bin/bapx-cli";
const mapPath = "map.mmd";
const indexPath = "docs/project-index.json";

test("checkout CLI preserves generated outputs and rejects drift without writing", () => {
  const directory = mkdtempSync(join(tmpdir(), "agency-inventory-test-"));
  const map = readFileSync(join(root, mapPath), "utf8");
  const index = readFileSync(join(root, indexPath), "utf8");
  const inventory = JSON.parse(index);
  const compose = inventory.routes[0].source;
  const files = new Set([
    launcher, "gui/apps/cli/scripts/repository-cli.mjs",
    "gui/apps/cli/scripts/repository-inventory.mjs", mapPath, indexPath,
    compose, inventory.docs.registry, inventory.workspace_config,
    ...Object.values(inventory.release), ...Object.values(inventory.sources).flat(),
    ...inventory.docs.guides.map(({ source }) => source),
    "core/src/web/admin.rs", "deploy/publish-site.sh",
  ]);
  const git = (...args) => execFileSync("git", args, { cwd: directory, stdio: "pipe" });
  const run = (action) => {
    const result = spawnSync(join(directory, launcher), ["repo", "inventory", action], {
      // A reachable engine is unnecessary for a checked-in Compose config.
      env: { ...process.env, DOCKER_HOST: "unix:///nonexistent/agency-inventory.sock" },
      cwd: tmpdir(),
      encoding: "utf8",
    });
    assert.ifError(result.error);
    return result;
  };
  const expectOk = (action, output = "") => {
    const result = run(action);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, output);
  };
  const expectFailure = (action, message) => {
    const result = run(action);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, message);
  };
  const read = (file) => readFileSync(join(directory, file), "utf8");
  const write = (file, content) => writeFileSync(join(directory, file), content);
  try {
    git("init", "--quiet");
    for (const file of files) {
      mkdirSync(dirname(join(directory, file)), { recursive: true });
      copyFileSync(join(root, file), join(directory, file));
    }
    git("add", ".");
    expectOk("map", map);
    expectOk("index", index);
    expectOk("check");

    write(indexPath, "stale index\n");
    expectFailure("check", /docs\/project-index\.json stale/);
    assert.equal(read(indexPath), "stale index\n");
    expectOk("generate");
    assert.equal(read(mapPath), map);
    assert.equal(read(indexPath), index);

    const verifier = inventory.release.smoke_verifier;
    const checks = read(verifier);
    write(verifier, checks.replace(', "www.bapx.in",', ','));
    expectFailure("generate", /Public web CI health checks disagree/);
    assert.equal(read(mapPath), map);
    assert.equal(read(indexPath), index);
    write(verifier, checks);

    const workflow = inventory.release.workflow;
    const ci = read(workflow);
    write(workflow, ci.replace(/^( +)(.+repo verify web --revision.+)$/m, "$1# $2"));
    expectFailure("check", /Public web CI must run/);
    write(workflow, ci.replace(`      - '${verifier}'\n`, ""));
    expectFailure("check", /Web verifier is missing from Public web PR path coverage/);
    write(workflow, ci);

    const ingress = read(compose);
    write(compose, ingress.replace(
      /^([ ]*traefik\.http\.routers\.agency-account-login\.priority: )"520"$/m, '$1"1"',
    ));
    expectFailure("check", /Public ingress, storage or pilot request isolation differs/);
    write(compose, ingress);

    const dockerfile = inventory.release.image;
    const image = read(dockerfile);
    write(dockerfile, image.replace(/^COPY gui\/README\.md README\.md\n/m, ""));
    expectFailure("check", /build-from-source source is missing from the web image/);
    write(dockerfile, image);
    expectOk("check");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
