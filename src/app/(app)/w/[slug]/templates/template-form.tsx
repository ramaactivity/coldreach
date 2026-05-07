"use client";

import { useActionState, useState } from "react";
import { Mail, AlertTriangle, Sparkles } from "lucide-react";
import {
  SUPPORTED_VARIABLES,
  extractVariables,
  renderPreview,
  type Template,
} from "@/lib/template-helpers";
import { Button } from "@/components/ui/button";
import {
  FieldLabel,
  FieldError,
  FieldDescription,
  Input,
  Textarea,
} from "@/components/ui/input";
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
  const [bodyEn, setBodyEn] = useState(initialTemplate?.body_plain_en ?? "");

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
        {/* Editor */}
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="name" required>
                Nama Template
              </FieldLabel>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Cold Outreach Catering"
              />
              <FieldError>{state.fieldErrors?.name}</FieldError>
            </div>
            <div>
              <FieldLabel htmlFor="category">Kategori</FieldLabel>
              <Input
                id="category"
                name="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="cold-outreach, follow-up"
              />
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="subject_lines" required hint="Satu per baris">
              Subject Lines
            </FieldLabel>
            <Textarea
              id="subject_lines"
              name="subject_lines"
              value={subjects}
              onChange={(e) => setSubjects(e.target.value)}
              required
              rows={3}
              className="font-mono text-xs"
              placeholder={`Penawaran catering untuk {company}\nIde catering untuk event {company}\nKolaborasi catering, {first_name}?`}
            />
            <FieldDescription>
              Sistem random pilih saat kirim (A/B testing manual). Variable dalam{" "}
              <code className="rounded bg-zinc-100 px-1 font-mono text-[11px] dark:bg-zinc-800">
                {`{curly_braces}`}
              </code>
              .
            </FieldDescription>
            <FieldError>{state.fieldErrors?.subject_lines}</FieldError>
          </div>

          <div>
            <FieldLabel htmlFor="body_plain" required>
              Body
            </FieldLabel>
            <Textarea
              id="body_plain"
              name="body_plain"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              rows={14}
              className="font-mono text-xs leading-relaxed"
              placeholder={`Halo {first_name},\n\n{ai_opener}\n\nKenalin, saya Muhamad dari Tiska Catering.\n...`}
            />
            <FieldDescription>
              Plain text lebih bagus untuk cold email — masuk inbox lebih
              konsisten. Variable otomatis di-replace saat kirim per kontak.
            </FieldDescription>
            <FieldError>{state.fieldErrors?.body_plain}</FieldError>
          </div>

          {/* Optional English variant */}
          <div>
            <FieldLabel htmlFor="body_plain_en">
              Body (English) <span className="font-normal text-zinc-500">— opsional</span>
            </FieldLabel>
            <Textarea
              id="body_plain_en"
              name="body_plain_en"
              value={bodyEn}
              onChange={(e) => setBodyEn(e.target.value)}
              rows={10}
              className="font-mono text-xs leading-relaxed"
              placeholder={`Hi {first_name},\n\n{ai_opener}\n\nI'm Muhamad from Tiska Catering.\n...`}
            />
            <FieldDescription>
              Kalau diisi, kontak yang ke-detect Bahasa Inggris (domain
              .com/.org/.io tanpa nama Indonesian) akan dapat versi ini. Kosong
              berarti semua kontak pakai body utama di atas.
            </FieldDescription>
          </div>

          {/* Variables */}
          <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-4 dark:border-zinc-800/80 dark:bg-zinc-900/60">
            <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              <Sparkles className="h-3 w-3 text-amber-500" />
              Variables tersedia
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUPPORTED_VARIABLES.map((v) => {
                const used = detectedVariables.includes(v);
                return (
                  <code
                    key={v}
                    className={`rounded-md px-2 py-1 font-mono text-[11px] transition-colors ${
                      used
                        ? "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800/40"
                        : "bg-white text-zinc-500 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700"
                    }`}
                  >
                    {`{${v}}`}
                  </code>
                );
              })}
            </div>
            {unsupported.length > 0 && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  Variable gak dikenal:{" "}
                  {unsupported.map((v) => `{${v}}`).join(", ")}. Akan
                  tampak literal saat kirim.
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900">
            <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50/60 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/60">
              <Mail className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                Preview · sample values
              </p>
            </div>
            <div className="p-5">
              <div className="space-y-2 border-b border-zinc-100 pb-3 text-xs dark:border-zinc-800">
                <Field
                  label="From"
                  value="Muhamad <catering.tiska@gmail.com>"
                />
                <Field
                  label="To"
                  value={`${SAMPLE_VALUES.first_name} ${SAMPLE_VALUES.last_name} <${SAMPLE_VALUES.email}>`}
                />
                <Field
                  label="Subject"
                  value={
                    subjectPreview || (
                      <span className="text-zinc-400">— belum ada subject —</span>
                    )
                  }
                  emphasis
                />
              </div>
              <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                {bodyPreview || (
                  <span className="italic text-zinc-400">— body kosong —</span>
                )}
              </pre>
            </div>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            Sample: Bella Hs / Kreston Indonesia / HR Manager. Saat kirim,
            value diganti dari kontak masing-masing.
          </p>
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400">
          ✓ Saved
        </p>
      )}

      <div className="flex justify-end pt-2">
        <Button type="submit" loading={pending} disabled={pending}>
          {pending ? "Menyimpan..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <span
        className={
          emphasis
            ? "text-sm font-medium text-zinc-900 dark:text-zinc-100"
            : "text-zinc-700 dark:text-zinc-300"
        }
      >
        {value}
      </span>
    </div>
  );
}
