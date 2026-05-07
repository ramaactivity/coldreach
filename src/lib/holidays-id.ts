// Indonesian national holidays (libur nasional). Used to skip queue runs
// on days where corporate inboxes are dead anyway. Keep this file
// hand-maintained — Idul Fitri / Idul Adha shift each year so the
// dates aren't algorithmically derivable without a Hijri calendar lib.
//
// Source-of-truth: https://www.kemnaker.go.id (annual SKB 3 Menteri).
// Format: ISO date string YYYY-MM-DD in WIB local time.
//
// Add cuti bersama (collective leave) entries here as well if you don't
// want to email during those long weekends — they tend to be officially
// announced 2-3 months ahead.

const HOLIDAYS: ReadonlySet<string> = new Set([
  // 2026
  "2026-01-01", // Tahun Baru Masehi
  "2026-01-29", // Isra Mikraj Nabi Muhammad
  "2026-02-17", // Tahun Baru Imlek
  "2026-03-19", // Hari Suci Nyepi
  "2026-03-20", // Wafat Isa Almasih (Jumat Agung)
  "2026-03-21", // Hari Paskah
  "2026-04-01", // Idul Fitri 1447 H (perkiraan, hari pertama)
  "2026-04-02", // Idul Fitri 1447 H (hari kedua)
  "2026-05-01", // Hari Buruh Internasional
  "2026-05-14", // Kenaikan Isa Almasih
  "2026-06-01", // Hari Lahir Pancasila
  "2026-06-08", // Idul Adha 1447 H (perkiraan)
  "2026-06-29", // Tahun Baru Islam 1448 H
  "2026-08-17", // Hari Kemerdekaan RI
  "2026-09-07", // Maulid Nabi Muhammad
  "2026-12-25", // Hari Raya Natal
  "2026-12-31", // Cuti bersama akhir tahun (umumnya)

  // 2027 (perkiraan — update sesuai SKB resmi nanti)
  "2027-01-01", // Tahun Baru Masehi
  "2027-02-06", // Tahun Baru Imlek
  "2027-03-08", // Hari Suci Nyepi
  "2027-03-21", // Idul Fitri (perkiraan)
  "2027-03-22",
  "2027-04-02", // Wafat Isa Almasih
  "2027-05-01", // Hari Buruh
  "2027-05-13", // Kenaikan Isa Almasih
  "2027-05-28", // Idul Adha (perkiraan)
  "2027-06-01", // Hari Lahir Pancasila
  "2027-06-18", // Tahun Baru Islam
  "2027-08-17", // Hari Kemerdekaan
  "2027-08-27", // Maulid Nabi
  "2027-12-25", // Natal
]);

/**
 * Returns true if the given ISO date (YYYY-MM-DD, WIB local) is a registered
 * Indonesian national holiday. Hand-curated list — see file header.
 */
export function isIndonesianHoliday(isoDate: string): boolean {
  return HOLIDAYS.has(isoDate);
}

/** Today (WIB) as YYYY-MM-DD string. */
export function todayWIB(): string {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 3600 * 1000);
  return wib.toISOString().slice(0, 10);
}

/** Convenience: is today (in WIB) a registered holiday? */
export function isTodayHolidayWIB(): boolean {
  return isIndonesianHoliday(todayWIB());
}
