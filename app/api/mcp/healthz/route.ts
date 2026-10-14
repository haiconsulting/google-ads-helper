import { healthStatus } from "../../../../mcp/src/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(healthStatus(), {
    headers: { "cache-control": "no-store" },
  });
}
