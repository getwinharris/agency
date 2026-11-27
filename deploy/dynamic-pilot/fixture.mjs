import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { Server } from "node:http";

const appCookies = new Set(["__Host-bapx-app-email", "__Host-bapx-app-session"]);
const emit = Server.prototype.emit;
Server.prototype.emit = function (event, ...args) {
  if (event === "request") {
    const headers = args[0].headers;
    assert.equal(headers.authorization, undefined, "Proxy leaked Authorization");
    assert.equal(headers["proxy-authorization"], undefined, "Proxy leaked Proxy-Authorization");
    assert.equal(headers.forwarded, undefined, "Proxy leaked Forwarded");
    for (const cookie of (headers.cookie ?? "").split(";").map((part) => part.trim()).filter(Boolean)) {
      assert.ok(appCookies.has(cookie.split("=")[0]), "Proxy leaked a foreign cookie");
    }
  }
  return emit.call(this, event, ...args);
};

globalThis.fetch = async (url, options) => {
  assert.equal(String(url), "https://api.resend.com/emails");
  assert.equal(options.method, "POST");
  const message = JSON.parse(options.body);
  assert.deepEqual(message.to, [process.env.APP_OWNER_EMAIL]);
  const link = message.text.match(/https:\/\/\S+\/auth\/email\/verify\?token=\S+/)?.[0];
  assert.ok(link, "Local confirmation link missing");
  assert.equal(new URL(link).origin, process.env.APP_ORIGIN);
  await writeFile("/fixture-data/mail.json", JSON.stringify({ link }), { mode: 0o600 });
  return Response.json({ id: "isolated-fixture" });
};
