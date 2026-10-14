import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { authenticateRequest } from "../src/auth";
import { ConnectorError } from "../src/errors";
import { resetConnectorForTests } from "../src/testing";
import { errorCode, mcpCall, signToken, startTestHarness, type TestHarness } from "./helpers";

let harness: TestHarness;

before(async () => {
  harness = await startTestHarness();
});

after(async () => {
  await harness.close();
});

test("missing token fails closed with AUTH_INVALID", async () => {
  const result = await mcpCall(null, "initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "auth-test", version: "0.0.0" },
  });
  assert.equal(result.status, 401);
  assert.equal(errorCode(result.json), "AUTH_INVALID");
  assert.equal(result.text.includes("eyJ"), false);
});

test("wrong audience, wrong issuer, and tenant mismatch are AUTH_INVALID", async () => {
  const wrongAud = await signToken(harness.privateKey, ["gads:clients.read"], { aud: "other-app" });
  const audResult = await mcpCall(wrongAud, "tools/list");
  assert.equal(audResult.status, 401);
  assert.equal(errorCode(audResult.json), "AUTH_INVALID");

  const wrongIss = await signToken(harness.privateKey, ["gads:clients.read"], { iss: "someone-else" });
  const issResult = await mcpCall(wrongIss, "tools/list");
  assert.equal(issResult.status, 401);
  assert.equal(errorCode(issResult.json), "AUTH_INVALID");

  const wrongTid = await signToken(harness.privateKey, ["gads:clients.read"], { tid: "other-tenant" });
  const tidResult = await mcpCall(wrongTid, "tools/list");
  assert.equal(tidResult.status, 401);
  assert.equal(errorCode(tidResult.json), "AUTH_INVALID");
});

test("expired token is AUTH_EXPIRED and is not stored for replay", async () => {
  const expired = await signToken(harness.privateKey, ["gads:clients.read"], { exp: "-1m" });
  const first = await mcpCall(expired, "tools/list");
  const second = await mcpCall(expired, "tools/list");
  assert.equal(errorCode(first.json), "AUTH_EXPIRED");
  assert.equal(first.status, 401);
  assert.equal(errorCode(second.json), "AUTH_EXPIRED");
});

test("local token is required only when HARNESS_LOCAL_TOKEN is set", async () => {
  process.env.HARNESS_LOCAL_TOKEN = "local-test-token";
  resetConnectorForTests();
  const token = await signToken(harness.privateKey, ["gads:clients.read"]);
  const missing = await authenticateRequest(
    new Request("http://localhost/api/mcp", { headers: { authorization: `Bearer ${token}` } }),
  ).then(
    () => null,
    (error: unknown) => error,
  );
  assert.ok(missing instanceof ConnectorError);
  assert.equal(missing.code, "AUTH_INVALID");

  const ok = await authenticateRequest(
    new Request("http://localhost/api/mcp", {
      headers: { authorization: `Bearer ${token}`, "x-hai-local-token": "local-test-token" },
    }),
  );
  assert.equal(ok.sub, "user-1");
  delete process.env.HARNESS_LOCAL_TOKEN;
});
