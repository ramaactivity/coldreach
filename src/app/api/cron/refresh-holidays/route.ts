import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayWIB } from "@/lib/holidays-id";

export const maxDuration = 30;

// Multiple free APIs, tried in order. date.nager.at is rock-solid for
// libur nasional but doesn't include cuti bersama. dayoffapi covers
// cuti bersama. We merge whichever sources respond.
const SOURCES: Source[] = [
  {
    name: "date.nager.at",
    url: (year) => `https://date.nager.at/api/v3/PublicHolidays/${year}/ID`,
    parse: parseNager,
  },
  {
    name: "dayoffapi",
    url: (year) => `https://dayoffapi.vercel.app/api?year=${year}`,
    parse: parseDayoff,
  },
];

type Source = {
  name: string;
  url: (year: number) => string;
  parse: (raw: unknown) => HolidayRow[];
};

type HolidayRow = {
  date: string;
  name: string;
  is_cuti_bersama: boolean;
  source: string;
};

function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// date.nager.at shape:
// [{ date, localName, name, countryCode, fixed, global, counties, ... }]
function parseNager(raw: unknown): HolidayRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: HolidayRow[] = [];
  for (const item of raw as Array<Record<string, unknown>>) {
    const date = item.date;
    const name = (item.localName as string) ?? (item.name as string);
    if (!isIsoDate(date) || typeof name !== "string") continue;
    rows.push({
      date,
      name,
      is_cuti_bersama: false, // nager.at only lists official public holidays
      source: "date.nager.at",
    });
  }
  return rows;
}

// dayoffapi.vercel.app shape:
// [{ tanggal, keterangan, is_cuti }] OR [{ holiday_date, holiday_name, is_national_holiday }]
// The API has changed shape historically — handle both.
function parseDayoff(raw: unknown): HolidayRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: HolidayRow[] = [];
  for (const item of raw as Array<Record<string, unknown>>) {
    const date =
      (item.tanggal as string) ?? (item.holiday_date as string) ?? null;
    const name =
      (item.keterangan as string) ?? (item.holiday_name as string) ?? null;
    if (!isIsoDate(date) || typeof name !== "string") continue;
    const isCuti =
      item.is_cuti === true ||
      item.is_national_holiday === false ||
      String(name).toLowerCase().includes("cuti bersama");
    rows.push({
      date,
      name,
      is_cuti_bersama: !!isCuti,
      source: "dayoffapi",
    });
  }
  return rows;
}

async function fetchSource(
  src: Source,
  year: number,
): Promise<{ rows: HolidayRow[]; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(src.url(year), {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        // Some free APIs reject requests without a UA. Identify ourselves
        // politely so they can rate-limit / contact us if abused.
        "User-Agent": "ColdReach/1.0 (+holiday-refresh-cron)",
      },
    });
    if (!res.ok) {
      return { rows: [], error: `HTTP ${res.status}` };
    }
    const raw = await res.json();
    const rows = src.parse(raw);
    if (rows.length === 0) {
      return { rows: [], error: "empty_or_unparsable" };
    }
    return { rows };
  } catch (err) {
    return {
      rows: [],
      error: err instanceof Error ? err.message : "unknown",
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Pull every source for one year and merge. Later sources can supplement
// the first (e.g., nager gives libur nasional; dayoff adds cuti bersama).
async function fetchYear(year: number): Promise<{
  rows: HolidayRow[];
  perSource: Array<{ source: string; count: number; error?: string }>;
}> {
  const perSource: Array<{ source: string; count: number; error?: string }> =
    [];
  const merged = new Map<string, HolidayRow>();

  for (const src of SOURCES) {
    const { rows, error } = await fetchSource(src, year);
    perSource.push({ source: src.name, count: rows.length, error });
    for (const row of rows) {
      const existing = merged.get(row.date);
      if (!existing) {
        merged.set(row.date, row);
      } else if (!existing.is_cuti_bersama && row.is_cuti_bersama) {
        // Prefer the row that knows about cuti bersama
        merged.set(row.date, row);
      }
    }
  }
  return { rows: Array.from(merged.values()), perSource };
}

/**
 * Cron-triggered refresh of public.id_holidays from public APIs. Tries
 * multiple sources in parallel and merges the best of both — date.nager.at
 * for libur nasional, dayoffapi for cuti bersama. Falls through gracefully
 * when a source returns 402/5xx so a single API outage doesn't blow up
 * the whole refresh.
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

  const summary: Array<{
    year: number;
    sources: Array<{ source: string; count: number; error?: string }>;
    upserted: number;
    error?: string;
  }> = [];

  for (const year of years) {
    const { rows, perSource } = await fetchYear(year);
    if (rows.length === 0) {
      summary.push({
        year,
        sources: perSource,
        upserted: 0,
        error: "all_sources_empty",
      });
      continue;
    }
    const { error } = await admin.from("id_holidays").upsert(
      rows.map((r) => ({
        date: r.date,
        name: r.name,
        is_cuti_bersama: r.is_cuti_bersama,
        source: r.source,
        fetched_at: new Date().toISOString(),
      })),
      { onConflict: "date" },
    );
    summary.push({
      year,
      sources: perSource,
      upserted: error ? 0 : rows.length,
      error: error?.message,
    });
  }

  const totalUpserted = summary.reduce((sum, s) => sum + s.upserted, 0);
  const anyErrors = summary.some(
    (s) => s.error || s.sources.every((src) => src.error),
  );

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
        summary,
        total_upserted: totalUpserted,
        had_errors: anyErrors,
      },
    });
  }

  return NextResponse.json({
    ok: totalUpserted > 0,
    refreshed_at: new Date().toISOString(),
    today_wib: today,
    total_upserted: totalUpserted,
    summary,
  });
}
