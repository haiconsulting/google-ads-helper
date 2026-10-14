import { handleToggleHttp } from "../../../../../mcp/src/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleToggleHttp(request);
}
