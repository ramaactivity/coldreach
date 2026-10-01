"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { toast } from "@/components/ui/toast-provider";
import { displayCompany } from "@/lib/template-helpers";
import {
  approveDrafts,
  cancelDraft,
  updateDraft,
  updateDraftSettings,
} from "./actions";

export type Draft = {
  id: string;
  /** Approved/auto: already in the send queue, only edit/cancel apply. */
  scheduled: boolean;
  /** Deferred by cooldown/domain caps until this WIB date. */
  scheduledFor: string | null;
  subject: string;
  body: string;
  createdAt: string;
  email: string;
  company: string | null;
  person: string | null;
  position: string | null;
};

type Result = { ok: true; count?: number } | { ok: false; error: string };

function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, success: (r: { count?: number }) => string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(success(r));
      else toast.error(r.error);
    });
  return [pending, run] as const;
}

export function DraftSettings({
  slug,
  approvalMode,
  dailyNewCap,
}: {
  slug: string;
  approvalMode: "manual" | "auto";
  dailyNewCap: number | null;
}) {
  const [auto, setAuto] = useState(approvalMode === "auto");
  const [cap, setCap] = useState(dailyNewCap?.toString() ?? "");
  const [pending, run] = useAction();
  const save = (nextAuto: boolean) =>
    run(
      () => updateDraftSettings(slug, nextAuto ? "auto" : "manual", cap.trim() === "" ? null : Number(cap)),
      () => "Pengaturan disimpan",
    );

  return (
    <div className="mb-6 flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <label className="flex items-center gap-3 text-sm text-ink">
        <Toggle
          checked={auto}
          disabled={pending}
          aria-label="Kirim otomatis tanpa persetujuan"
          onCheckedChange={(v) => {
            setAuto(v);
            save(v);
          }}
        />
        <span>
          Kirim otomatis tanpa persetujuan
          <span className="block text-[12px] text-muted">
            {auto ? "Draf baru langsung masuk antrean." : "Draf baru menunggu persetujuan di halaman ini."}
          </span>
        </span>
      </label>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save(auto);
        }}
      >
        <label className="text-[12px] text-muted">
          Email baru per hari
          <Input
            type="number"
            min={0}
            max={500}
            value={cap}
            placeholder="tanpa batas"
            onChange={(e) => setCap(e.target.value)}
            className="mt-1 w-32"
          />
        </label>
        <Button type="submit" variant="secondary" size="md" loading={pending}>
          Simpan
        </Button>
      </form>
    </div>
  );
}

export function DraftList({ slug, drafts }: { slug: string; drafts: Draft[] }) {
  const [pending, run] = useAction();
  const scheduled = drafts[0]?.scheduled;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-medium text-muted">
          {scheduled
            ? `Dijadwalkan, belum terkirim (${drafts.length})`
            : `Menunggu persetujuan (${drafts.length})`}
        </h2>
        {!scheduled && (
          <Button
            size="sm"
            loading={pending}
            onClick={() => run(() => approveDrafts(slug, null), (r) => `${r.count ?? 0} draf disetujui`)}
          >
            <Check className="h-4 w-4" />
            Setujui semua
          </Button>
        )}
      </div>
      {drafts.map((d) => (
        <DraftCard key={d.id} slug={slug} draft={d} />
      ))}
    </section>
  );
}

function DraftCard({ slug, draft }: { slug: string; draft: Draft }) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [pending, run] = useAction();

  return (
    <article className="rounded-lg border border-border bg-surface p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-ink">
            {displayCompany(draft.company) || draft.email}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {draft.email}
            {draft.person && ` · ${draft.person}`}
            {draft.position && ` (${draft.position})`}
          </p>
          {draft.scheduled && (
            <p className="mt-1 text-[12px] text-muted">
              {draft.scheduledFor
                ? `Ditunda sampai ${draft.scheduledFor} (cooldown/batas domain)`
                : "Terkirim otomatis di jendela kirim berikutnya"}
            </p>
          )}
        </div>
        {!editing && (
          <div className="flex shrink-0 gap-2">
            {!draft.scheduled && (
              <Button
                size="sm"
                loading={pending}
                onClick={() => run(() => approveDrafts(slug, [draft.id]), () => "Draf disetujui")}
              >
                <Check className="h-4 w-4" />
                Setujui
              </Button>
            )}
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
              Ubah
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => cancelDraft(slug, draft.id), () => "Draf dibatalkan")}
            >
              <X className="h-4 w-4" />
              Batalkan
            </Button>
          </div>
        )}
      </header>

      {editing ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              async () => {
                const r = await updateDraft(slug, draft.id, subject, body);
                if (r.ok) setEditing(false);
                return r;
              },
              () => "Draf diperbarui",
            );
          }}
        >
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subjek" />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Isi email"
            className="min-h-64 font-[inherit] leading-relaxed"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSubject(draft.subject);
                setBody(draft.body);
                setEditing(false);
              }}
            >
              Batal
            </Button>
            <Button type="submit" size="sm" loading={pending}>
              Simpan
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 rounded-md bg-surface-sunken p-4">
          <p className="text-sm font-medium text-ink">{draft.subject}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-secondary">{draft.body}</p>
        </div>
      )}
    </article>
  );
}
