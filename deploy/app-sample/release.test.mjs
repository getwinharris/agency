import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";

const source = await readFile(new URL("./deploy.sh", import.meta.url), "utf8");
const sha = "a".repeat(40);
const otherSha = "b".repeat(40);
const runId = "12345679";
const attempt = "2";
const downloadStop = 45;
const receipt = { sha, run: Number(runId), attempt: Number(attempt) };
const completedRun = {
  path: ".github/workflows/web.yml",
  name: "Public web",
  event: "push",
  head_branch: "main",
  head_sha: sha,
  head_repository: { full_name: "getwinharris/agency" },
  run_attempt: Number(attempt),
  status: "completed",
  conclusion: "success",
};
const health = { ready: true, service: "bapx-web", revision: sha };
const defaults = { receipt, run: completedRun, main: sha, health, artifacts: 1 };

function shellQuote(value) {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

function fixtureSource(directory) {
  const sandboxFiles = {
    state: ["/var/lib/bapx-agency-app-sample", "state"],
    platform: ["/var/lib/bapx-agency-web-deploy/last-good.json", "platform.json"],
    owner_file: ["/etc/bapx-agency/sample-owner-password", "owner-password"],
  };
  let sandboxed = source;
  for (const [variable, [productionPath, fixturePath]] of Object.entries(sandboxFiles)) {
    const declaration = `${variable}=${productionPath}`;
    assert.equal(sandboxed.split("\n").filter((line) => line === declaration).length, 1,
      `Expected one exact ${variable} path before running the worker fixture`);
    sandboxed = sandboxed.replace(declaration, `${variable}=${shellQuote(join(directory, fixturePath))}`);
  }
  return sandboxed;
}

async function writeCommand(bin, name, body) {
  await writeFile(join(bin, name), `#!/bin/bash\nset -eu\n${body}\n`, { mode: 0o700 });
}

async function runFixture(t, overrides) {
  const fixture = { ...defaults, ...overrides };
  const directory = await mkdtemp(join(tmpdir(), "agency-sample-worker-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bin = join(directory, "bin");
  await mkdir(bin, { mode: 0o700 });

  const files = {
    "platform.json": JSON.stringify(fixture.receipt),
    "owner-password": "disposable local test token",
    "main.txt": fixture.main,
    "health.json": JSON.stringify(fixture.health),
    "run.json": JSON.stringify(fixture.run),
    "artifacts.txt": String(fixture.artifacts),
    "trace.log": "",
    "worker.sh": fixtureSource(directory),
  };
  await Promise.all(Object.entries(files).map(([name, content]) =>
    writeFile(join(directory, name), content, { mode: 0o600 })));
  if (fixture.failedRollbackInspection) {
    const key = `${runId}-${attempt}`;
    const state = join(directory, "state");
    const bundle = join(state, "releases", key);
    await mkdir(bundle, { recursive: true });
    const compose = "services: {}\n";
    const proxy = "# fixture configuration\n";
    const hash = (value) => createHash("sha256").update(value).digest("hex");
    const manifest = {
      sha,
      image: "ghcr.io/getwinharris/agency-app-sample@sha256:" + "a".repeat(64),
      composeSha256: hash(compose),
      proxySha256: hash(proxy),
    };
    await Promise.all([
      writeFile(join(state, "current"), ""),
      writeFile(join(state, "pending"), key + "\n"),
      writeFile(join(bundle, "compose.yml"), compose),
      writeFile(join(bundle, "nginx.conf"), proxy),
      writeFile(join(bundle, "release.json"), JSON.stringify(manifest)),
    ]);
  }
  await Promise.all([
    writeCommand(bin, "flock", 'test "$*" = "-n 9"'),
    writeCommand(bin, "curl", `
      printf '%s\\n' curl >> "$FIXTURE/trace.log"
      for last in "$@"; do :; done
      test "$last" = 'https://bapx.in/healthz'
      cat "$FIXTURE/health.json"`),
    writeCommand(bin, "gh", `
      case "$*" in
        'api repos/getwinharris/agency/git/ref/heads/main --jq .object.sha')
          printf '%s\\n' main >> "$FIXTURE/trace.log"
          cat "$FIXTURE/main.txt"
          ;;
        'api repos/getwinharris/agency/actions/runs/${runId}')
          printf '%s\\n' run >> "$FIXTURE/trace.log"
          cat "$FIXTURE/run.json"
          ;;
        'api repos/getwinharris/agency/actions/runs/${runId}/artifacts?name=agency-app-sample-release --jq .total_count')
          printf '%s\\n' artifacts >> "$FIXTURE/trace.log"
          cat "$FIXTURE/artifacts.txt"
          ;;
        'run download ${runId} --repo getwinharris/agency --name agency-app-sample-release --dir '*)
          printf '%s\\n' download >> "$FIXTURE/trace.log"
          exit ${downloadStop}
          ;;
        *) printf '%s\\n' unexpected-gh >> "$FIXTURE/trace.log"; exit 96 ;;
      esac`),
    writeCommand(bin, "docker", fixture.failedRollbackInspection ? `
      case "$*" in
        'compose --project-name bapx-app-sample -f '*'/compose.yml down')
          printf '%s\\n' down >> "$FIXTURE/trace.log" ;;
        'compose --project-name bapx-app-sample -f '*'/compose.yml ps --all --quiet')
          printf '%s\\n' inspect >> "$FIXTURE/trace.log"; exit 42 ;;
        *) exit 97 ;;
      esac` : 'printf \'%s\\n\' unexpected-docker >> "$FIXTURE/trace.log"; exit 97'),
  ]);

  const result = spawnSync("bash", [join(directory, "worker.sh"), sha, runId, attempt], {
    cwd: directory,
    env: {
      PATH: [bin, process.env.PATH].join(delimiter),
      HOME: directory,
      TMPDIR: directory,
      FIXTURE: directory,
    },
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  const trace = (await readFile(join(directory, "trace.log"), "utf8")).trim().split("\n").filter(Boolean);
  let pending;
  if (fixture.failedRollbackInspection) {
    pending = await readFile(join(directory, "state", "pending"), "utf8");
  }
  return { ...result, trace, pending };
}

const runGate = ["main", "curl", "run"];
const artifactGate = [...runGate, "artifacts"];
const cases = [
  ["downloads only the exact successful, completed main release", {}, [...artifactGate, "download"], downloadStop],
  ["rejects a stale receipt SHA", { receipt: { ...receipt, sha: otherSha } }, []],
  ["rejects a stale receipt run", { receipt: { ...receipt, run: 12345678 } }, []],
  ["rejects a stale receipt attempt", { receipt: { ...receipt, attempt: 1 } }, []],
  ["rejects a superseded main SHA", { main: otherSha }, ["main"]],
  ["rejects a different live first-party revision", { health: { ...health, revision: otherSha } }, ["main", "curl"]],
  ["rejects an incomplete workflow", { run: { ...completedRun, status: "in_progress", conclusion: null } }, runGate],
  ["rejects a failed workflow", { run: { ...completedRun, conclusion: "failure" } }, runGate],
  ["rejects a stale workflow SHA", { run: { ...completedRun, head_sha: otherSha } }, runGate],
  ["rejects a different workflow path", { run: { ...completedRun, path: ".github/workflows/other.yml" } }, runGate],
  ["rejects a different workflow attempt", { run: { ...completedRun, run_attempt: 1 } }, runGate],
  ["rejects an untrusted repository", { run: { ...completedRun, head_repository: { full_name: "elsewhere/agency" } } }, runGate],
  ["rejects a pull request event", { run: { ...completedRun, event: "pull_request" } }, runGate],
  ["rejects a non-main branch", { run: { ...completedRun, head_branch: "feature" } }, runGate],
  ["rejects a missing sample artifact", { artifacts: 0 }, artifactGate],
  ["rejects duplicate sample artifacts", { artifacts: 2 }, artifactGate],
];

for (const [name, fixture, trace, expectedStatus = 1] of cases) {
  test(name, async (t) => {
    const result = await runFixture(t, fixture);
    assert.deepEqual(result.trace, trace, result.stderr);
    assert.equal(result.status, expectedStatus, result.stderr);
  });
}

test("preserves pending rollback when Compose cannot verify teardown", async (t) => {
  const result = await runFixture(t, { failedRollbackInspection: true });
  assert.deepEqual(result.trace, ["down", "inspect"], result.stderr);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.pending, `${runId}-${attempt}\n`);
});
