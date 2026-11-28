import { execFileSync } from "node:child_process";
import {
  chmodSync,
  chownSync,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const usage = `Usage: bapx-cli repo skills <command>

Commands:
  list [--json]       List tracked Agency skills and their repository paths.
  read NAME          Print the selected SKILL.md.
  edit NAME --stdin  Replace the selected SKILL.md with text from standard input.
`;
const root = realpathSync(fileURLToPath(new URL("../../../../", import.meta.url)));
const noFollow = constants.O_NOFOLLOW ?? 0;

function trackedSkills() {
  const env = { ...process.env };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE", "GIT_PREFIX"]) {
    delete env[key];
  }
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", env });
  if (realpathSync(git("rev-parse", "--show-toplevel").trimEnd()) !== root) {
    throw new Error("Run repository skill commands from an Agency Git checkout.");
  }
  const skills = [];
  for (const entry of git("ls-files", "--stage", "-z", "--", "skills").split("\0")) {
    const match = /^100(?:644|755) [a-f0-9]+ 0\t(skills\/([a-z0-9]+(?:-[a-z0-9]+)*)\/SKILL\.md)$/.exec(entry);
    if (match) skills.push({ name: match[2], path: match[1] });
  }
  return skills;
}

function inspectSkill(file) {
  const stat = lstatSync(file, { bigint: true });
  if (!stat.isFile() || stat.nlink !== 1n || realpathSync(file) !== file) {
    throw new Error("The selected skill must be a regular, unlinked file inside this checkout.");
  }
  return stat;
}

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino
    && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function openSkill(file, access) {
  const stat = inspectSkill(file);
  const fd = openSync(file, access | noFollow);
  if (!sameFile(stat, fstatSync(fd, { bigint: true }))) {
    closeSync(fd);
    throw new Error("The selected skill changed while opening it. Retry with the current file.");
  }
  return { fd, stat };
}

function editSkill(file) {
  if (process.stdin.isTTY) throw new Error("Supply the replacement Markdown on standard input.");
  const { fd, stat } = openSkill(file, constants.O_RDWR);
  try {
    const contents = readFileSync(0, "utf8");
    if (!contents.trim() || contents.includes("\0")) {
      throw new Error("Supply nonempty Markdown text.");
    }
    if (!sameFile(stat, inspectSkill(file))) {
      throw new Error("The selected skill changed while reading input. Re-read it before retrying.");
    }
    if (readFileSync(fd, "utf8") === contents) return;
    const temporary = mkdtempSync(join(dirname(file), ".bapx-skill-"));
    try {
      const replacement = join(temporary, "SKILL.md");
      writeFileSync(replacement, contents, { mode: 0o600, flag: "wx" });
      const replacementInfo = lstatSync(replacement, { bigint: true });
      if (replacementInfo.uid !== stat.uid || replacementInfo.gid !== stat.gid) {
        chownSync(replacement, Number(stat.uid), Number(stat.gid));
      }
      chmodSync(replacement, Number(stat.mode & 0o777n));
      if (!sameFile(stat, inspectSkill(file))) {
        throw new Error("The selected skill changed while preparing the edit. Re-read it before retrying.");
      }
      renameSync(replacement, file);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  } finally {
    closeSync(fd);
  }
}

export function runSkills([action, ...args]) {
  if (action === undefined || (action === "--help" && !args.length)) {
    process.stdout.write(usage);
    return;
  }
  if (action === "list" && (args.length === 0 || (args.length === 1 && args[0] === "--json"))) {
    const skills = trackedSkills();
    process.stdout.write(args.length
      ? JSON.stringify(skills, null, 2) + "\n"
      : skills.map(({ name, path }) => `${name}\t${path}\n`).join(""));
    return;
  }
  const [name, mode] = args;
  const read = action === "read" && args.length === 1;
  const edit = action === "edit" && args.length === 2 && mode === "--stdin";
  if (!read && !edit) throw new Error(usage.trimEnd());
  const skill = trackedSkills().find((entry) => entry.name === name);
  if (!skill) throw new Error("Select a tracked skill name from bapx-cli repo skills list.");
  const file = join(root, skill.path);
  if (edit) {
    editSkill(file);
    return;
  }
  const { fd } = openSkill(file, constants.O_RDONLY);
  try {
    process.stdout.write(readFileSync(fd));
  } finally {
    closeSync(fd);
  }
}
