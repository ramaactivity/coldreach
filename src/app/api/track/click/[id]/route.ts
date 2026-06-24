import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyClickSignature } from "@/lib/click-tracking";
import { classifyOpenEvent, msSinceSent } from "@/lib/open-classifier";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Click-tracking redirect. Embedded in outbound email HTML as
 *   <a href="/api/track/click/{recipient_id}?u=<urlencoded>&s=<sig>">
 *
 * On request:
 *   1. Verify HMAC signature so this can't be abused as an open redirect.
 *   2. Fire-and-forget: bump campaign_recipients.click_count + log activity.
 *   3. 302 to the original URL.
 *
 * Public endpoint (recipients are anonymous). Always responds — never
 * leak signature failure details. Bad signature → fall back to `u` if
 * looks safe, else 400.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const u = request.nextUrl.searchParams.get("u");
  const s = request.nextUrl.searchParams.get("s");

  if (!u) {
    return new NextResponse("Missing target URL", { status: 400 });
  }

  // Validate target URL: must be http/https
  let targetUrl: string;
  try {
    const parsed = new URL(u);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return new NextResponse("Invalid URL scheme", { status: 400 });
    }
    targetUrl = parsed.toString();
  } catch {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  // Verify signature
  if (!s || !verifyClickSignature(u, s)) {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  // Fire-and-forget click logging — don't block redirect on DB latency
  if (UUID_RE.test(id)) {
    const userAgent = request.headers.get("user-agent") ?? "";
    logClick(id, targetUrl, userAgent).catch((err) => {
      console.error("trackClick error:", err);
    });
  }

  return NextResponse.redirect(targetUrl, 302);
}

async function logClick(recipientId: string, url: string, userAgent: string) {
  const admin = createAdminClient();

  const { data: recipient } = await admin
    .from("campaign_recipients")
    .select(
      "id, click_count, human_click_count, status, user_id, workspace_id, sent_at",
    )
    .eq("id", recipientId)
    .maybeSingle();
  if (!recipient) return;

  // Security scanners (SafeLinks etc.) follow every link at delivery time. Use
  // the same machine filter as opens — raw click_count always increments, but
  // human_click_count + the activity feed only move on a real human click.
  const kind = classifyOpenEvent({
    userAgent,
    msSinceSent: msSinceSent((recipient as { sent_at?: string | null }).sent_at),
  });
  const isHuman = kind === "human";

  const updates: Record<string, unknown> = {
    click_count: (recipient.click_count ?? 0) + 1,
  };
  if (isHuman) {
    updates.human_click_count =
      ((recipient as { human_click_count?: number }).human_click_count ?? 0) + 1;
  }

  await admin
    .from("campaign_recipients")
    .update(updates)
    .eq("id", recipientId);

  if (isHuman) {
    await admin.from("activity_log").insert({
      user_id: recipient.user_id,
      workspace_id: recipient.workspace_id,
      activity_type: "email_clicked",
      entity_type: "campaign_recipient",
      entity_id: recipientId,
      metadata: {
        url: url.slice(0, 500),
        user_agent: userAgent.slice(0, 200),
      },
    });
  }
}
