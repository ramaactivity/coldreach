"use client";

import { useTransition } from "react";
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
import { disconnectGmail, toggleWarmupMode } from "./actions";

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
  const [pending, startTransition] = useTransition();

  if (!account || !account.is_active) {
    return (
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col items-start gap-4 p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-200 ring-1 ring-zinc-200 dark:from-zinc-800 dark:to-zinc-900 dark:ring-zinc-700">
            <Mail className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
          </div>
          <div>
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Belum ada Gmail terhubung
            </p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Connect Gmail account untuk workspace ini. Lu bisa pilih akun
              mana saja di account picker Google — gak harus sama dengan akun
              login.
            </p>
          </div>
          <Link
            href={`/api/gmail/connect?workspace=${slug}`}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-zinc-50 shadow-sm transition-all hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 active:scale-[0.99]"
          >
            <Plus className="h-4 w-4" />
            Connect Gmail
          </Link>
        </div>
      </Card>
    );
  }

  function handleDisconnect() {
    if (!account || !confirm(`Disconnect Gmail ${account.email}? Lu bisa connect lagi nanti.`)) return;
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

  const tokenExpired = new Date(account.token_expires_at) < new Date();
  const healthVariant: "success" | "warning" | "danger" | "secondary" =
    account.health_status === "healthy"
      ? "success"
      : account.health_status === "blocked"
        ? "danger"
        : account.health_status === "needs_reconnect" || account.health_status === "warning"
          ? "warning"
          : "secondary";

  const quotaPct = Math.round(
    (account.emails_sent_today / Math.max(1, account.daily_quota)) * 100,
  );

  return (
    <Card className="overflow-hidden p-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-zinc-100 p-5 dark:border-zinc-800">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 ring-1 ring-blue-200/60 dark:from-blue-950/30 dark:to-indigo-950/30 dark:ring-blue-800/40">
            <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {account.email}
              </p>
              <Badge variant={healthVariant} className="capitalize">
                {account.health_status.replace(/_/g, " ")}
              </Badge>
            </div>
            {account.display_name && (
              <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                {account.display_name}
              </p>
            )}
            {(account.health_notes || tokenExpired) && (
              <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
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
      <div className="grid grid-cols-1 divide-y divide-zinc-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 dark:divide-zinc-800">
        <div className="p-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            <Activity className="h-3 w-3" />
            <span>Today's quota</span>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-100">
            {account.emails_sent_today}{" "}
            <span className="text-base font-normal text-zinc-500">
              / {account.daily_quota}
            </span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
              style={{ width: `${Math.min(100, quotaPct)}%` }}
            />
          </div>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            <Clock className="h-3 w-3" />
            <span>Last used</span>
          </div>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {account.last_used_at
              ? new Date(account.last_used_at).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "short",
                })
              : "—"}
          </p>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
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
      <div className="border-t border-zinc-100 bg-zinc-50/40 p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Warmup mode
              </p>
              {account.warmup_mode && (
                <Badge variant="success">Active</Badge>
              )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              Untuk akun Gmail baru (&lt; 90 hari) atau yang lama gak dipakai.
              Mulai 5 email/hari, naik bertahap selama 14 hari sebelum hit full
              quota.
            </p>
            {account.warmup_mode && account.warmup_started_at && (
              <p className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                Started{" "}
                {new Date(account.warmup_started_at).toLocaleDateString(
                  "id-ID",
                  { day: "numeric", month: "long", year: "numeric" },
                )}
              </p>
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
