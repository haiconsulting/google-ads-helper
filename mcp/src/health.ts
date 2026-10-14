import { remoteJwks } from "./auth";
import { connectorVersion } from "./version";

export type HealthStatus = {
  status: "ok" | "degraded" | "down";
  version: string;
  checks: Record<string, { ok: boolean; detail?: string }>;
};

export function healthStatus(): HealthStatus {
  const jwksConfigured = remoteJwks() !== null;
  return {
    status: jwksConfigured ? "ok" : "degraded",
    version: connectorVersion,
    checks: {
      jwksConfigured: { ok: jwksConfigured },
    },
  };
}

export function readyStatus(): { httpStatus: number; body: HealthStatus } {
  const health = healthStatus();
  const ready = health.checks.jwksConfigured?.ok === true;
  return {
    httpStatus: ready ? 200 : 503,
    body: { ...health, status: ready ? "ok" : "down" },
  };
}
