"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  pauseQueue,
  resumeQueue,
  deleteQueueAction,
  runNowAction,
} from "../actions";

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

  function handleRun(batchSize: number) {
    setLastResult(null);
    startTransition(async () => {
      const res = await runNowAction(slug, queueId, batchSize);
      if ("error" in res && res.error) {
        setLastResult(`Error: ${res.error}`);
      } else if ("result" in res && res.result) {
        const r = res.result;
        const parts = [`Attempted ${r.attempted}`, `sent ${r.sent}`];
        if (r.failed > 0) parts.push(`failed ${r.failed}`);
        if (r.skipped > 0) parts.push(`skipped ${r.skipped}`);
        setLastResult(parts.join(", "));
        if (r.errors.length > 0) {
          setLastResult(
            (prev) => `${prev}. Errors: ${r.errors.slice(0, 2).join("; ")}`,
          );
        }
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
        "Delete queue ini permanen? Semua queue_recipients akan ikut terhapus, tapi email yang udah ke-kirim tetap di Gmail Sent.",
      )
    )
      return;
    startTransition(async () => {
      await deleteQueueAction(slug, queueId);
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        Run Now (manual test)
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        Untuk testing, kirim email langsung tanpa nunggu cron schedule. Pakai delay 30-90 detik antar email kalau lu kirim batch &gt; 1.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => handleRun(1)}
          disabled={!canSend || pending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-50 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? "Running..." : "Send 1 email"}
        </button>
        <button
          onClick={() => handleRun(3)}
          disabled={!canSend || pending}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        >
          Send 3 emails
        </button>
        <button
          onClick={() => handleRun(10)}
          disabled={!canSend || pending}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        >
          Send 10 emails
        </button>
      </div>
      {!canSend && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          {pendingCount === 0
            ? "Gak ada pending recipients."
            : "Quota harian habis atau Gmail belum connected."}
        </p>
      )}
      {lastResult && (
        <p className="mt-3 rounded-md bg-zinc-100 p-2 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {lastResult}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <button
          onClick={handlePauseToggle}
          disabled={pending}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        >
          {isActive ? "Pause Queue" : "Resume Queue"}
        </button>
        <button
          onClick={handleDelete}
          disabled={pending}
          className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-zinc-900 dark:text-red-400"
        >
          Delete Queue
        </button>
      </div>
    </div>
  );
}
