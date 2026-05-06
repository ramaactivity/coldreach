import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Upload,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import {
  listContacts,
  CONTACTS_SORT_OPTIONS,
  type ContactsSort,
} from "@/lib/contacts";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FiltersBar } from "./filters-bar";
import { ContactsTable } from "./contacts-table";

const PAGE_SIZE = 50;

const VALID_SORTS = new Set(CONTACTS_SORT_OPTIONS.map((o) => o.value));

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
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const page = Math.max(0, parseInt(sp.page ?? "0", 10));
  const sort = (
    sp.sort && VALID_SORTS.has(sp.sort as ContactsSort) ? sp.sort : "created_desc"
  ) as ContactsSort;

  const { contacts, total } = await listContacts(
    workspace,
    {
      search: sp.q,
      tags: sp.tag ? [sp.tag] : undefined,
      lead_stage_id: sp.stage || undefined,
      sort_by: sort,
    },
    page,
    PAGE_SIZE,
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilter = Boolean(sp.q || sp.tag || sp.stage);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 pb-32">
      <PageHeader
        title="Contacts"
        description={`${total.toLocaleString("id-ID")} contacts · shared antar workspace, status untuk ${workspace.name}`}
        actions={
          <>
            <ButtonLink
              href={`/w/${slug}/contacts/import`}
              variant="outline"
              size="md"
            >
              <Upload className="h-4 w-4" />
              Import CSV
            </ButtonLink>
            <ButtonLink href={`/w/${slug}/contacts/new`} size="md">
              <Plus className="h-4 w-4" />
              New Contact
            </ButtonLink>
          </>
        }
      />

      <FiltersBar slug={slug} stages={workspace.pipeline_stages} />

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
              <ButtonLink href={`/w/${slug}/contacts/import`} variant="outline">
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
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Page {page + 1} of {totalPages} ·{" "}
                {total.toLocaleString("id-ID")} contacts
              </p>
              <div className="flex gap-2">
                {page > 0 && (
                  <Link
                    href={`/w/${slug}/contacts?${withPage(sp, page - 1)}`}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <ChevronLeft className="h-3 w-3" />
                    Previous
                  </Link>
                )}
                {page + 1 < totalPages && (
                  <Link
                    href={`/w/${slug}/contacts?${withPage(sp, page + 1)}`}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
