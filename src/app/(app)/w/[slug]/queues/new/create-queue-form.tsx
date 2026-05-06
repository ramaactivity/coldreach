"use client";

import { useActionState, useState } from "react";
import { Loader2, Users, Tag, Sparkles, Check, Shield } from "lucide-react";
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

      {/* Template */}
      <div>
        <FieldLabel required>Template Email</FieldLabel>
        <Select
          name="template_id"
          required
          defaultValue={templates[0]?.id}
          placeholder="Pilih template..."
        >
          {templates.map((t) => (
            <SelectItem
              key={t.id}
              value={t.id}
              hint={t.attachmentCount > 0 ? `📎 ${t.attachmentCount}` : undefined}
            >
              {t.name}
            </SelectItem>
          ))}
        </Select>
        <FieldError>{state.fieldErrors?.template_id}</FieldError>
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
            <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
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
            <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
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
              className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400"
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
      <div className="rounded-xl border border-zinc-200/80 bg-gradient-to-br from-amber-50/60 to-rose-50/40 p-4 dark:border-zinc-800/80 dark:from-amber-950/20 dark:to-rose-950/10">
        <label className="flex cursor-pointer items-start gap-3">
          <div className="relative mt-0.5">
            <input
              type="checkbox"
              name="use_ai_opener"
              defaultChecked
              className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-zinc-300 bg-white transition-colors checked:border-zinc-900 checked:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 dark:border-zinc-600 dark:bg-zinc-800 dark:checked:border-zinc-100 dark:checked:bg-zinc-100"
            />
            <Check className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 text-white opacity-0 peer-checked:opacity-100 dark:text-zinc-900" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Pakai AI personalization
              </p>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              Gemini akan generate opener line per kontak (1-2 kalimat
              berdasarkan company/position). Variable{" "}
              <code className="rounded bg-zinc-100 px-1 font-mono text-[11px] dark:bg-zinc-800">
                {`{ai_opener}`}
              </code>{" "}
              di template otomatis di-fill.
            </p>
          </div>
        </label>
      </div>

      {/* Test mode toggle */}
      <div className="rounded-xl border border-blue-200/80 bg-gradient-to-br from-blue-50/80 to-indigo-50/60 p-4 dark:border-blue-900/50 dark:from-blue-950/30 dark:to-indigo-950/20">
        <label className="flex cursor-pointer items-start gap-3">
          <div className="relative mt-0.5">
            <input
              type="checkbox"
              name="test_mode"
              className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-zinc-300 bg-white transition-colors checked:border-blue-600 checked:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-zinc-600 dark:bg-zinc-800 dark:checked:border-blue-500 dark:checked:bg-blue-500"
            />
            <Check className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 text-white opacity-0 peer-checked:opacity-100" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Test mode
              </p>
              <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                Safe
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
              Semua email <strong>redirect ke akun Gmail terhubung</strong> (gak
              ke kontak asli). Subject prefixed{" "}
              <code className="rounded bg-blue-100 px-1 font-mono text-[10px] dark:bg-blue-900/50">
                [TEST]
              </code>
              . Cron auto-runner SKIP queue ini — cuma jalan via "Run Now"
              manual. Cocok untuk verifikasi audience filter / template /
              Gmail tanpa risk blast ke real customer.
            </p>
          </div>
        </label>
      </div>

      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
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
          ? "border-zinc-900 bg-zinc-50 ring-2 ring-zinc-900/10 dark:border-zinc-100 dark:bg-zinc-800/40 dark:ring-zinc-100/10"
          : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/30"
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
              ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {title}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            {description}
          </p>
          {extra}
        </div>
      </div>
    </label>
  );
}
