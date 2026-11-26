import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageJsonUrl = new URL("../package.json", import.meta.url);
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;

export function stampRequested(env, args = []) {
  return env.BB_CLOUDROOM_STAMP === "1" || args.includes("--stamp");
}

export async function readDesktopPackageVersion() {
  const { version } = JSON.parse(await readFile(packageJsonUrl, "utf8"));
  if (typeof version !== "string" || !versionPattern.test(version)) {
    throw new Error("The desktop package version must use MAJOR.MINOR.PATCH.");
  }
  return version;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  console.log(await readDesktopPackageVersion());
}
