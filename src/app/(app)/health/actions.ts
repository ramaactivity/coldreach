"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { corporateDomainOf } from "@/lib/lang-detect";

/**
 * Archive every still-active contact on a company domain that keeps
 * bouncing. Same effect as a manual archive: queues skip them, the contact
 * stays in the database (archive_reason 'domain_bounce').
 */
export async function archiveDomain(
  domain: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const d = domain.trim().toLowerCase();
  // Letters/digits/dots/hyphens only (no LIKE wildcards), and never a webmail
  // domain — archiving gmail.com would wipe unrelated people.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) || corporateDomainOf(`x@${d}`) !== d) {
    return { ok: false, error: "Domain ini tidak bisa diarsipkan sekaligus" };
  }
  const { data, error } = await supabase
    .from("contacts")
    .update({ archived_at: new Date().toISOString(), archive_reason: "domain_bounce" })
    .eq("user_id", user.id)
    .eq("status", "active")
    .is("archived_at", null)
    .is("deleted_at", null)
    .ilike("email", `%@${d}`)
    .select("id");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/health");
  return { ok: true, count: data?.length ?? 0 };
}
