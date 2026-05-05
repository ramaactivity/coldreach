"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Pause, Trash2, Zap, AlertTriangle } from "lucide-react";
import {
  pauseQueue,
  resumeQueue,
  deleteQueueAction,
  runNowAction,
} from "../actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function QueueActionsBar({
  slug,
  queueId,
  isActive,
  canSend,
  pendingCount,
}: {
  slug: string;
  queueId: string;
  isActive: boolean;
  canSend: boolean;
  pendingCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [resultTone, setResultTone] = useState<"success" | "error" | "info">("info");

  function handleRun(batchSize: number) {
    setLastResult(null);
    startTransition(async () => {
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
    });
  }

  function handlePauseToggle() {
    startTransition(async () => {
      if (isActive) {
        await pauseQueue(slug, queueId);
      } else {
        await resumeQueue(slug, queueId);
      }
      router.refresh();
    });
  }

  function handleDelete() {
    if (
      !confirm(
        "Delete queue ini permanen? Semua queue_recipients ikut terhapus, tapi email yang udah ke-kirim tetap di Gmail Sent.",
      )
    )
      return;
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
            loading={pending}
          >
            Send 1 email
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleRun(3)}
            disabled={!canSend || pending}
          >
            Send 3 emails
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleRun(10)}
            disabled={!canSend || pending}
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

      {/* Manage controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePauseToggle}
          disabled={pending}
        >
          {isActive ? (
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
