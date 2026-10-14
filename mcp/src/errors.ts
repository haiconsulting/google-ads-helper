export const ERROR_CODES = [
  "AUTH_INVALID",
  "AUTH_EXPIRED",
  "AUTH_SCOPE",
  "TOOL_DISABLED",
  "INPUT_INVALID",
  "OUTPUT_INVALID",
  "RATE_LIMITED",
  "UPSTREAM_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL",
  "ACCOUNT_MISSING",
  "ACCOUNT_REVOKED",
  "ACCOUNT_SCOPE",
  "UNSUPPORTED",
  "JOB_NOT_FOUND",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const HTTP_STATUS: Record<ErrorCode, number> = {
  AUTH_INVALID: 401,
  AUTH_EXPIRED: 401,
  AUTH_SCOPE: 403,
  TOOL_DISABLED: 403,
  INPUT_INVALID: 400,
  OUTPUT_INVALID: 500,
  RATE_LIMITED: 429,
  UPSTREAM_ERROR: 502,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL: 500,
  ACCOUNT_MISSING: 403,
  ACCOUNT_REVOKED: 403,
  ACCOUNT_SCOPE: 403,
  UNSUPPORTED: 501,
  JOB_NOT_FOUND: 404,
};

const JSON_RPC: Record<ErrorCode, number> = {
  AUTH_INVALID: -32001,
  AUTH_EXPIRED: -32002,
  AUTH_SCOPE: -32003,
  TOOL_DISABLED: -32004,
  INPUT_INVALID: -32602,
  OUTPUT_INVALID: -32005,
  RATE_LIMITED: -32006,
  UPSTREAM_ERROR: -32007,
  NOT_FOUND: -32008,
  CONFLICT: -32009,
  INTERNAL: -32603,
  ACCOUNT_MISSING: -32010,
  ACCOUNT_REVOKED: -32011,
  ACCOUNT_SCOPE: -32012,
  UNSUPPORTED: -32013,
  JOB_NOT_FOUND: -32014,
};

export class ConnectorError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly httpStatus: number;

  constructor(code: ErrorCode, message: string, retryable = false, httpStatus = HTTP_STATUS[code]) {
    super(message);
    this.name = "ConnectorError";
    this.code = code;
    this.retryable = retryable;
    this.httpStatus = httpStatus;
  }
}

export function toConnectorError(error: unknown): ConnectorError {
  if (error instanceof ConnectorError) return error;
  return new ConnectorError("INTERNAL", "The connector failed.", true);
}

export type ErrorBody = {
  code: ErrorCode;
  retryable: boolean;
  message: string;
};

export function errorBody(error: ConnectorError): ErrorBody {
  return { code: error.code, retryable: error.retryable, message: error.message };
}

export function jsonRpcErrorResponse(id: unknown, error: ConnectorError): Response {
  const data = errorBody(error);
  return Response.json(
    {
      jsonrpc: "2.0",
      id: id ?? null,
      error: {
        code: JSON_RPC[error.code],
        message: error.message,
        data,
      },
    },
    {
      status: error.httpStatus,
      headers: { "cache-control": "no-store" },
    },
  );
}
