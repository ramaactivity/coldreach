import Link from "next/link";
import { CalendarOff } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getUpcomingHolidaysWIB,
  todayWIB,
  type HolidayHit,
} from "@/lib/holidays-id";
import { Notice } from "@/components/ui";

const LOOKAHEAD_DAYS = 7;

function daysBetween(fromIso: string, toIso: string): number {
  const [y1, m1, d1] = fromIso.split("-").map(Number);
  const [y2, m2, d2] = toIso.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / (24 * 3600 * 1000));
}

function relativeDayLabel(daysFromToday: number): string {
  if (daysFromToday === 0) return "Hari ini";
  if (daysFromToday === 1) return "Besok";
  if (daysFromToday === 2) return "Lusa";
  return `${daysFromToday} hari lagi`;
}

function formatWibDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/**
 * Server component. Shows a single banner when one or more Indonesian
 * holidays / cuti bersama fall in the next 7 days. Auto-skip messaging is
 * accurate because the cron routes use the same data source.
 */
export async function HolidayNotice() {
  const admin = createAdminClient();
  let upcoming: HolidayHit[] = [];
  try {
    upcoming = await getUpcomingHolidaysWIB(admin, LOOKAHEAD_DAYS);
  } catch {
    // Never break the dashboard if holiday lookup fails.
    return null;
  }

  if (upcoming.length === 0) return null;

  const today = todayWIB();
  const first = upcoming[0];
  const daysAway = daysBetween(today, first.date);
  const isToday = daysAway === 0;
  const others = upcoming.slice(1);

  return (
    <div className="mb-6">
      <Notice
        tone={isToday ? "warning" : "info"}
        icon={<CalendarOff className="h-4 w-4" />}
        title={
          isToday
            ? `Hari ini libur: ${first.name}`
            : `${relativeDayLabel(daysAway)} libur: ${first.name}`
        }
      >
        <p className="mt-0.5 text-[13px] text-muted">
          {formatWibDate(first.date)}
          {first.is_cuti_bersama ? " · cuti bersama" : ""} — queue & follow-up
          auto-skip pada tanggal ini.
        </p>
        {others.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-[11px] text-muted">
            {others.slice(0, 3).map((h) => {
              const offset = daysBetween(today, h.date);
              return (
                <li key={h.date}>
                  <span className="tabular">{formatWibDate(h.date)}</span>
                  <span className="ml-1.5 text-faint">
                    · {relativeDayLabel(offset)}
                  </span>
                  <span className="ml-1.5">— {h.name}</span>
                  {h.is_cuti_bersama && (
                    <span className="ml-1 text-faint">(cuti bersama)</span>
                  )}
                </li>
              );
            })}
            {others.length > 3 && (
              <li className="text-faint">
                + {others.length - 3} libur lainnya dalam 7 hari ke depan
              </li>
            )}
          </ul>
        )}
        <Link
          href="/holidays"
          prefetch={true}
          className="mt-2 inline-block text-xs font-medium text-accent-text underline-offset-2 hover:underline"
        >
          Kelola hari libur →
        </Link>
      </Notice>
    </div>
  );
}
