import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { archiveStaleContacts } from "@/lib/stale-archiver";

// Pure SQL — bounded batch update + activity_log insert. Easily finishes
// within seconds; 30s is a generous ceiling.
export const maxDuration = 30;

/**
 * Daily cron — archives contacts that have ignored 5+ emails over 30+ days.
 * pg_cron schedule: 0 18 * * * UTC (= 01:00 WIB next day, after the daily
 * quota reset at 17:00 UTC = 00:00 WIB).
 *
 * Auth: X-Cron-Secret header must match CRON_SECRET env.
 *
 * Manual:
 *   curl -H "X-Cron-Secret: $CRON_SECRET" http://localhost:3000/api/cron/stale-archiver
 */
export async function GET(request: NextRequest) {
  const cronSecret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await archiveStaleContacts(admin);

  return NextResponse.json({
    ok: true,
    triggered_at: new Date().toISOString(),
    ...result,
  });
}
