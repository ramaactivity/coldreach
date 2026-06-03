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
      <div className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-[0_1px_2px_0_rgb(0_0_0/0.03)] dark:border-zinc-800/70 dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200/70 bg-zinc-50/60 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
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
                    className={`group border-b border-zinc-100 transition-colors last:border-0 dark:border-zinc-800/60 ${
                      isSel
                        ? "bg-blue-50/50 dark:bg-blue-950/10"
                        : "hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40"
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
                        <div className="font-medium text-zinc-900 transition-colors group-hover:text-zinc-950 dark:text-zinc-100">
                          {fullName || c.email}
                        </div>
                        {fullName && (
                          <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {c.email}
                          </div>
                        )}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="text-zinc-900 dark:text-zinc-100">
                        {c.company ?? <span className="text-zinc-400">—</span>}
                      </div>
                      {c.position && (
                        <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
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
                        <span className="text-xs text-zinc-400">—</span>
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
                          <span className="text-xs text-zinc-400">
                            +{c.tags.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-zinc-500 dark:text-zinc-400">
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
          <div className="pointer-events-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl ring-1 ring-black/5 dark:border-zinc-700 dark:bg-zinc-900 dark:ring-white/5">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-zinc-900 px-2 text-xs font-semibold tabular-nums text-white dark:bg-zinc-100 dark:text-zinc-900">
                  {selected.size}
                </span>
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
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
                  className="ml-1 inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              </div>
            </div>

            {/* Mode-specific input */}
            {mode === "tag" && (
              <div className="flex items-center gap-2 border-t border-zinc-100 bg-zinc-50/60 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/40">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Tag (pisahkan koma): hr, bogor, hot-lead"
                  className="h-8 flex-1 rounded-md border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <button
                  type="button"
                  disabled={pending || !tagInput.trim()}
                  onClick={() =>
                    runBulk(() => bulkAddTags(slug, ids, tagInput))
                  }
                  className="inline-flex h-8 items-center gap-1 rounded-md bg-zinc-900 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
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
              <div className="flex items-center gap-2 border-t border-zinc-100 bg-zinc-50/60 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/40">
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
                  className="inline-flex h-8 items-center gap-1 rounded-md bg-zinc-900 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
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
              <div className="flex items-center gap-2 border-t border-zinc-100 bg-red-50/60 px-4 py-3 dark:border-red-900/30 dark:bg-red-950/20">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                <p className="flex-1 text-xs text-red-700 dark:text-red-400">
                  Hapus {ids.length} kontak? Soft-delete — masih bisa dipulihkan
                  dari DB.
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => runBulk(() => bulkDelete(slug, ids))}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 shadow-sm transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/30"
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
              <div className="flex items-center gap-2 border-t border-zinc-100 bg-amber-50/60 px-4 py-3 dark:border-amber-900/30 dark:bg-amber-950/20">
                <Archive className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                <p className="flex-1 text-xs text-amber-800 dark:text-amber-300">
                  Archive {ids.length} kontak? Mereka gak akan masuk queue baru
                  dan pending sends auto-skipped. Bisa di-restore kapan aja.
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => runBulk(() => bulkArchive(slug, ids))}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-amber-200 bg-white px-3 text-xs font-semibold text-amber-800 shadow-sm transition-colors hover:bg-amber-50 disabled:opacity-50 dark:border-amber-900/50 dark:bg-zinc-900 dark:text-amber-400 dark:hover:bg-amber-950/30"
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
              <div className="flex items-center gap-2 border-t border-zinc-100 bg-emerald-50/60 px-4 py-3 dark:border-emerald-900/30 dark:bg-emerald-950/20">
                <RotateCcw className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
                <p className="flex-1 text-xs text-emerald-800 dark:text-emerald-300">
                  Restore {ids.length} kontak? Status di-set ke active dan
                  mereka jadi eligible buat queue lagi.
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => runBulk(() => bulkUnarchive(slug, ids))}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-800 shadow-sm transition-colors hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900/50 dark:bg-zinc-900 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
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
              <div className="flex items-center gap-2 border-t border-zinc-100 bg-blue-50/60 px-4 py-3 dark:border-blue-900/30 dark:bg-blue-950/20">
                <ShieldCheck className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" />
                <p className="flex-1 text-xs text-blue-800 dark:text-blue-300">
                  Verifikasi {ids.length} kontak via Apollo? Email yang berubah
                  diperbarui otomatis (lama disimpan ke alt), yang gagal ditandai
                  berisiko. Yang baru diverifikasi (&lt;30 hari) dilewati gratis.
                  Sekitar 1 kredit per kontak yang dicek.
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={runEnrich}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-200 bg-white px-3 text-xs font-semibold text-blue-800 shadow-sm transition-colors hover:bg-blue-50 disabled:opacity-50 dark:border-blue-900/50 dark:bg-zinc-900 dark:text-blue-400 dark:hover:bg-blue-950/30"
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
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400"
                    : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
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
        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/25"
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
        className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-500/25"
      >
        <ShieldAlert className="h-3 w-3" />
        Berisiko
      </span>
    );
  }
  return (
    <span
      title="Belum diverifikasi"
      className="text-xs text-zinc-400 dark:text-zinc-600"
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
            ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
            : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
          : destructive
            ? "text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
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
      className="h-4 w-4 cursor-pointer rounded border-zinc-300 bg-white text-zinc-900 shadow-sm transition-colors focus:ring-2 focus:ring-zinc-900/30 focus:ring-offset-0 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-zinc-100/30"
      {...rest}
    />
  );
}
