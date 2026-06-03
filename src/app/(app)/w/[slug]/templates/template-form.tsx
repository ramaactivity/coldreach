"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Mail, AlertTriangle, Sparkles, PenLine } from "lucide-react";
import {
  SUPPORTED_VARIABLES,
  extractVariables,
  renderPreview,
  type Template,
} from "@/lib/template-helpers";
import {
  renderSignatureHtml,
  isSignatureEmpty,
  type SignatureData,
} from "@/lib/signature";
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
  workspace,
  slug,
}: {
  initialTemplate?: Template;
  action: (state: TemplateFormState, formData: FormData) => Promise<TemplateFormState>;
  submitLabel: string;
  workspace: {
    signature_data: SignatureData | null;
    color_theme: string;
  };
  slug: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const [name, setName] = useState(initialTemplate?.name ?? "");
  const [category, setCategory] = useState(initialTemplate?.category ?? "");
  const [subjects, setSubjects] = useState(
    initialTemplate?.subject_lines?.join("\n") ?? "",
  );
  const [subjectsEn, setSubjectsEn] = useState(
    initialTemplate?.subject_lines_en?.join("\n") ?? "",
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

  const signatureEmpty = isSignatureEmpty(workspace.signature_data);
  const signatureHtml = useMemo(
    () =>
      renderSignatureHtml(workspace.signature_data, {
        fallbackBrandColor: workspace.color_theme,
      }),
    [workspace.signature_data, workspace.color_theme],
  );
  // Defer client-only render — see signature-form for full rationale.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Canonical "isHydrated" flip — intentionally a setState in effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Heuristic: detect inline-signature patterns in the body that would
  // duplicate against the workspace signature when sent.
  const inlineSignatureLikely = useMemo(() => {
    const lower = body.toLowerCase();
    return (
      /\n\s*-- ?\n/.test(body) ||
      /(hormat saya|best regards|salam hangat|cheers,|regards,|salam,)/.test(lower)
    );
  }, [body]);

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
            <FieldLabel htmlFor="subject_lines" required hint="Satu per baris = satu variant">
              Subject Lines
            </FieldLabel>
            <Textarea
              id="subject_lines"
              name="subject_lines"
              value={subjects}
              onChange={(e) => setSubjects(e.target.value)}
              required
              rows={4}
              className="font-mono text-xs"
              placeholder={`Penawaran catering untuk {company}\nIde catering untuk event {company}\nKolaborasi catering, {first_name}?`}
            />

            {/* Variant chips — surfaces each non-empty line as its own
                A/B variant so the user actually sees what's being rotated. */}
            <SubjectVariantList raw={subjects} />

            <FieldDescription>
              Tulis 1 baris untuk subject tunggal, atau{" "}
              <strong>multiple baris untuk A/B testing</strong> — sistem
              random pilih satu variant tiap kirim. Variable{" "}
              <code className="rounded bg-surface-sunken px-1 font-mono text-[11px]">
                {`{curly_braces}`}
              </code>{" "}
              di-replace per kontak.
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
              Signature workspace (logo, kontak, sosmed) <strong>otomatis
              di-append</strong> di bawah body — atur di{" "}
              <strong>Settings → Email Signature</strong>, gak perlu tulis
              di sini.
            </FieldDescription>
            <FieldError>{state.fieldErrors?.body_plain}</FieldError>
          </div>

          {/* Optional English variants — subject + body */}
          <div>
            <FieldLabel htmlFor="subject_lines_en" hint="Satu per baris = satu variant">
              Subject Lines (English){" "}
              <span className="font-normal text-muted">— opsional</span>
            </FieldLabel>
            <Textarea
              id="subject_lines_en"
              name="subject_lines_en"
              value={subjectsEn}
              onChange={(e) => setSubjectsEn(e.target.value)}
              rows={4}
              className="font-mono text-xs"
              placeholder={`Catering for your {company} events\nLet's collaborate on your next event, {first_name}\nProfessional catering for {company}`}
            />
            <SubjectVariantList raw={subjectsEn} />
            <FieldDescription>
              Subject untuk kontak yang ke-detect Bahasa Inggris. Kosong berarti
              kontak EN pakai Subject Lines (Indonesia) di atas.
            </FieldDescription>
          </div>

          <div>
            <FieldLabel htmlFor="body_plain_en">
              Body (English) <span className="font-normal text-muted">— opsional</span>
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
              Otomatis dipakai untuk kontak yang ke-detect Bahasa Inggris (domain
              perusahaan/internasional; domain .id & webmail seperti gmail
              dianggap Indonesia). Kosong berarti semua kontak pakai body utama.
            </FieldDescription>
          </div>

          {/* Variables */}
          <div className="rounded-lg border border-border bg-surface-sunken p-4">
            <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-secondary">
              <Sparkles className="h-3 w-3 text-warning" />
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
                        ? "bg-success-soft text-success-text ring-1 ring-inset ring-success-soft"
                        : "bg-surface text-muted ring-1 ring-inset ring-border"
                    }`}
                  >
                    {`{${v}}`}
                  </code>
                );
              })}
            </div>
            {unsupported.length > 0 && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-warning">
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
        <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-lg border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border bg-surface-sunken px-4 py-2.5">
              <Mail className="h-3.5 w-3.5 text-muted" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                Preview · sample values
              </p>
            </div>
            <div className="p-5">
              <div className="space-y-2 border-b border-border pb-3 text-xs">
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
                      <span className="text-faint">— belum ada subject —</span>
                    )
                  }
                  emphasis
                />
              </div>
              <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">
                {bodyPreview || (
                  <span className="italic text-faint">— body kosong —</span>
                )}
              </pre>

              {/* Workspace signature — auto-appended at send time */}
              {signatureEmpty ? (
                <div className="mt-5 rounded-lg border border-dashed border-warning bg-warning-soft p-3 text-xs text-warning-text">
                  <div className="mb-1 flex items-center gap-1.5 font-semibold">
                    <PenLine className="h-3 w-3" />
                    Workspace signature belum di-set
                  </div>
                  <p className="leading-relaxed">
                    Set di{" "}
                    <a
                      href={`/w/${slug}/settings`}
                      className="font-medium underline hover:no-underline"
                    >
                      Settings → Email Signature
                    </a>{" "}
                    biar logo + kontak + sosmed otomatis muncul di setiap
                    email — gak perlu tulis ulang di tiap template.
                  </p>
                </div>
              ) : (
                <div className="mt-5">
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    <PenLine className="h-3 w-3" />
                    Auto-appended dari workspace signature
                  </div>
                  {mounted ? (
                    <div
                      className="overflow-x-auto rounded-lg border border-border bg-surface-sunken/40 p-3"
                      dangerouslySetInnerHTML={{ __html: signatureHtml }}
                    />
                  ) : (
                    <div className="h-32 animate-pulse rounded-lg bg-surface-sunken" />
                  )}
                </div>
              )}
            </div>
          </div>

          {inlineSignatureLikely && !signatureEmpty && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-warning-soft bg-warning-soft p-2.5 text-xs text-warning-text">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                Body template lo kayaknya udah punya signature inline
                (&ldquo;Hormat saya&rdquo; / nama / kontak). Sistem akan
                tetap append workspace signature di bawah body —
                kemungkinan duplikat. Hapus signature dari body biar
                kirim sekali aja.
              </span>
            </div>
          )}

          <p className="mt-2 text-xs leading-relaxed text-muted">
            Sample: Bella Hs / Kreston Indonesia / HR Manager. Saat kirim,
            value diganti dari kontak masing-masing.
          </p>
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg border border-danger-soft bg-danger-soft p-3 text-xs font-medium text-danger-text">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-lg border border-success-soft bg-success-soft p-3 text-xs font-medium text-success-text">
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
      <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </span>
      <span
        className={
          emphasis
            ? "text-sm font-medium text-ink"
            : "text-ink-secondary"
        }
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Surfaces each non-empty line of the subject textarea as a numbered chip
 * so the user can actually see what gets rotated. Falls back to a single
 * neutral status when only one (or zero) variants exist.
 */
function SubjectVariantList({ raw }: { raw: string }) {
  const variants = raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  if (variants.length === 0) {
    return (
      <div className="mt-2 text-[11px] text-faint">
        Belum ada subject. Tulis minimal satu di atas.
      </div>
    );
  }

  if (variants.length === 1) {
    return (
      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-2.5 py-1 text-[11px] text-muted">
        <Sparkles className="h-3 w-3" />
        1 variant aktif · tambahin baris lagi untuk A/B testing
      </div>
    );
  }

  return (
    <div className="mt-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-success-text">
        <Sparkles className="h-3 w-3" />
        {variants.length} variant aktif — sistem rotate random per kirim
      </div>
      <ul className="space-y-1">
        {variants.map((v, i) => (
          <li
            key={i}
            className="flex items-start gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-ink-secondary"
          >
            <span className="inline-flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded bg-surface-sunken px-1 text-[9px] font-semibold uppercase tracking-wider text-muted">
              {String.fromCharCode(65 + i)}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
              {v}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
