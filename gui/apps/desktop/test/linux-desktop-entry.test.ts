import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ensureLinuxDesktopEntry } from "../src/linux-desktop-entry.js";

it("upgrades the stable share handler and leaves the scheme out of nightly", async () => {
  const root = await mkdtemp(join(tmpdir(), "bapx-linux-desktop-entry-"));
  try {
    const iconPath = join(root, "source.png");
    const desktopName = "bapx-agents.desktop";
    const appImagePath = join(root, "bapX Agents.AppImage");
    const applications = join(root, "applications");
    const entryPath = join(applications, desktopName);
    const options = { appImagePath, desktopName, dataHome: root, iconPath };
    await writeFile(iconPath, "icon");
    await mkdir(applications);
    await writeFile(entryPath, "MimeType=x-scheme-handler/cloudroom;\n");

    const stable = { ...options, applicationName: "bapX Agents", registerShareLinks: true };
    expect(await ensureLinuxDesktopEntry(stable)).toEqual({ kind: "updated", entryPath });
    const entry = await readFile(entryPath, "utf8");
    expect(entry).toContain(`Exec="${appImagePath}" %U\n`);
    expect(entry).toContain("MimeType=x-scheme-handler/bapx-agents;\n");
    expect(entry).not.toContain("MimeType=x-scheme-handler/cloudroom;");
    expect(await ensureLinuxDesktopEntry(stable)).toEqual({ kind: "unchanged", entryPath });

    const nightly = await ensureLinuxDesktopEntry({
      ...options,
      applicationName: "bapX Agents Nightly",
      desktopName: "bapx-agents-nightly.desktop",
      registerShareLinks: false,
    });
    expect(nightly.kind).toBe("created");
    expect(await readFile(join(applications, "bapx-agents-nightly.desktop"), "utf8"))
      .not.toContain("x-scheme-handler/");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
