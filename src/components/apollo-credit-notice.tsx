import Link from "next/link";
import { Coins, Sparkles } from "lucide-react";
import { requireCurrentUser } from "@/lib/supabase/session-helpers";
import { createClient } from "@/lib/supabase/server";
import { getApolloCreditStatus } from "@/lib/apollo-credits";

/**
 * Workspace dashboard widget for Apollo credits. Two looks:
 *  - normal: a slim info card with remaining estimate + "Cari lead" CTA.
 *  - reminder: a prominent amber banner when there's still a meaningful chunk
 *    unused AND the cycle resets soon (use-it-or-lose-it).
 * Hidden entirely if Apollo isn't configured.
 */
export async function ApolloCreditNotice({ slug }: { slug: string }) {
  if (!process.env.APOLLO_API_KEY) return null;

  let credit;
  try {
    const user = await requireCurrentUser();
    const supabase = await createClient();
    credit = await getApolloCreditStatus(supabase, user.id);
  } catch {
    return null;
  }

  const href = `/w/${slug}/contacts/discover`;
  const remaining = credit.remainingEst.toLocaleString("id-ID");

  if (credit.unusedHint) {
    return (
      <Link
        href={href}
        prefetch={true}
        className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 transition-colors hover:bg-amber-100/70 dark:border-amber-900/60 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
      >
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
          <Coins className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Masih ada ≈{remaining} kredit Apollo belum kepakai bulan ini
          </p>
          <p className="mt-0.5 text-xs text-amber-800/90 dark:text-amber-300/80">
            Reset {credit.nextResetIso} ({credit.daysToReset} hari lagi) — sayang
            kalau hangus. Cari lead baru sekarang →
          </p>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      prefetch={true}
      className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-zinc-200/70 bg-white px-4 py-3 transition-colors hover:bg-zinc-50 dark:border-zinc-800/70 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"
    >
      <span className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <Coins className="h-4 w-4 text-amber-500" />
        Apollo: <strong className="tabular-nums">≈{remaining}</strong> kredit
        tersisa bulan ini
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          · reset {credit.daysToReset} hari
        </span>
      </span>
      <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-900 dark:text-zinc-100">
        <Sparkles className="h-3 w-3 text-amber-500" />
        Cari lead →
      </span>
    </Link>
  );
}
