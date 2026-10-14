import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { after, before, test } from "node:test";
import { assertScope, assertToolEnabled } from "../src/access";
import { canonicalJson } from "../src/canonical";
import { ConnectorError } from "../src/errors";
import { connectorVersion } from "../src/version";
import { HOSTING_TOOL_NAMES, tools } from "../src/tools";
import { hostingSchemas } from "../src/tools/hosting";
import { resetConnectorForTests } from "../src/testing";
import {
  errorCode,
  mcpCall,
  readAllToolsToggle,
  signToggle,
  signToken,
  startTestHarness,
  CANARY,
  type TestHarness,
} from "./helpers";

const ROOT = join(import.meta.dirname, "../..");
const DATA_CLASSES = new Set([
  "public",
  "internal",
  "confidential",
  "pii.contact",
  "pii.business_contact",
  "pii.sensitive",
  "financial",
  "payment",
  "credentials",
  "customer_content",
  "location",
  "analytics",
  "code",
  "logs",
]);
const VERBS = new Set(["list", "get", "search", "create", "update", "delete", "run"]);
const REQUIRED_AUDIT = [
  "ts",
  "requestId",
  "sessionId",
  "userId",
  "deviceId",
  "tenantId",
  "connectorId",
  "connectorVersion",
  "tool",
  "access",
  "outcome",
  "errorCode",
  "inputHmac",
  "hmacKeyId",
];

let harness: TestHarness;

before(async () => {
  harness = await startTestHarness();
});

after(async () => {
  delete process.env.HARNESS_RATE_LIMIT_OVERRIDE;
  await harness.close();
});

async function enableReads(): Promise<void> {
  resetConnectorForTests();
  const event = await signToggle(harness.privateKey, readAllToolsToggle(1));
  const token = await signToken(harness.privateKey, ["gads:clients.read", "gads:hosting.read"]);
  const { POST } = await import("../../app/api/mcp/admin/toggle/route");
  const response = await POST(
    new Request("http://localhost/api/mcp/admin/toggle", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-hai-request-id": "req-toggle",
      },
      body: JSON.stringify(event),
    }),
  );
  const text = await response.text();
  assert.equal(response.status, 200, text);
}

async function capture(fn: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  try {
    await fn();
    return lines.join("\n");
  } finally {
    console.log = original;
  }
}

test("1 manifest validates", () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, "mcp/manifest.json"), "utf8")) as {
    id: string;
    version: string;
    specVersion: string;
    language: string;
    tools: { name: string; access: string; scopes: string[] }[];
    scopes: { id: string; access: string }[];
    secrets: string[];
    dataClasses: string[];
    tenancy: { mode: string; tenantId: string };
    endpoint: string;
    health: string;
    port: number;
  };
  const pkg = JSON.parse(readFileSync(join(ROOT, "mcp/package.json"), "utf8")) as { version: string; name: string };
  assert.equal(manifest.id, "google-ads-helper");
  assert.match(manifest.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.version, connectorVersion);
  assert.equal(manifest.specVersion, "1");
  assert.equal(manifest.language, "typescript");
  assert.equal(manifest.endpoint, "http://127.0.0.1:7424/api/mcp");
  assert.equal(manifest.port, 7424);
  assert.equal(manifest.health, "/api/mcp/healthz");
  assert.equal(manifest.tenancy.mode, "single");
  assert.equal(manifest.tenancy.tenantId, "hai");
  assert.deepEqual(manifest.secrets, ["AUDIT_HMAC_KEY"]);
  assert.ok(manifest.dataClasses.every((label) => DATA_CLASSES.has(label)));
  assert.deepEqual(
    manifest.tools.map((tool) => tool.name).sort(),
    tools.map((tool) => tool.name).sort(),
  );
  for (const tool of manifest.tools) {
    const defined = tools.find((candidate) => candidate.name === tool.name);
    assert.ok(defined);
    assert.equal(tool.access, defined.access);
    assert.deepEqual(tool.scopes, defined.scopes);
  }
  assert.ok(manifest.scopes.length > 0);
});

test("2 tool names and scopes match the contract", () => {
  assert.deepEqual(
    tools.filter((tool) => tool.name.startsWith("gads.hosting.")).map((tool) => tool.name),
    [...HOSTING_TOOL_NAMES],
  );
  for (const tool of tools) {
    assert.equal(tool.access, "read");
    const parts = tool.name.split(".");
    assert.equal(parts[0], "gads");
    if (parts[1] === "hosting") {
      assert.ok(HOSTING_TOOL_NAMES.includes(tool.name as (typeof HOSTING_TOOL_NAMES)[number]));
    } else {
      assert.equal(parts.length, 3);
      assert.ok(VERBS.has(parts[2] ?? ""));
    }
    for (const scope of tool.scopes) {
      assert.match(scope, /^gads:[a-z0-9]+\.(read|write|admin)$/);
    }
  }
});

test("3 call without a token is AUTH_INVALID", async () => {
  const result = await mcpCall(null, "tools/call", { name: "gads.clients.list", arguments: {} });
  assert.equal(result.status, 401);
  assert.equal(errorCode(result.json), "AUTH_INVALID");
});

test("4 wrong audience, expired token, replayed jti, and foreign tenant are rejected", async () => {
  const wrongAud = await mcpCall(
    await signToken(harness.privateKey, ["gads:clients.read"], { aud: "other-app" }),
    "tools/list",
  );
  assert.equal(wrongAud.status, 401);
  assert.equal(errorCode(wrongAud.json), "AUTH_INVALID");

  const expired = await mcpCall(
    await signToken(harness.privateKey, ["gads:clients.read"], { exp: "-30s" }),
    "tools/list",
  );
  assert.equal(expired.status, 401);
  assert.equal(errorCode(expired.json), "AUTH_EXPIRED");

  const foreign = await mcpCall(
    await signToken(harness.privateKey, ["gads:clients.read"], { tid: "not-hai" }),
    "tools/list",
  );
  assert.equal(foreign.status, 401);
  assert.equal(errorCode(foreign.json), "AUTH_INVALID");

  const replay = await signToken(harness.privateKey, ["gads:clients.read"], { jti: "replay-jti-1" });
  const first = await mcpCall(replay, "tools/list");
  const second = await mcpCall(replay, "tools/list");
  assert.equal(first.status, 200);
  assert.equal(second.status, 401);
  assert.equal(errorCode(second.json), "AUTH_INVALID");
});

test("5 missing scope is AUTH_SCOPE", async () => {
  await enableReads();
  const token = await signToken(harness.privateKey, ["gads:hosting.read"]);
  const result = await mcpCall(token, "tools/call", { name: "gads.clients.list", arguments: {} });
  assert.equal(result.status, 403);
  assert.equal(errorCode(result.json), "AUTH_SCOPE");
  assert.throws(
    () => assertScope(["gads:hosting.read"], ["gads:clients.read"]),
    (error: unknown) => error instanceof ConnectorError && error.code === "AUTH_SCOPE",
  );
});

test("6 disabled tool is TOOL_DISABLED and read mode blocks writes", async () => {
  resetConnectorForTests();
  const token = await signToken(harness.privateKey, ["gads:clients.read"]);
  const result = await mcpCall(token, "tools/call", { name: "gads.clients.list", arguments: {} });
  assert.equal(result.status, 403);
  assert.equal(errorCode(result.json), "TOOL_DISABLED");
  assert.throws(
    () =>
      assertToolEnabled(
        {
          connectorEnabled: true,
          mode: "read",
          version: 1,
          issuedAt: "2026-10-14T00:00:00.000Z",
          tools: { "gads.clients.create": { enabled: true, access: "write" } },
        },
        { name: "gads.clients.create", access: "write" },
        false,
      ),
    (error: unknown) => error instanceof ConnectorError && error.code === "TOOL_DISABLED",
  );
});

test("7 invalid input is INPUT_INVALID", async () => {
  await enableReads();
  const token = await signToken(harness.privateKey, ["gads:clients.read"]);
  const result = await mcpCall(token, "tools/call", {
    name: "gads.clients.get",
    arguments: { id: "killa", extra: true },
  });
  assert.equal(result.status, 400);
  assert.equal(errorCode(result.json), "INPUT_INVALID");
  assert.equal(result.text.includes("killa"), false);
});

test("8 tool output validates against its schema", async () => {
  await enableReads();
  const token = await signToken(harness.privateKey, ["gads:clients.read"]);
  const result = await mcpCall(token, "tools/call", { name: "gads.clients.get", arguments: { id: "killa" } });
  assert.equal(result.status, 200, result.text);
  const structured = (result.json as { result?: { structuredContent?: unknown } }).result?.structuredContent;
  const tool = tools.find((candidate) => candidate.name === "gads.clients.get");
  assert.ok(tool);
  assert.equal(tool.output.safeParse(structured).success, true);
  assert.equal(tool.output.safeParse({ client: { id: "x" } }).success, false);
});

test("9 healthz returns the connector package version", async () => {
  const { GET } = await import("../../app/api/mcp/healthz/route");
  const response = await GET();
  const body = (await response.json()) as { status: string; version: string };
  const pkg = JSON.parse(readFileSync(join(ROOT, "mcp/package.json"), "utf8")) as { version: string };
  const app = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
  assert.equal(response.status, 200);
  assert.equal(body.version, pkg.version);
  assert.equal(body.version, "0.1.0");
  assert.equal(app.version, "0.2.0");
  assert.ok(body.status === "ok" || body.status === "degraded");
});

test("10 audit events have required fields and omit the canary secret", async () => {
  await enableReads();
  harness.setAccountMode("ok");
  const token = await signToken(harness.privateKey, ["gads:hosting.read", "gads:clients.read"]);
  let responseText = "";
  const logs = await capture(async () => {
    const result = await mcpCall(token, "tools/call", { name: "gads.hosting.status", arguments: {} });
    responseText = result.text;
    assert.equal(errorCode(result.json), "UNSUPPORTED");
  });
  assert.equal(logs.includes(CANARY), false);
  assert.equal(responseText.includes(CANARY), false);
  const events = logs
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const end = events.find((event) => event.type === "tool.call.end");
  assert.ok(end);
  for (const field of REQUIRED_AUDIT) assert.ok(field in end, field);
  assert.equal(end.connectorVersion, "0.1.0");
  assert.equal(end.errorCode, "UNSUPPORTED");
  assert.equal(end.hmacKeyId, "hmac-1");
  const plain = createHash("sha256").update(canonicalJson({})).digest("hex");
  const keyed = createHmac("sha256", CANARY).update(canonicalJson({})).digest("hex");
  assert.notEqual(end.inputHmac, plain);
  assert.equal(end.inputHmac, keyed);
  const secretAccess = events.find((event) => event.type === "secret.access");
  assert.ok(secretAccess);
  assert.equal(secretAccess.name, "AUDIT_HMAC_KEY");
  assert.equal("value" in secretAccess, false);
  const accountAccess = events.find((event) => event.type === "account.access");
  assert.ok(accountAccess);
  assert.equal(accountAccess.provider, "vercel");
  assert.equal(accountAccess.accountId, "acct_vercel");
});

test("11 rate limit is RATE_LIMITED", async () => {
  await enableReads();
  process.env.HARNESS_RATE_LIMIT_OVERRIDE = "2";
  try {
    const first = await mcpCall(await signToken(harness.privateKey, ["gads:clients.read"]), "tools/call", {
      name: "gads.clients.list",
      arguments: {},
    });
    const second = await mcpCall(await signToken(harness.privateKey, ["gads:clients.read"]), "tools/call", {
      name: "gads.clients.list",
      arguments: {},
    });
    const third = await mcpCall(await signToken(harness.privateKey, ["gads:clients.read"]), "tools/call", {
      name: "gads.clients.list",
      arguments: {},
    });
    assert.equal(first.status, 200, first.text);
    assert.equal(second.status, 200, second.text);
    assert.equal(third.status, 429);
    assert.equal(errorCode(third.json), "RATE_LIMITED");
  } finally {
    delete process.env.HARNESS_RATE_LIMIT_OVERRIDE;
  }
});

test("12 hosting tools are present and fixtures match their schemas", async () => {
  const fixtures = JSON.parse(readFileSync(join(ROOT, "mcp/fixtures/hosting.json"), "utf8")) as Record<string, unknown>;
  const schemas = {
    "gads.hosting.deployments.list": hostingSchemas.deploymentsList.output,
    "gads.hosting.deployments.get": hostingSchemas.deploymentsGet.output,
    "gads.hosting.analytics.summary": hostingSchemas.analyticsSummary.output,
    "gads.hosting.speed.summary": hostingSchemas.speedSummary.output,
    "gads.hosting.logs.query": hostingSchemas.logsQuery.output,
    "gads.hosting.errors.list": hostingSchemas.errorsList.output,
    "gads.hosting.status": hostingSchemas.status.output,
  };
  for (const name of HOSTING_TOOL_NAMES) {
    assert.equal(schemas[name].safeParse(fixtures[name]).success, true, name);
    assert.ok(tools.some((tool) => tool.name === name && tool.access === "read"));
  }
  await enableReads();
  harness.setAccountMode("ok");
  const result = await mcpCall(await signToken(harness.privateKey, ["gads:hosting.read"]), "tools/call", {
    name: "gads.hosting.status",
    arguments: {},
  });
  assert.equal(errorCode(result.json), "UNSUPPORTED");
  assert.equal(result.text.includes("pageviews"), false);
  assert.equal(result.text.includes("dpl_fixture"), false);
});

test("13 repo scan finds no provider secrets and the connector reads no model keys", () => {
  const skipDir = new Set(["node_modules", ".git", ".next", "coverage", "out", "state"]);
  const secretPatterns = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /sk-ant-[A-Za-z0-9_-]{20,}/,
    /\bsk-[A-Za-z0-9]{24,}/,
    /AKIA[0-9A-Z]{16}/,
    /xox[baprs]-[A-Za-z0-9-]{10,}/,
    /ghp_[A-Za-z0-9]{20,}/,
    /github_pat_[A-Za-z0-9_]{20,}/,
  ];
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (skipDir.has(entry)) continue;
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        walk(path);
        continue;
      }
      if (entry.startsWith(".env") && entry !== ".env.example") offenders.push(relative(ROOT, path));
      if (!/\.(ts|tsx|js|mjs|json|md|example|yml|yaml|txt)$/.test(entry) && entry !== ".env.example") continue;
      if (stat.size > 1_000_000) continue;
      const text = readFileSync(path, "utf8");
      for (const pattern of secretPatterns) {
        if (pattern.test(text)) offenders.push(`${relative(ROOT, path)} matched ${pattern}`);
      }
    }
  };
  walk(ROOT);
  const example = readFileSync(join(ROOT, ".env.example"), "utf8");
  for (const name of ["HARNESS_JWKS_URL", "HARNESS_ISSUER", "HARNESS_CONNECTOR_ID", "HARNESS_INTERNAL_URL"]) {
    assert.match(example, new RegExp(`^${name}=$`, "m"));
  }
  const connectorSource = readdirSync(join(ROOT, "mcp/src"), { recursive: true })
    .filter((file) => String(file).endsWith(".ts"))
    .map((file) => readFileSync(join(ROOT, "mcp/src", String(file)), "utf8"))
    .join("\n");
  assert.equal(/process\.env\.(ANTHROPIC_API_KEY|OPENAI_API_KEY|XAI_API_KEY|GOOGLE_ADS_)/.test(connectorSource), false);
  assert.deepEqual(offenders, []);
});

test("14 accounts.get is audited and a revoked account is ACCOUNT_REVOKED", async () => {
  await enableReads();
  harness.setAccountMode("revoked");
  const token = await signToken(harness.privateKey, ["gads:hosting.read"]);
  let responseText = "";
  const logs = await capture(async () => {
    const result = await mcpCall(token, "tools/call", { name: "gads.hosting.deployments.list", arguments: {} });
    responseText = result.text;
    assert.equal(result.status, 403);
    assert.equal(errorCode(result.json), "ACCOUNT_REVOKED");
  });
  assert.equal(logs.includes(CANARY), false);
  assert.equal(responseText.includes(CANARY), false);
  const events = logs
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const access = events.find((event) => event.type === "account.access");
  assert.ok(access);
  assert.equal(access.provider, "vercel");
  assert.equal(access.outcome, "revoked");
  assert.equal(access.connectorId, "google-ads-helper");
  assert.equal(access.requestId, "req-test");
  harness.setAccountMode("ok");
});

test("streamable http initialize returns server info", async () => {
  const result = await mcpCall(await signToken(harness.privateKey, ["gads:clients.read"]), "initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "conformance", version: "0.1.0" },
  });
  assert.equal(result.status, 200, result.text);
  const info = (result.json as { result?: { serverInfo?: { name?: string; version?: string } } }).result?.serverInfo;
  assert.equal(info?.name, "google-ads-helper");
  assert.equal(info?.version, "0.1.0");
});
