import Link from "next/link";
import { Coins, Sparkles } from "lucide-react";
import { requireCurrentUser } from "@/lib/supabase/session-helpers";
import { createClient } from "@/lib/supabase/server";
import { getApolloCreditStatus } from "@/lib/apollo-credits";
import { Notice } from "@/components/ui";

/**
 * Workspace dashboard widget for Apollo credits. Two looks:
 *  - normal: a slim accent notice with remaining estimate + "Cari lead" CTA.
 *  - reminder: a warning notice when there's still a meaningful chunk unused
 *    AND the cycle resets soon (use-it-or-lose-it).
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

  const cta = (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-ink">
      <Sparkles className="h-3 w-3 text-accent-text" />
      Cari lead →
    </span>
  );

  if (credit.unusedHint) {
    return (
      <Link href={href} prefetch className="mb-6 block">
        <Notice
          tone="warning"
          icon={<Coins className="h-4 w-4" />}
          title={`Masih ada ≈${remaining} kredit Apollo belum kepakai bulan ini`}
          action={cta}
        >
          <p className="mt-0.5 text-[13px] text-muted">
            Reset {credit.nextResetIso} ({credit.daysToReset} hari lagi) — sayang
            kalau hangus. Cari lead baru sekarang →
          </p>
        </Notice>
      </Link>
    );
  }

  return (
    <Link href={href} prefetch className="mb-6 block">
      <Notice
        tone="accent"
        icon={<Coins className="h-4 w-4" />}
        action={cta}
      >
        <span className="text-ink-secondary">
          Apollo: <strong className="tabular text-ink">≈{remaining}</strong>{" "}
          kredit tersisa bulan ini
          <span className="ml-1 text-muted">· reset {credit.daysToReset} hari</span>
        </span>
      </Notice>
    </Link>
  );
}
