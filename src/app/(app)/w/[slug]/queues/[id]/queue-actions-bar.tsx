"use client";

import { useState, useTransition, useOptimistic } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  Pause,
  Trash2,
  Zap,
  AlertTriangle,
  Shuffle,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import {
  pauseQueue,
  resumeQueue,
  deleteQueueAction,
  runNowAction,
  reshuffleQueueAction,
} from "../actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/dialog";

function timeAgo(iso: string | null): string {
  if (!iso) return "belum pernah";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "baru saja";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} menit lalu`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} jam lalu`;
  return `${Math.floor(ms / 86_400_000)} hari lalu`;
}

export function QueueActionsBar({
  slug,
  queueId,
  isActive,
  canSend,
  pendingCount,
  lastShuffledAt,
  lastRefilledAt,
  audienceType,
}: {
  slug: string;
  queueId: string;
  isActive: boolean;
  canSend: boolean;
  pendingCount: number;
  lastShuffledAt: string | null;
  lastRefilledAt: string | null;
  audienceType: "all" | "tag" | "manual" | string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  // Which Run-Now batch is in flight, so the spinner shows on the clicked
  // button (not always on "Send 1").
  const [runningBatch, setRunningBatch] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [resultTone, setResultTone] = useState<"success" | "error" | "info">("info");
  const [shuffleMsg, setShuffleMsg] = useState<string | null>(null);
  // Optimistic UI: flip immediately, server reconciles via revalidatePath
  const [optimisticActive, setOptimisticActive] = useOptimistic(
    isActive,
    (_, newValue: boolean) => newValue,
  );

  function handleRun(batchSize: number) {
    setLastResult(null);
    setRunningBatch(batchSize);
    startTransition(async () => {
      try {
        const res = await runNowAction(slug, queueId, batchSize);
        if ("error" in res && res.error) {
          setResultTone("error");
          setLastResult(`Error: ${res.error}`);
        } else if ("result" in res && res.result) {
          const r = res.result;
          const parts = [`Attempted ${r.attempted}`, `sent ${r.sent}`];
          if (r.failed > 0) parts.push(`failed ${r.failed}`);
          if (r.skipped > 0) parts.push(`skipped ${r.skipped}`);
          setResultTone(r.failed > 0 ? "error" : "success");
          let msg = parts.join(", ");
          if (r.errors.length > 0) {
            msg += `. Errors: ${r.errors.slice(0, 2).join("; ")}`;
          }
          setLastResult(msg);
        }
        router.refresh();
      } finally {
        setRunningBatch(null);
      }
    });
  }

  function handleReshuffle() {
    setShuffleMsg(null);
    startTransition(async () => {
      const res = await reshuffleQueueAction(slug, queueId);
      if (res.ok) {
        setShuffleMsg(
          res.reshuffled > 0
            ? `Diacak ulang — ${res.reshuffled.toLocaleString("id-ID")} kontak pending dapat urutan baru.`
            : "0 kontak pending — gak ada yang di-shuffle. Queue sudah selesai atau semua recipient sudah sent/skipped.",
        );
      } else {
        setShuffleMsg(`Error: ${res.error}`);
      }
      router.refresh();
    });
  }

  function handlePauseToggle() {
    startTransition(async () => {
      // Flip optimistically — UI updates instantly, server reconciles
      setOptimisticActive(!optimisticActive);
      if (optimisticActive) {
        await pauseQueue(slug, queueId);
      } else {
        await resumeQueue(slug, queueId);
      }
      router.refresh();
    });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete queue ini?",
      description:
        "Semua queue_recipients ikut terhapus, tapi email yang udah ke-kirim tetap di Gmail Sent.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      await deleteQueueAction(slug, queueId);
    });
  }

  return (
    <Card className="mt-4 p-0">
      <div className="border-b border-zinc-100 p-5 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Run Now (manual test)
          </h3>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Untuk testing, kirim email langsung tanpa nunggu cron schedule.
          Pakai delay 30-90 detik antar email kalau lu kirim batch &gt; 1.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => handleRun(1)}
            disabled={!canSend || pending}
            loading={runningBatch === 1}
          >
            Send 1 email
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleRun(3)}
            disabled={!canSend || pending}
            loading={runningBatch === 3}
          >
            Send 3 emails
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleRun(10)}
            disabled={!canSend || pending}
            loading={runningBatch === 10}
          >
            Send 10 emails
          </Button>
        </div>
        {!canSend && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            {pendingCount === 0
              ? "Gak ada pending recipients."
              : "Quota harian habis atau Gmail belum connected."}
          </div>
        )}
        {lastResult && (
          <div
            className={`mt-3 rounded-lg border p-3 text-xs ${
              resultTone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400"
                : resultTone === "error"
                  ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400"
                  : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-300"
            }`}
          >
            {lastResult}
          </div>
        )}
      </div>

      {/* Randomization & cross-account dedup */}
      <div className="border-b border-zinc-100 p-5 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <Shuffle className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Random pick & cross-account dedup
          </h3>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Pending recipients di-shuffle ulang setiap hari sebelum batch jalan,
          jadi tiap hari pick acak dari seluruh pool (atas, tengah, atau bawah
          list) — bukan urutan deterministik. Kalau lo punya queue di
          workspace lain dengan akun beda, sistem otomatis skip kontak yang
          udah disentuh akun lain dalam 3 hari terakhir.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={handleReshuffle}
            disabled={pending}
            title={
              pendingCount === 0
                ? "Gak ada pending recipients — RPC tetap jalan tapi 0 row ke-shuffle"
                : `${pendingCount.toLocaleString("id-ID")} pending recipients akan dapat urutan acak baru`
            }
          >
            <Shuffle className="h-3.5 w-3.5" />
            Reshuffle now
          </Button>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <ShieldCheck className="h-3 w-3" />
            Last reshuffle: <strong className="font-medium text-zinc-700 dark:text-zinc-300">{timeAgo(lastShuffledAt)}</strong>
            <span className="text-zinc-400 dark:text-zinc-600">·</span>
            <strong className="font-medium text-zinc-700 dark:text-zinc-300">{pendingCount.toLocaleString("id-ID")}</strong> pending
          </span>
        </div>
        {shuffleMsg && (
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
            {shuffleMsg}
          </p>
        )}
      </div>

      {/* Auto-refill (evergreen) — info-only, no controls. */}
      <div className="border-b border-zinc-100 p-5 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Auto-refill
          </h3>
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
            {audienceType === "manual" ? "Off (manual list)" : "On"}
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          {audienceType === "manual"
            ? "Queue ini pakai manual contact list — gak di-refill otomatis. Bikin queue baru kalau mau target audience lain."
            : "Sebelum batch jalan, kalau pending recipients tipis (kurang dari 2 hari kapasitas), sistem otomatis tambah kontak baru dari pool yang match audience — tanpa duplikat dari queue ini. Lo gak perlu klik apa-apa."}
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          <ShieldCheck className="h-3 w-3" />
          Last refill: <strong className="font-medium text-zinc-700 dark:text-zinc-300">{timeAgo(lastRefilledAt)}</strong>
        </div>
      </div>

      {/* Manage controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePauseToggle}
          disabled={pending}
        >
          {optimisticActive ? (
            <>
              <Pause className="h-3.5 w-3.5" /> Pause Queue
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" /> Resume Queue
            </>
          )}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={pending}
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete Queue
        </Button>
      </div>
    </Card>
  );
}
