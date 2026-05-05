"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { importContacts, type ImportRow, type ImportResult } from "./import-actions";

const FIELD_OPTIONS = [
  { value: "", label: "— Skip —" },
  { value: "email", label: "Email *" },
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
  recipient: "email",
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
    // Build ImportRow array using mapping
    const importRows: ImportRow[] = rows.map((row) => {
      const mapped: ImportRow = {};
      for (const [csvHeader, fieldKey] of Object.entries(mapping)) {
        if (!fieldKey) continue;
        mapped[fieldKey] = row[csvHeader];
      }
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

  if (step === "upload") {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Step 1: Upload CSV
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Pilih file CSV dari Google Sheet (File → Download → CSV) atau Excel.
          Header kolom akan auto-detect.
        </p>

        <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-12 text-center transition hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:border-zinc-500 dark:hover:bg-zinc-800/50">
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Click untuk pilih CSV file
          </span>
          <span className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
            atau drag and drop. Max 10MB.
          </span>
        </label>

        {parseError && (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            Parse error: {parseError}
          </p>
        )}
      </div>
    );
  }

  if (step === "map") {
    const previewRows = rows.slice(0, 5);
    const hasEmailMapped = Object.values(mapping).includes("email");
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Step 2: Mapping Kolom
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {rows.length.toLocaleString("id-ID")} rows detected. Konfirm mapping kolom CSV ke field aplikasi.
              </p>
            </div>
            <button
              onClick={() => setStep("upload")}
              className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              ← Pilih file lain
            </button>
          </div>

          <div className="mt-6 space-y-3">
            {headers.map((h) => (
              <div
                key={h}
                className="grid grid-cols-1 items-center gap-3 md:grid-cols-3"
              >
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {h}
                  <p className="text-xs font-normal text-zinc-500">
                    Sample: {previewRows[0]?.[h]?.slice(0, 30) ?? "—"}
                  </p>
                </div>
                <span className="text-zinc-400">→</span>
                <select
                  value={mapping[h] ?? ""}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [h]: e.target.value as FieldKey }))
                  }
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100"
                >
                  {FIELD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {!hasEmailMapped && (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400">
              ⚠️ Email kolom belum di-mapping. Email wajib untuk import.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Step 3: Default Tags (opsional)
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Tags ini akan diterapkan ke semua kontak yang di-import. Berguna untuk batch tagging seperti region atau source.
          </p>
          <input
            type="text"
            value={defaultTagsStr}
            onChange={(e) => setDefaultTagsStr(e.target.value)}
            placeholder="bogor, hr, q2-import"
            className="mt-3 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100"
          />
        </div>

        {/* Preview table */}
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Preview (5 rows)
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-zinc-500">
                <tr>
                  {headers.map((h) => (
                    <th key={h} className="px-2 py-1 font-medium">
                      {h}
                      <div className="text-[10px] font-normal text-zinc-400">
                        → {FIELD_OPTIONS.find((o) => o.value === mapping[h])?.label ?? "Skip"}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
                    {headers.map((h) => (
                      <td
                        key={h}
                        className="max-w-[160px] truncate px-2 py-1 text-zinc-700 dark:text-zinc-300"
                      >
                        {row[h]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={() => setStep("upload")}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            Batal
          </button>
          <button
            onClick={handleImport}
            disabled={!hasEmailMapped || pending}
            className="rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-50 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {pending
              ? `Importing ${rows.length.toLocaleString("id-ID")} rows...`
              : `Import ${rows.length.toLocaleString("id-ID")} Contacts`}
          </button>
        </div>
      </div>
    );
  }

  // step === "done"
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        Import Selesai 🎉
      </h2>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat
          label="Imported"
          value={result?.imported.toLocaleString("id-ID") ?? "0"}
          color="emerald"
        />
        <Stat
          label="Skipped"
          value={result?.skipped.toLocaleString("id-ID") ?? "0"}
          color="zinc"
        />
        <Stat
          label="Failed"
          value={result?.failed.toLocaleString("id-ID") ?? "0"}
          color="red"
        />
      </div>
      {result && result.skipped > 0 && (
        <p className="mt-4 text-xs text-zinc-500">
          Skipped = email duplicate (sudah ada di database) atau email invalid.
        </p>
      )}
      {result && result.errors.length > 0 && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          <p className="font-medium">Errors:</p>
          <ul className="mt-1 list-disc pl-4">
            {result.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-6 flex gap-3">
        <button
          onClick={() => router.push(`/w/${slug}/contacts`)}
          className="rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-50 transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Lihat Contacts
        </button>
        <button
          onClick={() => {
            setStep("upload");
            setHeaders([]);
            setRows([]);
            setMapping({});
            setDefaultTagsStr("");
            setResult(null);
            setParseError(null);
          }}
          className="rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          Import Lagi
        </button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "emerald" | "zinc" | "red";
}) {
  const colorClasses = {
    emerald: "text-emerald-700 dark:text-emerald-400",
    zinc: "text-zinc-700 dark:text-zinc-300",
    red: "text-red-700 dark:text-red-400",
  };
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${colorClasses[color]}`}>
        {value}
      </p>
    </div>
  );
}
