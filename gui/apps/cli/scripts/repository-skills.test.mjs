import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync, copyFileSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync,
  statSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const launcher = "gui/apps/cli/bin/bapx-cli";

test("repository skills are selected explicitly and stay inside the checkout", () => {
  const directory = mkdtempSync(join(tmpdir(), "agency-skills-test-"));
  const checkout = join(directory, "Agency checkout");
  const primary = join(checkout, "skills/review-note/SKILL.md");
  const installed = join(checkout, ".agents/skills/review-note/SKILL.md");
  const outside = join(directory, "outside.md");
  const initial = "# Review note\n";
  const updated = "# Review note\n\nCollect concrete results.\n";
  const run = (args, options) => {
    const result = spawnSync(join(checkout, launcher), ["repo", "skills", ...args], {
      encoding: "utf8", cwd: directory, ...options,
    });
    assert.ifError(result.error);
    return result;
  };
  const read = (file) => readFileSync(file, "utf8");
  try {
    mkdirSync(checkout);
    for (const file of [
      launcher, "gui/apps/cli/scripts/repository-cli.mjs", "gui/apps/cli/scripts/repository-skills.mjs",
    ]) {
      mkdirSync(dirname(join(checkout, file)), { recursive: true });
      copyFileSync(join(root, file), join(checkout, file));
    }
    for (const file of [primary, installed, join(checkout, "skills/private-note/SKILL.md"), outside]) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, initial);
    }
    for (const args of [["init", "--quiet"], ["add", "--", "skills/review-note/SKILL.md"]]) {
      execFileSync("git", args, { cwd: checkout });
    }
    const list = run(["list", "--json"]);
    assert.equal(list.status, 0, list.stderr);
    assert.deepEqual(JSON.parse(list.stdout), [{ name: "review-note", path: "skills/review-note/SKILL.md" }]);
    const selected = run(["read", "review-note"]);
    assert.equal(selected.status, 0, selected.stderr);
    assert.equal(selected.stdout, initial);
    for (const args of [["read", "private-note"], ["read", "../outside.md"], ["edit", "review-note"]]) {
      assert.equal(run(args).status, 1);
    }
    assert.equal(run(["edit", "review-note", "--stdin"], { input: "" }).status, 1);
    chmodSync(primary, 0o640);
    const edited = run(["edit", "review-note", "--stdin"], { input: updated });
    assert.equal(edited.status, 0, edited.stderr);
    assert.equal(read(primary), updated);
    assert.equal(statSync(primary).mode & 0o777, 0o640);
    assert.equal(read(installed), initial);

    if (process.getuid?.() !== 0) {
      chmodSync(primary, 0o440);
      assert.equal(run(["edit", "review-note", "--stdin"], { input: initial }).status, 1);
      assert.equal(read(primary), updated);
    }
    rmSync(primary);
    symlinkSync(outside, primary);
    assert.equal(run(["read", "review-note"]).status, 1);
    assert.equal(run(["edit", "review-note", "--stdin"], { input: updated }).status, 1);
    rmSync(primary);
    linkSync(outside, primary);
    assert.equal(run(["edit", "review-note", "--stdin"], { input: updated }).status, 1);
    assert.equal(read(outside), initial);
    rmSync(primary);
    rmSync(dirname(primary), { recursive: true });
    symlinkSync(directory, dirname(primary));
    writeFileSync(join(directory, "SKILL.md"), initial);
    assert.equal(run(["read", "review-note"]).status, 1);
    assert.equal(run(["edit", "review-note", "--stdin"], { input: updated }).status, 1);
    assert.equal(read(join(directory, "SKILL.md")), initial);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
