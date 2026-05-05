"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces";

export type ImportRow = {
  email?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  position?: string;
  phone?: string;
  website?: string;
  notes?: string;
  tags?: string;
};

export type ImportResult = {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
};

const EmailSchema = z.string().email();

const BATCH_SIZE = 500;

export async function importContacts(
  slug: string,
  rows: ImportRow[],
  defaultTags: string[],
): Promise<ImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) {
    return {
      imported: 0,
      skipped: 0,
      failed: rows.length,
      errors: ["Workspace not found"],
    };
  }

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  // Filter and normalize rows
  const validRows: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    if (!row.email) {
      skipped++;
      continue;
    }
    const email = row.email.trim().toLowerCase();
    if (!EmailSchema.safeParse(email).success) {
      skipped++;
      continue;
    }

    const tags = [
      ...defaultTags,
      ...(row.tags
        ? row.tags
            .split(/[,;]/)
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
        : []),
    ];

    validRows.push({
      user_id: user.id,
      email,
      first_name: row.first_name?.trim() || null,
      last_name: row.last_name?.trim() || null,
      company: row.company?.trim() || null,
      position: row.position?.trim() || null,
      phone: row.phone?.trim() || null,
      website: row.website?.trim() || null,
      notes: row.notes?.trim() || null,
      tags: Array.from(new Set(tags)),
      source: "csv_import",
    });
  }

  // Insert in batches with onConflict do nothing
  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const batch = validRows.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from("contacts")
      .upsert(batch, {
        onConflict: "user_id,email",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) {
      failed += batch.length;
      errors.push(`Batch ${i / BATCH_SIZE + 1}: ${error.message}`);
      continue;
    }

    const insertedCount = data?.length ?? 0;
    imported += insertedCount;
    skipped += batch.length - insertedCount; // rows that conflicted (duplicate email)

    // Create contact_workspace_data rows for newly inserted contacts
    if (data && data.length > 0) {
      const wsData = data.map((c: { id: string }) => ({
        contact_id: c.id,
        workspace_id: workspace.id,
        user_id: user.id,
        lead_stage_id: "new",
        lead_stage_updated_at: new Date().toISOString(),
      }));
      await supabase
        .from("contact_workspace_data")
        .upsert(wsData, { onConflict: "contact_id,workspace_id", ignoreDuplicates: true });
    }
  }

  revalidatePath(`/w/${slug}/contacts`);

  return { imported, skipped, failed, errors };
}
