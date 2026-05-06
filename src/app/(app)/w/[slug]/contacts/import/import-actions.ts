"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces";

const EmailSchema = z.string().email();

export type SkippedReason =
  | "missing_email"
  | "invalid_email"
  | "duplicate_in_csv"
  | "duplicate_primary"
  | "duplicate_alt";

export const SKIPPED_REASON_LABEL: Record<SkippedReason, string> = {
  missing_email: "Email kosong",
  invalid_email: "Format email invalid",
  duplicate_in_csv: "Duplikat di CSV ini",
  duplicate_primary: "Sudah ada di database (primary)",
  duplicate_alt: "Sudah ada sebagai alt email kontak lain",
};

export type SkippedDetail = {
  rowIndex: number;
  email: string;
  reason: SkippedReason;
};

export type ImportRow = {
  email?: string;
  alt_emails?: string[];
  first_name?: string;
  last_name?: string;
  company?: string;
  position?: string;
  phone?: string;
  website?: string;
  notes?: string;
  tags?: string;
};

export type ImportRowWithIndex = ImportRow & { rowIndex: number };

export type AnalysisRow = {
  rowIndex: number;
  email?: string;
  alt_emails?: string[];
};

export type AnalysisResult = {
  totalRows: number;
  willImport: number;
  skipped: SkippedDetail[];
};

export type ChunkResult = {
  imported: number;
  skipped: SkippedDetail[];
  failed: number;
  errors: string[];
};

type EmailIndex = {
  primaries: Map<string, string>;
  altsToContact: Map<string, string>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadExistingEmailIndex(
  supabase: any,
  userId: string,
): Promise<EmailIndex> {
  const { data } = await supabase
    .from("contacts")
    .select("id, email, alt_emails")
    .eq("user_id", userId)
    .is("deleted_at", null);

  const primaries = new Map<string, string>();
  const altsToContact = new Map<string, string>();
  for (const r of (data ?? []) as Array<{
    id: string;
    email: string;
    alt_emails: string[] | null;
  }>) {
    primaries.set(r.email.toLowerCase(), r.id);
    for (const a of r.alt_emails ?? []) {
      altsToContact.set(a.toLowerCase(), r.id);
    }
  }
  return { primaries, altsToContact };
}

/**
 * Pre-import dry-run: classify each row without writing anything.
 * Used to show the user what's about to happen before they commit.
 */
export async function analyzeImport(
  slug: string,
  rows: AnalysisRow[],
): Promise<AnalysisResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ws = await getWorkspaceBySlug(slug);
  if (!ws) {
    return {
      totalRows: rows.length,
      willImport: 0,
      skipped: [],
    };
  }

  const { primaries, altsToContact } = await loadExistingEmailIndex(
    supabase,
    user.id,
  );

  const seenInCsv = new Set<string>();
  const skipped: SkippedDetail[] = [];
  let willImport = 0;

  for (const r of rows) {
    const raw = r.email?.trim().toLowerCase() ?? "";
    if (!raw) {
      skipped.push({ rowIndex: r.rowIndex, email: "", reason: "missing_email" });
      continue;
    }
    if (!EmailSchema.safeParse(raw).success) {
      skipped.push({
        rowIndex: r.rowIndex,
        email: raw,
        reason: "invalid_email",
      });
      continue;
    }
    if (seenInCsv.has(raw)) {
      skipped.push({
        rowIndex: r.rowIndex,
        email: raw,
        reason: "duplicate_in_csv",
      });
      continue;
    }
    seenInCsv.add(raw);
    if (primaries.has(raw)) {
      skipped.push({
        rowIndex: r.rowIndex,
        email: raw,
        reason: "duplicate_primary",
      });
      continue;
    }
    if (altsToContact.has(raw)) {
      skipped.push({
        rowIndex: r.rowIndex,
        email: raw,
        reason: "duplicate_alt",
      });
      continue;
    }
    willImport++;
  }

  return { totalRows: rows.length, willImport, skipped };
}

/**
 * Insert one chunk of contacts. Each chunk re-fetches the email index
 * so previous chunks (within the same import session) are seen as
 * "already imported" rather than retried.
 */
export async function importContactsChunk(
  slug: string,
  rows: ImportRowWithIndex[],
  defaultTags: string[],
): Promise<ChunkResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) {
    return {
      imported: 0,
      skipped: [],
      failed: rows.length,
      errors: ["Workspace not found"],
    };
  }

  const { primaries, altsToContact } = await loadExistingEmailIndex(
    supabase,
    user.id,
  );

  const skipped: SkippedDetail[] = [];
  const seenInChunk = new Set<string>();
  type ToInsert = { rowIndex: number; record: Record<string, unknown> };
  const toInsert: ToInsert[] = [];

  for (const row of rows) {
    const raw = row.email?.trim().toLowerCase() ?? "";
    if (!raw) {
      skipped.push({ rowIndex: row.rowIndex, email: "", reason: "missing_email" });
      continue;
    }
    if (!EmailSchema.safeParse(raw).success) {
      skipped.push({ rowIndex: row.rowIndex, email: raw, reason: "invalid_email" });
      continue;
    }
    if (seenInChunk.has(raw)) {
      skipped.push({
        rowIndex: row.rowIndex,
        email: raw,
        reason: "duplicate_in_csv",
      });
      continue;
    }
    seenInChunk.add(raw);
    if (primaries.has(raw)) {
      skipped.push({
        rowIndex: row.rowIndex,
        email: raw,
        reason: "duplicate_primary",
      });
      continue;
    }
    if (altsToContact.has(raw)) {
      skipped.push({
        rowIndex: row.rowIndex,
        email: raw,
        reason: "duplicate_alt",
      });
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

    const altEmails = Array.from(
      new Set(
        (row.alt_emails ?? [])
          .map((e) => e.trim().toLowerCase())
          .filter(
            (e) =>
              e &&
              e !== raw &&
              EmailSchema.safeParse(e).success &&
              !primaries.has(e) &&
              !altsToContact.has(e),
          ),
      ),
    );

    toInsert.push({
      rowIndex: row.rowIndex,
      record: {
        user_id: user.id,
        email: raw,
        alt_emails: altEmails,
        first_name: row.first_name?.trim() || null,
        last_name: row.last_name?.trim() || null,
        company: row.company?.trim() || null,
        position: row.position?.trim() || null,
        phone: row.phone?.trim() || null,
        website: row.website?.trim() || null,
        notes: row.notes?.trim() || null,
        tags: Array.from(new Set(tags)),
        source: "csv_import",
      },
    });
  }

  if (toInsert.length === 0) {
    return { imported: 0, skipped, failed: 0, errors: [] };
  }

  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  const { data, error } = await supabase
    .from("contacts")
    .upsert(
      toInsert.map((t) => t.record),
      { onConflict: "user_id,email", ignoreDuplicates: true },
    )
    .select("id");

  if (error) {
    failed = toInsert.length;
    errors.push(error.message);
  } else {
    imported = data?.length ?? 0;
    // race-condition: anything not returned was a silent dup at DB level
    if (imported < toInsert.length) {
      // we won't know which row exactly; emit a soft-warning skip
      const diff = toInsert.length - imported;
      for (let k = 0; k < diff; k++) {
        skipped.push({
          rowIndex: toInsert[toInsert.length - 1 - k].rowIndex,
          email: String(toInsert[toInsert.length - 1 - k].record.email),
          reason: "duplicate_primary",
        });
      }
    }
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
        .upsert(wsData, {
          onConflict: "contact_id,workspace_id",
          ignoreDuplicates: true,
        });
    }
  }

  revalidatePath(`/w/${slug}/contacts`);

  return { imported, skipped, failed, errors };
}
