import { handleMcpHttp } from "../../../mcp/src/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleMcpHttp(request);
}

export function GET(request: Request) {
  return handleMcpHttp(request);
}

export function DELETE(request: Request) {
  return handleMcpHttp(request);
}
