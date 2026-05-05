import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 1x1 transparent GIF (43 bytes)
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const PIXEL_HEADERS = {
  "Content-Type": "image/gif",
  "Content-Length": String(TRANSPARENT_GIF.length),
  "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

/**
 * Email open tracking pixel. Embedded in outbound email HTML as
 *   <img src="/api/track/open/{campaign_recipient_id}" />
 *
 * Recipients' email clients fetch the pixel when displaying the email.
 * We log the open and return a 1x1 transparent GIF.
 *
 * No auth needed (public endpoint, recipients are anonymous).
 * Always returns 200 + GIF, even on DB error, so we never break email rendering.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Fire-and-forget DB update so we always return the pixel quickly
  trackOpen(id, request).catch((err) => {
    console.error("trackOpen error:", err);
  });

  return new NextResponse(new Uint8Array(TRANSPARENT_GIF), {
    status: 200,
    headers: PIXEL_HEADERS,
  });
}

async function trackOpen(recipientId: string, request: NextRequest) {
  if (!recipientId.match(/^[0-9a-f-]{36}$/i)) return; // not a UUID, ignore

  const userAgent = request.headers.get("user-agent") ?? "";
  // Skip Gmail's image proxy preview that fires once on display in some clients
  // (we still count it as an open since user actually viewed the email)

  const admin = createAdminClient();

  // Fetch current state
  const { data: recipient } = await admin
    .from("campaign_recipients")
    .select("id, opened_at, open_count, status, user_id")
    .eq("id", recipientId)
    .maybeSingle();
  if (!recipient) return;

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    open_count: (recipient.open_count ?? 0) + 1,
  };

  // First-time open: set opened_at + bump status if still 'sent'
  if (!recipient.opened_at) {
    updates.opened_at = now;
    if (recipient.status === "sent") {
      updates.status = "opened";
    }
  }

  await admin
    .from("campaign_recipients")
    .update(updates)
    .eq("id", recipientId);

  // Light-touch activity log (max 1 entry per first open)
  if (!recipient.opened_at) {
    await admin.from("activity_log").insert({
      user_id: recipient.user_id,
      activity_type: "email_opened",
      entity_type: "campaign_recipient",
      entity_id: recipientId,
      metadata: { user_agent: userAgent.slice(0, 200) },
    });
  }
}
