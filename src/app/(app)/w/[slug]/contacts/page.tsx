import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Upload,
  Users,
  ChevronLeft,
  ChevronRight,
  MailX,
  MessageCircle,
  AlertOctagon,
  Clock,
  Archive,
  Eye,
  UserPlus,
} from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import {
  listContacts,
  getContactStats,
  type ContactSegment,
} from "@/lib/contacts";
import {
  CONTACTS_SORT_OPTIONS,
  type ContactsSort,
} from "@/lib/contacts-constants";
import { listSavedFilters } from "./saved-filter-actions";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { FiltersBar } from "./filters-bar";
import { ContactsTable } from "./contacts-table";
import { ExportButton } from "./export-button";

const PAGE_SIZE = 50;

const VALID_SORTS = new Set(CONTACTS_SORT_OPTIONS.map((o) => o.value));
const VALID_SEGMENTS = new Set<ContactSegment>([
  "never_contacted",
  "replied",
  "bounced",
  "stale_30d",
  "archived",
  "unverified",
  "risky",
]);

export default async function ContactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    q?: string;
    tag?: string;
    page?: string;
    sort?: string;
    stage?: string;
    segment?: string;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const page = Math.max(0, parseInt(sp.page ?? "0", 10));
  const sort = (
    sp.sort && VALID_SORTS.has(sp.sort as ContactsSort)
      ? sp.sort
      : "created_desc"
  ) as ContactsSort;
  const segment =
    sp.segment && VALID_SEGMENTS.has(sp.segment as ContactSegment)
      ? (sp.segment as ContactSegment)
      : undefined;

  const [{ contacts, total }, savedFilters, stats] = await Promise.all([
    listContacts(
      workspace,
      {
        search: sp.q,
        tags: sp.tag ? [sp.tag] : undefined,
        lead_stage_id: sp.stage || undefined,
        segment,
        sort_by: sort,
      },
      page,
      PAGE_SIZE,
    ),
    listSavedFilters(slug),
    getContactStats(workspace),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilter = Boolean(sp.q || sp.tag || sp.stage || sp.segment);
  const fmt = (n: number) => n.toLocaleString("id-ID");
  const pct = (n: number, base: number) =>
    base > 0 ? Math.round((n / base) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-8 pb-32">
      <PageHeader
        title="Contacts"
        description={`${total.toLocaleString("id-ID")} contacts · shared antar workspace, status untuk ${workspace.name}`}
        actions={
          <>
            <ExportButton slug={slug} />
            <ButtonLink href={`/w/${slug}/contacts/new`} size="md">
              <Plus className="h-4 w-4" />
              New Contact
            </ButtonLink>
          </>
        }
      />

      {/* Database snapshot — outreach funnel + composition */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link
          href={`/w/${slug}/contacts?segment=never_contacted`}
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
        >
          <StatCard
            label="Belum dikontak"
            value={fmt(stats.never_contacted)}
            icon={MailX}
            tone={stats.never_contacted > 0 ? "amber" : "default"}
            hint={`${pct(stats.never_contacted, stats.active_total)}% dari aktif`}
          />
        </Link>
        <Link
          href={`/w/${slug}/contacts?segment=replied`}
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
        >
          <StatCard
            label="Pernah reply"
            value={fmt(stats.replied)}
            icon={MessageCircle}
            tone={stats.replied > 0 ? "emerald" : "default"}
            hint={`${pct(stats.replied, stats.active_total)}% dari aktif`}
          />
        </Link>
        <Link
          href={`/w/${slug}/contacts?segment=stale_30d`}
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
        >
          <StatCard
            label="Stale 30+ hari"
            value={fmt(stats.stale_30d)}
            icon={Clock}
            hint="butuh follow-up"
          />
        </Link>
        <Link
          href={`/w/${slug}/contacts?segment=bounced`}
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
        >
          <StatCard
            label="Bounced"
            value={fmt(stats.bounced)}
            icon={AlertOctagon}
            tone={stats.bounced > 0 ? "red" : "default"}
            hint={`${pct(stats.bounced, stats.active_total)}% dari aktif`}
          />
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Aktif (workspace)"
          value={fmt(stats.active_total)}
          icon={Users}
          hint="non-archived"
        />
        <StatCard
          label="Baru (7 hari)"
          value={fmt(stats.added_7d)}
          icon={UserPlus}
          tone={stats.added_7d > 0 ? "blue" : "default"}
          hint="ditambah ke workspace"
        />
        <StatCard
          label="Pernah dibuka"
          value={fmt(stats.opened)}
          icon={Eye}
          hint={`${pct(stats.opened, stats.active_total)}% dari aktif`}
        />
        <Link
          href={`/w/${slug}/contacts?segment=archived`}
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
        >
          <StatCard
            label="Archived"
            value={fmt(stats.archived)}
            icon={Archive}
            tone={stats.archived > 0 ? "amber" : "default"}
            hint="seluruh akun"
          />
        </Link>
      </div>

      <FiltersBar
        slug={slug}
        stages={workspace.pipeline_stages}
        savedFilters={savedFilters}
      />

      {contacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            hasFilter
              ? "Gak ada kontak yang match filter"
              : "Belum ada kontak di workspace ini"
          }
          description={
            hasFilter
              ? "Coba reset filter atau ubah kata kunci search."
              : "Mulai dengan import CSV dari Google Sheet existing, atau tambah satu kontak manual."
          }
          action={
            !hasFilter ? (
              <ButtonLink href={`/w/${slug}/contacts/import`} variant="secondary">
                <Upload className="h-4 w-4" />
                Import CSV
              </ButtonLink>
            ) : undefined
          }
          secondaryAction={
            !hasFilter ? (
              <ButtonLink href={`/w/${slug}/contacts/new`}>
                <Plus className="h-4 w-4" />
                New Contact
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <>
          <ContactsTable
            slug={slug}
            contacts={contacts}
            stages={workspace.pipeline_stages}
          />

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-muted">
                Page {page + 1} of {totalPages} ·{" "}
                {total.toLocaleString("id-ID")} contacts
              </p>
              <div className="flex gap-2">
                {page > 0 && (
                  <Link
                    href={`/w/${slug}/contacts?${withPage(sp, page - 1)}`}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-sunken"
                  >
                    <ChevronLeft className="h-3 w-3" />
                    Previous
                  </Link>
                )}
                {page + 1 < totalPages && (
                  <Link
                    href={`/w/${slug}/contacts?${withPage(sp, page + 1)}`}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-sunken"
                  >
                    Next
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function withPage(
  sp: Record<string, string | undefined>,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v !== undefined && v !== "") params.set(k, v);
  }
  params.set("page", String(page));
  return params.toString();
}
