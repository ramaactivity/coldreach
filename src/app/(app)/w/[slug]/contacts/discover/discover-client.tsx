"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Download,
  Zap,
  Coins,
  RefreshCw,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, FieldLabel } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectItem } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/dialog";
import { TagInput } from "./tag-input";
import { Toggle, CheckBox } from "./toggle";
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

function splitList(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

// City names → "City, Indonesia" so Apollo never matches a same-named city
// abroad. Drops a bare "indonesia" token and won't double-append.
function buildLocations(cities: string[]): string[] {
  const out = cities
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.toLowerCase() !== "indonesia")
    .map((t) => (/indonesia/i.test(t) ? t : `${t}, Indonesia`));
  return Array.from(new Set(out));
}

const idr = (n: number) => n.toLocaleString("id-ID");

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

  const [titles, setTitles] = useState<string[]>(splitList(presetTitles));
  const [location, setLocation] = useState<string[]>(splitList(presetLocations));
  const [keywords, setKeywords] = useState<string[]>([]);
  const [netNewOnly, setNetNewOnly] = useState(true);
  const [quickN, setQuickN] = useState(25);
  const [selectN, setSelectN] = useState(50);
  const [syncVal, setSyncVal] = useState("");

  // Result view controls.
  const [hideExisting, setHideExisting] = useState(true); // default ON
  const [onlyEmail, setOnlyEmail] = useState(false);
  const [sortBy, setSortBy] = useState<
    "email" | "name_asc" | "name_desc" | "company_asc"
  >("email");

  const [personaList, setPersonaList] = useState<ApolloPersona[]>(personas);
  const [activePersona, setActivePersona] = useState("");

  const [people, setPeople] = useState<DiscoverPerson[]>([]); // accumulated
  const [totalEntries, setTotalEntries] = useState(0);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [counts, setCounts] = useState<{
    total: number;
    netNew: number;
    saved: number;
  } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searched, setSearched] = useState(false);
  const [importing, setImporting] = useState(false);

  function criteria() {
    return {
      titles,
      locations: buildLocations(location),
      keywords: keywords.join(" ") || undefined,
      netNewOnly,
      perPage: 50,
    };
  }

  // --- Personas ---
  function loadPersona(id: string) {
    setActivePersona(id);
    const p = personaList.find((x) => x.id === id);
    if (!p) return;
    setTitles(splitList(p.titles));
    setLocation(splitList(p.locations));
    setKeywords(p.keywords ? splitList(p.keywords) : []);
    setNetNewOnly(p.netNewOnly);
  }
  function savePersona() {
    const name = window.prompt("Nama persona (mis. Catering Corporate Bogor):");
    if (!name?.trim()) return;
    startTransition(async () => {
      const res = await saveApolloPersona(slug, {
        name: name.trim(),
        titles: titles.join(", "),
        locations: location.join(", "),
        keywords: keywords.join(", "),
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

  // --- View derivation ---
  const displayedPeople = useMemo(() => {
    let list = [...people];
    if (hideExisting) list = list.filter((p) => !p.alreadyImported);
    if (onlyEmail) list = list.filter((p) => p.has_email);
    const cmp: Record<string, (a: DiscoverPerson, b: DiscoverPerson) => number> = {
      email: (a, b) => Number(b.has_email) - Number(a.has_email),
      name_asc: (a, b) => (a.first_name ?? "").localeCompare(b.first_name ?? ""),
      name_desc: (a, b) => (b.first_name ?? "").localeCompare(a.first_name ?? ""),
      company_asc: (a, b) =>
        (a.organization_name ?? "").localeCompare(b.organization_name ?? ""),
    };
    return list.sort(cmp[sortBy] ?? cmp.email);
  }, [people, hideExisting, onlyEmail, sortBy]);

  function selectable() {
    return displayedPeople.filter((p) => !p.alreadyImported);
  }
  function selectTopN(n: number) {
    setSelected(new Set(selectable().slice(0, n).map((p) => p.id)));
  }
  function selectAll() {
    setSelected(new Set(selectable().map((p) => p.id)));
  }
  function clearSelection() {
    setSelected(new Set());
  }
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // --- Search / import ---
  // Fresh search (reset) replaces; "Muat lebih" appends the next Apollo page,
  // so filter/sort below span everything loaded, not a single page.
  function runSearch() {
    startTransition(async () => {
      const res = await searchApollo(slug, criteria(), 1, true);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setPeople(res.people ?? []);
      setTotalEntries(res.totalEntries ?? 0);
      setNextPage(res.nextPage ?? null);
      setCounts(res.counts ?? null);
      setSelected(new Set());
      setSearched(true);
    });
  }
  function loadMore() {
    if (!nextPage) return;
    startTransition(async () => {
      const res = await searchApollo(slug, criteria(), nextPage, false);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setPeople((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...(res.people ?? []).filter((p) => !seen.has(p.id))];
      });
      setNextPage(res.nextPage ?? null);
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
      description: `Reveal email lead baru sekitar ${ids.length} kredit Apollo (yang sudah ada dilewati gratis). Sisa estimasi: ${credit.remainingEst}.`,
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
    const n = Math.max(1, quickN);
    const ok = await confirm({
      title: `Ambil cepat ${n} lead baru?`,
      description: `Sistem cari lalu reveal ${n} lead baru teratas sesuai kriteria, sekitar ${n} kredit. Sisa estimasi: ${credit.remainingEst}.`,
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
  const existingLoaded = people.filter((p) => p.alreadyImported).length;

  return (
    <div className="space-y-5">
      {/* ── Credit meter ─────────────────────────────────────────── */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 pt-4">
          <div className="flex items-baseline gap-2.5">
            <Coins className="h-4 w-4 translate-y-0.5 text-amber-500" />
            <span className="text-2xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
              ≈{idr(credit.remainingEst)}
            </span>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              dari {idr(credit.limit)} kredit Apollo tersisa
            </span>
          </div>
          <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">
            <span className="tabular-nums">{idr(credit.usedThisCycle)}</span>{" "}
            terpakai · reset{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {credit.daysToReset} hari
            </span>
          </div>
        </div>
        <div className="mt-3 h-1.5 bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full bg-amber-400 transition-[width] duration-500"
            style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 text-[11px] text-zinc-400 dark:text-zinc-500">
          <span className="leading-relaxed">
            Estimasi dari pemakaian via ColdReach (Apollo tidak membuka saldo
            lewat API).
          </span>
          <a
            href="https://developer.apollo.io/keys#/usage"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            cek aktual <ExternalLink className="h-3 w-3" />
          </a>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <Input
              type="number"
              value={syncVal}
              onChange={(e) => setSyncVal(e.target.value)}
              placeholder="koreksi sisa"
              className="h-7 w-28 text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={doSync}
              disabled={pending}
            >
              <RefreshCw className="h-3 w-3" />
              Sinkron
            </Button>
          </span>
        </div>
      </Card>

      {/* ── Search builder ───────────────────────────────────────── */}
      <Card className="p-5">
        {/* Persona row */}
        <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-zinc-100 pb-4 dark:border-zinc-800">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Persona
          </span>
          <div className="w-56">
            <Select
              value={activePersona}
              onValueChange={loadPersona}
              placeholder="Preset tersimpan…"
            >
              {personaList.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={savePersona} disabled={pending}>
            Simpan kriteria ini
          </Button>
          {activePersona && (
            <Button
              variant="ghost"
              size="sm"
              onClick={removePersona}
              disabled={pending}
            >
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </Button>
          )}
        </div>

        <div className="space-y-3.5">
          <div>
            <FieldLabel>
              Jabatan target{" "}
              <span className="font-normal text-zinc-400">
                (Enter atau koma untuk menambah)
              </span>
            </FieldLabel>
            <TagInput
              value={titles}
              onChange={setTitles}
              placeholder="HR Manager, Procurement Manager…"
            />
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <FieldLabel>
                Lokasi{" "}
                <span className="font-normal text-zinc-400">
                  (kota saja, negara otomatis Indonesia)
                </span>
              </FieldLabel>
              <TagInput
                value={location}
                onChange={setLocation}
                placeholder="Bogor, Jakarta, Bekasi…"
              />
            </div>
            <div>
              <FieldLabel>
                Keyword industri{" "}
                <span className="font-normal text-zinc-400">(opsional)</span>
              </FieldLabel>
              <TagInput
                value={keywords}
                onChange={setKeywords}
                placeholder="hotel, manufaktur…"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <Toggle checked={netNewOnly} onChange={setNetNewOnly}>
            Hanya <strong className="font-semibold">Net New</strong> (lewati yang
            sudah disimpan di Apollo, hemat kredit)
          </Toggle>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runSearch} disabled={disabled || pending}>
              <Search className="h-4 w-4" />
              Cari (gratis)
            </Button>
            <div className="flex items-center gap-2 rounded-xl border border-zinc-200 px-2.5 py-1.5 dark:border-zinc-800">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Ambil top
              </span>
              <Input
                type="number"
                value={quickN}
                onChange={(e) => setQuickN(parseInt(e.target.value, 10) || 1)}
                className="h-7 w-16 text-xs"
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
                className="text-[11px] font-medium text-amber-600 hover:underline dark:text-amber-400"
              >
                semua ({credit.remainingEst})
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Results ──────────────────────────────────────────────── */}
      {searched && (
        <Card className="overflow-hidden p-0">
          {/* Stats strip */}
          {counts && (
            <div className="grid grid-cols-2 divide-x divide-zinc-100 border-b border-zinc-100 sm:grid-cols-4 dark:divide-zinc-800 dark:border-zinc-800">
              <Stat label="Total" value={counts.total} />
              <Stat label="Net New" value={counts.netNew} accent="emerald" />
              <Stat label="Saved (Apollo)" value={counts.saved} />
              <Stat
                label="Di ColdReach (dimuat)"
                value={existingLoaded}
                muted
              />
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
            <div className="flex flex-wrap items-center gap-4">
              <Toggle checked={hideExisting} onChange={setHideExisting}>
                Sembunyikan yang sudah di ColdReach
              </Toggle>
              <Toggle checked={onlyEmail} onChange={setOnlyEmail}>
                Hanya yang punya email
              </Toggle>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Urutkan
                </span>
                <div className="w-40">
                  <Select
                    value={sortBy}
                    onValueChange={(v) => setSortBy(v as typeof sortBy)}
                  >
                    <SelectItem value="email">Punya email dulu</SelectItem>
                    <SelectItem value="name_asc">Nama A–Z</SelectItem>
                    <SelectItem value="name_desc">Nama Z–A</SelectItem>
                    <SelectItem value="company_asc">Perusahaan A–Z</SelectItem>
                  </Select>
                </div>
              </div>
            </div>
            <Button
              onClick={importSelected}
              disabled={pending || selCount === 0}
              size="sm"
            >
              <Download className="h-3.5 w-3.5" />
              Import {selCount > 0 ? `${selCount} (≈${selCount} kredit)` : ""}
            </Button>
          </div>

          {/* Quick select */}
          <div className="flex flex-wrap items-center gap-1.5 px-5 py-2.5 text-xs">
            <span className="text-zinc-500 dark:text-zinc-400">Pilih:</span>
            {[10, 25].map((n) => (
              <Chip key={n} onClick={() => selectTopN(n)}>
                {n} teratas
              </Chip>
            ))}
            <span className="inline-flex items-center overflow-hidden rounded-full border border-zinc-200 dark:border-zinc-700">
              <input
                type="number"
                value={selectN}
                onChange={(e) =>
                  setSelectN(Math.max(1, parseInt(e.target.value, 10) || 1))
                }
                className="w-12 bg-transparent px-2 py-0.5 text-zinc-700 outline-none dark:text-zinc-300"
              />
              <button
                type="button"
                onClick={() => selectTopN(selectN)}
                className="bg-zinc-900 px-2.5 py-0.5 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                pilih
              </button>
            </span>
            <Chip onClick={selectAll}>Semua ({selectable().length})</Chip>
            {selCount > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="px-2 font-medium text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
              >
                Hapus pilihan
              </button>
            )}
            <span className="ml-auto text-zinc-400 dark:text-zinc-500">
              {idr(displayedPeople.length)} tampil / {idr(people.length)} dimuat
              dari {idr(totalEntries)} ·{" "}
              <span className="text-emerald-600 dark:text-emerald-400">✓</span>{" "}
              punya email ·{" "}
              <span className="text-amber-600 dark:text-amber-400">?</span> belum
              tentu
            </span>
          </div>

          {/* List */}
          {displayedPeople.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {people.length === 0
                ? "Belum ada hasil. Atur kriteria lalu klik Cari."
                : "Tidak ada yang cocok filter saat ini. Longgarkan filter, atau klik Muat lebih banyak untuk memindai halaman berikutnya."}
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {displayedPeople.map((p) => {
                const checked = selected.has(p.id);
                return (
                  <li
                    key={p.id}
                    onClick={() => !p.alreadyImported && toggle(p.id)}
                    className={`flex cursor-pointer items-center gap-3 px-5 py-2.5 transition-colors ${
                      checked
                        ? "bg-zinc-50 dark:bg-zinc-800/40"
                        : "hover:bg-zinc-50/60 dark:hover:bg-zinc-800/20"
                    }`}
                  >
                    <CheckBox
                      checked={checked}
                      disabled={p.alreadyImported}
                      onChange={() => toggle(p.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-zinc-900 dark:text-zinc-100">
                        <span className="font-medium">
                          {p.first_name ?? "—"} {p.last_name ?? ""}
                        </span>
                        {p.title && (
                          <span className="ml-2 text-zinc-500 dark:text-zinc-400">
                            {p.title}
                          </span>
                        )}
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
                );
              })}
            </ul>
          )}

          {/* Load more */}
          {people.length > 0 && (
            <div className="flex items-center justify-center border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">
              {nextPage ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMore}
                  disabled={pending}
                >
                  {pending ? (
                    <Spinner />
                  ) : (
                    <>Muat lebih banyak (akumulasi)</>
                  )}
                </Button>
              ) : (
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  Semua hasil sudah dimuat.
                </span>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Import progress overlay */}
      {importing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="flex max-w-sm items-center gap-4 rounded-2xl border border-zinc-200 bg-white px-6 py-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <Spinner />
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Mengimpor kontak…
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                Reveal email lewat Apollo lalu simpan ke Contacts. Jangan tutup
                halaman ini.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: number;
  accent?: "emerald";
  muted?: boolean;
}) {
  return (
    <div className="px-5 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums tracking-tight ${
          accent === "emerald"
            ? "text-emerald-600 dark:text-emerald-400"
            : muted
              ? "text-zinc-400 dark:text-zinc-500"
              : "text-zinc-900 dark:text-zinc-100"
        }`}
      >
        {value.toLocaleString("id-ID")}
      </p>
    </div>
  );
}

function Chip({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-zinc-200 px-2.5 py-0.5 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}
