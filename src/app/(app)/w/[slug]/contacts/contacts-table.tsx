"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import {
  Tag as TagIcon,
  Trash2,
  Loader2,
  X,
  Check,
  ChevronsUp,
  AlertTriangle,
  Archive,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import type { ContactWithWorkspaceData } from "@/lib/contacts";
import type { PipelineStage } from "@/lib/workspace-constants";
import { Badge } from "@/components/ui/badge";
import { Select, SelectItem } from "@/components/ui/select";
import {
  bulkAddTags,
  bulkChangeStage,
  bulkDelete,
  bulkArchive,
  bulkUnarchive,
} from "./bulk-actions";
import { bulkEnrichContacts } from "./enrich-actions";

type Props = {
  slug: string;
  contacts: ContactWithWorkspaceData[];
  stages: PipelineStage[];
};

type Mode =
  | null
  | "tag"
  | "stage"
  | "delete"
  | "archive"
  | "unarchive"
  | "enrich";

export function ContactsTable({ slug, contacts, stages }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>(null);
  const [tagInput, setTagInput] = useState("");
  const [stageInput, setStageInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    | { type: "ok"; msg: string }
    | { type: "err"; msg: string }
    | null
  >(null);

  const stageById = useMemo(
    () => new Map(stages.map((s) => [s.id, s])),
    [stages],
  );

  const allChecked =
    contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  const someChecked = !allChecked && contacts.some((c) => selected.has(c.id));

  function toggleAll() {
    if (allChecked) {
      const next = new Set(selected);
      for (const c of contacts) next.delete(c.id);
      setSelected(next);
    } else {
      const next = new Set(selected);
      for (const c of contacts) next.add(c.id);
      setSelected(next);
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function clearSelection() {
    setSelected(new Set());
    setMode(null);
    setFeedback(null);
  }

  function showFeedback(type: "ok" | "err", msg: string) {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  }

  function runBulk(fn: () => Promise<{ ok: boolean; error?: string; affected?: number }>) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        showFeedback("ok", `${res.affected ?? 0} kontak ter-update`);
        setMode(null);
        setTagInput("");
        setStageInput("");
        if (mode === "delete") setSelected(new Set());
      } else {
        showFeedback("err", res.error ?? "Gagal");
      }
    });
  }

  function runEnrich() {
    startTransition(async () => {
      const res = await bulkEnrichContacts(slug, Array.from(selected));
      if (res.error) {
        showFeedback("err", res.error);
        return;
      }
      const parts = [`${res.verified ?? 0} terverifikasi`];
      if (res.email_updated) parts.push(`${res.email_updated} email diperbarui`);
      if (res.risky) parts.push(`${res.risky} berisiko`);
      if (res.skipped) parts.push(`${res.skipped} dilewati`);
      parts.push(`${res.credits_used ?? 0} kredit`);
      showFeedback("ok", parts.join(" · "));
      setMode(null);
    });
  }

  const ids = Array.from(selected);
  // If everything in the selection is already archived, surface an Unarchive
  // action instead of Archive. Mixed selections show Archive (the more
  // common path).
  const allSelectedArchived =
    ids.length > 0 &&
    ids.every((id) => {
      const c = contacts.find((x) => x.id === id);
      return c ? !!c.archived_at : false;
    });

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="label-eyebrow border-b border-border bg-surface-sunken text-left">
                <th className="w-10 px-5 py-3">
                  <CheckboxInput
                    checked={allChecked}
                    indeterminate={someChecked}
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Company</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Stage</th>
                <th className="px-5 py-3 font-semibold">Tags</th>
                <th className="px-5 py-3 font-semibold">Last Contacted</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => {
                const fullName = [c.first_name, c.last_name]
                  .filter(Boolean)
                  .join(" ");
                const stage = c.workspace_data?.lead_stage_id
                  ? stageById.get(c.workspace_data.lead_stage_id)
                  : null;
                const lastContacted = c.workspace_data?.last_contacted_at;
                const isSel = selected.has(c.id);
                return (
                  <tr
                    key={c.id}
                    className={`group border-b border-border transition-colors last:border-0 ${
                      isSel
                        ? "border-l-2 border-l-accent bg-accent-soft"
                        : "hover:bg-surface-hover"
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <CheckboxInput
                        checked={isSel}
                        onChange={() => toggleOne(c.id)}
                        aria-label={`Select ${c.email}`}
                      />
                    </td>
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/w/${slug}/contacts/${c.id}`}
                        className="block min-w-0"
                      >
                        <div className="font-medium text-ink transition-colors group-hover:text-ink">
                          {fullName || c.email}
                        </div>
                        {fullName && (
                          <div className="mt-0.5 truncate text-xs text-muted">
                            {c.email}
                          </div>
                        )}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="text-ink">
                        {c.company ?? <span className="text-faint">—</span>}
                      </div>
                      {c.position && (
                        <div className="mt-0.5 text-xs text-muted">
                          {c.position}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <VerifyMark c={c} />
                    </td>
                    <td className="px-5 py-3.5">
                      {stage ? (
                        <Badge
                          variant="outline"
                          dotColor={stage.color}
                          className="font-normal"
                        >
                          {stage.name}
                        </Badge>
                      ) : (
                        <span className="text-xs text-faint">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.slice(0, 3).map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="font-normal"
                          >
                            {tag}
                          </Badge>
                        ))}
                        {c.tags.length > 3 && (
                          <span className="text-xs text-faint">
                            +{c.tags.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted">
                      {lastContacted
                        ? new Date(lastContacted).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating action bar */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="pointer-events-auto w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-lg)]">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-action px-2 text-xs font-semibold tabular text-on-action">
                  {selected.size}
                </span>
                <span className="text-sm font-medium text-ink-secondary">
                  dipilih
                </span>
              </div>

              <div className="ml-auto flex items-center gap-1.5">
                <ActionBtn
                  active={mode === "tag"}
                  onClick={() => setMode(mode === "tag" ? null : "tag")}
                  icon={TagIcon}
                  label="Tag"
                />
                <ActionBtn
                  active={mode === "stage"}
                  onClick={() => setMode(mode === "stage" ? null : "stage")}
                  icon={ChevronsUp}
                  label="Stage"
                />
                {allSelectedArchived ? (
                  <ActionBtn
                    active={mode === "unarchive"}
                    onClick={() =>
                      setMode(mode === "unarchive" ? null : "unarchive")
                    }
                    icon={RotateCcw}
                    label="Restore"
                  />
                ) : (
                  <ActionBtn
                    active={mode === "archive"}
                    onClick={() =>
                      setMode(mode === "archive" ? null : "archive")
                    }
                    icon={Archive}
                    label="Archive"
                  />
                )}
                <ActionBtn
                  active={mode === "enrich"}
                  onClick={() => setMode(mode === "enrich" ? null : "enrich")}
                  icon={ShieldCheck}
                  label="Verifikasi"
                />
                <ActionBtn
                  active={mode === "delete"}
                  onClick={() => setMode(mode === "delete" ? null : "delete")}
                  icon={Trash2}
                  label="Delete"
                  destructive
                />
                <button
                  type="button"
                  onClick={clearSelection}
                  className="ml-1 inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-ink"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              </div>
            </div>

            {/* Mode-specific input */}
            {mode === "tag" && (
              <div className="flex items-center gap-2 border-t border-border bg-surface-sunken/60 px-4 py-3">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Tag (pisahkan koma): hr, bogor, hot-lead"
                  className="h-8 flex-1 rounded-md border border-border bg-surface px-2.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
                />
                <button
                  type="button"
                  disabled={pending || !tagInput.trim()}
                  onClick={() =>
                    runBulk(() => bulkAddTags(slug, ids, tagInput))
                  }
                  className="inline-flex h-8 items-center gap-1 rounded-md bg-action px-3 text-xs font-semibold text-on-action transition-colors hover:bg-action-hover disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  Apply ke {ids.length}
                </button>
              </div>
            )}

            {mode === "stage" && (
              <div className="flex items-center gap-2 border-t border-border bg-surface-sunken/60 px-4 py-3">
                <div className="flex-1">
                  <Select
                    value={stageInput}
                    onValueChange={setStageInput}
                    placeholder="Pilih stage..."
                    size="sm"
                    dotColor={
                      stageInput
                        ? stageById.get(stageInput)?.color
                        : undefined
                    }
                  >
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.id} dotColor={s.color}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
                <button
                  type="button"
                  disabled={pending || !stageInput}
                  onClick={() =>
                    runBulk(() => bulkChangeStage(slug, ids, stageInput))
                  }
                  className="inline-flex h-8 items-center gap-1 rounded-md bg-action px-3 text-xs font-semibold text-on-action transition-colors hover:bg-action-hover disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  Apply ke {ids.length}
                </button>
              </div>
            )}

            {mode === "delete" && (
              <div className="flex items-center gap-2 border-t border-border bg-danger-soft px-4 py-3">
                <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
                <p className="flex-1 text-xs text-danger-text">
                  Hapus {ids.length} kontak? Soft-delete — masih bisa dipulihkan
                  dari DB.
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => runBulk(() => bulkDelete(slug, ids))}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-danger-soft bg-surface px-3 text-xs font-semibold text-danger-text transition-colors hover:bg-danger-soft disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                  Hapus
                </button>
              </div>
            )}

            {mode === "archive" && (
              <div className="flex items-center gap-2 border-t border-border bg-warning-soft px-4 py-3">
                <Archive className="h-4 w-4 shrink-0 text-warning" />
                <p className="flex-1 text-xs text-warning-text">
                  Archive {ids.length} kontak? Mereka gak akan masuk queue baru
                  dan pending sends auto-skipped. Bisa di-restore kapan aja.
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => runBulk(() => bulkArchive(slug, ids))}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-warning-soft bg-surface px-3 text-xs font-semibold text-warning-text transition-colors hover:bg-warning-soft disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Archive className="h-3 w-3" />
                  )}
                  Archive
                </button>
              </div>
            )}

            {mode === "unarchive" && (
              <div className="flex items-center gap-2 border-t border-border bg-success-soft px-4 py-3">
                <RotateCcw className="h-4 w-4 shrink-0 text-success-text" />
                <p className="flex-1 text-xs text-success-text">
                  Restore {ids.length} kontak? Status di-set ke active dan
                  mereka jadi eligible buat queue lagi.
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => runBulk(() => bulkUnarchive(slug, ids))}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-success-soft bg-surface px-3 text-xs font-semibold text-success-text transition-colors hover:bg-success-soft disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  Restore
                </button>
              </div>
            )}

            {mode === "enrich" && (
              <div className="flex items-center gap-2 border-t border-border bg-info-soft px-4 py-3">
                <ShieldCheck className="h-4 w-4 shrink-0 text-info" />
                <p className="flex-1 text-xs text-info-text">
                  Verifikasi {ids.length} kontak via Apollo? Email yang berubah
                  diperbarui otomatis (lama disimpan ke alt), yang gagal ditandai
                  berisiko. Yang baru diverifikasi (&lt;30 hari) dilewati gratis.
                  Sekitar 1 kredit per kontak yang dicek.
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={runEnrich}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-info-soft bg-surface px-3 text-xs font-semibold text-info-text transition-colors hover:bg-info-soft disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-3 w-3" />
                  )}
                  Verifikasi sekarang
                </button>
              </div>
            )}

            {feedback && (
              <div
                className={`border-t px-4 py-2 text-xs font-medium ${
                  feedback.type === "ok"
                    ? "border-success-soft bg-success-soft text-success-text"
                    : "border-danger-soft bg-danger-soft text-danger-text"
                }`}
              >
                {feedback.msg}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function VerifyMark({ c }: { c: ContactWithWorkspaceData }) {
  if (c.email_verified_at) {
    return (
      <span
        title={`Email terverifikasi Apollo${c.email_status ? ` (${c.email_status})` : ""}`}
        className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success-text"
      >
        <ShieldCheck className="h-3 w-3" />
        Verified
      </span>
    );
  }
  if (c.enriched_at) {
    return (
      <span
        title={`Dicek Apollo tapi email tidak terverifikasi${c.email_status ? ` (${c.email_status})` : ""}`}
        className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning-text"
      >
        <ShieldAlert className="h-3 w-3" />
        Berisiko
      </span>
    );
  }
  return (
    <span
      title="Belum diverifikasi"
      className="text-xs text-faint"
    >
      —
    </span>
  );
}

function ActionBtn({
  active,
  onClick,
  icon: Icon,
  label,
  destructive,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof TagIcon;
  label: string;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors ${
        active
          ? destructive
            ? "bg-danger-soft text-danger-text"
            : "bg-surface-sunken text-ink"
          : destructive
            ? "text-danger-text hover:bg-danger-soft"
            : "text-ink-secondary hover:bg-surface-sunken hover:text-ink"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function CheckboxInput({
  checked,
  indeterminate,
  onChange,
  ...rest
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "type" | "checked">) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = !checked && Boolean(indeterminate);
      }}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className="size-4 cursor-pointer rounded-sm border-border-strong accent-action"
      {...rest}
    />
  );
}
