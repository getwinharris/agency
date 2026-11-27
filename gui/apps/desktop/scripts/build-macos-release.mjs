import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readDesktopPackageVersion } from "./desktop-version.mjs";

const desktopDirectory = fileURLToPath(new URL("../", import.meta.url));
const releaseDirectory = join(desktopDirectory, "release.noindex");
const builderArgs = [
  "scripts/run-electron-builder.mjs", "--stamp", "--mac", "--arm64", "--publish", "never", "--mac-release",
];

function git(args) {
  return execFileSync("git", args, { cwd: desktopDirectory, encoding: "utf8" }).trim();
}

function requireApprovedCheckout(approvedSha) {
  if (git(["rev-parse", "HEAD"]) !== approvedSha || git(["status", "--porcelain"])) {
    throw new Error("Build from a clean checkout of the approved Git SHA.");
  }
}

async function buildMacRelease([approvedVersion, approvedSha, ...extra]) {
  if (!approvedVersion || !/^[a-f0-9]{40}$/u.test(approvedSha ?? "") || extra.length) {
    throw new Error("Usage: pnpm run dist:mac:release <approved version> <approved full Git SHA>");
  }
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw new Error("Build the Apple Silicon release on macOS with native arm64 Node.js.");
  }
  if (await readDesktopPackageVersion() !== approvedVersion) {
    throw new Error("The desktop package version does not match the approved release version.");
  }
  requireApprovedCheckout(approvedSha);

  const signingEnv = {
    ...process.env,
    BB_DESKTOP_COMMIT: approvedSha,
    BAPX_MAC_RELEASE_OUTPUT: join(releaseDirectory, "preflight-only"),
  };
  execFileSync(process.execPath, [...builderArgs, "--print-config"], {
    cwd: desktopDirectory, env: signingEnv, stdio: ["ignore", "ignore", "inherit"],
  });
  if (!signingEnv.CSC_LINK?.trim()) {
    const identities = execFileSync("security", ["find-identity", "-v", "-p", "codesigning"], { encoding: "utf8" });
    if (!identities.includes('"Developer ID Application:')) {
      throw new Error("The signing keychain has no valid Developer ID Application identity.");
    }
  }

  await mkdir(releaseDirectory, { recursive: true });
  const output = await mkdtemp(join(releaseDirectory, `macos-v${approvedVersion}-${approvedSha.slice(0, 12)}-`));
  signingEnv.BAPX_MAC_RELEASE_OUTPUT = output;
  const buildEnv = { ...signingEnv };
  for (const key of ["CSC_LINK", "CSC_KEY_PASSWORD", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID", "APPLE_KEYCHAIN_PROFILE"]) {
    delete buildEnv[key];
  }
  const buildOptions = { cwd: desktopDirectory, env: buildEnv, stdio: "inherit" };
  execFileSync("pnpm", ["run", "prepare-runtime"], buildOptions);
  execFileSync("pnpm", ["run", "build", "--stamp"], buildOptions);
  execFileSync(process.execPath, builderArgs, { ...buildOptions, env: signingEnv });
  execFileSync("/bin/bash", ["scripts/verify-macos-release.sh", output, approvedVersion, approvedSha], buildOptions);
  requireApprovedCheckout(approvedSha);

  const files = ["dmg", "zip"].map((extension) => `bapx-agents-v${approvedVersion}-arm64.${extension}`);
  const artifacts = await Promise.all(files.map(async (name) => {
    const path = join(output, name);
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return { name, sha256: hash.digest("hex"), bytes: (await stat(path)).size };
  }));
  await writeFile(join(output, "SHA256SUMS.txt"), artifacts.map(({ name, sha256 }) => `${sha256}  ${name}\n`).join(""), { flag: "wx" });
  await writeFile(join(output, "macos-release.json"), `${JSON.stringify({
    version: approvedVersion,
    sha: approvedSha,
    architecture: "arm64",
    updatesEnabled: signingEnv.BAPX_DESKTOP_UPDATES === "1",
    verifiedAt: new Date().toISOString(),
    artifacts,
  }, null, 2)}\n`, { flag: "wx" });
  console.log(`Verified macOS release candidate files in ${output}. Complete the isolated install and workflow QA before publishing.`);
}

await buildMacRelease(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
