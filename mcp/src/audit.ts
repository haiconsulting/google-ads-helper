import { createHmac } from "node:crypto";
import { connectorVersion } from "./version";
import type { ErrorCode } from "./errors";

const SENSITIVE_KEY =
  /^(value|secret|token|accesstoken|access_token|authorization|password|apikey|api_key|credential|jwt|sig|refreshtoken|refresh_token)$/i;

export type AuditType =
  | "tool.call.start"
  | "tool.call.end"
  | "auth.reject"
  | "toggle.applied"
  | "secret.access"
  | "account.access";

export type AuditInput = {
  type: AuditType;
  requestId: string;
  sessionId: string;
  userId: string;
  deviceId: string;
  tenantId: string;
  connectorId: string;
  tool?: string;
  access?: string;
  outcome?: string;
  errorCode?: ErrorCode | "";
  inputHmac?: string;
  hmacKeyId?: string;
  durationMs?: number;
  name?: string;
  provider?: string;
  accountId?: string;
};

function stripNewlines(value: string): string {
  return value.replace(/[\r\n]/g, "");
}

export function sanitizeAudit(input: Record<string, unknown>): {
  record: Record<string, unknown>;
  redactions: number;
} {
  let redactions = 0;
  const record: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (SENSITIVE_KEY.test(key)) {
      redactions += 1;
      continue;
    }
    if (typeof value === "string") {
      record[key] = stripNewlines(value);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      record[key] = value;
    } else {
      redactions += 1;
    }
  }
  return { record, redactions };
}

export function emitAudit(partial: AuditInput): void {
  const flat: Record<string, unknown> = {
    ts: new Date().toISOString(),
    type: partial.type,
    requestId: partial.requestId,
    sessionId: partial.sessionId,
    userId: partial.userId,
    deviceId: partial.deviceId,
    tenantId: partial.tenantId,
    connectorId: partial.connectorId,
    connectorVersion,
    tool: partial.tool ?? "",
    access: partial.access ?? "",
    outcome: partial.outcome ?? "",
    errorCode: partial.errorCode ?? "",
    inputHmac: partial.inputHmac ?? "unavailable",
    hmacKeyId: partial.hmacKeyId ?? "unavailable",
    durationMs: partial.durationMs,
    name: partial.name,
    provider: partial.provider,
    accountId: partial.accountId,
  };
  const { record, redactions } = sanitizeAudit(flat);
  record.redactions = redactions;
  console.log(JSON.stringify(record));
}

export function hmacSha256(key: string, canonical: string): string {
  return createHmac("sha256", key).update(canonical).digest("hex");
}
