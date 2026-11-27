import assert from "node:assert/strict";
import { mkdtemp, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "./config.mjs";

test("app listener stays on loopback unless an HTTPS app opts into private bridge access", async (t) => {
  const data = await mkdtemp(join(tmpdir(), "bapx-app-bind-"));
  t.after(() => rmdir(data));
  const env = {
    APP_ID: "bind-fixture",
    APP_NAME: "Bind fixture",
    APP_ORIGIN: "http://127.0.0.1:3000",
    APP_DATA_DIR: data,
    APP_OWNER_EMAIL: "owner@example.test",
    APP_RESEND_API_KEY: "fixture-unused",
    APP_EMAIL_FROM: "fixture@example.test",
  };
  assert.equal((await loadConfig(env)).bindAddress, "127.0.0.1");
  assert.equal((await loadConfig({ ...env, APP_BIND_ADDRESS: "127.0.0.1" })).bindAddress, "127.0.0.1");
  assert.equal((await loadConfig({ ...env, APP_BIND_ADDRESS: "::1", APP_ORIGIN: "http://[::1]:3000" })).bindAddress, "::1");
  const privateConfig = await loadConfig({ ...env, APP_BIND_ADDRESS: "0.0.0.0", APP_ORIGIN: "https://app.example.test" });
  assert.equal(privateConfig.bindAddress, "0.0.0.0");
  assert.equal(privateConfig.host, "app.example.test");
  assert.equal(privateConfig.origin, "https://app.example.test");

  for (const bindAddress of ["", "localhost", "::", "[::1]", "192.0.2.1", "0.0.0.0:3000", "0.0.0.0 "]) {
    await assert.rejects(loadConfig({ ...env, APP_BIND_ADDRESS: bindAddress }), /APP_BIND_ADDRESS must be/);
  }
  await assert.rejects(loadConfig({ ...env, APP_BIND_ADDRESS: "0.0.0.0" }), /requires an HTTPS APP_ORIGIN/);
});
