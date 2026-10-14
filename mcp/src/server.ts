import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { canonicalJson } from "./canonical";
import { hmacSha256 } from "./audit";
import { ConnectorError, errorBody, toConnectorError } from "./errors";
import { assertScope, assertToolEnabled } from "./access";
import { currentToggle } from "./toggle";
import { tools } from "./tools";
import type { ToolContext, ToolDef } from "./tools/types";
import { connectorVersion } from "./version";
import { requestStore } from "./requestStore";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "google-ads-helper",
    version: connectorVersion,
  });
  const register = server.registerTool.bind(server) as (
    name: string,
    config: {
      description: string;
      inputSchema: ToolDef["input"];
      outputSchema: ToolDef["output"];
      annotations: {
        readOnlyHint: boolean;
        destructiveHint: boolean;
        idempotentHint: boolean;
        openWorldHint: boolean;
      };
    },
    cb: (args: unknown) => Promise<unknown>,
  ) => void;
  for (const tool of tools) {
    register(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.input,
        outputSchema: tool.output,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (args: unknown) => runRegisteredTool(tool, args ?? {}),
    );
  }
  return server;
}

async function hashInput(input: unknown, ctx: ToolContext): Promise<{ inputHmac: string; hmacKeyId: string }> {
  try {
    const secret = await ctx.secrets.get("AUDIT_HMAC_KEY");
    return {
      inputHmac: hmacSha256(secret.value, canonicalJson(input)),
      hmacKeyId: secret.keyId,
    };
  } catch {
    return { inputHmac: "unavailable", hmacKeyId: "unavailable" };
  }
}

function errorResult(error: ConnectorError) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify(errorBody(error)) }],
  };
}

export async function runRegisteredTool(tool: ToolDef, args: unknown) {
  const ctx = requestStore.getStore();
  if (!ctx) {
    return errorResult(new ConnectorError("INTERNAL", "The connector failed.", true));
  }
  const started = Date.now();
  const hmac = await hashInput(args, ctx);
  ctx.audit({
    type: "tool.call.start",
    tool: tool.name,
    access: tool.access,
    outcome: "start",
    errorCode: "",
    ...hmac,
  });
  try {
    assertToolEnabled(currentToggle(), tool, ctx.stepup);
    assertScope(ctx.grantedScopes, tool.scopes);
    const output = await tool.handler(args, ctx);
    const parsed = tool.output.safeParse(output);
    if (!parsed.success) {
      throw new ConnectorError("OUTPUT_INVALID", "Tool output did not match the schema.", false);
    }
    ctx.audit({
      type: "tool.call.end",
      tool: tool.name,
      access: tool.access,
      outcome: "ok",
      errorCode: "",
      durationMs: Date.now() - started,
      ...hmac,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(parsed.data) }],
      structuredContent: parsed.data as Record<string, unknown>,
    };
  } catch (error) {
    const connectorError = toConnectorError(error);
    ctx.audit({
      type: "tool.call.end",
      tool: tool.name,
      access: tool.access,
      outcome: "error",
      errorCode: connectorError.code,
      durationMs: Date.now() - started,
      ...hmac,
    });
    return errorResult(connectorError);
  }
}
