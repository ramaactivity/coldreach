"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Download,
  Globe,
  Mail,
  Phone,
  Link2,
  Copy,
  AlertTriangle,
  Check,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast-provider";
import {
  scrapeWebsite,
  importScraped,
  type ScrapeState,
} from "./scrape-actions";

const GENERIC = /^(info|sales|hello|contact|admin|support|cs|marketing|halo|kontak)@/i;

const SOCIAL_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  twitter: "Twitter/X",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
};

function socialEntries(socials: Record<string, string | undefined>) {
  return Object.entries(socials).filter(([, v]) => Boolean(v)) as [string, string][];
}

export function ScrapeClient({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ScrapeState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const importable = useMemo(
    () => (result?.contacts ?? []).filter((c) => c.importable && c.email),
    [result],
  );
  const infoOnly = useMemo(
    () => (result?.contacts ?? []).filter((c) => !c.importable),
    [result],
  );

  function runScrape() {
    if (!url.trim()) {
      toast.error("Masukkan URL website dulu.");
      return;
    }
    startTransition(async () => {
      const res = await scrapeWebsite(slug, url.trim());
      setResult(res);
      if (res.error && !res.contacts?.length) {
        toast.error(res.error);
        setSelected(new Set());
        return;
      }
      // Default-select all importable rows that aren't already imported.
      const next = new Set<string>(
        (res.contacts ?? [])
          .filter((c) => c.importable && c.email && !c.alreadyImported)
          .map((c) => c.email as string),
      );
      setSelected(next);
    });
  }

  function toggle(email: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }
  function selectAll() {
    setSelected(
      new Set(
        importable
          .filter((c) => !c.alreadyImported)
          .map((c) => c.email as string),
      ),
    );
  }
  function clearSelection() {
    setSelected(new Set());
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Gagal menyalin.");
    }
  }

  function doImport() {
    const picked = importable.filter((c) => selected.has(c.email as string));
    if (picked.length === 0) {
      toast.error("Pilih minimal 1 kontak.");
      return;
    }
    setImporting(true);
    startTransition(async () => {
      try {
        const res = await importScraped(slug, picked);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        const parts = [`${res.imported ?? 0} kontak baru masuk`];
        if (res.deduped) parts.push(`${res.deduped} sudah ada`);
        if (res.skipped_no_email) parts.push(`${res.skipped_no_email} tanpa email dilewati`);
        toast.success(parts.join(" · "));
        setSelected(new Set());
        router.refresh();
      } finally {
        setImporting(false);
      }
    });
  }

  const selCount = selected.size;

  return (
    <div className="space-y-5">
      {/* ── URL input ─────────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-ink">
              URL website
            </label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !pending && runScrape()}
              placeholder="contoh.co.id atau https://contoh.co.id/kontak"
              autoFocus
            />
          </div>
          <Button onClick={runScrape} disabled={pending}>
            {pending ? <Spinner /> : <Search className="h-4 w-4" />}
            Scrape
          </Button>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-faint">
          Mengambil halaman publik (homepage + kontak/about, maks. 5 halaman) dan
          menghormati robots.txt. Pastikan kamu punya dasar yang sah untuk
          menghubungi kontak yang ditemukan.
        </p>
      </Card>

      {/* ── Loading ───────────────────────────────────────────────── */}
      {pending && !result && (
        <Card className="flex items-center gap-3 p-5 text-sm text-muted">
          <Spinner />
          Mengambil dan memindai halaman…
        </Card>
      )}

      {/* ── Blocked / error (non-fatal) ───────────────────────────── */}
      {result?.blocked && (
        <Card className="flex items-start gap-3 border-warning-soft bg-warning-soft/40 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" />
          <p className="text-sm text-warning-text">{result.error}</p>
        </Card>
      )}

      {/* ── Results ───────────────────────────────────────────────── */}
      {result && !result.blocked && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
            <Globe className="h-3.5 w-3.5" />
            <span className="text-muted">{result.url}</span>
            <span>· {result.fetchedPages?.length ?? 0} halaman dipindai</span>
            {result.rendered && <Badge variant="info">JS render</Badge>}
          </div>

          {/* Importable contacts */}
          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-success-text" />
                <span className="font-medium text-ink">
                  {importable.length} email ditemukan
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={selectAll}
                  className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-sunken"
                >
                  Pilih semua
                </button>
                {selCount > 0 && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="px-2 text-xs font-medium text-muted underline-offset-2 hover:underline"
                  >
                    Hapus pilihan
                  </button>
                )}
                <Button
                  onClick={doImport}
                  disabled={pending || selCount === 0}
                  size="sm"
                >
                  <Download className="h-3.5 w-3.5" />
                  Import {selCount > 0 ? selCount : ""}
                </Button>
              </div>
            </div>

            {importable.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted">
                Tidak ada email yang ditemukan di situs ini.
                {infoOnly.length > 0 && " Lihat info kontak di bawah."}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {importable.map((c) => {
                  const email = c.email as string;
                  const checked = selected.has(email);
                  const disabled = c.alreadyImported;
                  return (
                    <li
                      key={email}
                      onClick={() => !disabled && toggle(email)}
                      className={`flex cursor-pointer items-center gap-3 px-5 py-2.5 transition-colors ${
                        checked ? "bg-surface-sunken" : "hover:bg-surface-sunken"
                      } ${disabled ? "cursor-default opacity-60" : ""}`}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={() => toggle(email)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {email}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 truncate text-xs text-muted">
                          {c.company && <span>{c.company}</span>}
                          {c.phone && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {c.phone}
                            </span>
                          )}
                          {socialEntries(c.socials).length > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Link2 className="h-3 w-3" />
                              {socialEntries(c.socials)
                                .map(([k]) => SOCIAL_LABELS[k] ?? k)
                                .join(", ")}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {GENERIC.test(email) && (
                          <Badge variant="warning">generic</Badge>
                        )}
                        {disabled && <Badge variant="secondary">Sudah ada</Badge>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Info-only (phone/social, not importable) */}
          {infoOnly.length > 0 && (
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted" />
                <span className="font-medium text-ink">
                  Info kontak ditemukan (tanpa email — tidak bisa diimpor)
                </span>
              </div>
              <ul className="space-y-2">
                {infoOnly.map((c, i) => (
                  <li
                    key={`info-${i}`}
                    className="flex flex-wrap items-center gap-2 text-sm text-ink-secondary"
                  >
                    {c.phone && (
                      <CopyChip
                        label={c.phone}
                        icon={<Phone className="h-3 w-3" />}
                        copied={copied === c.phone}
                        onCopy={() => copy(c.phone as string)}
                      />
                    )}
                    {socialEntries(c.socials).map(([k, v]) => (
                      <CopyChip
                        key={k}
                        label={SOCIAL_LABELS[k] ?? k}
                        icon={<Link2 className="h-3 w-3" />}
                        copied={copied === v}
                        onCopy={() => copy(v)}
                      />
                    ))}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {/* Import progress overlay */}
      {importing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4">
          <div className="flex max-w-sm items-center gap-4 rounded-lg border border-border bg-surface px-6 py-5 shadow-[var(--shadow-lg)]">
            <Spinner />
            <div>
              <p className="text-sm font-semibold text-ink">Mengimpor kontak…</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                Menyimpan ke Contacts. Jangan tutup halaman ini.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CopyChip({
  label,
  icon,
  copied,
  onCopy,
}: {
  label: string;
  icon: React.ReactNode;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-sunken"
    >
      {icon}
      {label}
      {copied ? (
        <Check className="h-3 w-3 text-success-text" />
      ) : (
        <Copy className="h-3 w-3 text-faint" />
      )}
    </button>
  );
}
