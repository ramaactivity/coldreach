import type { SupabaseClient } from "@supabase/supabase-js";
import { todayWIB, FALLBACK_HOLIDAYS } from "@/lib/holidays-id";

// Refresh public.id_holidays from public APIs, shared by the daily cron
// (api/cron/refresh-holidays) and the manual "Refresh sekarang" server action.
//
// Two sources, merged: date.nager.at is solid for libur nasional but omits
// cuti bersama (and, in practice, some Islamic feasts); dayoffapi adds cuti
// bersama when it's up. Whatever responds is merged; a single outage never
// blows up the whole refresh.
//
// Two invariants that make manual management safe:
//   - Rows with is_manual=true (user added / corrected / disabled) are NEVER
//     touched — their dates are excluded from the upsert.
//   - The upsert only writes holiday *facts* (name, cuti, source, fetched_at).
//     It never writes is_manual/enabled, so a user's disable on a non-manual
//     row would survive too — though setHolidayEnabled() also flips is_manual,
//     so disabled rows are protected regardless.

type Source = {
  name: string;
  url: (year: number) => string;
  parse: (raw: unknown) => HolidayRow[];
};

export type HolidayRow = {
  date: string;
  name: string;
  is_cuti_bersama: boolean;
  source: string;
};

export type RefreshSummary = {
  ok: boolean;
  today_wib: string;
  total_upserted: number;
  protected_dates: number;
  years: Array<{
    year: number;
    sources: Array<{ source: string; count: number; error?: string }>;
    upserted: number;
    error?: string;
  }>;
};

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
        "User-Agent": "ColdReach/1.0 (+holiday-refresh)",
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

// Pull every source for one year and merge. Later sources supplement the
// first (nager gives libur nasional; dayoff adds cuti bersama). Finally we
// gap-fill from the hardcoded fixed-date set so a source outage never drops
// a certain civil holiday.
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

  // Gap-fill: certain fixed-date holidays the APIs might have dropped.
  for (const [date, name] of FALLBACK_HOLIDAYS) {
    if (date.slice(0, 4) !== String(year)) continue;
    if (!merged.has(date)) {
      merged.set(date, { date, name, is_cuti_bersama: false, source: "fallback" });
    }
  }

  return { rows: Array.from(merged.values()), perSource };
}

/**
 * Refresh id_holidays for the current + next year. Returns a structured
 * summary. Does NOT write to activity_log — callers decide whether to log.
 */
export async function refreshHolidays(
  admin: SupabaseClient,
): Promise<RefreshSummary> {
  const today = todayWIB();
  const currentYear = parseInt(today.slice(0, 4), 10);
  const years = [currentYear, currentYear + 1];

  // Never overwrite user-managed rows (added / corrected / disabled).
  // supabase-js does NOT throw on query errors — it returns { error }. A
  // try/catch here would be dead code, so check `error` explicitly and bail
  // rather than proceed with an empty protected set (which would clobber the
  // user's corrected/disabled holiday rows).
  const protectedDates = new Set<string>();
  const { data: protectedRows, error: protectedErr } = await admin
    .from("id_holidays")
    .select("date")
    .eq("is_manual", true);
  if (protectedErr) {
    return {
      ok: false,
      today_wib: today,
      total_upserted: 0,
      protected_dates: 0,
      years: [],
    };
  }
  for (const row of protectedRows ?? []) {
    if (typeof (row as { date?: string }).date === "string") {
      protectedDates.add((row as { date: string }).date);
    }
  }

  const summary: RefreshSummary["years"] = [];

  for (const year of years) {
    const { rows, perSource } = await fetchYear(year);
    // Drop any date the user manages — refresh must not touch those.
    const upsertable = rows.filter((r) => !protectedDates.has(r.date));
    if (upsertable.length === 0) {
      summary.push({
        year,
        sources: perSource,
        upserted: 0,
        error: rows.length === 0 ? "all_sources_empty" : "all_protected",
      });
      continue;
    }
    // Only write holiday facts — never is_manual/enabled (user-control cols).
    const { error } = await admin.from("id_holidays").upsert(
      upsertable.map((r) => ({
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
      upserted: error ? 0 : upsertable.length,
      error: error?.message,
    });
  }

  const totalUpserted = summary.reduce((sum, s) => sum + s.upserted, 0);

  return {
    ok: totalUpserted > 0,
    today_wib: today,
    total_upserted: totalUpserted,
    protected_dates: protectedDates.size,
    years: summary,
  };
}
