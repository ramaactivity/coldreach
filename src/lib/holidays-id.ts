// Indonesian national holidays — **offline fallback only**.
//
// The runtime source of truth is the `id_holidays` table: refreshed daily
// from public APIs (date.nager.at + dayoffapi) and editable by users via
// /holidays (add / correct / disable). This hardcoded set is a thin safety
// net used ONLY on a cold start — before the very first refresh has
// populated the table (e.g. a fresh deploy with an empty DB). Once the DB
// has any rows, it is authoritative and this set is NOT overlaid.
//
// IMPORTANT: keep this to FIXED-DATE civil holidays that are correct every
// year. Movable feasts (Idul Fitri, Idul Adha, Imlek, Nyepi, Jumat Agung,
// Paskah, Kenaikan, Tahun Baru Islam, Maulid) shift on lunar/liturgical
// calendars — hardcoding estimates here caused a real bug (Idul Adha 1447 H
// shown on the wrong date, 2026-06-08, leaking into the dashboard banner).
// Those dates come from the API or are added manually instead.
//
// Format: ISO date string YYYY-MM-DD in WIB local time.

export const FALLBACK_HOLIDAYS: ReadonlyMap<string, string> = new Map([
  // 2026 — fixed-date national holidays only.
  ["2026-01-01", "Tahun Baru Masehi"],
  ["2026-05-01", "Hari Buruh Internasional"],
  ["2026-06-01", "Hari Lahir Pancasila"],
  ["2026-08-17", "Hari Kemerdekaan RI"],
  ["2026-12-25", "Hari Raya Natal"],

  // 2027 — fixed-date national holidays only.
  ["2027-01-01", "Tahun Baru Masehi"],
  ["2027-05-01", "Hari Buruh Internasional"],
  ["2027-06-01", "Hari Lahir Pancasila"],
  ["2027-08-17", "Hari Kemerdekaan RI"],
  ["2027-12-25", "Hari Raya Natal"],
]);

// Highest year covered by the fallback set. If `todayWIB()` is beyond
// this AND the DB hasn't been refreshed yet, the cron route logs a
// warning and (conservatively) keeps running — we'd rather over-send
// than silently skip every day forever once the list dries up.
export const FALLBACK_LAST_KNOWN_YEAR = 2027;

/**
 * Returns true if the given ISO date (YYYY-MM-DD, WIB local) is on the
 * offline fallback set. Synchronous — used as a safety net behind the
 * async DB lookup. Prefer `isHolidayWIBAsync` in cron paths.
 */
export function isIndonesianHoliday(isoDate: string): boolean {
  return FALLBACK_HOLIDAYS.has(isoDate);
}

/** Name of a hardcoded holiday or null. */
export function getFallbackHolidayName(isoDate: string): string | null {
  return FALLBACK_HOLIDAYS.get(isoDate) ?? null;
}

/** Today (WIB) as YYYY-MM-DD string. */
export function todayWIB(): string {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 3600 * 1000);
  return wib.toISOString().slice(0, 10);
}

/** Convenience: is today (in WIB) on the hardcoded fallback set? */
export function isTodayHolidayWIB(): boolean {
  return isIndonesianHoliday(todayWIB());
}

/** Add N days to a WIB ISO date string (YYYY-MM-DD). */
export function addDaysWIB(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

import type { SupabaseClient } from "@supabase/supabase-js";

export type HolidayHit = {
  date: string;
  name: string;
  source: "db" | "fallback";
  is_cuti_bersama: boolean;
};

/**
 * True if the id_holidays table has any row at all. Used to distinguish a
 * cold start (empty table — trust the hardcoded fallback) from a populated
 * DB (authoritative — a date absent from it is genuinely not a holiday).
 */
async function dbHasAnyHoliday(admin: SupabaseClient): Promise<boolean> {
  try {
    const { count } = await admin
      .from("id_holidays")
      .select("date", { count: "exact", head: true });
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * DB-first holiday lookup. The id_holidays table is the source of truth
 * (auto-refreshed + user-managed via /holidays). Rules:
 *   - row exists & enabled  -> holiday
 *   - row exists & disabled -> NOT a holiday (user opted to send that day;
 *     authoritative, no fallback)
 *   - no row, DB populated   -> NOT a holiday (absent = genuinely none)
 *   - no row, DB empty/down  -> hardcoded fallback (cold-start safety net)
 * Use this from cron route handlers — they already run in async context.
 */
export async function getHolidayWIBAsync(
  admin: SupabaseClient,
  isoDate: string,
): Promise<HolidayHit | null> {
  try {
    const { data } = await admin
      .from("id_holidays")
      .select("name, is_cuti_bersama, enabled")
      .eq("date", isoDate)
      .maybeSingle();
    if (data) {
      if (!data.enabled) return null; // user-disabled — authoritative
      if (typeof data.name === "string") {
        return {
          date: isoDate,
          name: data.name,
          source: "db",
          is_cuti_bersama: !!data.is_cuti_bersama,
        };
      }
    }
    // No row for this date: only fall back on a cold start (empty table).
    if (await dbHasAnyHoliday(admin)) return null;
  } catch {
    // DB unreachable or table missing — fall through to hardcoded net.
  }

  const fallbackName = FALLBACK_HOLIDAYS.get(isoDate);
  if (fallbackName) {
    return {
      date: isoDate,
      name: fallbackName,
      source: "fallback",
      is_cuti_bersama: fallbackName.toLowerCase().includes("cuti bersama"),
    };
  }
  return null;
}

/** Convenience wrapper for "is today a holiday in WIB?". */
export async function isTodayHolidayWIBAsync(
  admin: SupabaseClient,
): Promise<HolidayHit | null> {
  return getHolidayWIBAsync(admin, todayWIB());
}

/**
 * Return enabled holidays in the next `daysAhead` days (inclusive of today).
 * Used by the dashboard banner. The DB is authoritative once populated — we
 * do NOT overlay the hardcoded fallback on top of it (that used to leak a
 * wrong estimated date into the banner). Fallback is consulted only on a
 * cold start (empty table). Disabled rows are skipped.
 */
export async function getUpcomingHolidaysWIB(
  admin: SupabaseClient,
  daysAhead: number = 7,
): Promise<HolidayHit[]> {
  const today = todayWIB();
  const end = addDaysWIB(today, daysAhead);

  const byDate = new Map<string, HolidayHit>();
  let dbAlive = false;

  try {
    const { data } = await admin
      .from("id_holidays")
      .select("date, name, is_cuti_bersama, enabled")
      .gte("date", today)
      .lte("date", end)
      .order("date", { ascending: true });
    if (data) {
      // Table-wide existence check — a populated DB is authoritative even
      // when this particular window happens to hold no holidays.
      dbAlive = await dbHasAnyHoliday(admin);
      for (const row of data) {
        if (!row.enabled) continue; // disabled — not a skip day
        byDate.set(row.date, {
          date: row.date,
          name: row.name,
          source: "db",
          is_cuti_bersama: !!row.is_cuti_bersama,
        });
      }
    }
  } catch {
    // DB unreachable — fall through to the cold-start fallback below.
  }

  // Cold-start safety net: overlay fallback only when the DB has no data.
  if (!dbAlive) {
    for (let i = 0; i <= daysAhead; i++) {
      const d = addDaysWIB(today, i);
      const fb = FALLBACK_HOLIDAYS.get(d);
      if (fb && !byDate.has(d)) {
        byDate.set(d, {
          date: d,
          name: fb,
          source: "fallback",
          is_cuti_bersama: fb.toLowerCase().includes("cuti bersama"),
        });
      }
    }
  }

  return Array.from(byDate.values()).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

/**
 * Returns true if the current WIB year is past the last hardcoded year
 * AND the DB is empty for the year. Cron paths log a warning when this is
 * true — without a refreshed DB, the app would silently send on real
 * holidays.
 */
export async function holidayDataLooksStale(
  admin: SupabaseClient,
): Promise<boolean> {
  const year = parseInt(todayWIB().slice(0, 4), 10);
  if (year <= FALLBACK_LAST_KNOWN_YEAR) return false;
  try {
    const { data } = await admin
      .from("id_holidays")
      .select("date, name, is_cuti_bersama")
      .gte("date", `${year}-01-01`)
      .lte("date", `${year}-12-31`)
      .order("date", { ascending: true });
    return !data || data.length === 0;
  } catch {
    return true;
  }
}
