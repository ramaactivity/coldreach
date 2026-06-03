"use client";

import { useActionState, useState } from "react";
import { Users, Tag, Sparkles, Check, Shield, Flame } from "lucide-react";
import {
  FieldLabel,
  FieldError,
  FieldDescription,
  Input,
} from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import { Button } from "@/components/ui/button";
import type { CreateQueueState } from "../actions";

const INITIAL_STATE: CreateQueueState = {};

export function CreateQueueForm({
  action,
  templates,
  tags,
  totalActiveContacts,
  workspaceDefaults,
}: {
  action: (state: CreateQueueState, formData: FormData) => Promise<CreateQueueState>;
  templates: Array<{ id: string; name: string; attachmentCount: number }>;
  tags: string[];
  totalActiveContacts: number;
  workspaceDefaults: {
    schedule_start_time: string;
    schedule_end_time: string;
    daily_target: number;
  };
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const [audienceType, setAudienceType] = useState<"all" | "tag">("all");
  const [selectedTag, setSelectedTag] = useState(tags[0] ?? "");
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>(
    templates[0] ? [templates[0].id] : [],
  );

  return (
    <form action={formAction} className="space-y-6">
      {/* Name */}
      <div>
        <FieldLabel htmlFor="name" required>
          Nama Queue
        </FieldLabel>
        <Input
          id="name"
          name="name"
          type="text"
          required
          placeholder="Bogor HR Cold Outreach Q2"
        />
        <FieldError>{state.fieldErrors?.name}</FieldError>
      </div>

      {/* Templates — rotation pool */}
      <div>
        <FieldLabel required>Template Email</FieldLabel>
        <FieldDescription>
          Pilih satu atau lebih. Kalau pilih lebih dari satu, queue otomatis
          merotasi template acak-merata tiap kirim — buat lihat body mana yang
          paling efektif (A/B test).
        </FieldDescription>
        <div className="mt-2 space-y-1.5">
          {templates.map((t) => {
            const checked = selectedTemplates.includes(t.id);
            return (
              <label
                key={t.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  checked
                    ? "border-action bg-surface-sunken"
                    : "border-border hover:bg-surface-sunken"
                }`}
              >
                <input
                  type="checkbox"
                  name="template_ids"
                  value={t.id}
                  checked={checked}
                  onChange={(e) =>
                    setSelectedTemplates((prev) =>
                      e.target.checked
                        ? [...prev, t.id]
                        : prev.filter((id) => id !== t.id),
                    )
                  }
                  className="h-4 w-4 rounded border-border-strong text-ink focus:ring-accent"
                />
                <span className="flex-1 text-sm font-medium text-ink">
                  {t.name}
                </span>
                {t.attachmentCount > 0 && (
                  <span className="text-xs text-faint">
                    📎 {t.attachmentCount}
                  </span>
                )}
              </label>
            );
          })}
        </div>
        {selectedTemplates.length > 1 && (
          <p className="mt-1.5 text-xs font-medium text-success">
            {selectedTemplates.length} template — dirotasi acak-merata per
            kirim.
          </p>
        )}
        <FieldError>{state.fieldErrors?.template_ids}</FieldError>
      </div>

      {/* Audience */}
      <div>
        <FieldLabel>Target Kontak</FieldLabel>
        <div className="space-y-2">
          <AudienceCard
            selected={audienceType === "all"}
            onClick={() => setAudienceType("all")}
            icon={Users}
            title={`Semua kontak active (${totalActiveContacts.toLocaleString("id-ID")})`}
            description="Semua kontak yang status active akan di-target."
            radioName="audience_type"
            radioValue="all"
          />
          {tags.length > 0 && (
            <AudienceCard
              selected={audienceType === "tag"}
              onClick={() => setAudienceType("tag")}
              icon={Tag}
              title="Tag tertentu"
              description="Kontak dengan tag spesifik (cth: bogor, hr, q2-import)."
              radioName="audience_type"
              radioValue="tag"
              extra={
                <div className="mt-2.5">
                  <Select
                    name="audience_tag"
                    value={selectedTag}
                    onValueChange={setSelectedTag}
                    disabled={audienceType !== "tag"}
                    size="sm"
                  >
                    {tags.map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
              }
            />
          )}
        </div>
      </div>

      {/* Schedule */}
      <div>
        <FieldLabel>Schedule</FieldLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-muted">
              Mulai jam
            </label>
            <TimePicker
              name="schedule_start_time"
              value={workspaceDefaults.schedule_start_time.slice(0, 5)}
              required
              step={30}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">
              Sampai jam
            </label>
            <TimePicker
              name="schedule_end_time"
              value={workspaceDefaults.schedule_end_time.slice(0, 5)}
              required
              step={30}
            />
          </div>
          <div>
            <label
              htmlFor="daily_target"
              className="mb-1 block text-xs text-muted"
            >
              Target per hari
            </label>
            <Input
              id="daily_target"
              name="daily_target"
              type="number"
              min={1}
              max={500}
              defaultValue={workspaceDefaults.daily_target}
              required
            />
          </div>
        </div>
      </div>

      {/* AI opener toggle */}
      <div className="rounded-lg border border-border bg-warning-soft p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <div className="relative mt-0.5">
            <input
              type="checkbox"
              name="use_ai_opener"
              defaultChecked
              className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-border-strong bg-surface transition-colors checked:border-action checked:bg-action focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
            />
            <Check className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 text-on-action opacity-0 peer-checked:opacity-100" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-warning" />
              <p className="text-sm font-medium text-ink">
                Pakai AI personalization
              </p>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Gemini akan generate opener line per kontak (1-2 kalimat
              berdasarkan company/position). Variable{" "}
              <code className="rounded bg-surface-sunken px-1 font-mono text-[11px]">
                {`{ai_opener}`}
              </code>{" "}
              di template otomatis di-fill.
            </p>
          </div>
        </label>
      </div>

      {/* Pool ordering */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="mb-2 text-sm font-medium text-ink">
          Urutan kontak di queue
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-surface-sunken p-3 transition-colors hover:border-border-strong has-[:checked]:border-action has-[:checked]:bg-surface-sunken">
            <input
              type="radio"
              name="pool_order"
              value="random"
              defaultChecked
              className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-action"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-muted" />
                <p className="text-xs font-semibold text-ink">
                  Random
                </p>
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                Acak dari pool. Default — fair distribution antar workspace.
              </p>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-surface-sunken p-3 transition-colors hover:border-warning has-[:checked]:border-warning has-[:checked]:bg-warning-soft">
            <input
              type="radio"
              name="pool_order"
              value="warm_first"
              className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-warning"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <Flame className="h-3 w-3 text-warning" />
                <p className="text-xs font-semibold text-ink">
                  Warm-first
                </p>
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                Kontak engaged (pernah open/reply) diprioritisasi duluan.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Test mode toggle */}
      <div className="rounded-xl border border-info-soft bg-info-soft p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <div className="relative mt-0.5">
            <input
              type="checkbox"
              name="test_mode"
              className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-border-strong bg-surface transition-colors checked:border-action checked:bg-action focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
            />
            <Check className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 text-on-action opacity-0 peer-checked:opacity-100" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-info" />
              <p className="text-sm font-medium text-ink">
                Test mode
              </p>
              <span className="rounded-full bg-info-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-info">
                Safe
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
              Semua email <strong>redirect ke akun Gmail terhubung</strong> (gak
              ke kontak asli). Subject prefixed{" "}
              <code className="rounded bg-info-soft px-1 font-mono text-[10px]">
                [TEST]
              </code>
              . Cron auto-runner SKIP queue ini — cuma jalan via &quot;Run Now&quot;
              manual. Cocok untuk verifikasi audience filter / template /
              Gmail tanpa risk blast ke real customer.
            </p>
          </div>
        </label>
      </div>

      {state.error && (
        <p className="rounded-lg border border-danger-soft bg-danger-soft p-3 text-xs font-medium text-danger-text">
          {state.error}
        </p>
      )}

      <div className="flex justify-end pt-2">
        <Button type="submit" loading={pending} disabled={pending}>
          {pending ? "Membuat queue..." : "Buat Queue"}
        </Button>
      </div>
    </form>
  );
}

function AudienceCard({
  selected,
  onClick,
  icon: Icon,
  title,
  description,
  radioName,
  radioValue,
  extra,
}: {
  selected: boolean;
  onClick: () => void;
  icon: typeof Users;
  title: string;
  description: string;
  radioName: string;
  radioValue: string;
  extra?: React.ReactNode;
}) {
  return (
    <label
      onClick={onClick}
      className={`relative block cursor-pointer rounded-xl border p-3.5 transition-all ${
        selected
          ? "border-action bg-surface-sunken ring-2 ring-accent-soft"
          : "border-border hover:border-border-strong hover:bg-surface-sunken/50"
      }`}
    >
      <input
        type="radio"
        name={radioName}
        value={radioValue}
        checked={selected}
        onChange={() => onClick()}
        className="sr-only"
      />
      <div className="flex items-start gap-3">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
            selected
              ? "bg-action text-on-action"
              : "bg-surface-sunken text-muted"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">
            {title}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {description}
          </p>
          {extra}
        </div>
      </div>
    </label>
  );
}
