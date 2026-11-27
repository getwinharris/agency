import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { adminPages } from "./admin/pages.ts";
import { accountPages } from "./auth/pages.ts";
import { docsPages } from "./docs/pages.ts";
import { mediaHubPages } from "./mediahub/pages.ts";
import { publicPages } from "./pages.ts";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(packageRoot, "dist");
const pages = {
  ...publicPages(),
  ...await docsPages(resolve(packageRoot, "../../..")),
  ...mediaHubPages(),
  ...adminPages(),
  ...accountPages(),
};
await rm(output, { recursive: true, force: true });
await cp(resolve(packageRoot, "public"), output, { recursive: true });
const managementStyles = await readFile(resolve(output, "admin/index.css"), "utf8");
await writeFile(resolve(output, "auth/management.css"), `@scope (#admin-workspace) {\n${managementStyles.replace(":root {", ":scope {")}\n}\n`);

for (const [file, html] of Object.entries(pages)) {
  const destination = resolve(output, file);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, html);
}
