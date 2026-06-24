import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bumpContactEngagement } from "@/lib/engagement";
import { classifyOpenEvent, msSinceSent } from "@/lib/open-classifier";

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

  const admin = createAdminClient();

  // Fetch current state. sent_at drives the timing-based machine filter.
  const { data: recipient } = await admin
    .from("campaign_recipients")
    .select(
      "id, opened_at, human_opened_at, open_count, human_open_count, status, user_id, contact_id, sent_at",
    )
    .eq("id", recipientId)
    .maybeSingle();
  if (!recipient) return;

  // Separate machine traffic (scanners, MPP/proxy prefetch, bots) from a real
  // human open. Only human opens move the metrics; everything still increments
  // the raw open_count so the forensic record stays complete.
  const kind = classifyOpenEvent({
    userAgent,
    msSinceSent: msSinceSent((recipient as { sent_at?: string | null }).sent_at),
  });
  const isHuman = kind === "human";

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    open_count: (recipient.open_count ?? 0) + 1,
    last_open_at: now,
  };
  // Keep opened_at as the first-ever raw ping (forensic), unchanged.
  if (!recipient.opened_at) updates.opened_at = now;

  const firstHumanOpen = isHuman && !recipient.human_opened_at;
  if (isHuman) {
    updates.human_open_count =
      ((recipient as { human_open_count?: number }).human_open_count ?? 0) + 1;
    if (firstHumanOpen) {
      updates.human_opened_at = now;
      // Only a genuine human read flips the status to 'opened'.
      if (recipient.status === "sent") updates.status = "opened";
    }
  }

  await admin
    .from("campaign_recipients")
    .update(updates)
    .eq("id", recipientId);

  // Activity log + engagement only fire on the first real human open, so the
  // feed and engagement scores aren't drowned in scanner noise.
  if (firstHumanOpen) {
    await admin.from("activity_log").insert({
      user_id: recipient.user_id,
      activity_type: "email_opened",
      entity_type: "campaign_recipient",
      entity_id: recipientId,
      metadata: { user_agent: userAgent.slice(0, 200), open_kind: kind },
    });

    if ((recipient as { contact_id?: string }).contact_id) {
      await bumpContactEngagement(
        admin,
        (recipient as { contact_id: string }).contact_id,
        "open",
      );
    }
  }
}
