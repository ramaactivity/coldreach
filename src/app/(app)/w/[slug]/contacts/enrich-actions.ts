"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { apolloBulkEnrichByEmail } from "@/lib/apollo";

export type EnrichResult = {
  error?: string;
  checked?: number;
  verified?: number;
  email_updated?: number;
  risky?: number;
  skipped?: number;
  credits_used?: number;
};

// Re-verify at most once per 30 days to avoid burning credits on fresh data.
const RECENT_DAYS = 30;

function goodStatus(s: string | null): boolean {
  if (!s) return true; // email present, status unknown → treat as usable
  const x = s.toLowerCase();
  return (
    x.includes("verified") ||
    x.includes("likely") ||
    x === "valid" ||
    x === "guessed"
  );
}

type Row = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  position: string | null;
  apollo_id: string | null;
  alt_emails: string[] | null;
  enriched_at: string | null;
};

/**
 * Verify/refresh selected contacts via Apollo (match by email). Updates a
 * changed email (old → alt_emails), confirms good ones, flags the rest as
 * risky. Skips contacts verified within the last 30 days. ~1 credit per
 * revealed email.
 */
export async function bulkEnrichContacts(
  slug: string,
  contactIds: string[],
): Promise<EnrichResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return { error: "Workspace not found" };
  if (!contactIds.length) return { error: "Pilih minimal 1 kontak" };

  const { data: rowsRaw, error: fetchErr } = await supabase
    .from("contacts")
    .select(
      "id, email, first_name, last_name, company, position, apollo_id, alt_emails, enriched_at",
    )
    .eq("user_id", user.id)
    .in("id", contactIds);
  if (fetchErr) return { error: fetchErr.message };
  const rows = (rowsRaw ?? []) as Row[];

  const cutoff = Date.now() - RECENT_DAYS * 86400 * 1000;
  const toCheck = rows.filter(
    (c) =>
      c.email &&
      (!c.enriched_at || new Date(c.enriched_at).getTime() < cutoff),
  );
  const skipped = rows.length - toCheck.length;
  if (toCheck.length === 0) {
    return {
      checked: 0,
      verified: 0,
      email_updated: 0,
      risky: 0,
      skipped,
      credits_used: 0,
    };
  }

  let matches;
  try {
    matches = await apolloBulkEnrichByEmail(
      toCheck.map((c) => ({
        email: c.email as string,
        firstName: c.first_name,
        lastName: c.last_name,
        company: c.company,
      })),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Verifikasi gagal" };
  }

  const nowIso = new Date().toISOString();
  let verified = 0;
  let emailUpdated = 0;
  let risky = 0;
  let creditsUsed = 0;

  await Promise.all(
    toCheck.map(async (c, i) => {
      const m = matches[i];
      const update: Record<string, unknown> = { enriched_at: nowIso };
      if (m?.id && !c.apollo_id) update.apollo_id = m.id;

      const revealed = m?.email ?? null;
      if (revealed) creditsUsed++;

      if (revealed && goodStatus(m!.email_status)) {
        update.email_status = m!.email_status ?? "verified";
        if (revealed === (c.email ?? "").toLowerCase()) {
          // Same email confirmed good.
          update.email_verified_at = nowIso;
          verified++;
          if (!c.position && m!.title) update.position = m!.title;
          if (!c.company && m!.organization_name)
            update.company = m!.organization_name;
        } else {
          // Different email. Replace primary (old → alt) unless the new one
          // already belongs to another of this user's contacts.
          const { data: clash } = await supabase
            .from("contacts")
            .select("id")
            .eq("user_id", user.id)
            .eq("email", revealed)
            .neq("id", c.id)
            .limit(1)
            .maybeSingle();
          if (clash) {
            update.email_status = "duplicate";
            risky++;
          } else {
            const alts = new Set((c.alt_emails ?? []).map((e) => e.toLowerCase()));
            if (c.email) alts.add(c.email.toLowerCase());
            alts.delete(revealed);
            update.email = revealed;
            update.alt_emails = Array.from(alts);
            update.email_verified_at = nowIso;
            if (m!.title) update.position = m!.title;
            if (m!.organization_name) update.company = m!.organization_name;
            emailUpdated++;
          }
        }
      } else {
        // No usable email → risky (do NOT archive).
        update.email_status = revealed
          ? (m!.email_status ?? "unverified")
          : (m?.email_status ?? "not_found");
        risky++;
      }

      await supabase.from("contacts").update(update).eq("id", c.id);
    }),
  );

  if (creditsUsed > 0) {
    const admin = createAdminClient();
    await admin.from("activity_log").insert({
      user_id: user.id,
      workspace_id: workspace.id,
      activity_type: "apollo_credits_used",
      entity_type: "contacts",
      metadata: { count: creditsUsed, verified, email_updated: emailUpdated },
    });
  }

  revalidatePath(`/w/${slug}/contacts`);
  revalidatePath(`/w/${slug}/dashboard`);
  return {
    checked: toCheck.length,
    verified,
    email_updated: emailUpdated,
    risky,
    skipped, // recently-verified or without an email
    credits_used: creditsUsed,
  };
}
