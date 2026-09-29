import { NextResponse, type NextRequest } from "next/server";
import { requireCurrentUser } from "@/lib/supabase/session-helpers";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import {
  listAllContactsForExport,
  type ContactSegment,
} from "@/lib/contacts";
import {
  CONTACTS_SORT_OPTIONS,
  type ContactsSort,
} from "@/lib/contacts-constants";
import { buildCsv } from "@/lib/csv";

const VALID_SORTS = new Set(CONTACTS_SORT_OPTIONS.map((o) => o.value));
const VALID_SEGMENTS = new Set<ContactSegment>([
  "never_contacted",
  "replied",
  "bounced",
  "stale_30d",
]);

const HEADERS = [
  "email",
  "alt_emails",
  "first_name",
  "last_name",
  "company",
  "position",
  "phone",
  "website",
  "tags",
  "stage",
  "status",
  "priority",
  "last_contacted_at",
  "total_emails_sent",
  "total_emails_opened",
  "total_replies",
  "workspace_notes",
  "notes",
  "source",
  "created_at",
];

/**
 * Streams a CSV of contacts in the given workspace, honoring the same
 * filter / sort URL params as the /contacts page so "what you see is
 * what you export".
 *
 * Auth via cookie (server client). RLS keeps the query scoped to the
 * authenticated user.
 */
export async function GET(request: NextRequest) {
  await requireCurrentUser();

  const sp = request.nextUrl.searchParams;
  const slug = sp.get("workspace");
  if (!slug) {
    return new NextResponse("Missing workspace", { status: 400 });
  }

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) {
    return new NextResponse("Workspace not found", { status: 404 });
  }

  const sortRaw = sp.get("sort");
  const sort: ContactsSort = (
    sortRaw && VALID_SORTS.has(sortRaw as ContactsSort)
      ? sortRaw
      : "created_desc"
  ) as ContactsSort;

  const segmentRaw = sp.get("segment");
  const segment =
    segmentRaw && VALID_SEGMENTS.has(segmentRaw as ContactSegment)
      ? (segmentRaw as ContactSegment)
      : undefined;

  const stageById = new Map(
    workspace.pipeline_stages.map((s) => [s.id, s.name]),
  );

  const contacts = await listAllContactsForExport(workspace, {
    search: sp.get("q") ?? undefined,
    tags: sp.get("tag") ? [sp.get("tag")!] : undefined,
    lead_stage_id: sp.get("stage") ?? undefined,
    segment,
    sort_by: sort,
  });

  const rows = contacts.map((c) => {
    const wd = c.workspace_data;
    return [
      c.email,
      (c.alt_emails ?? []).join("; "),
      c.first_name ?? "",
      c.last_name ?? "",
      c.company ?? "",
      c.position ?? "",
      c.phone ?? "",
      c.website ?? "",
      (c.tags ?? []).join("; "),
      wd?.lead_stage_id ? stageById.get(wd.lead_stage_id) ?? wd.lead_stage_id : "",
      c.status,
      c.priority,
      wd?.last_contacted_at ?? "",
      wd?.total_emails_sent ?? 0,
      wd?.total_emails_opened ?? 0,
      wd?.total_replies ?? 0,
      wd?.workspace_notes ?? "",
      c.notes ?? "",
      c.source ?? "",
      c.created_at,
    ];
  });

  const csv = buildCsv(HEADERS, rows);

  // Build filename: workspace-slug + filter hint + date. `stage`/`tag` are
  // attacker-controllable, so strip everything but safe filename chars before
  // interpolating into the Content-Disposition header (defense-in-depth
  // against header injection even though the runtime also strips CR/LF).
  const safe = (v: string) => v.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  const filterParts: string[] = [];
  if (sp.get("segment")) filterParts.push(safe(sp.get("segment") as string));
  if (sp.get("stage")) filterParts.push(`stage-${safe(sp.get("stage") as string)}`);
  if (sp.get("tag")) filterParts.push(`tag-${safe(sp.get("tag") as string)}`);
  if (sp.get("q")) filterParts.push("search");
  const filterStr = filterParts.length > 0 ? `-${filterParts.join("-")}` : "";
  const filename = `coldreach-${workspace.slug}${filterStr}-${date}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
