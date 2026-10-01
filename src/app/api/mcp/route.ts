import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { handleMcpRequest } from "@/lib/hermes-mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/mcp — MCP endpoint for the Hermes sales agent (VPS).
 * Auth: `Authorization: Bearer ${HERMES_MCP_TOKEN}`; an unset token rejects
 * everything. Only POST exists: GET/HEAD → 405, which is what the Streamable
 * HTTP probe expects before falling back to the plain handshake.
 */
function authorized(req: NextRequest): boolean {
  const want = process.env.HERMES_MCP_TOKEN?.trim();
  if (!want) return false;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  // Hash both sides so lengths match and the compare is constant-time.
  const sha = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(sha(got), sha(want));
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }
  const reply = await handleMcpRequest(body);
  if (reply.body === undefined) return new Response(null, { status: reply.status });
  return NextResponse.json(reply.body, { status: reply.status });
}
