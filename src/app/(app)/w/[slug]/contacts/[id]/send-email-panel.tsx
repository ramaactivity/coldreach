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
import { FieldLabel } from "@/components/ui/input";
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
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
            <AlertCircle className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">
              Belum ada template
            </p>
            <p className="mt-0.5 text-xs text-muted">
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
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
            <Mail className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">
              Belum ada Gmail terhubung
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Connect Gmail dulu di Settings sebelum bisa kirim email.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-border bg-surface-sunken p-5">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-ink-secondary" />
          <h2 className="text-base font-semibold text-ink">
            Send Email
          </h2>
        </div>
        <p className="mt-1 text-xs text-muted">
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
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-border-strong">
          <div className="relative mt-0.5">
            <input
              type="checkbox"
              checked={useAiOpener}
              onChange={(e) => setUseAiOpener(e.target.checked)}
              className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-border-strong bg-surface transition-colors checked:border-action checked:bg-action focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
            />
            <Check className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 text-on-action opacity-0 peer-checked:opacity-100" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-warning" />
              <p className="text-sm font-medium text-ink">
                AI personalization
              </p>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              Generate <code className="font-mono">{`{ai_opener}`}</code> otomatis (cache per kontak).
            </p>
          </div>
        </label>

        {/* Test mode toggle */}
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
            testMode
              ? "border-info bg-info-soft/40"
              : "border-border bg-surface hover:border-border-strong"
          }`}
        >
          <div className="relative mt-0.5">
            <input
              type="checkbox"
              checked={testMode}
              onChange={(e) => setTestMode(e.target.checked)}
              className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-border-strong bg-surface transition-colors checked:border-action checked:bg-action focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
            />
            <Check className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 text-on-action opacity-0 peer-checked:opacity-100" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3 w-3 text-info" />
              <p className="text-sm font-medium text-ink">
                Test mode
              </p>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              {testMode ? (
                <>
                  Email aman ke <strong>{account.email}</strong> (bukan {contactEmail}). Subject prefixed{" "}
                  <code className="rounded bg-info-soft px-1 font-mono text-[10px]">
                    [TEST]
                  </code>
                  .
                </>
              ) : (
                <>
                  Email akan dikirim ke{" "}
                  <strong className="text-ink">{contactEmail}</strong> (real).
                </>
              )}
            </p>
          </div>
        </label>

        {/* Result banner */}
        {result?.ok && (
          <div className="flex items-start gap-2.5 rounded-lg border border-success-soft bg-success-soft p-3 text-xs">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-success-text">
                Email sent · subject: &quot;{result.subject_used}&quot;
              </p>
              {result.gmail_thread_id && (
                <a
                  href={`https://mail.google.com/mail/u/0/#sent/${result.gmail_thread_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-success-text underline hover:no-underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Buka di Gmail Sent folder
                </a>
              )}
            </div>
          </div>
        )}
        {result && !result.ok && (
          <div className="flex items-start gap-2.5 rounded-lg border border-danger-soft bg-danger-soft p-3 text-xs">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <p className="font-medium text-danger-text">
              {result.error}
            </p>
          </div>
        )}

        {/* Send button + quota indicator */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted tabular">
            Quota hari ini:{" "}
            <strong
              className={
                remainingQuota === 0
                  ? "text-danger"
                  : "text-ink"
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
