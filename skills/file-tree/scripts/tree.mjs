import { execFileSync } from "node:child_process";
import { basename, resolve } from "node:path";

const directory = process.argv[2] ?? ".";
if (directory === "--help" || process.argv.length > 3) {
  console.log("Usage: node tree.mjs [git-directory]");
  process.exit(directory === "--help" ? 0 : 2);
}

const depth = 2;
const lineLimit = 30;
const cleanName = (name) =>
  name.replace(/[\u0000-\u001f\u007f]/gu, (character) =>
    JSON.stringify(character).slice(1, -1),
  );
let files;
try {
  files = execFileSync("git", ["-C", directory, "ls-files", "--cached", "-z"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).split("\0");
} catch {
  console.error("Could not list tracked files. Choose a directory in a Git checkout with Git on PATH.");
  process.exit(1);
}

const outline = new Map();
for (const filename of files) {
  if (!filename) continue;
  const parts = filename.split("/");
  for (let index = 0; index < Math.min(parts.length, depth); index++) {
    const key = parts.slice(0, index + 1).join("/");
    const ending = index + 1 < parts.length ? "/" : "";
    outline.set(
      key,
      `${"  ".repeat(index + 1)}${cleanName(parts[index])}${ending}`,
    );
  }
}

const rootName = cleanName(basename(resolve(directory)));
console.log(rootName ? `${rootName}/` : "/");
for (const line of [...outline.values()].slice(0, lineLimit)) console.log(line);
if (outline.size > lineLimit) console.log("  …");
