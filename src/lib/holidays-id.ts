// Indonesian national holidays (libur nasional + cuti bersama). Used to
// skip queue runs on days where corporate inboxes are dead anyway.
//
// This hardcoded set is the **offline fallback**. The runtime path also
// queries the `id_holidays` table which gets refreshed daily from a public
// API (api-harilibur.vercel.app), so the user never has to update this
// file manually. The hardcoded set keeps the app safe when:
//   - API is down or returns garbage
//   - DB hasn't been refreshed yet (fresh deploy, table empty)
//   - Network is unreachable from the cron route
//
// Format: ISO date string YYYY-MM-DD in WIB local time.

export const FALLBACK_HOLIDAYS: ReadonlyMap<string, string> = new Map([
  // ===== 2026 — libur nasional (SKB 3 Menteri) + cuti bersama yang umum =====
  ["2026-01-01", "Tahun Baru Masehi"],
  ["2026-01-29", "Isra Mikraj Nabi Muhammad"],
  ["2026-02-17", "Tahun Baru Imlek 2577"],
  ["2026-03-19", "Hari Suci Nyepi"],
  ["2026-03-20", "Wafat Isa Almasih (Jumat Agung)"],
  ["2026-03-21", "Hari Paskah"],
  // Idul Fitri 1447 H — pemerintah biasanya menetapkan H-1/H+1 sbg cuti
  // bersama. Tambahkan estimasi yang umum supaya outreach gak nekat
  // ngirim di long weekend Lebaran. Verifikasi via SKB resmi.
  ["2026-03-30", "Cuti bersama Idul Fitri (perkiraan)"],
  ["2026-03-31", "Cuti bersama Idul Fitri (perkiraan)"],
  ["2026-04-01", "Idul Fitri 1447 H — Hari Pertama"],
  ["2026-04-02", "Idul Fitri 1447 H — Hari Kedua"],
  ["2026-04-03", "Cuti bersama Idul Fitri (perkiraan)"],
  ["2026-05-01", "Hari Buruh Internasional"],
  ["2026-05-14", "Kenaikan Isa Almasih"],
  ["2026-05-15", "Cuti bersama Kenaikan Isa Almasih (perkiraan)"],
  ["2026-06-01", "Hari Lahir Pancasila"],
  ["2026-06-08", "Idul Adha 1447 H (perkiraan)"],
  ["2026-06-29", "Tahun Baru Islam 1448 H"],
  ["2026-08-17", "Hari Kemerdekaan RI"],
  ["2026-09-07", "Maulid Nabi Muhammad"],
  ["2026-12-24", "Cuti bersama Natal (perkiraan)"],
  ["2026-12-25", "Hari Raya Natal"],
  ["2026-12-31", "Cuti bersama akhir tahun (perkiraan)"],

  // ===== 2027 (perkiraan — update sesuai SKB resmi nanti) =====
  ["2027-01-01", "Tahun Baru Masehi"],
  ["2027-02-06", "Tahun Baru Imlek 2578 (perkiraan)"],
  ["2027-03-08", "Hari Suci Nyepi (perkiraan)"],
  ["2027-03-21", "Idul Fitri 1448 H — Hari Pertama (perkiraan)"],
  ["2027-03-22", "Idul Fitri 1448 H — Hari Kedua (perkiraan)"],
  ["2027-04-02", "Wafat Isa Almasih"],
  ["2027-05-01", "Hari Buruh"],
  ["2027-05-13", "Kenaikan Isa Almasih (perkiraan)"],
  ["2027-05-28", "Idul Adha 1448 H (perkiraan)"],
  ["2027-06-01", "Hari Lahir Pancasila"],
  ["2027-06-18", "Tahun Baru Islam 1449 H (perkiraan)"],
  ["2027-08-17", "Hari Kemerdekaan RI"],
  ["2027-08-27", "Maulid Nabi (perkiraan)"],
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
 * DB-first holiday lookup with hardcoded fallback. Use this from cron route
 * handlers — they already run in async context.
 */
export async function getHolidayWIBAsync(
  admin: SupabaseClient,
  isoDate: string,
): Promise<HolidayHit | null> {
  // 1. Database — refreshed daily from api-harilibur.
  try {
    const { data } = await admin
      .from("id_holidays")
      .select("name, is_cuti_bersama")
      .eq("date", isoDate)
      .maybeSingle();
    if (data && typeof data.name === "string") {
      return {
        date: isoDate,
        name: data.name,
        source: "db",
        is_cuti_bersama: !!data.is_cuti_bersama,
      };
    }
  } catch {
    // Fall through to hardcoded — DB unreachable or table missing.
  }

  // 2. Hardcoded fallback.
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
 * Return holidays in the next `daysAhead` days (inclusive of today). Used by
 * the dashboard banner. DB-first; for any date not in DB, we patch in the
 * hardcoded fallback so the banner stays accurate even when refresh hasn't
 * fired yet.
 */
export async function getUpcomingHolidaysWIB(
  admin: SupabaseClient,
  daysAhead: number = 7,
): Promise<HolidayHit[]> {
  const today = todayWIB();
  const end = addDaysWIB(today, daysAhead);

  const byDate = new Map<string, HolidayHit>();

  // Hardcoded fallback first — keeps the banner working before the very
  // first DB refresh has happened (fresh deploys).
  for (let i = 0; i <= daysAhead; i++) {
    const d = addDaysWIB(today, i);
    const fb = FALLBACK_HOLIDAYS.get(d);
    if (fb) {
      byDate.set(d, {
        date: d,
        name: fb,
        source: "fallback",
        is_cuti_bersama: fb.toLowerCase().includes("cuti bersama"),
      });
    }
  }

  // DB overrides fallback wherever it has data.
  try {
    const { data } = await admin
      .from("id_holidays")
      .select("date, name, is_cuti_bersama")
      .gte("date", today)
      .lte("date", end)
      .order("date", { ascending: true });
    for (const row of data ?? []) {
      byDate.set(row.date, {
        date: row.date,
        name: row.name,
        source: "db",
        is_cuti_bersama: !!row.is_cuti_bersama,
      });
    }
  } catch {
    // Fall through with just the fallback set.
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
