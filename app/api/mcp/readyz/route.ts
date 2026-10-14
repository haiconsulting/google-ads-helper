import { readyStatus } from "../../../../mcp/src/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const ready = readyStatus();
  return Response.json(ready.body, {
    status: ready.httpStatus,
    headers: { "cache-control": "no-store" },
  });
}
