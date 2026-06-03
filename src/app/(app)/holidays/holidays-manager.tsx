"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  RefreshCw,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, FieldLabel } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  useConfirm,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast-provider";
import {
  addHoliday,
  editHoliday,
  setHolidayEnabled,
  deleteHoliday,
  refreshHolidaysNow,
  type HolidayActionState,
} from "./actions";

export type Holiday = {
  date: string;
  name: string;
  is_cuti_bersama: boolean;
  is_manual: boolean;
  enabled: boolean;
  source: string;
};

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function HolidaysManager({
  holidays,
  today,
}: {
  holidays: Holiday[];
  today: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Holiday | null>(null);
  const addFormRef = useRef<HTMLFormElement>(null);

  function handleResult(res: HolidayActionState) {
    if (res.error) toast.error(res.error);
    else if (res.message) toast.success(res.message);
    router.refresh();
  }

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const res = await addHoliday(fd);
      handleResult(res);
      if (!res.error) form.reset();
    });
  }

  function onToggle(h: Holiday) {
    startTransition(async () => {
      handleResult(await setHolidayEnabled(h.date, !h.enabled));
    });
  }

  async function onDelete(h: Holiday) {
    const ok = await confirm({
      title: `Hapus libur "${h.name}"?`,
      description: `${formatDate(h.date)}. Tindakan ini tidak bisa dibatalkan.`,
      confirmLabel: "Hapus",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      handleResult(await deleteHoliday(h.date));
    });
  }

  function onRefresh() {
    startTransition(async () => {
      handleResult(await refreshHolidaysNow());
    });
  }

  function onSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    const original = editing.date;
    startTransition(async () => {
      const res = await editHoliday(original, fd);
      handleResult(res);
      if (!res.error) setEditing(null);
    });
  }

  const upcoming = holidays.filter((h) => h.date >= today);
  const past = holidays.filter((h) => h.date < today).reverse();

  return (
    <div className="space-y-6">
      {/* Add + refresh */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <CalendarPlus className="h-4 w-4 text-zinc-500" />
            Tambah libur sendiri
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isPending}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`}
            />
            Refresh sekarang
          </Button>
        </div>
        <form
          ref={addFormRef}
          onSubmit={onAdd}
          className="grid grid-cols-1 gap-3 sm:grid-cols-[170px_1fr_auto] sm:items-end"
        >
          <div>
            <FieldLabel htmlFor="add-date">Tanggal</FieldLabel>
            <Input id="add-date" type="date" name="date" required />
          </div>
          <div>
            <FieldLabel htmlFor="add-name">Nama libur</FieldLabel>
            <Input
              id="add-name"
              name="name"
              placeholder="Cuti kantor / Libur pribadi"
              required
            />
          </div>
          <Button type="submit" disabled={isPending}>
            Tambah
          </Button>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 sm:col-span-3 dark:text-zinc-400">
            <input
              type="checkbox"
              name="is_cuti_bersama"
              className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900/40 dark:border-zinc-700"
            />
            Tandai sebagai cuti bersama
          </label>
        </form>
      </Card>

      {/* Upcoming */}
      <section>
        <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Akan datang ({upcoming.length})
        </h3>
        {upcoming.length === 0 ? (
          <p className="px-1 text-sm text-zinc-500 dark:text-zinc-400">
            Tidak ada libur ke depan untuk sisa tahun ini.
          </p>
        ) : (
          <Card className="divide-y divide-zinc-100 p-0 dark:divide-zinc-800">
            {upcoming.map((h) => (
              <HolidayRow
                key={h.date}
                h={h}
                isPending={isPending}
                onToggle={onToggle}
                onEdit={setEditing}
                onDelete={onDelete}
              />
            ))}
          </Card>
        )}
      </section>

      {/* Past (this year) */}
      {past.length > 0 && (
        <section>
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Sudah lewat tahun ini ({past.length})
          </h3>
          <Card className="divide-y divide-zinc-100 p-0 opacity-80 dark:divide-zinc-800">
            {past.map((h) => (
              <HolidayRow
                key={h.date}
                h={h}
                isPending={isPending}
                onToggle={onToggle}
                onEdit={setEditing}
                onDelete={onDelete}
              />
            ))}
          </Card>
        </section>
      )}

      {/* Edit dialog */}
      <Dialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
      >
        {editing && (
          <DialogContent size="sm">
            <DialogHeader
              title="Edit libur"
              description="Koreksi tanggal atau nama. Setelah disimpan, refresh harian tidak akan menimpanya."
            />
            <form onSubmit={onSaveEdit}>
              <DialogBody>
                <div className="space-y-3">
                  <div>
                    <FieldLabel htmlFor="edit-date">Tanggal</FieldLabel>
                    <Input
                      id="edit-date"
                      type="date"
                      name="date"
                      defaultValue={editing.date}
                      required
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="edit-name">Nama libur</FieldLabel>
                    <Input
                      id="edit-name"
                      name="name"
                      defaultValue={editing.name}
                      required
                    />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <input
                      type="checkbox"
                      name="is_cuti_bersama"
                      defaultChecked={editing.is_cuti_bersama}
                      className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900/40 dark:border-zinc-700"
                    />
                    Cuti bersama
                  </label>
                </div>
              </DialogBody>
              <DialogFooter>
                <Button type="submit" size="sm" disabled={isPending}>
                  Simpan
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(null)}
                >
                  Batal
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function HolidayRow({
  h,
  isPending,
  onToggle,
  onEdit,
  onDelete,
}: {
  h: Holiday;
  isPending: boolean;
  onToggle: (h: Holiday) => void;
  onEdit: (h: Holiday) => void;
  onDelete: (h: Holiday) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${
            h.enabled
              ? "text-zinc-900 dark:text-zinc-100"
              : "text-zinc-400 line-through dark:text-zinc-600"
          }`}
        >
          {h.name}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
            {formatDate(h.date)}
          </span>
          <Badge variant={h.is_manual ? "info" : "secondary"}>
            {h.is_manual ? "Manual" : "Nasional"}
          </Badge>
          {h.is_cuti_bersama && <Badge variant="warning">Cuti bersama</Badge>}
          {!h.enabled && <Badge variant="outline">Nonaktif</Badge>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title={h.enabled ? "Nonaktifkan (tetap kirim hari ini)" : "Aktifkan"}
          onClick={() => onToggle(h)}
          disabled={isPending}
        >
          {h.enabled ? (
            <Eye className="h-4 w-4" />
          ) : (
            <EyeOff className="h-4 w-4 text-zinc-400" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Edit"
          onClick={() => onEdit(h)}
          disabled={isPending}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Hapus"
          onClick={() => onDelete(h)}
          disabled={isPending}
        >
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </div>
    </div>
  );
}
