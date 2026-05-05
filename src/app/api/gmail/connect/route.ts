import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { buildAuthUrl } from "@/lib/gmail";

/**
 * Starts the Gmail OAuth flow for a specific workspace.
 * GET /api/gmail/connect?workspace=tiska-catering
 *
 * State param encodes: random nonce + workspace_id, base64 JSON.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const slug = request.nextUrl.searchParams.get("workspace");
  if (!slug) {
    return NextResponse.json({ error: "Missing workspace slug" }, { status: 400 });
  }

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const nonce = randomBytes(16).toString("hex");
  const state = Buffer.from(
    JSON.stringify({ nonce, slug, workspace_id: workspace.id }),
  ).toString("base64url");

  const authUrl = buildAuthUrl(state);
  return NextResponse.redirect(authUrl);
}
