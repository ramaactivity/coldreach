import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAndSendDigests } from "@/lib/digest";

export const maxDuration = 60;

/**
 * Daily 08:00 WIB digest (pg_cron coldreach-reply-digest, weekdays):
 * unanswered replies, stalled hot leads, yesterday's numbers.
 * Manual: curl -H "X-Cron-Secret: $CRON_SECRET" http://localhost:3000/api/cron/reply-digest
 */
export async function GET(request: NextRequest) {
  const cronSecret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await buildAndSendDigests(createAdminClient());
  return NextResponse.json({ ok: true, triggered_at: new Date().toISOString(), results });
}
