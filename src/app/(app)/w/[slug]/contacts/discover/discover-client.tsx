"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Download, Zap, Coins, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, FieldLabel } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/dialog";
import type { ApolloCreditStatus } from "@/lib/apollo-credits";
import {
  searchApollo,
  importApollo,
  quickImportApollo,
  syncApolloCredits,
  type DiscoverPerson,
  type ImportResult,
} from "./actions";

function splitTitles(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function DiscoverClient({
  slug,
  presetTitles,
  credit,
  disabled,
}: {
  slug: string;
  presetTitles: string;
  credit: ApolloCreditStatus;
  disabled: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  const [titles, setTitles] = useState(presetTitles);
  const [location, setLocation] = useState("Indonesia");
  const [keywords, setKeywords] = useState("");
  const [quickN, setQuickN] = useState(25);
  const [syncVal, setSyncVal] = useState("");

  const [people, setPeople] = useState<DiscoverPerson[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEntries, setTotalEntries] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searched, setSearched] = useState(false);

  function criteria() {
    return {
      titles: splitTitles(titles),
      locations: location.trim() ? [location.trim()] : undefined,
      keywords: keywords.trim() || undefined,
      perPage: 25,
    };
  }

  function runSearch(toPage: number) {
    startTransition(async () => {
      const res = await searchApollo(slug, criteria(), toPage);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setPeople(res.people ?? []);
      setPage(res.page ?? toPage);
      setTotalPages(res.totalPages ?? 1);
      setTotalEntries(res.totalEntries ?? 0);
      setSelected(new Set());
      setSearched(true);
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function report(res: ImportResult) {
    if (res.error) {
      toast.error(res.error);
      return;
    }
    const parts = [`${res.imported ?? 0} kontak baru masuk`];
    if (res.deduped) parts.push(`${res.deduped} sudah ada (gratis)`);
    if (res.no_email) parts.push(`${res.no_email} tanpa email`);
    parts.push(`${res.credits_used ?? 0} kredit terpakai`);
    toast.success(parts.join(" · "));
    setSelected(new Set());
    router.refresh();
  }

  async function importSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      toast.error("Pilih minimal 1 kontak dulu.");
      return;
    }
    const ok = await confirm({
      title: `Import ${ids.length} kontak?`,
      description: `Reveal email lead baru ≈ ${ids.length} kredit Apollo (yang sudah ada dilewati gratis). Sisa estimasi: ${credit.remainingEst}.`,
      confirmLabel: "Import",
    });
    if (!ok) return;
    startTransition(async () => report(await importApollo(slug, ids)));
  }

  async function runQuick() {
    const n = Math.min(100, Math.max(1, quickN));
    const ok = await confirm({
      title: `Ambil cepat ${n} lead baru?`,
      description: `Sistem cari + reveal ${n} lead baru teratas sesuai kriteria ≈ ${n} kredit. Sisa estimasi: ${credit.remainingEst}.`,
      confirmLabel: "Ambil",
    });
    if (!ok) return;
    startTransition(async () => report(await quickImportApollo(slug, criteria(), n)));
  }

  function doSync() {
    const v = parseInt(syncVal, 10);
    if (!Number.isFinite(v) || v < 0) {
      toast.error("Masukkan angka sisa kredit yang valid.");
      return;
    }
    startTransition(async () => {
      const res = await syncApolloCredits(slug, v);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Sisa kredit diperbarui.");
        setSyncVal("");
        router.refresh();
      }
    });
  }

  const selCount = selected.size;
  const pct = credit.limit > 0 ? (credit.remainingEst / credit.limit) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Credit status */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Kredit Apollo (estimasi)
            </h3>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            reset dalam{" "}
            <strong className="text-zinc-800 dark:text-zinc-200">
              {credit.daysToReset} hari
            </strong>{" "}
            ({credit.nextResetIso})
          </p>
        </div>
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          <strong className="text-lg tabular-nums text-zinc-900 dark:text-zinc-100">
            ≈ {credit.remainingEst.toLocaleString("id-ID")}
          </strong>{" "}
          / {credit.limit.toLocaleString("id-ID")} kredit tersisa bulan ini ·{" "}
          {credit.usedThisCycle.toLocaleString("id-ID")} terpakai
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400"
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <FieldLabel htmlFor="sync">Koreksi sisa kredit (dari portal Apollo)</FieldLabel>
            <Input
              id="sync"
              type="number"
              value={syncVal}
              onChange={(e) => setSyncVal(e.target.value)}
              placeholder="mis. 143"
              className="h-8 w-40"
            />
          </div>
          <Button variant="outline" size="sm" onClick={doSync} disabled={pending}>
            <RefreshCw className="h-3.5 w-3.5" />
            Update
          </Button>
        </div>
      </Card>

      {/* Search form */}
      <Card className="p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="titles">Jabatan target (pisah koma)</FieldLabel>
            <Input
              id="titles"
              value={titles}
              onChange={(e) => setTitles(e.target.value)}
              placeholder="HR Manager, Procurement Manager"
            />
          </div>
          <div>
            <FieldLabel htmlFor="loc">Lokasi</FieldLabel>
            <Input
              id="loc"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Indonesia"
            />
          </div>
          <div>
            <FieldLabel htmlFor="kw">Keyword industri/perusahaan (opsional)</FieldLabel>
            <Input
              id="kw"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="hotel, manufaktur, dll"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => runSearch(1)} disabled={disabled || pending}>
            <Search className="h-4 w-4" />
            Cari (gratis)
          </Button>
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Ambil cepat top
            </span>
            <Input
              type="number"
              value={quickN}
              onChange={(e) => setQuickN(parseInt(e.target.value, 10) || 1)}
              className="h-8 w-20"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={runQuick}
              disabled={disabled || pending}
            >
              Ambil
            </Button>
          </div>
        </div>
      </Card>

      {/* Results */}
      {searched && (
        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {totalEntries.toLocaleString("id-ID")} hasil · halaman {page}/
              {totalPages} · {selCount} dipilih
            </p>
            <Button
              size="sm"
              onClick={importSelected}
              disabled={pending || selCount === 0}
            >
              <Download className="h-3.5 w-3.5" />
              Import {selCount > 0 ? `${selCount} (≈${selCount} kredit)` : ""}
            </Button>
          </div>

          {people.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Tidak ada hasil. Coba ubah kriteria.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {people.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    disabled={p.alreadyImported}
                    onChange={() => toggle(p.id)}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900/40 disabled:opacity-40 dark:border-zinc-700"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {p.first_name ?? "—"} {p.last_name ?? ""}
                      <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
                        {p.title ?? ""}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {p.organization_name ?? "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {!p.has_email && (
                      <Badge variant="outline">email?</Badge>
                    )}
                    {p.alreadyImported && (
                      <Badge variant="secondary">Sudah ada</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Pager */}
          {people.length > 0 && (
            <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => runSearch(page - 1)}
                disabled={pending || page <= 1}
              >
                ← Sebelumnya
              </Button>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => runSearch(page + 1)}
                disabled={pending || page >= totalPages}
              >
                Berikutnya →
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
