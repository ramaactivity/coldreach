"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { scrapeWebsite as runScrape, type ScrapedContact } from "@/lib/scraper";

export type { ScrapedContact } from "@/lib/scraper";

export type ScrapeState = {
  error?: string;
  url?: string;
  fetchedPages?: string[];
  blocked?: boolean;
  rendered?: boolean;
  contacts?: (ScrapedContact & { alreadyImported?: boolean })[];
};

export type ScrapeImportResult = {
  error?: string;
  found?: number; // total candidates submitted
  importable?: number; // had an email
  deduped?: number; // already existed
  imported?: number; // newly inserted
  skipped_no_email?: number; // phone/social-only, not imported
};

async function authWorkspace(slug: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const workspace = await getWorkspaceBySlug(slug);
  return { supabase, user, workspace };
}

/** Scrape one URL and flag which found emails are already in the user's contacts. */
export async function scrapeWebsite(
  slug: string,
  url: string,
): Promise<ScrapeState> {
  const { supabase, user, workspace } = await authWorkspace(slug);
  if (!workspace) return { error: "Workspace not found" };

  let res;
  try {
    res = await runScrape(url);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Scrape gagal" };
  }
  if (res.error && res.contacts.length === 0) {
    return { error: res.error, blocked: res.blocked, url: res.url };
  }

  // Flag already-imported emails so the client can grey them out.
  const emails = res.contacts
    .map((c) => c.email)
    .filter((e): e is string => Boolean(e));
  const existing = new Set<string>();
  if (emails.length > 0) {
    const { data } = await supabase
      .from("contacts")
      .select("email")
      .eq("user_id", user.id)
      .in("email", emails);
    for (const r of data ?? []) {
      const e = (r as { email: string | null }).email;
      if (e) existing.add(e.toLowerCase());
    }
  }

  return {
    url: res.url,
    fetchedPages: res.fetchedPages,
    blocked: res.blocked,
    rendered: res.rendered,
    contacts: res.contacts.map((c) => ({
      ...c,
      alreadyImported: c.email ? existing.has(c.email) : false,
    })),
  };
}

function splitName(name?: string): { first_name: string | null; last_name: string | null } {
  if (!name?.trim()) return { first_name: null, last_name: null };
  const parts = name.trim().split(/\s+/);
  return {
    first_name: parts[0] ?? null,
    last_name: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

/** Fold phone + socials + source into a notes string so nothing is lost. */
function buildNote(c: ScrapedContact): string {
  const bits: string[] = [`Scraped dari ${c.source_page}`];
  if (c.phone) bits.push(`Telepon: ${c.phone}`);
  if (c.socials.linkedin) bits.push(`LinkedIn: ${c.socials.linkedin}`);
  if (c.socials.instagram) bits.push(`Instagram: ${c.socials.instagram}`);
  if (c.socials.twitter) bits.push(`Twitter/X: ${c.socials.twitter}`);
  if (c.socials.facebook) bits.push(`Facebook: ${c.socials.facebook}`);
  return bits.join(" · ");
}

/** Import selected scraped contacts. Mirrors discover's doImport (no reveal). */
export async function importScraped(
  slug: string,
  contacts: ScrapedContact[],
): Promise<ScrapeImportResult> {
  const { supabase, user, workspace } = await authWorkspace(slug);
  if (!workspace) return { error: "Workspace not found" };
  if (!contacts.length) return { error: "Pilih minimal 1 kontak" };

  const found = contacts.length;
  const withEmail = contacts.filter((c) => c.email && c.email.trim());
  const skipped_no_email = found - withEmail.length;
  const importable = withEmail.length;

  if (importable === 0) {
    return { found, importable: 0, deduped: 0, imported: 0, skipped_no_email };
  }

  // Dedup within the batch by lowercased email.
  const byEmail = new Map<string, ScrapedContact>();
  for (const c of withEmail) {
    const e = (c.email as string).toLowerCase();
    if (!byEmail.has(e)) byEmail.set(e, c);
  }
  const emails = [...byEmail.keys()];

  // Dedup vs existing contacts.
  const { data: existingRows } = await supabase
    .from("contacts")
    .select("email")
    .eq("user_id", user.id)
    .in("email", emails);
  const existing = new Set(
    (existingRows ?? []).map((r) =>
      (r as { email: string }).email.toLowerCase(),
    ),
  );

  let deduped = 0;
  const toInsert: Array<Record<string, unknown>> = [];
  for (const [email, c] of byEmail) {
    if (existing.has(email)) {
      deduped++;
      continue;
    }
    const { first_name, last_name } = splitName(c.name);
    toInsert.push({
      user_id: user.id,
      email,
      first_name,
      last_name,
      company: c.company ?? null,
      position: c.role ?? null,
      phone: c.phone ?? null,
      website: c.website,
      notes: buildNote(c),
      source: "website_scrape",
      tags: ["scraped"],
    });
  }

  let imported = 0;
  if (toInsert.length > 0) {
    const { data: inserted, error } = await supabase
      .from("contacts")
      .upsert(toInsert, { onConflict: "user_id,email", ignoreDuplicates: true })
      .select("id");
    if (error) return { error: error.message };
    const ids = (inserted ?? []).map((r) => (r as { id: string }).id);
    imported = ids.length;
    if (ids.length > 0) {
      await supabase.from("contact_workspace_data").upsert(
        ids.map((id) => ({
          contact_id: id,
          workspace_id: workspace.id,
          user_id: user.id,
          lead_stage_id: "new",
          lead_stage_updated_at: new Date().toISOString(),
        })),
        { onConflict: "contact_id,workspace_id", ignoreDuplicates: true },
      );
    }
  }

  // Audit log — activity_log is service-role-only under RLS.
  if (imported > 0) {
    const admin = createAdminClient();
    const { error: logErr } = await admin.from("activity_log").insert({
      user_id: user.id,
      workspace_id: workspace.id,
      activity_type: "website_scrape_import",
      entity_type: "contacts",
      metadata: { imported, found, importable },
    });
    if (logErr) console.error("website_scrape_import log failed:", logErr.message);
  }

  revalidatePath(`/w/${slug}/contacts`);
  revalidatePath(`/w/${slug}/dashboard`);
  return { found, importable, deduped, imported, skipped_no_email };
}
