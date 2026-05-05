"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-900/50">
        <div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Belum ada Gmail terhubung
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Connect Gmail account untuk workspace ini. Lu bisa pilih akun mana
            saja di account picker Google — gak harus sama dengan akun login.
          </p>
        </div>
        <Link
          href={`/api/gmail/connect?workspace=${slug}`}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          + Connect Gmail
        </Link>
      </div>
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
  const healthColor = {
    healthy: "emerald",
    warning: "amber",
    blocked: "red",
    needs_reconnect: "amber",
  }[account.health_status] ?? "zinc";

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base">📧</span>
            <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
              {account.email}
            </p>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${healthColorClasses(healthColor)}`}
            >
              {account.health_status}
            </span>
          </div>
          {account.display_name && (
            <p className="mt-0.5 text-xs text-zinc-500">{account.display_name}</p>
          )}
          {account.health_notes && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              ⚠ {account.health_notes}
            </p>
          )}
          {tokenExpired && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              ⚠ Token expired — akan auto-refresh saat dipakai. Kalau gagal, reconnect.
            </p>
          )}
        </div>
        <button
          onClick={handleDisconnect}
          disabled={pending}
          className="shrink-0 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/30"
        >
          Disconnect
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-4 text-sm dark:border-zinc-800">
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Today's quota</dt>
          <dd className="mt-0.5 text-zinc-900 dark:text-zinc-100">
            {account.emails_sent_today} / {account.daily_quota}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Last used</dt>
          <dd className="mt-0.5 text-zinc-900 dark:text-zinc-100">
            {account.last_used_at
              ? new Date(account.last_used_at).toLocaleDateString("id-ID")
              : "Belum dipakai"}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex items-start justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Warmup mode
          </p>
          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
            Untuk akun Gmail baru (&lt; 90 hari) atau yang lama gak dipakai. Mulai
            5 email/hari, naik bertahap selama 14 hari sebelum hit full quota.
          </p>
          {account.warmup_mode && account.warmup_started_at && (
            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
              Active. Started {new Date(account.warmup_started_at).toLocaleDateString("id-ID")}
            </p>
          )}
        </div>
        <button
          onClick={handleToggleWarmup}
          disabled={pending}
          className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
            account.warmup_mode
              ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
              : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          }`}
        >
          {account.warmup_mode ? "Stop Warmup" : "Start Warmup"}
        </button>
      </div>
    </div>
  );
}

function healthColorClasses(color: string): string {
  switch (color) {
    case "emerald":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400";
    case "amber":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400";
    case "red":
      return "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-400";
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
}
