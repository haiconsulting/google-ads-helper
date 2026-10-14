import manifest from "../../../../mcp/manifest.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(manifest, {
    headers: { "cache-control": "no-store" },
  });
}
