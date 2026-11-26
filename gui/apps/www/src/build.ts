import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mediaHubPages } from "./mediahub/pages.ts";
import { publicPages } from "./pages.ts";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(packageRoot, "dist");
await rm(output, { recursive: true, force: true });
await cp(resolve(packageRoot, "public"), output, { recursive: true });

for (const [file, html] of Object.entries({ ...publicPages(), ...mediaHubPages() })) {
  const destination = resolve(output, file);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, html);
}
