import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { expectedAudience, authenticateRequest, type HarnessClaims } from "./auth";
import { emitAudit } from "./audit";
import { assertScope, assertToolEnabled } from "./access";
import { ConnectorError, ERROR_CODES, jsonRpcErrorResponse, toConnectorError, type ErrorCode } from "./errors";
import { createHarnessClients } from "./harness";
import { consumeRate, resolvePerMinute } from "./rateLimit";
import { createMcpServer } from "./server";
import { requestStore } from "./requestStore";
import { toolByName } from "./tools";
import type { ToolContext } from "./tools/types";
import { applyToggle, currentToggle } from "./toggle";

function requestIdFrom(request: Request): string {
  const header = request.headers.get("x-hai-request-id");
  if (header && /^[A-Za-z0-9._:-]{1,128}$/.test(header)) return header;
  return crypto.randomUUID();
}

function jsonRpcId(body: unknown): unknown {
  if (body && typeof body === "object" && !Array.isArray(body) && "id" in body) {
    return (body as { id?: unknown }).id ?? null;
  }
  return null;
}

function auditReject(requestId: string, error: ConnectorError, claims?: HarnessClaims, tool?: string): void {
  const type = error.code.startsWith("AUTH_") ? "auth.reject" : "tool.call.end";
  emitAudit({
    type,
    requestId,
    sessionId: claims?.sid ?? "",
    userId: claims?.sub ?? "",
    deviceId: claims?.did ?? "",
    tenantId: claims?.tid ?? "",
    connectorId: expectedAudience(),
    tool: tool ?? "",
    outcome: "reject",
    errorCode: error.code,
  });
}

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? "";
}

function buildContext(request: Request, claims: HarnessClaims, requestId: string): ToolContext {
  const audit: ToolContext["audit"] = (partial) => {
    emitAudit({
      requestId,
      sessionId: claims.sid,
      userId: claims.sub,
      deviceId: claims.did,
      tenantId: claims.tid,
      connectorId: expectedAudience(),
      ...partial,
    });
  };
  const harness = createHarnessClients(bearerToken(request), claims.scp, audit);
  return {
    requestId,
    sessionId: claims.sid,
    principal: { userId: claims.sub, deviceId: claims.did },
    grantedScopes: claims.scp,
    tenantId: claims.tid,
    stepup: claims.stepup,
    signal: request.signal,
    secrets: harness.secrets,
    accounts: harness.accounts,
    models: harness.models,
    jobs: harness.jobs,
    audit,
  };
}

function gateToolCall(body: unknown, claims: HarnessClaims): void {
  if (!body || typeof body !== "object" || Array.isArray(body)) return;
  const message = body as { method?: unknown; params?: { name?: unknown; arguments?: unknown } };
  if (message.method !== "tools/call") return;
  const name = message.params?.name;
  if (typeof name !== "string" || name.length === 0) {
    throw new ConnectorError("INPUT_INVALID", "Tool name is missing.", false);
  }
  const tool = toolByName(name);
  if (!tool) {
    throw new ConnectorError("NOT_FOUND", "Tool was not found.", false);
  }
  assertToolEnabled(currentToggle(), tool, claims.stepup);
  assertScope(claims.scp, tool.scopes);
  const parsed = tool.input.safeParse(message.params?.arguments ?? {});
  if (!parsed.success) {
    throw new ConnectorError("INPUT_INVALID", "Tool input did not match the schema.", false);
  }
  const allowed = consumeRate(
    `${claims.tid}:${claims.sub}:${tool.name}`,
    resolvePerMinute(tool.rateLimit.perMinute),
  );
  if (!allowed) {
    throw new ConnectorError("RATE_LIMITED", "Tool rate limit exceeded.", true);
  }
}

async function normalizeSdkResponse(response: Response): Promise<Response> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("application/problem+json")) {
    return response;
  }
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(text, { status: response.status, headers: response.headers });
  }
  if (!body || typeof body !== "object" || !("result" in body)) {
    return new Response(text, { status: response.status, headers: response.headers });
  }
  const result = (body as { result?: { isError?: boolean; content?: { text?: string }[] }; id?: unknown }).result;
  if (!result?.isError) {
    return new Response(text, { status: response.status, headers: response.headers });
  }
  const raw = result.content?.[0]?.text ?? "";
  let parsed: { code?: string; retryable?: boolean; message?: string } | null = null;
  try {
    const candidate: unknown = JSON.parse(raw);
    if (candidate && typeof candidate === "object" && "code" in candidate) {
      parsed = candidate as { code?: string; retryable?: boolean; message?: string };
    }
  } catch {
    parsed = null;
  }
  if (parsed?.code && parsed.message && (ERROR_CODES as readonly string[]).includes(parsed.code)) {
    const error = new ConnectorError(parsed.code as ErrorCode, parsed.message, parsed.retryable === true);
    return jsonRpcErrorResponse((body as { id?: unknown }).id ?? null, error);
  }
  if (raw.startsWith("Input validation error")) {
    return jsonRpcErrorResponse(
      (body as { id?: unknown }).id ?? null,
      new ConnectorError("INPUT_INVALID", "Tool input did not match the schema.", false),
    );
  }
  if (raw.startsWith("Output validation error")) {
    return jsonRpcErrorResponse(
      (body as { id?: unknown }).id ?? null,
      new ConnectorError("OUTPUT_INVALID", "Tool output did not match the schema.", false),
    );
  }
  return jsonRpcErrorResponse(
    (body as { id?: unknown }).id ?? null,
    new ConnectorError("INTERNAL", "The connector failed.", true),
  );
}

export async function handleMcpHttp(request: Request): Promise<Response> {
  const requestId = requestIdFrom(request);
  if (request.method !== "POST" && request.method !== "GET" && request.method !== "DELETE") {
    return jsonRpcErrorResponse(null, new ConnectorError("INPUT_INVALID", "Method is not allowed.", false, 405));
  }

  let claims: HarnessClaims;
  try {
    claims = await authenticateRequest(request);
  } catch (error) {
    const connectorError = toConnectorError(error);
    auditReject(requestId, connectorError);
    return jsonRpcErrorResponse(null, connectorError);
  }

  let parsedBody: unknown;
  if (request.method === "POST") {
    try {
      parsedBody = await request.json();
    } catch {
      const error = new ConnectorError("INPUT_INVALID", "Request body must be valid JSON.", false);
      auditReject(requestId, error, claims);
      return jsonRpcErrorResponse(null, error);
    }
    if (Array.isArray(parsedBody)) {
      const error = new ConnectorError("INPUT_INVALID", "Batch requests are not supported.", false);
      auditReject(requestId, error, claims);
      return jsonRpcErrorResponse(null, error);
    }
    try {
      gateToolCall(parsedBody, claims);
    } catch (error) {
      const connectorError = toConnectorError(error);
      const name =
        parsedBody && typeof parsedBody === "object" && "params" in parsedBody
          ? (parsedBody as { params?: { name?: unknown } }).params?.name
          : undefined;
      auditReject(requestId, connectorError, claims, typeof name === "string" ? name : "");
      return jsonRpcErrorResponse(jsonRpcId(parsedBody), connectorError);
    }
  }

  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  const server = createMcpServer();
  const ctx = buildContext(request, claims, requestId);
  try {
    await server.connect(transport);
    const response = await requestStore.run(ctx, () =>
      transport.handleRequest(request, parsedBody === undefined ? undefined : { parsedBody }),
    );
    return await normalizeSdkResponse(response);
  } catch {
    return jsonRpcErrorResponse(jsonRpcId(parsedBody), new ConnectorError("INTERNAL", "The connector failed.", true));
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export async function handleToggleHttp(request: Request): Promise<Response> {
  const requestId = requestIdFrom(request);
  let claims: HarnessClaims | undefined;
  try {
    claims = await authenticateRequest(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ConnectorError("INPUT_INVALID", "Request body must be valid JSON.", false);
    }
    const next = await applyToggle(body);
    emitAudit({
      type: "toggle.applied",
      requestId,
      sessionId: claims.sid,
      userId: claims.sub,
      deviceId: claims.did,
      tenantId: claims.tid,
      connectorId: expectedAudience(),
      outcome: "ok",
      errorCode: "",
    });
    return Response.json(
      { ok: true, version: next.version, mode: next.mode, connectorEnabled: next.connectorEnabled },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const connectorError = toConnectorError(error);
    auditReject(requestId, connectorError, claims);
    return jsonRpcErrorResponse(null, connectorError);
  }
}
