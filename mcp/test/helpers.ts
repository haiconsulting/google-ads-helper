import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CompactSign, exportJWK, generateKeyPair, SignJWT, type CryptoKey as JoseKey } from "jose";
import { canonicalJson } from "../src/canonical";
import { resetConnectorForTests } from "../src/testing";
import { tools } from "../src/tools";
import type { ToggleState } from "../src/toggle";

export const CANARY = "CANARY_SECRET_do_not_log_7f3c9a1e4b";

export type AccountMode = "ok" | "revoked" | "missing";

export type TestHarness = {
  privateKey: JoseKey;
  base: string;
  canary: string;
  setAccountMode: (mode: AccountMode) => void;
  close: () => Promise<void>;
};

export async function startTestHarness(): Promise<TestHarness> {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", { extractable: true });
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test-key";
  jwk.alg = "EdDSA";
  jwk.use = "sig";
  let accountMode: AccountMode = "ok";

  const server: Server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const url = req.url ?? "";
    if (url.startsWith("/jwks.json")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    if (url === "/internal/secrets/get") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ value: CANARY, keyId: "hmac-1" }));
      return;
    }
    if (url === "/internal/accounts/token") {
      if (accountMode === "revoked") {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ code: "ACCOUNT_REVOKED", accountId: "acct_vercel" }));
        return;
      }
      if (accountMode === "missing") {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ code: "ACCOUNT_MISSING" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          accountId: "acct_vercel",
          provider: "vercel",
          credentialType: "oauth",
          accessToken: CANARY,
        }),
      );
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ code: "NOT_FOUND" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test harness failed to bind");
  const base = `http://127.0.0.1:${address.port}`;
  (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  process.env.HARNESS_JWKS_URL = `${base}/jwks.json`;
  process.env.HARNESS_INTERNAL_URL = base;
  process.env.HARNESS_ISSUER = "hai-harness";
  process.env.HARNESS_CONNECTOR_ID = "google-ads-helper";
  process.env.HARNESS_STATE_DIR = mkdtempSync(join(tmpdir(), "hai-mcp-"));
  delete process.env.HARNESS_LOCAL_TOKEN;
  delete process.env.HARNESS_RATE_LIMIT_OVERRIDE;
  resetConnectorForTests();

  return {
    privateKey,
    base,
    canary: CANARY,
    setAccountMode: (mode) => {
      accountMode = mode;
    },
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

export async function signToken(
  privateKey: JoseKey,
  scopes: string[],
  overrides: { aud?: string; iss?: string; exp?: string | number; tid?: string; jti?: string } = {},
): Promise<string> {
  const builder = new SignJWT({
    did: "device-1",
    sid: "session-1",
    tid: overrides.tid ?? "hai",
    scp: scopes,
    stepup: false,
  })
    .setProtectedHeader({ alg: "EdDSA", kid: "test-key" })
    .setIssuer(overrides.iss ?? "hai-harness")
    .setAudience(overrides.aud ?? "google-ads-helper")
    .setSubject("user-1")
    .setJti(overrides.jti ?? crypto.randomUUID())
    .setIssuedAt();
  if (overrides.exp === undefined) builder.setExpirationTime("3m");
  else builder.setExpirationTime(overrides.exp);
  return builder.sign(privateKey);
}

export function readAllToolsToggle(version = 1): Omit<ToggleState, never> & { sig?: string } {
  const toolsState: ToggleState["tools"] = {};
  for (const tool of tools) {
    toolsState[tool.name] = { enabled: true, access: "read" };
  }
  return {
    connectorEnabled: true,
    mode: "read",
    tools: toolsState,
    version,
    issuedAt: "2026-10-14T00:00:00.000Z",
  };
}

export async function signToggle<T extends Record<string, unknown>>(privateKey: JoseKey, event: T): Promise<T & { sig: string }> {
  const payload = canonicalJson(event);
  const sig = await new CompactSign(new TextEncoder().encode(payload))
    .setProtectedHeader({ alg: "EdDSA", kid: "test-key" })
    .sign(privateKey);
  return { ...event, sig };
}

export async function mcpCall(token: string | null, method: string, params?: unknown, id: number = 1) {
  const { POST } = await import("../../app/api/mcp/route");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-11-25",
    "x-hai-request-id": "req-test",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  if (process.env.HARNESS_LOCAL_TOKEN) headers["x-hai-local-token"] = process.env.HARNESS_LOCAL_TOKEN;
  const response = await POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }),
  );
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json, text };
}

export function errorCode(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return undefined;
  const data = (json as { error?: { data?: { code?: string } } }).error?.data;
  return data?.code;
}
