import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const parameters = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const algorithm = "scrypt-v1";
const saltPattern = /^[\da-f]{32}$/;
const keyPattern = /^[\da-f]{64}$/;

export function normalizePassword(value) {
  if (typeof value !== "string" || value.length > 256) return null;
  const password = value.normalize("NFC");
  const length = [...password].length;
  return length >= 15 && length <= 128 ? password : null;
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, 32, parameters);
  return { algorithm, salt: salt.toString("hex"), key: key.toString("hex") };
}

export async function matchesPassword(password, credential) {
  const valid = credential?.algorithm === algorithm && typeof credential.salt === "string" &&
    typeof credential.key === "string" && saltPattern.test(credential.salt) && keyPattern.test(credential.key);
  // Do the same expensive work for an address without a usable password.
  const salt = valid ? Buffer.from(credential.salt, "hex") : Buffer.alloc(16);
  const expected = valid ? Buffer.from(credential.key, "hex") : Buffer.alloc(32);
  const actual = await derive(password, salt, 32, parameters);
  return timingSafeEqual(actual, expected) && valid;
}

export function passwordThrottle() {
  const window = 60_000;
  let until = 0;
  let used = 0;
  let active = 0;
  const addresses = new Map();
  return {
    async run(email, work) {
      const now = Date.now();
      if (now >= until) {
        until = now + window;
        used = 0;
        addresses.clear();
      }
      const attempts = addresses.get(email) ?? 0;
      if (active >= 2 || used >= 40 || attempts >= 8) return { limited: true };
      active++;
      used++;
      addresses.set(email, attempts + 1);
      try {
        return await work();
      } finally {
        active--;
      }
    },
  };
}
