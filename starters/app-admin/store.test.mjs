import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openStore } from "./store.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "bapx-app-data-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, dataDir: join(root, "app"), appId: "sample" };
}

test("serializes concurrent changes across store handles and persists them on reopen", async t => {
  const options = await fixture(t);
  const first = await openStore(options);
  const second = await openStore(options);
  const ids = await Promise.all(Array.from({ length: 24 }, (_, index) => {
    const store = index % 2 === 0 ? first : second;
    return store.update(state => {
      const id = state.submissions.length + 1;
      state.submissions.push({ id, displayName: `Customer ${id}` });
      return id;
    });
  }));
  assert.deepEqual(ids, Array.from({ length: 24 }, (_, index) => index + 1));
  await first.update(state => state.users.push({ id: "customer", originalMethod: "email" }));

  const reopened = await openStore(options);
  const snapshot = await reopened.read();
  assert.deepEqual(snapshot.users, [{ id: "customer", originalMethod: "email" }]);
  assert.deepEqual(snapshot.submissions.map(item => item.id), ids);
  assert.deepEqual(await readdir(options.dataDir), ["state.json"]);

  snapshot.users.length = 0;
  assert.equal((await reopened.read()).users.length, 1);
});

test("a failed update leaves the last snapshot intact and clears the queue", async t => {
  const options = await fixture(t);
  const store = await openStore(options);
  await store.update(state => state.users.push({ id: "valid" }));

  const rejected = store.update(state => {
    state.users.length = 0;
    throw new Error("Failed mutation");
  });
  const recovered = store.update(state => state.signIns.push({ id: "next" }));

  await assert.rejects(rejected, /Failed mutation/);
  await recovered;

  await assert.rejects(store.update(state => { state.appId = "other"; }), /another app/);
  await assert.rejects(store.update(async state => {
    state.users.length = 0;
    throw new Error("Asynchronous mutation");
  }), /must be synchronous/);
  await assert.rejects(store.update(state => state.signIns.push(1n)), TypeError);

  const snapshot = await (await openStore(options)).read();
  assert.deepEqual(snapshot.users, [{ id: "valid" }]);
  assert.deepEqual(snapshot.signIns, [{ id: "next" }]);
  assert.deepEqual(await readdir(options.dataDir), ["state.json"]);
});

test("rejects a concurrent claim by a different app, including through a path alias", { skip: process.platform === "win32" }, async t => {
  const options = await fixture(t);
  await mkdir(options.dataDir);
  const alias = join(options.root, "alias");
  await symlink(options.dataDir, alias, "dir");

  const apps = await Promise.allSettled([
    openStore(options),
    openStore({ dataDir: alias, appId: "other" }),
  ]);
  const winners = apps.filter(result => result.status === "fulfilled");
  const rejected = apps.find(result => result.status === "rejected");
  assert.equal(winners.length, 1);
  assert.match(rejected.reason.message, /another app/);
  const data = await winners[0].value.read();
  assert.deepEqual(await (await openStore({ dataDir: alias, appId: data.appId })).read(), data);
});

test("rejects relative paths, unsupported snapshots, and symbolic state files", { skip: process.platform === "win32" }, async t => {
  const options = await fixture(t);
  await assert.rejects(openStore({ ...options, dataDir: "relative" }), /absolute path/);
  await mkdir(options.dataDir);
  const state = join(options.dataDir, "state.json");
  await writeFile(state, '{"version":2}');
  await assert.rejects(openStore(options), /Unsupported app data version/);
  await rm(state);
  await symlink(join(options.root, "elsewhere.json"), state, "file");
  await assert.rejects(openStore(options), /regular file/);
});
