"use client";

import { useState, useTransition } from "react";
import { Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setContactDeal } from "../actions";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

/** Record the value of a closed deal — feeds the dashboard's revenue view. */
export function DealPanel({
  slug,
  contactId,
  initialValue,
  closedAt,
}: {
  slug: string;
  contactId: string;
  initialValue: number | null;
  closedAt: string | null;
}) {
  const [value, setValue] = useState(initialValue ? String(initialValue) : "");
  const [pending, startTransition] = useTransition();

  function save(next: number | null) {
    startTransition(async () => {
      const res = await setContactDeal(contactId, slug, next);
      if (!res.ok) toast.error("Gagal menyimpan deal", { description: res.error });
      else toast.success(next === null ? "Deal dihapus" : "Deal tercatat");
      if (next === null) setValue("");
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border/80 px-5 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-success-soft text-success">
          <Trophy className="h-3.5 w-3.5" />
        </div>
        <h3 className="text-sm font-semibold text-ink">Deal</h3>
        {initialValue && closedAt && (
          <span className="text-xs text-muted">
            {rupiah(initialValue)} · {new Date(closedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        )}
      </div>
      <form
        className="flex flex-wrap items-center gap-2 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(value.replace(/[^\d]/g, ""));
          save(n > 0 ? n : null);
        }}
      >
        <Input
          inputMode="numeric"
          placeholder="Nilai deal, mis. 5000000"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="max-w-56"
          aria-label="Nilai deal dalam rupiah"
        />
        <Button type="submit" size="sm" disabled={pending || !value.trim()}>
          {initialValue ? "Perbarui" : "Catat deal"}
        </Button>
        {initialValue && (
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => save(null)}>
            Hapus
          </Button>
        )}
        <p className="w-full text-xs text-muted">
          Mencatat deal otomatis memindahkan kontak ke tahap menang di pipeline.
        </p>
      </form>
    </div>
  );
}
