"use client";

import { useActionState, useState } from "react";
import { Users, Tag, Sparkles, Check, Shield, Rocket, Clock } from "lucide-react";
import {
  FieldLabel,
  FieldError,
  FieldDescription,
  Input,
} from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Button } from "@/components/ui/button";
import type { CreateCampaignState } from "../actions";

const INITIAL_STATE: CreateCampaignState = {};

function defaultScheduledParts(): { date: string; time: string } {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
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
  const initParts = defaultScheduledParts();
  const [scheduledDate, setScheduledDate] = useState(initParts.date);
  const [scheduledTime, setScheduledTime] = useState(initParts.time);

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
              <div className="mt-2.5 space-y-2">
                {/* Stamp the WIB offset so the picked wall-clock time is
                    interpreted as Asia/Jakarta, not the server's UTC — a naive
                    string parsed server-side would send 7h late. */}
                <input
                  type="hidden"
                  name="scheduled_start_at"
                  value={
                    scheduledDate && scheduledTime
                      ? `${scheduledDate}T${scheduledTime}:00+07:00`
                      : ""
                  }
                />
                <DatePicker
                  value={scheduledDate}
                  onValueChange={setScheduledDate}
                  disabled={sendWhen !== "scheduled"}
                />
                <TimePicker
                  value={scheduledTime}
                  onValueChange={setScheduledTime}
                  disabled={sendWhen !== "scheduled"}
                  step={15}
                />
              </div>
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
              Gemini generate <code className="rounded bg-surface-sunken px-1 font-mono text-[11px]">{`{ai_opener}`}</code>{" "}
              per kontak. Cache reused dari queue lain kalau pernah generated.
            </p>
          </div>
        </label>
      </div>

      {/* Test mode */}
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
              Semua email redirect ke akun Gmail terhubung lu (gak ke kontak
              asli). Cron auto-runner skip campaign ini — cuma manual &quot;Run
              Now&quot; yang trigger. Cocok untuk verify audience filter sebelum
              real blast.
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
