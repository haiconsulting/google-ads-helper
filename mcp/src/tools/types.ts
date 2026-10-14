import type { ZodType } from "zod";
import type { Access } from "../access";
import type { AuditInput } from "../audit";
import type { AccountHandle, SecretValue } from "../harness";

export type ToolContext = {
  requestId: string;
  sessionId: string;
  principal: { userId: string; deviceId: string };
  grantedScopes: string[];
  tenantId: string;
  stepup: boolean;
  signal: AbortSignal;
  secrets: { get(name: string): Promise<SecretValue> };
  accounts: { get(provider: string): Promise<AccountHandle> };
  models: { complete(): Promise<never> };
  jobs: {
    create(): Promise<never>;
    get(jobId: string): Promise<never>;
    cancel(jobId: string): Promise<void>;
  };
  audit(partial: Omit<AuditInput, "requestId" | "sessionId" | "userId" | "deviceId" | "tenantId" | "connectorId">): void;
};

export type ToolDef = {
  name: string;
  description: string;
  access: Access;
  scopes: string[];
  rateLimit: { perMinute: number };
  input: ZodType;
  output: ZodType;
  handler(input: unknown, ctx: ToolContext): Promise<unknown>;
};
