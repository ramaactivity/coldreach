"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Sparkles,
  Shield,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Mail,
  Check,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FieldLabel, FieldDescription } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/dialog";
import { sendOneEmailToContact, type SendOneEmailResult } from "./send-actions";

type Template = {
  id: string;
  name: string;
  attachmentCount: number;
};

type EmailAccountInfo = {
  email: string;
  daily_quota: number;
  emails_sent_today: number;
} | null;

export function SendEmailPanel({
  slug,
  contactId,
  contactEmail,
  templates,
  account,
}: {
  slug: string;
  contactId: string;
  contactEmail: string;
  templates: Template[];
  account: EmailAccountInfo;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [useAiOpener, setUseAiOpener] = useState(true);
  const [testMode, setTestMode] = useState(false);
  const [result, setResult] = useState<SendOneEmailResult | null>(null);

  const remainingQuota = account
    ? account.daily_quota - account.emails_sent_today
    : 0;
  const canSend =
    !!account && remainingQuota > 0 && templates.length > 0 && !!templateId;

  async function handleSend() {
    if (!canSend) return;
    if (!testMode) {
      const ok = await confirm({
        title: "Kirim email sekarang?",
        description: `Email keluar ke ${contactEmail} dan gak bisa di-undo.`,
        confirmLabel: "Kirim",
      });
      if (!ok) return;
    }

    setResult(null);
    startTransition(async () => {
      const res = await sendOneEmailToContact(slug, {
        contactId,
        templateId,
        useAiOpener,
        testMode,
      });
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  if (templates.length === 0) {
    return (
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
            <AlertCircle className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Belum ada template
            </p>
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              Bikin template dulu di workspace ini sebelum bisa kirim email.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (!account) {
    return (
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
            <Mail className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Belum ada Gmail terhubung
            </p>
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              Connect Gmail dulu di Settings sebelum bisa kirim email.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-zinc-100 bg-gradient-to-br from-zinc-50/60 to-white p-5 dark:border-zinc-800 dark:from-zinc-900/60 dark:to-zinc-900">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Send Email
          </h2>
        </div>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Kirim email langsung ke kontak ini sekarang juga, tanpa perlu queue.
          Pakai template + AI personalization yang sama seperti queue.
        </p>
      </div>

      <div className="space-y-4 p-5">
        {/* Template */}
        <div>
          <FieldLabel>Template</FieldLabel>
          <Select value={templateId} onValueChange={setTemplateId}>
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

        {/* AI opener toggle */}
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-white p-3 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
          <div className="relative mt-0.5">
            <input
              type="checkbox"
              checked={useAiOpener}
              onChange={(e) => setUseAiOpener(e.target.checked)}
              className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-zinc-300 bg-white transition-colors checked:border-zinc-900 checked:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 dark:border-zinc-600 dark:bg-zinc-800 dark:checked:border-zinc-100 dark:checked:bg-zinc-100"
            />
            <Check className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 text-white opacity-0 peer-checked:opacity-100 dark:text-zinc-900" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-amber-500" />
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                AI personalization
              </p>
            </div>
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              Generate <code className="font-mono">{`{ai_opener}`}</code> otomatis (cache per kontak).
            </p>
          </div>
        </label>

        {/* Test mode toggle */}
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
            testMode
              ? "border-blue-300 bg-blue-50/40 dark:border-blue-800/50 dark:bg-blue-950/20"
              : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
          }`}
        >
          <div className="relative mt-0.5">
            <input
              type="checkbox"
              checked={testMode}
              onChange={(e) => setTestMode(e.target.checked)}
              className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-zinc-300 bg-white transition-colors checked:border-blue-600 checked:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-zinc-600 dark:bg-zinc-800 dark:checked:border-blue-500 dark:checked:bg-blue-500"
            />
            <Check className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 text-white opacity-0 peer-checked:opacity-100" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3 w-3 text-blue-600 dark:text-blue-400" />
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Test mode
              </p>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              {testMode ? (
                <>
                  Email aman ke <strong>{account.email}</strong> (bukan {contactEmail}). Subject prefixed{" "}
                  <code className="rounded bg-blue-100 px-1 font-mono text-[10px] dark:bg-blue-900/40">
                    [TEST]
                  </code>
                  .
                </>
              ) : (
                <>
                  Email akan dikirim ke{" "}
                  <strong className="text-zinc-900 dark:text-zinc-100">{contactEmail}</strong> (real).
                </>
              )}
            </p>
          </div>
        </label>

        {/* Result banner */}
        {result?.ok && (
          <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs dark:border-emerald-900/60 dark:bg-emerald-950/40">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                Email sent · subject: "{result.subject_used}"
              </p>
              {result.gmail_thread_id && (
                <a
                  href={`https://mail.google.com/mail/u/0/#sent/${result.gmail_thread_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-emerald-700 underline hover:no-underline dark:text-emerald-400"
                >
                  <ExternalLink className="h-3 w-3" />
                  Buka di Gmail Sent folder
                </a>
              )}
            </div>
          </div>
        )}
        {result && !result.ok && (
          <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs dark:border-red-900/60 dark:bg-red-950/40">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <p className="font-medium text-red-700 dark:text-red-400">
              {result.error}
            </p>
          </div>
        )}

        {/* Send button + quota indicator */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
            Quota hari ini:{" "}
            <strong
              className={
                remainingQuota === 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-zinc-900 dark:text-zinc-100"
              }
            >
              {account.emails_sent_today} / {account.daily_quota}
            </strong>
          </p>
          <Button
            onClick={handleSend}
            disabled={!canSend || pending}
            loading={pending}
            variant={testMode ? "outline" : "primary"}
          >
            <Send className="h-3.5 w-3.5" />
            {pending ? "Sending..." : testMode ? "Send Test" : "Send Now"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
