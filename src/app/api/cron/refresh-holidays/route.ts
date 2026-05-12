import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayWIB } from "@/lib/holidays-id";

export const maxDuration = 30;

// Public, no-auth Indonesian holiday API. Returns libur nasional (SKB) +
// cuti bersama declared by SKB 3 Menteri. If this domain ever dies, the
// hardcoded fallback in holidays-id.ts keeps the cron paths safe.
const HOLIDAY_API = "https://api-harilibur.vercel.app/api?year=";

type ApiHoliday = {
  holiday_date?: string;
  holiday_name?: string;
  is_national_holiday?: boolean;
};

type HolidayRow = {
  date: string;
  name: string;
  is_cuti_bersama: boolean;
};

async function fetchYear(year: number): Promise<HolidayRow[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  let raw: unknown;
  try {
    const res = await fetch(`${HOLIDAY_API}${year}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    raw = await res.json();
  } finally {
    clearTimeout(timeout);
  }

  if (!Array.isArray(raw)) {
    throw new Error("API returned non-array payload");
  }

  const rows: HolidayRow[] = [];
  for (const item of raw as ApiHoliday[]) {
    const date = item?.holiday_date;
    const name = item?.holiday_name;
    if (typeof date !== "string" || typeof name !== "string") continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    rows.push({
      date,
      name,
      // Cuti bersama is everything the API marks as non-national. SKB
      // libur nasional has is_national_holiday=true.
      is_cuti_bersama: item.is_national_holiday === false,
    });
  }
  return rows;
}

/**
 * Cron-triggered refresh of public.id_holidays from the public Indonesian
 * holiday API. Pulls current year + next year so the app always has 12+
 * months of look-ahead for the dashboard banner.
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
  const today = todayWIB();
  const currentYear = parseInt(today.slice(0, 4), 10);
  const years = [currentYear, currentYear + 1];

  const summary: {
    year: number;
    fetched: number;
    upserted: number;
    error?: string;
  }[] = [];

  for (const year of years) {
    try {
      const rows = await fetchYear(year);
      if (rows.length === 0) {
        summary.push({ year, fetched: 0, upserted: 0, error: "empty_payload" });
        continue;
      }
      // Upsert all rows in one shot. PostgREST limit is fine here — at
      // most ~30 rows per year.
      const { error } = await admin.from("id_holidays").upsert(
        rows.map((r) => ({
          date: r.date,
          name: r.name,
          is_cuti_bersama: r.is_cuti_bersama,
          source: "api-harilibur",
          fetched_at: new Date().toISOString(),
        })),
        { onConflict: "date" },
      );
      if (error) {
        summary.push({
          year,
          fetched: rows.length,
          upserted: 0,
          error: error.message,
        });
      } else {
        summary.push({ year, fetched: rows.length, upserted: rows.length });
      }
    } catch (err) {
      summary.push({
        year,
        fetched: 0,
        upserted: 0,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  const totalUpserted = summary.reduce((sum, s) => sum + s.upserted, 0);
  const anyErrors = summary.some((s) => s.error);

  // Log to activity_log so the user can audit refresh history in case the
  // API quietly starts returning bad data.
  await admin.from("activity_log").insert({
    activity_type: "holidays_refreshed",
    entity_type: "id_holidays",
    metadata: {
      summary,
      total_upserted: totalUpserted,
      had_errors: anyErrors,
    },
  });

  return NextResponse.json({
    ok: !anyErrors || totalUpserted > 0,
    refreshed_at: new Date().toISOString(),
    today_wib: today,
    summary,
  });
}
