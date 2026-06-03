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
import { Spinner } from "@/components/ui/spinner";
import type { ApolloCreditStatus } from "@/lib/apollo-credits";
import {
  searchApollo,
  importApollo,
  quickImportApollo,
  syncApolloCredits,
  saveApolloPersona,
  deleteApolloPersona,
  type DiscoverPerson,
  type ImportResult,
  type ApolloPersona,
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
  presetLocations,
  credit,
  personas,
  disabled,
}: {
  slug: string;
  presetTitles: string;
  presetLocations: string;
  credit: ApolloCreditStatus;
  personas: ApolloPersona[];
  disabled: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  const [titles, setTitles] = useState(presetTitles);
  const [location, setLocation] = useState(presetLocations);
  const [keywords, setKeywords] = useState("");
  const [netNewOnly, setNetNewOnly] = useState(true);
  const [quickN, setQuickN] = useState(25);
  const [selectN, setSelectN] = useState(50);
  const [syncVal, setSyncVal] = useState("");

  const [personaList, setPersonaList] = useState<ApolloPersona[]>(personas);
  const [activePersona, setActivePersona] = useState("");

  const [people, setPeople] = useState<DiscoverPerson[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEntries, setTotalEntries] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searched, setSearched] = useState(false);
  const [importing, setImporting] = useState(false);

  function criteria() {
    return {
      titles: splitTitles(titles),
      locations: splitTitles(location), // comma/newline separated
      keywords: keywords.trim() || undefined,
      netNewOnly,
      perPage: 50,
    };
  }

  function loadPersona(id: string) {
    setActivePersona(id);
    const p = personaList.find((x) => x.id === id);
    if (!p) return;
    setTitles(p.titles);
    setLocation(p.locations);
    setKeywords(p.keywords);
    setNetNewOnly(p.netNewOnly);
  }

  async function savePersona() {
    const name = window.prompt("Nama persona (mis. Catering Corporate Bogor):");
    if (!name?.trim()) return;
    startTransition(async () => {
      const res = await saveApolloPersona(slug, {
        name: name.trim(),
        titles,
        locations: location,
        keywords,
        netNewOnly,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success(`Persona "${name.trim()}" disimpan.`);
        if (res.personas) setPersonaList(res.personas);
      }
    });
  }

  async function removePersona() {
    if (!activePersona) return;
    const p = personaList.find((x) => x.id === activePersona);
    const ok = await confirm({
      title: `Hapus persona "${p?.name ?? ""}"?`,
      confirmLabel: "Hapus",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteApolloPersona(slug, activePersona);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Persona dihapus.");
        setPersonaList(res.personas ?? []);
        setActivePersona("");
      }
    });
  }

  // Candidates on the current page that can still be imported.
  function selectable() {
    return people.filter((p) => !p.alreadyImported);
  }
  // Quick-select the first N selectable (prefer ones Apollo has an email for).
  function selectTopN(n: number) {
    const pool = [...selectable()].sort(
      (a, b) => Number(b.has_email) - Number(a.has_email),
    );
    setSelected(new Set(pool.slice(0, n).map((p) => p.id)));
  }
  function selectAllOnPage() {
    setSelected(new Set(selectable().map((p) => p.id)));
  }
  function clearSelection() {
    setSelected(new Set());
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
    setImporting(true);
    startTransition(async () => {
      try {
        report(await importApollo(slug, ids));
      } finally {
        setImporting(false);
      }
    });
  }

  async function runQuick() {
    const n = Math.min(100, Math.max(1, quickN));
    const ok = await confirm({
      title: `Ambil cepat ${n} lead baru?`,
      description: `Sistem cari + reveal ${n} lead baru teratas sesuai kriteria ≈ ${n} kredit. Sisa estimasi: ${credit.remainingEst}.`,
      confirmLabel: "Ambil",
    });
    if (!ok) return;
    setImporting(true);
    startTransition(async () => {
      try {
        report(await quickImportApollo(slug, criteria(), n));
      } finally {
        setImporting(false);
      }
    });
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
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
          Estimasi dari pemakaian via ColdReach — Apollo tidak membuka saldo
          kredit lewat API. Angka aktual:{" "}
          <a
            href="https://developer.apollo.io/keys#/usage"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            portal Apollo → Usage
          </a>
          , lalu tempel di kolom di atas untuk sinkron.
        </p>
      </Card>

      {/* Search form */}
      <Card className="p-5">
        {/* Persona presets */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Persona:
          </span>
          <select
            value={activePersona}
            onChange={(e) => loadPersona(e.target.value)}
            className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <option value="">— pilih persona tersimpan —</option>
            {personaList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={savePersona}
            disabled={pending}
            className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            + Simpan persona
          </button>
          {activePersona && (
            <button
              type="button"
              onClick={removePersona}
              disabled={pending}
              className="rounded-full px-2 py-1 text-xs font-medium text-red-500 hover:underline"
            >
              Hapus
            </button>
          )}
        </div>

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
            <FieldLabel htmlFor="loc">Lokasi (pisah koma)</FieldLabel>
            <Input
              id="loc"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Bogor, Jakarta, Depok, Tangerang, Bekasi"
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

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={netNewOnly}
            onChange={(e) => setNetNewOnly(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900/40 dark:border-zinc-700"
          />
          Hanya <strong>Net New</strong> — lewati kontak yang sudah kamu simpan
          di Apollo (kemungkinan sudah di ColdReach). Hemat kredit.
        </label>

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
            <button
              type="button"
              onClick={() => setQuickN(Math.max(1, credit.remainingEst))}
              className="text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
              title="Set jumlah = sisa kredit estimasi"
            >
              pakai semua sisa kredit (≈{credit.remainingEst})
            </button>
          </div>
        </div>
      </Card>

      {/* Results */}
      {searched && (
        <Card className="p-0">
          <div className="space-y-2.5 border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {totalEntries.toLocaleString("id-ID")} hasil · halaman {page}/
                {totalPages} ·{" "}
                <strong className="text-zinc-900 dark:text-zinc-100">
                  {selCount} dipilih
                </strong>
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
            {/* Quick-select — no more one-by-one ticking */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">
                Pilih cepat:
              </span>
              {[10, 25].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => selectTopN(n)}
                  className="rounded-full border border-zinc-200 px-2.5 py-0.5 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {n} teratas
                </button>
              ))}
              {/* arbitrary N */}
              <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 py-0.5 pl-2.5 pr-1 dark:border-zinc-700">
                <input
                  type="number"
                  value={selectN}
                  onChange={(e) =>
                    setSelectN(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                  className="w-12 bg-transparent text-zinc-700 outline-none dark:text-zinc-300"
                />
                <button
                  type="button"
                  onClick={() => selectTopN(selectN)}
                  className="rounded-full bg-zinc-900 px-2 py-0.5 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                >
                  pilih
                </button>
              </span>
              <button
                type="button"
                onClick={selectAllOnPage}
                className="rounded-full border border-zinc-200 px-2.5 py-0.5 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Semua di halaman ({selectable().length})
              </button>
              {selCount > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-full px-2.5 py-0.5 font-medium text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
                >
                  Hapus pilihan
                </button>
              )}
              <span className="ml-auto text-zinc-400 dark:text-zinc-500">
                <span className="text-emerald-600 dark:text-emerald-400">
                  ✓ Email
                </span>{" "}
                = Apollo punya email · <span className="text-amber-600 dark:text-amber-400">Email?</span> = belum tentu (reveal bisa gagal, tetap kena kredit)
              </span>
            </div>
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
                    {p.has_email ? (
                      <Badge variant="success">✓ Email</Badge>
                    ) : (
                      <Badge variant="warning">Email?</Badge>
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

      {/* Import progress — blocking overlay so it's obvious something runs */}
      {importing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="flex max-w-sm items-center gap-4 rounded-2xl border border-zinc-200 bg-white px-6 py-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <Spinner />
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Mengimpor kontak…
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                Reveal email lewat Apollo (≈1 kredit/lead) lalu simpan ke
                Contacts. Jangan tutup halaman ini.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
