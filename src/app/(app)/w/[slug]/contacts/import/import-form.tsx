"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import {
  Upload,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  FileText,
  ChevronLeft,
  Loader2,
  Tag,
} from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, Input } from "@/components/ui/input";
import {
  importContacts,
  type ImportRow,
  type ImportResult,
} from "./import-actions";

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

const STEPS = ["Upload", "Map", "Done"] as const;

export function ImportForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<"upload" | "map" | "done">("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, FieldKey>>({});
  const [defaultTagsStr, setDefaultTagsStr] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

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
        const initialMapping: Record<string, FieldKey> = {};
        for (const h of hdrs) {
          initialMapping[h] = autoDetect(h);
        }
        setMapping(initialMapping);
        setStep("map");
      },
      error(err) {
        setParseError(err.message);
      },
    });
  }

  function handleImport() {
    const importRows: ImportRow[] = rows.map((row) => {
      const mapped: ImportRow = {};
      const altEmails: string[] = [];
      for (const [csvHeader, fieldKey] of Object.entries(mapping)) {
        if (!fieldKey) continue;
        if (fieldKey === "alt_email") {
          // Cell may contain multiple emails separated by , or ;
          const cell = row[csvHeader];
          if (cell) {
            for (const part of cell.split(/[,;]/)) {
              const v = part.trim();
              if (v) altEmails.push(v);
            }
          }
        } else {
          mapped[fieldKey] = row[csvHeader];
        }
      }
      if (altEmails.length > 0) mapped.alt_emails = altEmails;
      return mapped;
    });

    const defaultTags = defaultTagsStr
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    startTransition(async () => {
      const res = await importContacts(slug, importRows, defaultTags);
      setResult(res);
      setStep("done");
    });
  }

  return (
    <>
      <Stepper currentStep={step} />

      {step === "upload" && (
        <Card className="p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Upload CSV file
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Pilih file CSV dari Google Sheet (File → Download → CSV) atau
              Excel. Header kolom akan auto-detect.
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
                if (file) handleFile(file);
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
      )}

      {step === "map" && (
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep("upload")}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Pilih file lain
              </Button>
            </div>

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
                    value={mapping[h] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({
                        ...m,
                        [h]: e.target.value as FieldKey,
                      }))
                    }
                    className="h-9"
                  >
                    {FIELD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>

            {!Object.values(mapping).includes("email") && (
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
              Tags ini akan diterapkan ke semua kontak yang di-import. Berguna
              untuk batch tagging seperti region atau source.
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
                          → {FIELD_OPTIONS.find((o) => o.value === mapping[h])?.label ?? "Skip"}
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
            <Button variant="outline" onClick={() => setStep("upload")}>
              Batal
            </Button>
            <Button
              onClick={handleImport}
              disabled={!Object.values(mapping).includes("email") || pending}
              loading={pending}
            >
              {pending
                ? `Importing ${rows.length.toLocaleString("id-ID")} rows...`
                : `Import ${rows.length.toLocaleString("id-ID")} Contacts`}
            </Button>
          </div>
        </div>
      )}

      {step === "done" && (
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
                {result?.imported.toLocaleString("id-ID") ?? 0} kontak baru
                berhasil ditambahkan ke database.
              </p>
            </div>
          </div>
          <div className="mb-5 grid grid-cols-3 gap-3">
            <ResultStat
              label="Imported"
              value={result?.imported ?? 0}
              tone="emerald"
            />
            <ResultStat label="Skipped" value={result?.skipped ?? 0} />
            <ResultStat
              label="Failed"
              value={result?.failed ?? 0}
              tone="red"
            />
          </div>
          {result && result.skipped > 0 && (
            <p className="mb-4 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Skipped = email duplicate (sudah ada di database) atau email
              invalid format.
            </p>
          )}
          {result && result.errors.length > 0 && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
              <p className="mb-1 font-medium">Errors:</p>
              <ul className="list-disc space-y-0.5 pl-4">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/w/${slug}/contacts`}>Lihat Contacts</ButtonLink>
            <Button
              variant="outline"
              onClick={() => {
                setStep("upload");
                setHeaders([]);
                setRows([]);
                setMapping({});
                setDefaultTagsStr("");
                setResult(null);
                setParseError(null);
              }}
            >
              Import Lagi
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}

function Stepper({ currentStep }: { currentStep: "upload" | "map" | "done" }) {
  const currentIndex = STEPS.indexOf(currentStep === "upload" ? "Upload" : currentStep === "map" ? "Map" : "Done");

  return (
    <div className="mb-6 flex items-center gap-2">
      {STEPS.map((s, i) => {
        const isActive = i === currentIndex;
        const isComplete = i < currentIndex;
        return (
          <div key={s} className="flex items-center gap-2">
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

function ResultStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "red";
}) {
  const colors = {
    default: "text-zinc-900 dark:text-zinc-100",
    emerald: "text-emerald-600 dark:text-emerald-400",
    red: "text-red-600 dark:text-red-400",
  };
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] dark:border-zinc-800/80 dark:bg-zinc-900">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p
        className={`mt-1.5 text-2xl font-semibold tabular-nums tracking-tight ${tone ? colors[tone] : colors.default}`}
      >
        {value.toLocaleString("id-ID")}
      </p>
    </div>
  );
}
