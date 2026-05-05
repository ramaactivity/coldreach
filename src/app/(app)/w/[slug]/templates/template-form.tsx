"use client";

import { useActionState, useState } from "react";
import {
  SUPPORTED_VARIABLES,
  extractVariables,
  renderPreview,
  type Template,
} from "@/lib/template-helpers";
import type { TemplateFormState } from "./actions";

const SAMPLE_VALUES: Record<string, string> = {
  first_name: "Bella",
  last_name: "Hs",
  full_name: "Bella Hs",
  email: "bella.hs@kreston.co.id",
  company: "Kreston Indonesia",
  position: "HR Manager",
  ai_opener: "Halo Bella, saya lihat Kreston baru aja expand di Bogor — selamat ya!",
};

const INITIAL_STATE: TemplateFormState = {};

export function TemplateForm({
  initialTemplate,
  action,
  submitLabel,
}: {
  initialTemplate?: Template;
  action: (state: TemplateFormState, formData: FormData) => Promise<TemplateFormState>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const [name, setName] = useState(initialTemplate?.name ?? "");
  const [category, setCategory] = useState(initialTemplate?.category ?? "");
  const [subjects, setSubjects] = useState(
    initialTemplate?.subject_lines?.join("\n") ?? "",
  );
  const [body, setBody] = useState(initialTemplate?.body_plain ?? "");

  const detectedVariables = extractVariables(body + " " + subjects);
  const unsupported = detectedVariables.filter(
    (v) => !SUPPORTED_VARIABLES.includes(v as (typeof SUPPORTED_VARIABLES)[number]),
  );

  const subjectPreview = renderPreview(
    subjects.split("\n").filter(Boolean)[0] ?? "",
    SAMPLE_VALUES,
  );
  const bodyPreview = renderPreview(body, SAMPLE_VALUES);

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: editor */}
        <div className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              Nama Template
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Cold Outreach Catering - Indonesian"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100"
            />
            {state.fieldErrors?.name && (
              <p className="mt-1 text-xs text-red-600">{state.fieldErrors.name}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="category"
              className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              Kategori (opsional)
            </label>
            <input
              id="category"
              name="category"
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="cold-outreach, follow-up, tasting-invite"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100"
            />
          </div>

          <div>
            <label
              htmlFor="subject_lines"
              className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              Subject Lines
            </label>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              Satu subject per baris. Sistem random pilih saat kirim (A/B testing manual).
            </p>
            <textarea
              id="subject_lines"
              name="subject_lines"
              value={subjects}
              onChange={(e) => setSubjects(e.target.value)}
              required
              rows={3}
              placeholder={`Penawaran catering untuk {company}\nIde catering untuk event {company}\nKolaborasi catering, {first_name}?`}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100"
            />
            {state.fieldErrors?.subject_lines && (
              <p className="mt-1 text-xs text-red-600">
                {state.fieldErrors.subject_lines}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="body_plain"
              className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              Body (plain text)
            </label>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              Plain text lebih bagus untuk cold email — masuk inbox lebih konsisten. Pakai variable: <code>{`{first_name}`}</code>, <code>{`{company}`}</code>, dll.
            </p>
            <textarea
              id="body_plain"
              name="body_plain"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              rows={14}
              placeholder={`Halo {first_name},\n\n{ai_opener}\n\nKenalin, saya Muhamad dari Tiska Catering...\n\nKalau ada event di {company} yang butuh catering, kami bisa kirim sample.\n\nSalam,\nMuhamad`}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100"
            />
            {state.fieldErrors?.body_plain && (
              <p className="mt-1 text-xs text-red-600">
                {state.fieldErrors.body_plain}
              </p>
            )}
          </div>

          {/* Variables panel */}
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
            <p className="font-medium text-zinc-700 dark:text-zinc-300">
              Variables tersedia:
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUPPORTED_VARIABLES.map((v) => {
                const used = detectedVariables.includes(v);
                return (
                  <code
                    key={v}
                    className={`rounded px-1.5 py-0.5 ${
                      used
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400"
                        : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {`{${v}}`}
                  </code>
                );
              })}
            </div>
            {unsupported.length > 0 && (
              <p className="mt-2 text-amber-700 dark:text-amber-400">
                ⚠️ Variable gak dikenal: {unsupported.map((v) => `{${v}}`).join(", ")}. Akan tampak literal saat kirim.
              </p>
            )}
          </div>
        </div>

        {/* Right: preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Preview (sample values)
            </p>
            <div className="mt-3 border-b border-zinc-100 pb-3 dark:border-zinc-800">
              <p className="text-xs text-zinc-500">From</p>
              <p className="text-sm text-zinc-900 dark:text-zinc-100">
                Muhamad &lt;catering.tiska@gmail.com&gt;
              </p>
            </div>
            <div className="mt-2 border-b border-zinc-100 pb-3 dark:border-zinc-800">
              <p className="text-xs text-zinc-500">To</p>
              <p className="text-sm text-zinc-900 dark:text-zinc-100">
                {SAMPLE_VALUES.first_name} {SAMPLE_VALUES.last_name} &lt;{SAMPLE_VALUES.email}&gt;
              </p>
            </div>
            <div className="mt-2 border-b border-zinc-100 pb-3 dark:border-zinc-800">
              <p className="text-xs text-zinc-500">Subject</p>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {subjectPreview || (
                  <span className="text-zinc-400">— belum ada subject —</span>
                )}
              </p>
            </div>
            <div className="mt-3">
              <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-800 dark:text-zinc-200">
                {bodyPreview || (
                  <span className="text-zinc-400">— body kosong —</span>
                )}
              </pre>
            </div>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Sample values: Bella Hs / Kreston Indonesia / HR Manager. Saat kirim, value diganti dari kontak masing-masing.
          </p>
        </div>
      </div>

      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400">
          ✓ Saved
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-50 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? "Menyimpan..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
