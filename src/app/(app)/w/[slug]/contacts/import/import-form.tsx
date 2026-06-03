"use client";

import { useState, useTransition, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import {
  Upload,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  FileText,
  ChevronLeft,
  Tag,
  ChevronDown,
  ChevronUp,
  Save,
  Sparkles,
  XCircle,
  Mail,
  Files,
  AlertTriangle,
  Eye,
} from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { analyzeImport, importContactsChunk } from "./import-actions";
import {
  SKIPPED_REASON_LABEL,
  type ImportRowWithIndex,
  type AnalysisResult,
  type SkippedDetail,
  type SkippedReason,
} from "./import-shared";

const FIELD_OPTIONS = [
  { value: "", label: "— Skip —" },
  { value: "email", label: "Email (utama) *" },
  { value: "alt_email", label: "Email (alternate)" },
  { value: "first_name", label: "First name" },
  { value: "last_name", label: "Last name" },
  { value: "company", label: "Company" },
  { value: "position", label: "Position" },
  { value: "phone", label: "Phone" },
  { value: "website", label: "Website" },
  { value: "notes", label: "Notes" },
  { value: "tags", label: "Tags (comma-separated)" },
] as const;

type FieldKey = (typeof FIELD_OPTIONS)[number]["value"];

const FUZZY_MAP: Record<string, FieldKey> = {
  email: "email",
  "email address": "email",
  "email utama": "email",
  "primary email": "email",
  recipient: "email",
  "secondary mail": "alt_email",
  "secondary email": "alt_email",
  "alt email": "alt_email",
  "alternate email": "alt_email",
  "email 2": "alt_email",
  "email alternatif": "alt_email",
  "email kedua": "alt_email",
  "first name": "first_name",
  firstname: "first_name",
  "nama depan": "first_name",
  nama: "first_name",
  "last name": "last_name",
  lastname: "last_name",
  "nama belakang": "last_name",
  company: "company",
  perusahaan: "company",
  pt: "company",
  organization: "company",
  position: "position",
  jabatan: "position",
  title: "position",
  "job title": "position",
  phone: "phone",
  "no hp": "phone",
  telepon: "phone",
  whatsapp: "phone",
  website: "website",
  url: "website",
  notes: "notes",
  catatan: "notes",
  komentar: "notes",
  tags: "tags",
  tag: "tags",
};

function autoDetect(header: string): FieldKey {
  const normalized = header.trim().toLowerCase().replace(/[_-]/g, " ");
  return FUZZY_MAP[normalized] ?? "";
}

const STEPS = ["Upload", "Map", "Preview", "Done"] as const;
const CHUNK_SIZE = 250;

type Step = "upload" | "map" | "preview" | "importing" | "done";

type Progress = {
  chunksDone: number;
  chunksTotal: number;
  imported: number;
  skipped: number;
  failed: number;
};

function mappingStorageKey(slug: string, headers: string[]): string {
  const sig = headers.join("|");
  return `coldreach:import-mapping:${slug}:${sig}`;
}

function buildImportRows(
  rows: Record<string, string>[],
  mapping: Record<string, FieldKey>,
): ImportRowWithIndex[] {
  return rows.map((row, idx) => {
    const mapped: ImportRowWithIndex = { rowIndex: idx + 2 }; // +2: header + 1-based
    const altEmails: string[] = [];
    for (const [csvHeader, fieldKey] of Object.entries(mapping)) {
      if (!fieldKey) continue;
      if (fieldKey === "alt_email") {
        const cell = row[csvHeader];
        if (cell) {
          for (const part of cell.split(/[,;]/)) {
            const v = part.trim();
            if (v) altEmails.push(v);
          }
        }
      } else {
        (mapped as unknown as Record<string, string>)[fieldKey] =
          row[csvHeader];
      }
    }
    if (altEmails.length > 0) mapped.alt_emails = altEmails;
    return mapped;
  });
}

export function ImportForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, FieldKey>>({});
  const [defaultTagsStr, setDefaultTagsStr] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  // Preview state
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [restoredMapping, setRestoredMapping] = useState(false);

  // Import progress state
  const [progress, setProgress] = useState<Progress>({
    chunksDone: 0,
    chunksTotal: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
  });
  const [allSkipped, setAllSkipped] = useState<SkippedDetail[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const cancelRef = useRef(false);

  const importRows = useMemo(
    () => (rows.length > 0 ? buildImportRows(rows, mapping) : []),
    [rows, mapping],
  );

  function handleFile(file: File) {
    setParseError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(res) {
        if (res.errors.length > 0 && res.data.length === 0) {
          setParseError(res.errors[0].message);
          return;
        }
        const hdrs = res.meta.fields ?? [];
        setHeaders(hdrs);
        setRows(res.data);

        // Try to restore saved mapping
        const saved = restoreMapping(slug, hdrs);
        if (saved) {
          setMapping(saved);
          setRestoredMapping(true);
        } else {
          const initial: Record<string, FieldKey> = {};
          for (const h of hdrs) initial[h] = autoDetect(h);
          setMapping(initial);
          setRestoredMapping(false);
        }
        setStep("map");
      },
      error(err) {
        setParseError(err.message);
      },
    });
  }

  function restoreMapping(
    slug: string,
    headers: string[],
  ): Record<string, FieldKey> | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(mappingStorageKey(slug, headers));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Record<string, FieldKey>;
      // Verify keys match
      for (const h of headers) {
        if (!(h in parsed)) return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  function persistMapping() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        mappingStorageKey(slug, headers),
        JSON.stringify(mapping),
      );
    } catch {
      /* ignore quota errors */
    }
  }

  function handlePreview() {
    persistMapping();
    const analysisRows = importRows.map((r) => ({
      rowIndex: r.rowIndex,
      email: r.email,
      alt_emails: r.alt_emails,
    }));
    startTransition(async () => {
      const res = await analyzeImport(slug, analysisRows);
      setAnalysis(res);
      setStep("preview");
    });
  }

  async function handleImport() {
    cancelRef.current = false;
    setAllSkipped([]);
    setImportErrors([]);

    const defaultTags = defaultTagsStr
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const total = importRows.length;
    const totalChunks = Math.ceil(total / CHUNK_SIZE);
    setProgress({
      chunksDone: 0,
      chunksTotal: totalChunks,
      imported: 0,
      skipped: 0,
      failed: 0,
    });
    setStep("importing");

    let imported = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const skippedAcc: SkippedDetail[] = [];
    const errorsAcc: string[] = [];

    for (let i = 0; i < totalChunks; i++) {
      if (cancelRef.current) break;
      const start = i * CHUNK_SIZE;
      const chunk = importRows.slice(start, start + CHUNK_SIZE);
      try {
        const res = await importContactsChunk(slug, chunk, defaultTags);
        imported += res.imported;
        skippedCount += res.skipped.length;
        failedCount += res.failed;
        skippedAcc.push(...res.skipped);
        errorsAcc.push(...res.errors);
      } catch (err) {
        failedCount += chunk.length;
        errorsAcc.push(
          `Chunk ${i + 1} gagal: ${err instanceof Error ? err.message : "unknown"}`,
        );
      }
      setProgress({
        chunksDone: i + 1,
        chunksTotal: totalChunks,
        imported,
        skipped: skippedCount,
        failed: failedCount,
      });
    }

    setAllSkipped(skippedAcc);
    setImportErrors(errorsAcc);
    setStep("done");
  }

  function handleCancel() {
    cancelRef.current = true;
  }

  const hasEmail = Object.values(mapping).includes("email");

  return (
    <>
      <Stepper step={step} />

      {step === "upload" && (
        <UploadStep
          parseError={parseError}
          onFile={handleFile}
        />
      )}

      {step === "map" && (
        <MapStep
          headers={headers}
          rows={rows}
          mapping={mapping}
          setMapping={setMapping}
          defaultTagsStr={defaultTagsStr}
          setDefaultTagsStr={setDefaultTagsStr}
          hasEmail={hasEmail}
          restored={restoredMapping}
          pending={pending}
          onBack={() => setStep("upload")}
          onPreview={handlePreview}
        />
      )}

      {step === "preview" && analysis && (
        <PreviewStep
          analysis={analysis}
          onBack={() => setStep("map")}
          onConfirm={handleImport}
        />
      )}

      {step === "importing" && (
        <ImportingStep progress={progress} onCancel={handleCancel} />
      )}

      {step === "done" && (
        <DoneStep
          slug={slug}
          progress={progress}
          skipped={allSkipped}
          errors={importErrors}
          onAgain={() => {
            setStep("upload");
            setHeaders([]);
            setRows([]);
            setMapping({});
            setDefaultTagsStr("");
            setAnalysis(null);
            setAllSkipped([]);
            setImportErrors([]);
            setParseError(null);
            setProgress({
              chunksDone: 0,
              chunksTotal: 0,
              imported: 0,
              skipped: 0,
              failed: 0,
            });
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/* ===================================================================== */
/* Step components                                                       */
/* ===================================================================== */

function UploadStep({
  parseError,
  onFile,
}: {
  parseError: string | null;
  onFile: (file: File) => void;
}) {
  return (
    <Card className="p-8">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-ink">
          Upload CSV file
        </h2>
        <p className="mt-1 text-sm text-muted">
          Pilih file CSV dari Google Sheet (File → Download → CSV) atau Excel.
          Header kolom akan auto-detect. Import 10K+ row di-handle otomatis via
          batch.
        </p>
      </div>

      <label
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center transition-all ${
          parseError
            ? "border-danger bg-danger-soft"
            : "border-border-strong bg-surface-sunken/40 hover:border-border-strong hover:bg-surface-sunken/80"
        }`}
      >
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
        />
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-lg bg-surface ring-1 ring-border">
          <Upload className="h-6 w-6 text-muted" />
        </div>
        <p className="text-base font-semibold text-ink">
          Click untuk pilih CSV file
        </p>
        <p className="mt-1 text-xs text-muted">
          atau drag and drop · Max 10MB
        </p>
      </label>

      {parseError && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-danger-soft bg-danger-soft p-3 text-xs text-danger-text">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Parse error: {parseError}</span>
        </div>
      )}
    </Card>
  );
}

function MapStep({
  headers,
  rows,
  mapping,
  setMapping,
  defaultTagsStr,
  setDefaultTagsStr,
  hasEmail,
  restored,
  pending,
  onBack,
  onPreview,
}: {
  headers: string[];
  rows: Record<string, string>[];
  mapping: Record<string, FieldKey>;
  setMapping: React.Dispatch<React.SetStateAction<Record<string, FieldKey>>>;
  defaultTagsStr: string;
  setDefaultTagsStr: React.Dispatch<React.SetStateAction<string>>;
  hasEmail: boolean;
  restored: boolean;
  pending: boolean;
  onBack: () => void;
  onPreview: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">
              Mapping Kolom
            </h2>
            <p className="mt-1 text-sm text-muted">
              <strong className="font-medium text-ink">
                {rows.length.toLocaleString("id-ID")} rows
              </strong>{" "}
              detected. Konfirm mapping kolom CSV ke field aplikasi.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft className="h-3.5 w-3.5" />
            Pilih file lain
          </Button>
        </div>

        {restored && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-info-soft bg-info-soft p-3 text-xs text-info">
            <Save className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Mapping dari import sebelumnya udah di-restore otomatis. Kalau
              perlu ubah, langsung edit.
            </span>
          </div>
        )}

        <div className="space-y-2">
          {headers.map((h) => (
            <div
              key={h}
              className="grid grid-cols-1 items-center gap-2 rounded-lg border border-border bg-surface-sunken/40 p-2.5 sm:grid-cols-[1fr_auto_1fr]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {h}
                </p>
                <p className="truncate text-xs text-muted">
                  {rows[0]?.[h]?.slice(0, 40) ?? "—"}
                </p>
              </div>
              <ArrowRight className="hidden h-4 w-4 text-faint sm:block" />
              <Select
                value={(mapping[h] || "__skip__") as string}
                onValueChange={(v) =>
                  setMapping((m) => ({
                    ...m,
                    [h]: (v === "__skip__" ? "" : v) as FieldKey,
                  }))
                }
              >
                {FIELD_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.value || "__skip__"}
                    value={opt.value || "__skip__"}
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </Select>
            </div>
          ))}
        </div>

        {!hasEmail && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning-soft bg-warning-soft p-3 text-xs text-warning-text">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Email kolom belum di-mapping. Email wajib untuk import.</span>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="mb-3 flex items-center gap-2">
          <Tag className="h-4 w-4 text-muted" />
          <h3 className="text-base font-semibold text-ink">
            Default Tags
          </h3>
          <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-muted">
            Optional
          </span>
        </div>
        <p className="mb-3 text-sm text-muted">
          Tags ini akan diterapkan ke semua kontak yang di-import. Berguna untuk
          batch tagging seperti region atau source.
        </p>
        <Input
          type="text"
          value={defaultTagsStr}
          onChange={(e) => setDefaultTagsStr(e.target.value)}
          placeholder="bogor, hr, q2-import"
        />
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-border px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <FileText className="h-3.5 w-3.5" />
            Preview · 5 rows pertama
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-sunken text-left">
              <tr>
                {headers.map((h) => (
                  <th
                    key={h}
                    className="border-b border-border px-3 py-2 font-semibold"
                  >
                    <p className="truncate text-ink">
                      {h}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] font-normal text-muted">
                      →{" "}
                      {FIELD_OPTIONS.find((o) => o.value === mapping[h])?.label ??
                        "Skip"}
                    </p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 5).map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border last:border-0"
                >
                  {headers.map((h) => (
                    <td
                      key={h}
                      className="max-w-[200px] truncate px-3 py-2 text-ink-secondary"
                    >
                      {row[h]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onBack}>
          Batal
        </Button>
        <Button
          onClick={onPreview}
          disabled={!hasEmail || pending}
          loading={pending}
        >
          {pending ? "Menganalisis..." : "Lanjut: Cek Duplikat"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function PreviewStep({
  analysis,
  onBack,
  onConfirm,
}: {
  analysis: AnalysisResult;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const [showSkipped, setShowSkipped] = useState(false);

  const counts = useMemo(() => {
    const c: Record<SkippedReason, number> = {
      missing_email: 0,
      invalid_email: 0,
      duplicate_in_csv: 0,
      duplicate_primary: 0,
      duplicate_alt: 0,
    };
    for (const s of analysis.skipped) c[s.reason]++;
    return c;
  }, [analysis.skipped]);

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info-soft ring-1 ring-info-soft">
            <Eye className="h-5 w-5 text-info" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-ink">
              Preview Import
            </h2>
            <p className="mt-1 text-sm text-muted">
              Sistem udah scan {analysis.totalRows.toLocaleString("id-ID")} rows
              di CSV-mu vs database existing. Konfirm sebelum commit.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KPI
            label="Akan diimport"
            value={analysis.willImport}
            icon={Sparkles}
            tone="emerald"
          />
          <KPI
            label="Total skip"
            value={analysis.skipped.length}
            icon={XCircle}
            tone={analysis.skipped.length > 0 ? "amber" : "default"}
          />
          <KPI
            label="Total CSV"
            value={analysis.totalRows}
            icon={Files}
          />
          <KPI
            label="Duplicate primary"
            value={counts.duplicate_primary}
            icon={Mail}
            tone={counts.duplicate_primary > 0 ? "amber" : "default"}
          />
        </div>

        {/* Skipped breakdown */}
        {analysis.skipped.length > 0 && (
          <div className="mt-5 rounded-lg border border-warning-soft/80 bg-warning-soft/50">
            <div className="flex items-start gap-2 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="flex-1">
                <p className="text-sm font-medium text-warning-text">
                  {analysis.skipped.length.toLocaleString("id-ID")} rows akan
                  di-skip
                </p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-warning-text">
                  {(Object.keys(counts) as SkippedReason[]).map((r) =>
                    counts[r] > 0 ? (
                      <span key={r}>
                        <strong className="tabular">{counts[r]}</strong>{" "}
                        {SKIPPED_REASON_LABEL[r]}
                      </span>
                    ) : null,
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowSkipped((v) => !v)}
              className="flex w-full items-center justify-center gap-1 border-t border-warning-soft px-4 py-2 text-xs font-medium text-warning-text transition-colors hover:bg-warning-soft/60"
            >
              {showSkipped ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Sembunyikan detail
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Lihat detail per row
                </>
              )}
            </button>

            {showSkipped && (
              <SkippedTable rows={analysis.skipped} />
            )}
          </div>
        )}
      </Card>

      <div className="flex justify-between gap-2 pt-2">
        <Button variant="secondary" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
          Edit mapping
        </Button>
        <Button onClick={onConfirm} disabled={analysis.willImport === 0}>
          Commit Import ({analysis.willImport.toLocaleString("id-ID")})
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ImportingStep({
  progress,
  onCancel,
}: {
  progress: Progress;
  onCancel: () => void;
}) {
  const pct =
    progress.chunksTotal > 0
      ? Math.round((progress.chunksDone / progress.chunksTotal) * 100)
      : 0;

  return (
    <Card className="p-8">
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info-soft ring-1 ring-info-soft">
          <Upload className="h-5 w-5 text-info" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-ink">
            Importing...
          </h2>
          <p className="mt-1 text-sm text-muted">
            Batch {progress.chunksDone} dari {progress.chunksTotal} ·{" "}
            {pct}%
          </p>
        </div>
      </div>

      <div className="mb-5">
        <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
          <div
            className="h-full rounded-full bg-info transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <KPI label="Imported" value={progress.imported} tone="emerald" />
        <KPI label="Skipped" value={progress.skipped} tone="amber" />
        <KPI label="Failed" value={progress.failed} tone="red" />
      </div>

      <div className="mt-6 flex justify-end">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel sisa batch
        </Button>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted">
        Jangan tutup tab ini sampai selesai. Cancel akan stop import setelah
        batch yang sedang jalan, batch sebelumnya tetap tersimpan.
      </p>
    </Card>
  );
}

function DoneStep({
  slug,
  progress,
  skipped,
  errors,
  onAgain,
}: {
  slug: string;
  progress: Progress;
  skipped: SkippedDetail[];
  errors: string[];
  onAgain: () => void;
}) {
  const [showSkipped, setShowSkipped] = useState(false);

  function downloadSkipped() {
    const csv = [
      ["row", "email", "reason"],
      ...skipped.map((s) => [
        String(s.rowIndex),
        s.email,
        SKIPPED_REASON_LABEL[s.reason],
      ]),
    ]
      .map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coldreach-skipped-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="p-8">
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-soft ring-1 ring-success-soft">
          <CheckCircle2 className="h-5 w-5 text-success" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-ink">
            Import Selesai
          </h2>
          <p className="mt-1 text-sm text-muted">
            {progress.imported.toLocaleString("id-ID")} kontak baru ditambahkan
            ke database.
          </p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <KPI label="Imported" value={progress.imported} tone="emerald" />
        <KPI label="Skipped" value={progress.skipped} tone="amber" />
        <KPI label="Failed" value={progress.failed} tone="red" />
      </div>

      {errors.length > 0 && (
        <div className="mb-4 rounded-lg border border-danger-soft bg-danger-soft p-3 text-xs text-danger-text">
          <p className="mb-1 font-medium">Errors:</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {skipped.length > 0 && (
        <div className="mb-4 rounded-lg border border-warning-soft/80 bg-warning-soft/50">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <p className="text-sm font-medium text-warning-text">
              {skipped.length.toLocaleString("id-ID")} rows di-skip — lihat
              alasan biar bisa di-cleanup di CSV
            </p>
            <Button variant="secondary" size="sm" onClick={downloadSkipped}>
              <FileText className="h-3 w-3" />
              Download CSV
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setShowSkipped((v) => !v)}
            className="flex w-full items-center justify-center gap-1 border-t border-warning-soft px-4 py-2 text-xs font-medium text-warning-text transition-colors hover:bg-warning-soft/60"
          >
            {showSkipped ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Sembunyikan
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                Lihat detail
              </>
            )}
          </button>
          {showSkipped && <SkippedTable rows={skipped} />}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`/w/${slug}/contacts`}>Lihat Contacts</ButtonLink>
        <ButtonLink href={`/w/${slug}/contacts/duplicates`} variant="secondary">
          Cek Duplikat di DB
        </ButtonLink>
        <Button variant="ghost" onClick={onAgain}>
          Import Lagi
        </Button>
      </div>
    </Card>
  );
}

/* ===================================================================== */
/* Sub-components                                                        */
/* ===================================================================== */

function SkippedTable({ rows }: { rows: SkippedDetail[] }) {
  const limit = 200;
  const display = rows.slice(0, limit);
  return (
    <div className="border-t border-warning-soft">
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-warning-soft text-left">
            <tr>
              <th className="px-4 py-2 font-medium text-warning-text">
                Row
              </th>
              <th className="px-4 py-2 font-medium text-warning-text">
                Email
              </th>
              <th className="px-4 py-2 font-medium text-warning-text">
                Alasan
              </th>
            </tr>
          </thead>
          <tbody>
            {display.map((s, i) => (
              <tr
                key={`${s.rowIndex}-${i}`}
                className="border-t border-warning-soft"
              >
                <td className="px-4 py-1.5 tabular text-warning-text">
                  {s.rowIndex}
                </td>
                <td className="px-4 py-1.5 text-warning-text">
                  {s.email || (
                    <span className="text-warning/70">
                      (kosong)
                    </span>
                  )}
                </td>
                <td className="px-4 py-1.5 text-warning-text">
                  {SKIPPED_REASON_LABEL[s.reason]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <p className="px-4 py-2 text-center text-[10px] text-warning">
          Showing {limit} dari {rows.length.toLocaleString("id-ID")} — download
          CSV untuk full list
        </p>
      )}
    </div>
  );
}

function KPI({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon?: typeof Mail;
  tone?: "default" | "emerald" | "amber" | "red";
}) {
  const colors = {
    default: "text-ink",
    emerald: "text-success",
    amber: "text-warning",
    red: "text-danger",
  };
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3 text-faint" />}
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          {label}
        </p>
      </div>
      <p
        className={`mt-1.5 text-2xl font-semibold tabular tracking-tight ${colors[tone]}`}
      >
        {value.toLocaleString("id-ID")}
      </p>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const map: Record<Step, number> = {
    upload: 0,
    map: 1,
    preview: 2,
    importing: 2,
    done: 3,
  };
  const current = map[step];

  return (
    <div className="mb-6 flex items-center gap-2 overflow-x-auto">
      {STEPS.map((s, i) => {
        const isActive = i === current;
        const isComplete = i < current;
        return (
          <div key={s} className="flex shrink-0 items-center gap-2">
            <div
              className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                isComplete
                  ? "bg-success text-on-action"
                  : isActive
                    ? "bg-accent text-accent-fg"
                    : "bg-surface-sunken text-faint"
              }`}
            >
              {isComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span
              className={`text-sm font-medium ${
                isActive ? "text-ink" : "text-muted"
              }`}
            >
              {s}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={`mx-1 h-px w-8 ${
                  isComplete ? "bg-success" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
