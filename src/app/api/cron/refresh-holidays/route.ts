import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshHolidays } from "@/lib/holidays-refresh";

export const maxDuration = 30;

/**
 * Cron-triggered refresh of public.id_holidays from public APIs. The actual
 * fetch/merge/upsert lives in src/lib/holidays-refresh.ts so the manual
 * "Refresh sekarang" server action can reuse it. User-managed rows
 * (is_manual=true) are never overwritten.
 *
 * Schedule (recommended): once per day at 02:00 WIB.
 *
 * Manual trigger:
 *   curl -H "X-Cron-Secret: $CRON_SECRET" http://localhost:3000/api/cron/refresh-holidays
 */
export async function GET(request: NextRequest) {
  const cronSecret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await refreshHolidays(admin);

  // Best-effort activity_log write. user_id is NOT NULL so we attribute
  // to the first user we find — single-tenant app today, but cheaper
  // than maintaining a separate audit table.
  const { data: anyUser } = await admin
    .from("users")
    .select("id")
    .limit(1)
    .maybeSingle();
  const ownerId = (anyUser as { id: string } | null)?.id;
  if (ownerId) {
    await admin.from("activity_log").insert({
      user_id: ownerId,
      activity_type: "holidays_refreshed",
      entity_type: "id_holidays",
      metadata: {
        summary: result.years,
        total_upserted: result.total_upserted,
        protected_dates: result.protected_dates,
      },
    });
  }

  return NextResponse.json({
    ok: result.ok,
    refreshed_at: new Date().toISOString(),
    today_wib: result.today_wib,
    total_upserted: result.total_upserted,
    protected_dates: result.protected_dates,
    summary: result.years,
  });
}
