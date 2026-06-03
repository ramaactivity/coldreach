"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/supabase/session-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshHolidays } from "@/lib/holidays-refresh";

export type HolidayActionState = { error?: string; message?: string };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid");
const holidayName = z
  .string()
  .trim()
  .min(2, "Nama libur minimal 2 karakter")
  .max(120, "Nama libur terlalu panjang");

function revalidate() {
  // Holiday data is global — refresh the manager + the aggregate dashboard
  // banner. Per-workspace dashboards render dynamically and pick it up on
  // next navigation.
  revalidatePath("/holidays");
  revalidatePath("/dashboard");
}

/** Add a manual holiday / day-off. Marked is_manual so refresh won't drop it. */
export async function addHoliday(
  formData: FormData,
): Promise<HolidayActionState> {
  await requireCurrentUser();

  const parsed = z
    .object({
      date: isoDate,
      name: holidayName,
      is_cuti_bersama: z.coerce.boolean().optional(),
    })
    .safeParse({
      date: formData.get("date"),
      name: formData.get("name"),
      is_cuti_bersama: formData.get("is_cuti_bersama") === "on",
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("id_holidays").upsert(
    {
      date: parsed.data.date,
      name: parsed.data.name,
      is_cuti_bersama: !!parsed.data.is_cuti_bersama,
      source: "manual",
      is_manual: true,
      enabled: true,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "date" },
  );
  if (error) return { error: error.message };

  revalidate();
  return { message: `Libur "${parsed.data.name}" ditambahkan.` };
}

/**
 * Edit a holiday. `date` is the PK, so a date change = write the new row +
 * delete the old one. Always flips is_manual so the daily refresh leaves it.
 */
export async function editHoliday(
  originalDate: string,
  formData: FormData,
): Promise<HolidayActionState> {
  await requireCurrentUser();

  const parsed = z
    .object({
      originalDate: isoDate,
      date: isoDate,
      name: holidayName,
      is_cuti_bersama: z.coerce.boolean().optional(),
    })
    .safeParse({
      originalDate,
      date: formData.get("date"),
      name: formData.get("name"),
      is_cuti_bersama: formData.get("is_cuti_bersama") === "on",
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  }

  const admin = createAdminClient();
  const { error: upsertErr } = await admin.from("id_holidays").upsert(
    {
      date: parsed.data.date,
      name: parsed.data.name,
      is_cuti_bersama: !!parsed.data.is_cuti_bersama,
      source: "manual",
      is_manual: true,
      enabled: true,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "date" },
  );
  if (upsertErr) return { error: upsertErr.message };

  if (parsed.data.originalDate !== parsed.data.date) {
    const { error: delErr } = await admin
      .from("id_holidays")
      .delete()
      .eq("date", parsed.data.originalDate);
    if (delErr) return { error: delErr.message };
  }

  revalidate();
  return { message: "Libur diperbarui." };
}

/**
 * Enable / disable a holiday. Disabling sets is_manual so the refresh can't
 * re-enable it; cron senders will run on a disabled day.
 */
export async function setHolidayEnabled(
  date: string,
  enabled: boolean,
): Promise<HolidayActionState> {
  await requireCurrentUser();
  if (!isoDate.safeParse(date).success) return { error: "Tanggal tidak valid" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("id_holidays")
    .update({ enabled, is_manual: true })
    .eq("date", date);
  if (error) return { error: error.message };

  revalidate();
  return { message: enabled ? "Libur diaktifkan." : "Libur dinonaktifkan." };
}

/** Permanently delete a holiday row. */
export async function deleteHoliday(
  date: string,
): Promise<HolidayActionState> {
  await requireCurrentUser();
  if (!isoDate.safeParse(date).success) return { error: "Tanggal tidak valid" };

  const admin = createAdminClient();
  const { error } = await admin.from("id_holidays").delete().eq("date", date);
  if (error) return { error: error.message };

  revalidate();
  return { message: "Libur dihapus." };
}

/** Pull the latest holidays from the public APIs now (manual trigger). */
export async function refreshHolidaysNow(): Promise<HolidayActionState> {
  await requireCurrentUser();
  const admin = createAdminClient();
  const result = await refreshHolidays(admin);
  revalidate();
  if (!result.ok && result.total_upserted === 0) {
    return {
      error:
        "Refresh selesai tapi sumber API tidak mengembalikan data baru. Data manualmu tetap aman.",
    };
  }
  return {
    message: `Refresh selesai · ${result.total_upserted} libur diperbarui · ${result.protected_dates} data manual dipertahankan.`,
  };
}
