import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { BAPX_DESKTOP_SCHEME } from "../scripts/desktop-release-channel.mjs";

const run = promisify(execFile);

export type LinuxDesktopEntryResult =
  | { kind: "created" | "updated" | "unchanged"; entryPath: string }
  | { kind: "skipped"; reason: "invalid-desktop-name" };

interface EnsureLinuxDesktopEntryArgs {
  appImagePath: string;
  applicationName: string;
  dataHome: string;
  desktopName: string;
  iconPath: string;
  registerShareLinks: boolean;
}

function quoteExecArgument(value: string): string {
  const quoted = value.replace(/["`$\\]/g, "\\$&");
  return `"${quoted.replace(/\\/g, "\\\\").replace(/%/g, "%%")}"`;
}

async function writeIfChanged(
  path: string,
  content: string | Buffer,
): Promise<"created" | "updated" | "unchanged"> {
  const current = await fs.readFile(path).catch(() => null);
  if (current?.equals(Buffer.from(content))) return "unchanged";
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, content);
  return current === null ? "created" : "updated";
}

export async function ensureLinuxDesktopEntry(
  args: EnsureLinuxDesktopEntryArgs,
): Promise<LinuxDesktopEntryResult> {
  if (!/^[A-Za-z0-9._-]+\.desktop$/.test(args.desktopName)) {
    return { kind: "skipped", reason: "invalid-desktop-name" };
  }
  const appId = args.desktopName.slice(0, -".desktop".length);
  const iconTarget = join(args.dataHome, "icons", `${appId}.png`);
  const entryPath = join(args.dataHome, "applications", args.desktopName);

  await writeIfChanged(iconTarget, await fs.readFile(args.iconPath));
  const entry = [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${args.applicationName}`,
    `Exec=${quoteExecArgument(args.appImagePath)} %U`,
    `Icon=${iconTarget}`,
    "Terminal=false",
    "Categories=Development;",
    `StartupWMClass=${appId}`,
    ...(args.registerShareLinks ? [`MimeType=x-scheme-handler/${BAPX_DESKTOP_SCHEME};`] : []),
    "",
  ].join("\n");
  const kind = await writeIfChanged(entryPath, entry);
  if (kind !== "unchanged") {
    // GIO reads mimeinfo.cache when choosing a handler. Minimal desktops can
    // omit this utility, so the entry still works with XDG file lookup.
    await run("update-desktop-database", [dirname(entryPath)], { timeout: 5_000 })
      .catch(() => undefined);
  }
  return { kind, entryPath };
}
