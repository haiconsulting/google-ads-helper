import { ConnectorError } from "./errors";
import type { ToggleState } from "./toggle";

export type Access = "read" | "write" | "destructive";

const RANK: Record<Access, number> = { read: 1, write: 2, destructive: 3 };

export function assertScope(granted: readonly string[], required: readonly string[]): void {
  const missing = required.filter((scope) => !granted.includes(scope));
  if (missing.length > 0) {
    throw new ConnectorError(
      "AUTH_SCOPE",
      `Token is missing required scope: ${missing.join(", ")}.`,
      false,
    );
  }
}

export function assertToolEnabled(
  state: ToggleState,
  tool: { name: string; access: Access },
  stepup: boolean,
): void {
  if (!state.connectorEnabled) {
    throw new ConnectorError("TOOL_DISABLED", "The connector is disabled.", false);
  }
  const entry = state.tools[tool.name];
  if (!entry?.enabled) {
    throw new ConnectorError("TOOL_DISABLED", "The tool is disabled.", false);
  }
  if (RANK[tool.access] > RANK[state.mode] || RANK[tool.access] > RANK[entry.access]) {
    throw new ConnectorError("TOOL_DISABLED", "The connector mode does not allow this tool.", false);
  }
  if (tool.access === "destructive" && !stepup) {
    throw new ConnectorError("AUTH_SCOPE", "This tool requires a step-up claim.", false);
  }
}
