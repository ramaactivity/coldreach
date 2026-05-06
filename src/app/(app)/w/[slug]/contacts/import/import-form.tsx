"use client";

import { useState, useTransition, useRef, useEffect, useMemo } from "react";
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
  type ImportRow,
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
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Upload CSV file
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Pilih file CSV dari Google Sheet (File → Download → CSV) atau Excel.
          Header kolom akan auto-detect. Import 10K+ row di-handle otomatis via
          batch.
        </p>
      </div>

      <label
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 text-center transition-all ${
          parseError
            ? "border-red-300 bg-red-50/40 dark:border-red-900/60 dark:bg-red-950/20"
            : "border-zinc-300 bg-zinc-50/40 hover:border-zinc-400 hover:bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-900/30 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/40"
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
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
          <Upload className="h-6 w-6 text-zinc-500 dark:text-zinc-400" />
        </div>
        <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Click untuk pilih CSV file
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          atau drag and drop · Max 10MB
        </p>
      </label>

      {parseError && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
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
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Mapping Kolom
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              <strong className="font-medium text-zinc-900 dark:text-zinc-100">
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
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-400">
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
              className="grid grid-cols-1 items-center gap-2 rounded-lg border border-zinc-100 bg-zinc-50/40 p-2.5 sm:grid-cols-[1fr_auto_1fr] dark:border-zinc-800 dark:bg-zinc-900/40"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {h}
                </p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {rows[0]?.[h]?.slice(0, 40) ?? "—"}
                </p>
              </div>
              <ArrowRight className="hidden h-4 w-4 text-zinc-400 sm:block" />
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
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Email kolom belum di-mapping. Email wajib untuk import.</span>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="mb-3 flex items-center gap-2">
          <Tag className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Default Tags
          </h3>
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            Optional
          </span>
        </div>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
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
        <div className="border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <FileText className="h-3.5 w-3.5" />
            Preview · 5 rows pertama
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50/60 text-left dark:bg-zinc-900/40">
              <tr>
                {headers.map((h) => (
                  <th
                    key={h}
                    className="border-b border-zinc-100 px-3 py-2 font-semibold dark:border-zinc-800"
                  >
                    <p className="truncate text-zinc-900 dark:text-zinc-100">
                      {h}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] font-normal text-zinc-500">
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
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                >
                  {headers.map((h) => (
                    <td
                      key={h}
                      className="max-w-[200px] truncate px-3 py-2 text-zinc-700 dark:text-zinc-300"
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
        <Button variant="outline" onClick={onBack}>
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
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:ring-blue-800/50">
            <Eye className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Preview Import
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
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
          <div className="mt-5 rounded-lg border border-amber-200/80 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20">
            <div className="flex items-start gap-2 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-300">
                  {analysis.skipped.length.toLocaleString("id-ID")} rows akan
                  di-skip
                </p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-amber-800 dark:text-amber-400">
                  {(Object.keys(counts) as SkippedReason[]).map((r) =>
                    counts[r] > 0 ? (
                      <span key={r}>
                        <strong className="tabular-nums">{counts[r]}</strong>{" "}
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
              className="flex w-full items-center justify-center gap-1 border-t border-amber-200 px-4 py-2 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100/60 dark:border-amber-900/50 dark:text-amber-400 dark:hover:bg-amber-950/40"
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
        <Button variant="outline" onClick={onBack}>
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
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:ring-blue-800/50">
          <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Importing...
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Batch {progress.chunksDone} dari {progress.chunksTotal} ·{" "}
            {pct}%
          </p>
        </div>
      </div>

      <div className="mb-5">
        <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all"
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
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel sisa batch
        </Button>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
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
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:ring-emerald-800/50">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Import Selesai
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
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
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
          <p className="mb-1 font-medium">Errors:</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {skipped.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200/80 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-300">
              {skipped.length.toLocaleString("id-ID")} rows di-skip — lihat
              alasan biar bisa di-cleanup di CSV
            </p>
            <Button variant="outline" size="sm" onClick={downloadSkipped}>
              <FileText className="h-3 w-3" />
              Download CSV
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setShowSkipped((v) => !v)}
            className="flex w-full items-center justify-center gap-1 border-t border-amber-200 px-4 py-2 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100/60 dark:border-amber-900/50 dark:text-amber-400 dark:hover:bg-amber-950/40"
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
        <ButtonLink href={`/w/${slug}/contacts/duplicates`} variant="outline">
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
    <div className="border-t border-amber-200 dark:border-amber-900/50">
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-amber-50 text-left dark:bg-amber-950/40">
            <tr>
              <th className="px-4 py-2 font-medium text-amber-900 dark:text-amber-300">
                Row
              </th>
              <th className="px-4 py-2 font-medium text-amber-900 dark:text-amber-300">
                Email
              </th>
              <th className="px-4 py-2 font-medium text-amber-900 dark:text-amber-300">
                Alasan
              </th>
            </tr>
          </thead>
          <tbody>
            {display.map((s, i) => (
              <tr
                key={`${s.rowIndex}-${i}`}
                className="border-t border-amber-100 dark:border-amber-900/40"
              >
                <td className="px-4 py-1.5 tabular-nums text-amber-900 dark:text-amber-200">
                  {s.rowIndex}
                </td>
                <td className="px-4 py-1.5 text-amber-900 dark:text-amber-200">
                  {s.email || (
                    <span className="text-amber-700/70 dark:text-amber-400/70">
                      (kosong)
                    </span>
                  )}
                </td>
                <td className="px-4 py-1.5 text-amber-800 dark:text-amber-400">
                  {SKIPPED_REASON_LABEL[s.reason]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <p className="px-4 py-2 text-center text-[10px] text-amber-700 dark:text-amber-400">
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
    default: "text-zinc-900 dark:text-zinc-100",
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-700 dark:text-amber-400",
    red: "text-red-600 dark:text-red-400",
  };
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] dark:border-zinc-800/80 dark:bg-zinc-900">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3 text-zinc-400" />}
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {label}
        </p>
      </div>
      <p
        className={`mt-1.5 text-2xl font-semibold tabular-nums tracking-tight ${colors[tone]}`}
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
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                isComplete
                  ? "bg-emerald-500 text-white"
                  : isActive
                    ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {isComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span
              className={`text-sm font-medium ${
                isActive
                  ? "text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {s}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={`mx-1 h-px w-8 ${
                  isComplete
                    ? "bg-emerald-500"
                    : "bg-zinc-200 dark:bg-zinc-800"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
