import { clientTools } from "./clients";
import { hostingTools } from "./hosting";
import type { ToolDef } from "./types";

export const tools: ToolDef[] = [...clientTools, ...hostingTools];

export function toolByName(name: string): ToolDef | undefined {
  return tools.find((tool) => tool.name === name);
}

export const HOSTING_TOOL_NAMES = [
  "gads.hosting.deployments.list",
  "gads.hosting.deployments.get",
  "gads.hosting.analytics.summary",
  "gads.hosting.speed.summary",
  "gads.hosting.logs.query",
  "gads.hosting.errors.list",
  "gads.hosting.status",
] as const;
