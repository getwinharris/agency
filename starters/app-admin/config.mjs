import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const releaseRoot = fileURLToPath(new URL(".", import.meta.url));
const identifier = /^[a-z][a-z0-9-]{0,62}$/;
const fieldTypes = new Set(["text", "email", "textarea"]);

export function emailAddress(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email?.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return email;
  return null;
}

function uniqueEntries(entries, valid) {
  const seen = new Set();
  return Array.isArray(entries) && entries.every((entry) => {
    if (typeof entry?.id !== "string" || !identifier.test(entry.id) || seen.has(entry.id) || !valid(entry)) return false;
    seen.add(entry.id);
    return true;
  });
}

function validLabel(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 120;
}

export function validateForms(forms) {
  if (!uniqueEntries(forms, (form) => validLabel(form.title) &&
      form.fields?.length <= 30 && uniqueEntries(form.fields, (field) =>
        validLabel(field.label) && fieldTypes.has(field.type) && typeof field.required === "boolean"))) {
    throw new Error("Invalid form definitions. Use unique IDs and supported field types.");
  }
  return forms;
}

async function physicalPath(file) {
  try {
    return await realpath(file);
  } catch (error) {
    if (error.code !== "ENOENT" || file === path.dirname(file)) throw error;
    return path.join(await physicalPath(path.dirname(file)), path.basename(file));
  }
}

function contains(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

export async function loadConfig(env = process.env) {
  if (!identifier.test(env.APP_ID ?? "")) throw new Error("Set APP_ID to a stable lowercase app identifier.");
  if (!validLabel(env.APP_NAME)) throw new Error("Set APP_NAME to the site's display name.");
  const ownerEmail = emailAddress(env.APP_OWNER_EMAIL);
  if (!ownerEmail) throw new Error("Set APP_OWNER_EMAIL before bootstrapping the app.");
  const origin = new URL(env.APP_ORIGIN);
  const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(origin.hostname) || origin.hostname.endsWith(".localhost");
  if (origin.href !== `${origin.origin}/` || (origin.protocol !== "https:" &&
      !(origin.protocol === "http:" && loopback))) {
    throw new Error("APP_ORIGIN must be an HTTPS site origin or a loopback HTTP origin.");
  }
  if (!path.isAbsolute(env.APP_DATA_DIR ?? "")) throw new Error("APP_DATA_DIR must be an absolute path.");
  const dataDir = await physicalPath(env.APP_DATA_DIR);
  const release = await realpath(releaseRoot);
  if (contains(release, dataDir) || contains(dataDir, release)) {
    throw new Error("APP_DATA_DIR must be separate from the app release and its public files.");
  }
  if (Boolean(env.APP_GOOGLE_CLIENT_ID) !== Boolean(env.APP_GOOGLE_CLIENT_SECRET)) {
    throw new Error("Set both Google credential variables or omit both.");
  }
  if (!env.APP_RESEND_API_KEY || !env.APP_EMAIL_FROM) throw new Error("Set APP_RESEND_API_KEY and APP_EMAIL_FROM.");
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT.");
  const forms = JSON.parse(await readFile(new URL("forms.json", import.meta.url), "utf8"));
  return {
    appId: env.APP_ID,
    appName: env.APP_NAME,
    ownerEmail,
    origin: origin.origin,
    host: origin.host,
    port,
    dataDir,
    forms: validateForms(forms.forms),
    googleClientId: env.APP_GOOGLE_CLIENT_ID,
    googleClientSecret: env.APP_GOOGLE_CLIENT_SECRET,
    mailKey: env.APP_RESEND_API_KEY,
    mailFrom: env.APP_EMAIL_FROM,
  };
}
