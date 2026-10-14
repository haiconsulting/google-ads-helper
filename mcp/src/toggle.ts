import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compactVerify } from "jose";
import { z } from "zod";
import { canonicalJson } from "./canonical";
import { ConnectorError } from "./errors";
import { remoteJwks } from "./auth";
import type { Access } from "./access";

const toolToggleSchema = z
  .object({
    enabled: z.boolean(),
    access: z.enum(["read", "write", "destructive"]),
  })
  .strict();

const toggleSchema = z
  .object({
    connectorEnabled: z.boolean(),
    mode: z.enum(["read", "write", "destructive"]),
    tools: z.record(z.string(), toolToggleSchema),
    version: z.number().int().positive(),
    issuedAt: z.string().min(1).max(64),
    sig: z.string().min(1).max(16_384),
  })
  .strict();

export type ToggleState = {
  connectorEnabled: boolean;
  mode: "read" | "write" | "destructive";
  tools: Record<string, { enabled: boolean; access: Access }>;
  version: number;
  issuedAt: string;
};

export type ToggleEvent = z.infer<typeof toggleSchema>;

function initialState(): ToggleState {
  return {
    connectorEnabled: false,
    mode: "read",
    tools: {},
    version: 0,
    issuedAt: "",
  };
}

let state = initialState();
let loaded = false;

function statePath(): string {
  const dir = process.env.HARNESS_STATE_DIR?.trim() || join(process.cwd(), "mcp", "state");
  return join(dir, "toggles.json");
}

const persistedSchema = z
  .object({
    connectorEnabled: z.boolean(),
    mode: z.enum(["read", "write", "destructive"]),
    tools: z.record(z.string(), toolToggleSchema),
    version: z.number().int().nonnegative(),
    issuedAt: z.string(),
  })
  .strict();

function readDisk(): ToggleState | null {
  try {
    const parsed = persistedSchema.safeParse(JSON.parse(readFileSync(statePath(), "utf8")));
    if (!parsed.success || parsed.data.version < 1) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeDisk(next: ToggleState): void {
  try {
    const path = statePath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(next), { mode: 0o600 });
  } catch {
    // Serverless filesystems are often read-only. Memory still holds the event.
  }
}

export function currentToggle(): ToggleState {
  if (!loaded) {
    state = readDisk() ?? initialState();
    loaded = true;
  }
  return state;
}

export function resetToggleForTests(): void {
  state = initialState();
  loaded = true;
  try {
    rmSync(statePath(), { force: true });
  } catch {
    // ignore
  }
}

export async function applyToggle(input: unknown): Promise<ToggleState> {
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) {
    throw new ConnectorError("INPUT_INVALID", "Toggle event did not match the schema.", false);
  }
  const event = parsed.data;
  const current = currentToggle();
  if (event.version <= current.version) {
    throw new ConnectorError("CONFLICT", "Toggle version is not newer than the current state.", false);
  }

  const jwks = remoteJwks();
  if (!jwks) {
    throw new ConnectorError("AUTH_INVALID", "Toggle signature could not be verified.", false);
  }
  const { sig, ...unsigned } = event;
  const expected = canonicalJson(unsigned);
  try {
    const verified = await compactVerify(sig, jwks, { algorithms: ["EdDSA"] });
    const payload = new TextDecoder().decode(verified.payload);
    if (payload !== expected) {
      throw new ConnectorError("AUTH_INVALID", "Toggle signature could not be verified.", false);
    }
  } catch (error) {
    if (error instanceof ConnectorError) throw error;
    throw new ConnectorError("AUTH_INVALID", "Toggle signature could not be verified.", false);
  }

  const next: ToggleState = {
    connectorEnabled: event.connectorEnabled,
    mode: event.mode,
    tools: event.tools,
    version: event.version,
    issuedAt: event.issuedAt,
  };
  state = next;
  loaded = true;
  writeDisk(next);
  return next;
}
