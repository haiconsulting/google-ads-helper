import { timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, errors as joseErrors, jwtVerify, type JWTVerifyGetKey } from "jose";
import { ConnectorError } from "./errors";
import manifest from "../manifest.json";

export type HarnessClaims = {
  sub: string;
  did: string;
  sid: string;
  tid: string;
  jti: string;
  scp: string[];
  stepup: boolean;
  exp: number;
};

const jwksCache = new Map<string, JWTVerifyGetKey>();
const replayedJti = new Map<string, number>();
const MAX_REPLAY = 10_000;
const MAX_TOKEN_LENGTH = 16_384;

export function expectedIssuer(): string {
  return process.env.HARNESS_ISSUER?.trim() || "hai-harness";
}

export function expectedAudience(): string {
  return process.env.HARNESS_CONNECTOR_ID?.trim() || "google-ads-helper";
}

export function remoteJwks(): JWTVerifyGetKey | null {
  const raw = process.env.HARNESS_JWKS_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const cached = jwksCache.get(raw);
  if (cached) return cached;
  const set = createRemoteJWKSet(url, {
    cacheMaxAge: 10 * 60 * 1000,
    cooldownDuration: 30_000,
  });
  jwksCache.set(raw, set);
  return set;
}

export function resetAuthForTests(): void {
  jwksCache.clear();
  replayedJti.clear();
}

function rememberJti(jti: string, exp: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  for (const [key, expires] of replayedJti) {
    if (expires <= now) replayedJti.delete(key);
  }
  if (replayedJti.has(jti)) return true;
  replayedJti.set(jti, exp);
  while (replayedJti.size > MAX_REPLAY) {
    const oldest = replayedJti.keys().next().value;
    if (oldest === undefined) break;
    replayedJti.delete(oldest);
  }
  return false;
}

function localTokenMatches(provided: string | null): boolean {
  const expected = process.env.HARNESS_LOCAL_TOKEN;
  if (!expected) return true;
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

function boundTenant(): string | null {
  const tenancy = manifest.tenancy as { mode?: string; tenantId?: string };
  if (tenancy.mode === "single") return tenancy.tenantId ?? null;
  return null;
}

function asStringArray(value: unknown): string[] | null {
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }
  if (typeof value === "string") {
    return value.split(" ").map((part) => part.trim()).filter(Boolean);
  }
  return null;
}

export async function verifyHarnessJwt(token: string): Promise<HarnessClaims> {
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    throw new ConnectorError("AUTH_INVALID", "Harness token is missing or invalid.", false);
  }
  const jwks = remoteJwks();
  if (!jwks) {
    throw new ConnectorError("AUTH_INVALID", "Harness token could not be verified.", false);
  }

  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(token, jwks, {
      issuer: expectedIssuer(),
      audience: expectedAudience(),
      algorithms: ["EdDSA"],
      clockTolerance: 0,
    });
    payload = verified.payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired || (error instanceof joseErrors.JWTClaimValidationFailed && error.claim === "exp")) {
      throw new ConnectorError("AUTH_EXPIRED", "Harness token is expired.", false);
    }
    if (
      error instanceof joseErrors.JWKSTimeout ||
      error instanceof joseErrors.JWKSInvalid ||
      (error instanceof joseErrors.JOSEError && /fetch|network|jwks/i.test(error.message))
    ) {
      throw new ConnectorError("AUTH_INVALID", "Harness token could not be verified.", true);
    }
    throw new ConnectorError("AUTH_INVALID", "Harness token is missing or invalid.", false);
  }

  const jti = payload.jti;
  const sub = payload.sub;
  const tid = payload.tid;
  const did = payload.did;
  const sid = payload.sid;
  const exp = payload.exp;
  const scp = asStringArray(payload.scp);
  if (
    typeof jti !== "string" ||
    jti.length === 0 ||
    jti.length > 256 ||
    typeof sub !== "string" ||
    sub.length === 0 ||
    typeof tid !== "string" ||
    tid.length === 0 ||
    typeof did !== "string" ||
    typeof sid !== "string" ||
    typeof exp !== "number" ||
    !scp
  ) {
    throw new ConnectorError("AUTH_INVALID", "Harness token is missing or invalid.", false);
  }

  const tenant = boundTenant();
  if (tenant && tid !== tenant) {
    throw new ConnectorError("AUTH_INVALID", "Token tenant is not allowed for this connector.", false);
  }

  if (rememberJti(jti, exp)) {
    throw new ConnectorError("AUTH_INVALID", "Harness token has already been used.", false);
  }

  return {
    sub,
    did,
    sid,
    tid,
    jti,
    scp,
    stepup: payload.stepup === true,
    exp,
  };
}

export async function authenticateRequest(request: Request): Promise<HarnessClaims> {
  if (!localTokenMatches(request.headers.get("x-hai-local-token"))) {
    throw new ConnectorError("AUTH_INVALID", "Local harness token is missing or invalid.", false);
  }
  const header = request.headers.get("authorization");
  const match = header ? /^Bearer\s+(\S+)$/i.exec(header.trim()) : null;
  if (!match) {
    throw new ConnectorError("AUTH_INVALID", "Harness token is missing or invalid.", false);
  }
  return verifyHarnessJwt(match[1]);
}
