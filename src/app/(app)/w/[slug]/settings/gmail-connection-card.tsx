"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Mail,
  Plus,
  AlertTriangle,
  Activity,
  Clock,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/dialog";
import { disconnectGmail, toggleWarmupMode } from "./actions";
import { QuotaForm } from "./quota-form";
import { describeWarmupStage } from "@/lib/warmup";

type EmailAccount = {
  id: string;
  email: string;
  display_name: string | null;
  oauth_scope: string | null;
  token_expires_at: string;
  is_active: boolean;
  daily_quota: number;
  emails_sent_today: number;
  health_status: string;
  health_notes: string | null;
  warmup_mode: boolean;
  warmup_started_at: string | null;
  last_used_at: string | null;
} | null;

export function GmailConnectionCard({
  slug,
  account,
}: {
  slug: string;
  account: EmailAccount;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  // tokenExpired must NOT depend on the in-render clock — server and client
  // see slightly different `now` values which causes a React #418 hydration
  // mismatch on any boundary token. Compute after mount on the client only.
  // Declared above the early-return so the hook call order stays stable.
  const [tokenExpired, setTokenExpired] = useState(false);
  useEffect(() => {
    if (!account?.token_expires_at) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTokenExpired(new Date(account.token_expires_at) < new Date());
  }, [account?.token_expires_at]);

  if (!account || !account.is_active) {
    return (
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col items-start gap-4 p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-sunken">
            <Mail className="h-5 w-5 text-muted" />
          </div>
          <div>
            <p className="text-base font-semibold text-ink">
              Belum ada Gmail terhubung
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Connect Gmail account untuk workspace ini. Lu bisa pilih akun
              mana saja di account picker Google — gak harus sama dengan akun
              login.
            </p>
          </div>
          <Link
            href={`/api/gmail/connect?workspace=${slug}`}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-action px-4 text-sm font-medium text-on-action transition-all hover:bg-action-hover active:scale-[0.99]"
          >
            <Plus className="h-4 w-4" />
            Connect Gmail
          </Link>
        </div>
      </Card>
    );
  }

  async function handleDisconnect() {
    if (!account) return;
    const ok = await confirm({
      title: "Disconnect Gmail?",
      description: `${account.email} akan terputus. Lu bisa connect lagi nanti.`,
      confirmLabel: "Disconnect",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      await disconnectGmail(slug, account.id);
      router.refresh();
    });
  }

  function handleToggleWarmup() {
    if (!account) return;
    startTransition(async () => {
      await toggleWarmupMode(slug, account.id, !account.warmup_mode);
      router.refresh();
    });
  }

  const healthVariant: "success" | "warning" | "danger" | "secondary" =
    account.health_status === "healthy"
      ? "success"
      : account.health_status === "blocked"
        ? "danger"
        : account.health_status === "needs_reconnect" || account.health_status === "warning"
          ? "warning"
          : "secondary";

  // Single source for the warmup stage so the quota line, progress bar, and
  // the warmup card below all show the SAME effective cap (no more 90 vs 20
  // mismatch). During warmup the real ceiling is the ramp stage, not daily_quota.
  const warmupStage = describeWarmupStage({
    warmupMode: account.warmup_mode,
    warmupStartedAt: account.warmup_started_at,
    fallbackQuota: account.daily_quota,
  });
  const effectiveCap = warmupStage ? warmupStage.cap : account.daily_quota;
  const quotaPct = Math.round(
    (account.emails_sent_today / Math.max(1, effectiveCap)) * 100,
  );

  return (
    <Card className="overflow-hidden p-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-border p-5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info-soft">
            <Mail className="h-4 w-4 text-info" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-ink">
                {account.email}
              </p>
              <Badge variant={healthVariant} className="capitalize">
                {account.health_status.replace(/_/g, " ")}
              </Badge>
            </div>
            {account.display_name && (
              <p className="mt-0.5 truncate text-xs text-muted">
                {account.display_name}
              </p>
            )}
            {(account.health_notes || tokenExpired) && (
              <div className="mt-2 flex items-start gap-1.5 text-xs text-warning-text">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <p>
                  {account.health_notes ??
                    "Token expired — akan auto-refresh saat dipakai. Kalau gagal, reconnect."}
                </p>
              </div>
            )}
          </div>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDisconnect}
          disabled={pending}
        >
          Disconnect
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className="p-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
            <Activity className="h-3 w-3" />
            <span>Today&apos;s quota</span>
          </div>
          <div className="mt-2">
            <QuotaForm
              slug={slug}
              accountId={account.id}
              initialQuota={account.daily_quota}
              emailsSentToday={account.emails_sent_today}
              effectiveCap={effectiveCap}
              warmupDay={warmupStage?.day ?? null}
            />
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{ width: `${Math.min(100, quotaPct)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            {warmupStage
              ? `Batas kirim hari ini (warmup). Target penuh ${account.daily_quota}/hari, dipakai semua queue setelah warmup selesai.`
              : "Angka ini juga jadi target kirim/hari — dipakai semua queue di workspace ini."}
          </p>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
            <Clock className="h-3 w-3" />
            <span>Last used</span>
          </div>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">
            {account.last_used_at
              ? new Date(account.last_used_at).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "short",
                })
              : "—"}
          </p>
          <p className="mt-2 text-xs text-muted">
            {account.last_used_at
              ? new Date(account.last_used_at).toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Belum dipakai"}
          </p>
        </div>
      </div>

      {/* Warmup mode */}
      <div className="border-t border-border bg-surface-sunken/40 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted" />
              <p className="text-sm font-semibold text-ink">
                Warmup mode
              </p>
              {account.warmup_mode && (
                <Badge variant="success">Active</Badge>
              )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Untuk akun Gmail baru atau yang lama gak dipakai. Cap pengiriman
              naik bertahap: 20 → 40 → 60 → 80 → full ({account.daily_quota})
              selama 30 hari biar reputasi domain stabil.
            </p>
            {warmupStage && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-md bg-success-soft px-2 py-1 text-[11px] text-success-text">
                <span>Hari ke-{warmupStage.day}</span>
                <span>·</span>
                <span>
                  Cap{" "}
                  <strong className="font-semibold">{warmupStage.cap}</strong>
                  /hari{warmupStage.isCapped ? "" : " (full quota)"}
                </span>
              </div>
            )}
          </div>
          <Button
            variant={account.warmup_mode ? "primary" : "outline"}
            size="sm"
            onClick={handleToggleWarmup}
            disabled={pending}
          >
            {account.warmup_mode ? "Stop Warmup" : "Start Warmup"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
