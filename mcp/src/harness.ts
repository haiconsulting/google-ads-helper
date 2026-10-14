import { ConnectorError } from "./errors";
import type { AuditInput } from "./audit";

export type SecretValue = { value: string; keyId: string };

export type AccountHandle = {
  accountId: string;
  provider: string;
  credentialType: string;
  getToken: () => Promise<string>;
};

type AuditFn = (partial: Omit<AuditInput, "requestId" | "sessionId" | "userId" | "deviceId" | "tenantId" | "connectorId">) => void;

async function readObject(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const data: unknown = await response.json();
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function internalUrl(path: string): string | null {
  const base = process.env.HARNESS_INTERNAL_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/$/, "")}${path}`;
}

function assertRouter(scopes: readonly string[]): void {
  if (!scopes.includes("router:chat.run")) {
    throw new ConnectorError("AUTH_SCOPE", "Model calls require scope router:chat.run.", false);
  }
}

export function createHarnessClients(jwt: string, scopes: readonly string[], audit: AuditFn) {
  return {
    secrets: {
      async get(name: string): Promise<SecretValue> {
        const url = internalUrl("/internal/secrets/get");
        if (!url) {
          audit({ type: "secret.access", name, outcome: "missing", errorCode: "INTERNAL" });
          throw new ConnectorError("INTERNAL", "Secret manager is not configured.", true);
        }
        let response: Response;
        try {
          response = await fetch(url, {
            method: "POST",
            headers: {
              authorization: `Bearer ${jwt}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ name }),
            signal: AbortSignal.timeout(5_000),
          });
        } catch {
          audit({ type: "secret.access", name, outcome: "error", errorCode: "UPSTREAM_ERROR" });
          throw new ConnectorError("UPSTREAM_ERROR", "Secret manager request failed.", true);
        }
        const data = await readObject(response);
        const value = data?.value;
        const keyId = typeof data?.keyId === "string" && data.keyId.length > 0 ? data.keyId : "";
        audit({ type: "secret.access", name, outcome: response.ok ? "ok" : "error", errorCode: response.ok ? "" : "UPSTREAM_ERROR" });
        if (!response.ok || typeof value !== "string" || value.length === 0 || !keyId) {
          throw new ConnectorError("UPSTREAM_ERROR", "Secret manager request failed.", true);
        }
        return { value, keyId };
      },
    },
    accounts: {
      async get(provider: string): Promise<AccountHandle> {
        const url = internalUrl("/internal/accounts/token");
        if (!url) {
          audit({ type: "account.access", provider, accountId: "", outcome: "missing", errorCode: "ACCOUNT_MISSING" });
          throw new ConnectorError("ACCOUNT_MISSING", "No account is bound for this provider.", false);
        }
        let response: Response;
        try {
          response = await fetch(url, {
            method: "POST",
            headers: {
              authorization: `Bearer ${jwt}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ provider }),
            signal: AbortSignal.timeout(5_000),
          });
        } catch {
          audit({ type: "account.access", provider, accountId: "", outcome: "error", errorCode: "UPSTREAM_ERROR" });
          throw new ConnectorError("UPSTREAM_ERROR", "The account service request failed.", true);
        }
        const data = await readObject(response);
        const code = typeof data?.code === "string" ? data.code : "";
        const accountId = typeof data?.accountId === "string" ? data.accountId : "";
        if (code === "ACCOUNT_REVOKED") {
          audit({ type: "account.access", provider, accountId, outcome: "revoked", errorCode: "ACCOUNT_REVOKED" });
          throw new ConnectorError("ACCOUNT_REVOKED", "The provider account is revoked.", false);
        }
        if (code === "ACCOUNT_SCOPE") {
          audit({ type: "account.access", provider, accountId, outcome: "scope", errorCode: "ACCOUNT_SCOPE" });
          throw new ConnectorError("ACCOUNT_SCOPE", "The provider account is missing a required scope.", false);
        }
        if (code === "ACCOUNT_MISSING" || response.status === 404) {
          audit({ type: "account.access", provider, accountId, outcome: "missing", errorCode: "ACCOUNT_MISSING" });
          throw new ConnectorError("ACCOUNT_MISSING", "No account is bound for this provider.", false);
        }
        const accessToken = data?.accessToken;
        const credentialType = typeof data?.credentialType === "string" ? data.credentialType : "access_token";
        if (!response.ok || typeof accessToken !== "string" || accessToken.length === 0 || !accountId) {
          audit({ type: "account.access", provider, accountId, outcome: "missing", errorCode: "ACCOUNT_MISSING" });
          throw new ConnectorError("ACCOUNT_MISSING", "No account is bound for this provider.", false);
        }
        audit({ type: "account.access", provider, accountId, outcome: "ok", errorCode: "" });
        return {
          accountId,
          provider: typeof data?.provider === "string" ? data.provider : provider,
          credentialType,
          getToken: async () => accessToken,
        };
      },
    },
    models: {
      async complete(): Promise<never> {
        assertRouter(scopes);
        throw new ConnectorError("UNSUPPORTED", "This connector does not run model calls.", false);
      },
    },
    jobs: {
      async create(): Promise<never> {
        assertRouter(scopes);
        throw new ConnectorError("UNSUPPORTED", "This connector does not run model jobs.", false);
      },
      async get(): Promise<never> {
        assertRouter(scopes);
        throw new ConnectorError("JOB_NOT_FOUND", "No job is available from this connector.", false);
      },
      async cancel(): Promise<never> {
        assertRouter(scopes);
        throw new ConnectorError("UNSUPPORTED", "This connector does not run model jobs.", false);
      },
    },
  };
}
