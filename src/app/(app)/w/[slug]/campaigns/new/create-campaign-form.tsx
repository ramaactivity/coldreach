"use client";

import { useActionState, useState } from "react";
import { Users, Tag, Sparkles, Check, Shield, Rocket, Clock } from "lucide-react";
import {
  FieldLabel,
  FieldError,
  FieldDescription,
  Input,
  Select,
} from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { CreateCampaignState } from "../actions";

const INITIAL_STATE: CreateCampaignState = {};

function defaultScheduledTime(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0); // round to next hour
  // datetime-local format: YYYY-MM-DDTHH:MM
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreateCampaignForm({
  action,
  templates,
  tags,
  totalActiveContacts,
}: {
  action: (state: CreateCampaignState, formData: FormData) => Promise<CreateCampaignState>;
  templates: Array<{ id: string; name: string; attachmentCount: number }>;
  tags: string[];
  totalActiveContacts: number;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const [audienceType, setAudienceType] = useState<"all" | "tag">("all");
  const [selectedTag, setSelectedTag] = useState(tags[0] ?? "");
  const [sendWhen, setSendWhen] = useState<"now" | "scheduled">("now");

  return (
    <form action={formAction} className="space-y-6">
      {/* Name */}
      <div>
        <FieldLabel htmlFor="name" required>
          Nama Campaign
        </FieldLabel>
        <Input
          id="name"
          name="name"
          required
          placeholder="Ramadan Special — HR Bogor"
        />
        <FieldError>{state.fieldErrors?.name}</FieldError>
      </div>

      {/* Template */}
      <div>
        <FieldLabel htmlFor="template_id" required>
          Template Email
        </FieldLabel>
        <Select id="template_id" name="template_id" required>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.attachmentCount > 0 ? ` (📎 ${t.attachmentCount})` : ""}
            </option>
          ))}
        </Select>
      </div>

      {/* Audience */}
      <div>
        <FieldLabel>Target Kontak</FieldLabel>
        <div className="space-y-2">
          <ChoiceCard
            selected={audienceType === "all"}
            onClick={() => setAudienceType("all")}
            icon={Users}
            radioName="audience_type"
            radioValue="all"
            title={`Semua kontak active (${totalActiveContacts.toLocaleString("id-ID")})`}
            description="Semua kontak status active akan di-target."
          />
          {tags.length > 0 && (
            <ChoiceCard
              selected={audienceType === "tag"}
              onClick={() => setAudienceType("tag")}
              icon={Tag}
              radioName="audience_type"
              radioValue="tag"
              title="Tag tertentu"
              description="Kontak dengan tag spesifik."
              extra={
                <Select
                  name="audience_tag"
                  value={selectedTag}
                  onChange={(e) => setSelectedTag(e.target.value)}
                  disabled={audienceType !== "tag"}
                  className="mt-2.5 h-8 text-xs"
                >
                  {tags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </Select>
              }
            />
          )}
        </div>
      </div>

      {/* Send when */}
      <div>
        <FieldLabel>Kapan Kirim</FieldLabel>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ChoiceCard
            selected={sendWhen === "now"}
            onClick={() => setSendWhen("now")}
            icon={Rocket}
            radioName="send_when"
            radioValue="now"
            title="Kirim Sekarang"
            description="Cron pickup dalam 30 menit ke depan, langsung blast."
          />
          <ChoiceCard
            selected={sendWhen === "scheduled"}
            onClick={() => setSendWhen("scheduled")}
            icon={Clock}
            radioName="send_when"
            radioValue="scheduled"
            title="Jadwalkan"
            description="Kirim di waktu tertentu (cth: Senin 09:00)."
            extra={
              <input
                type="datetime-local"
                name="scheduled_start_at"
                disabled={sendWhen !== "scheduled"}
                defaultValue={defaultScheduledTime()}
                className="mt-2.5 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800"
              />
            }
          />
        </div>
        <FieldError>{state.fieldErrors?.scheduled_start_at}</FieldError>
      </div>

      {/* Rate limit */}
      <div>
        <FieldLabel htmlFor="daily_target" hint="Max email per cron tick (30 min)">
          Rate Limit
        </FieldLabel>
        <Input
          id="daily_target"
          name="daily_target"
          type="number"
          min={1}
          max={500}
          defaultValue={30}
          required
        />
        <FieldDescription>
          Walau one-shot, kita tetap rate-limit biar Gmail gak mark spam.
          30 per 30-min tick = 60/jam = aman untuk akun mature.
        </FieldDescription>
      </div>

      {/* AI opener */}
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
              Gemini generate <code className="rounded bg-zinc-100 px-1 font-mono text-[11px] dark:bg-zinc-800">{`{ai_opener}`}</code>{" "}
              per kontak. Cache reused dari queue lain kalau pernah generated.
            </p>
          </div>
        </label>
      </div>

      {/* Test mode */}
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
              Semua email redirect ke akun Gmail terhubung lu (gak ke kontak
              asli). Cron auto-runner skip campaign ini — cuma manual "Run
              Now" yang trigger. Cocok untuk verify audience filter sebelum
              real blast.
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
          {pending ? "Membuat..." : "Buat Campaign"}
        </Button>
      </div>
    </form>
  );
}

function ChoiceCard({
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
