import { constants } from "node:fs";
import { link, lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";

const collectionNames = ["users", "signIns", "challenges", "sessions", "submissions"];
const pendingByFile = new Map();

function serialize(file, operation) {
  const next = (pendingByFile.get(file) ?? Promise.resolve()).then(operation);
  const tail = next.catch(() => {});
  pendingByFile.set(file, tail);

  return next.finally(() => {
    if (pendingByFile.get(file) === tail) pendingByFile.delete(file);
  });
}

function checkSnapshot(snapshot, appId) {
  if (!snapshot || snapshot.version !== 1) {
    throw new Error("Unsupported app data version");
  }
  if (snapshot.appId !== appId) {
    throw new Error("Data directory belongs to another app");
  }
  if (collectionNames.some(name => !Array.isArray(snapshot[name]))) {
    throw new Error("Invalid app data collections");
  }
  return snapshot;
}

async function readSnapshot(file, appId) {
  if (!(await lstat(file)).isFile()) {
    throw new Error("App data must be a regular file");
  }

  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const contents = await handle.readFile("utf8");
    let snapshot;
    try {
      snapshot = JSON.parse(contents);
    } catch {
      throw new Error("Invalid app data JSON");
    }
    return checkSnapshot(snapshot, appId);
  } finally {
    await handle.close();
  }
}

async function syncDirectory(directory) {
  if (process.platform === "win32") return;
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeSnapshot(directory, file, snapshot, initial = false) {
  const contents = JSON.stringify(snapshot) + "\n";
  const temporary = join(directory, `.state-${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    try {
      await handle.writeFile(contents, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }

    if (initial) {
      // The first snapshot must never replace another app's claim to this directory.
      await link(temporary, file);
    } else {
      await rename(temporary, file);
    }
    await syncDirectory(directory);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Open persistent app data. Only one process should write to the directory. */
export async function openStore({ dataDir, appId }) {
  if (typeof appId !== "string" || !appId.trim()) {
    throw new TypeError("App ID is required");
  }
  if (typeof dataDir !== "string" || !isAbsolute(dataDir)) {
    throw new TypeError("App data directory must be an absolute path");
  }

  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const directory = await realpath(dataDir);
  const file = join(directory, "state.json");

  await serialize(file, async () => {
    try {
      await readSnapshot(file, appId);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const initial = { version: 1, appId };
      for (const name of collectionNames) initial[name] = [];
      try {
        await writeSnapshot(directory, file, initial, true);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        await readSnapshot(file, appId);
      }
    }
  });

  return {
    read() {
      return serialize(file, () => readSnapshot(file, appId));
    },
    update(mutator) {
      return serialize(file, async () => {
        const snapshot = await readSnapshot(file, appId);
        const result = mutator(snapshot);
        if (typeof result?.then === "function") {
          Promise.resolve(result).catch(() => {});
          throw new TypeError("App data update must be synchronous");
        }
        await writeSnapshot(directory, file, checkSnapshot(snapshot, appId));
        return result;
      });
    },
  };
}
