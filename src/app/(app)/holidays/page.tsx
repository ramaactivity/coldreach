import { CalendarOff, Sparkles } from "lucide-react";
import { requireCurrentUser } from "@/lib/supabase/session-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayWIB } from "@/lib/holidays-id";
import { SimpleTopbar } from "@/components/simple-topbar";
import { PageHeader } from "@/components/ui/page-header";
import { HolidaysManager, type Holiday } from "./holidays-manager";

// Always render fresh — holidays are edited here and elsewhere.
export const dynamic = "force-dynamic";

export default async function HolidaysPage() {
  const user = await requireCurrentUser();
  const admin = createAdminClient();

  const today = todayWIB();
  const yearStart = `${today.slice(0, 4)}-01-01`;

  // Current year onward — enough to manage upcoming + audit recent past.
  const { data } = await admin
    .from("id_holidays")
    .select("date, name, is_cuti_bersama, is_manual, enabled, source")
    .gte("date", yearStart)
    .order("date", { ascending: true });

  const holidays = (data ?? []) as Holiday[];

  return (
    <>
      <SimpleTopbar email={user.email ?? ""} />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <PageHeader
          eyebrow={
            <>
              <Sparkles className="h-3 w-3 text-amber-500" />
              <span>Libur nasional &amp; libur sendiri</span>
            </>
          }
          title="Hari Libur"
          description="Pada tanggal libur (yang aktif), semua queue & follow-up otomatis di-skip. Auto-refresh harian dari sumber publik; tambah, koreksi, atau nonaktifkan sendiri di sini — keputusan manualmu gak akan ketimpa refresh."
        />

        {holidays.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-zinc-300/70 bg-zinc-50/50 px-6 py-12 text-center dark:border-zinc-800 dark:bg-zinc-900/30">
            <CalendarOff className="h-6 w-6 text-zinc-400" />
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Belum ada data libur tahun ini. Klik{" "}
              <span className="font-medium">Refresh sekarang</span> atau tambah
              manual di bawah.
            </p>
            <div className="mt-3 w-full">
              <HolidaysManager holidays={[]} today={today} />
            </div>
          </div>
        ) : (
          <HolidaysManager holidays={holidays} today={today} />
        )}
      </main>
    </>
  );
}
