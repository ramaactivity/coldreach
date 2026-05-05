import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Upload,
  Search,
  Users,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { listContacts } from "@/lib/contacts";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PAGE_SIZE = 50;

export default async function ContactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; tag?: string; page?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const page = Math.max(0, parseInt(sp.page ?? "0", 10));
  const { contacts, total } = await listContacts(
    workspace,
    {
      search: sp.q,
      tags: sp.tag ? [sp.tag] : undefined,
    },
    page,
    PAGE_SIZE,
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const stages = workspace.pipeline_stages;
  const stageById = new Map(stages.map((s) => [s.id, s]));

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
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

      {/* Search bar */}
      <form action={`/w/${slug}/contacts`} method="get" className="mb-4">
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Cari nama, email, atau company..."
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-10 pr-3 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-zinc-100"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Search
          </button>
          {sp.q && (
            <Link
              href={`/w/${slug}/contacts`}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Link>
          )}
        </div>
      </form>

      {/* Empty state */}
      {contacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            sp.q || sp.tag
              ? "Gak ada kontak yang match filter"
              : "Belum ada kontak di workspace ini"
          }
          description={
            sp.q || sp.tag
              ? "Coba clear filter atau search yang lain."
              : "Mulai dengan import CSV dari Google Sheet existing, atau tambah satu kontak manual."
          }
          action={
            !sp.q && !sp.tag ? (
              <ButtonLink href={`/w/${slug}/contacts/import`} variant="outline">
                <Upload className="h-4 w-4" />
                Import CSV
              </ButtonLink>
            ) : undefined
          }
          secondaryAction={
            !sp.q && !sp.tag ? (
              <ButtonLink href={`/w/${slug}/contacts/new`}>
                <Plus className="h-4 w-4" />
                New Contact
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200/80 bg-zinc-50/60 text-left text-[11px] uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
                    <th className="px-5 py-3 font-semibold">Name</th>
                    <th className="px-5 py-3 font-semibold">Company</th>
                    <th className="px-5 py-3 font-semibold">Stage</th>
                    <th className="px-5 py-3 font-semibold">Tags</th>
                    <th className="px-5 py-3 font-semibold">Last Contacted</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => {
                    const fullName = [c.first_name, c.last_name]
                      .filter(Boolean)
                      .join(" ");
                    const stage = c.workspace_data?.lead_stage_id
                      ? stageById.get(c.workspace_data.lead_stage_id)
                      : null;
                    const lastContacted = c.workspace_data?.last_contacted_at;
                    return (
                      <tr
                        key={c.id}
                        className="group border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50/80 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40"
                      >
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/w/${slug}/contacts/${c.id}`}
                            className="block min-w-0"
                          >
                            <div className="font-medium text-zinc-900 transition-colors group-hover:text-zinc-950 dark:text-zinc-100">
                              {fullName || c.email}
                            </div>
                            {fullName && (
                              <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                                {c.email}
                              </div>
                            )}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="text-zinc-900 dark:text-zinc-100">
                            {c.company ?? <span className="text-zinc-400">—</span>}
                          </div>
                          {c.position && (
                            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                              {c.position}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {stage ? (
                            <Badge
                              variant="outline"
                              dotColor={stage.color}
                              className="font-normal"
                            >
                              {stage.name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex flex-wrap gap-1">
                            {c.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="secondary" className="font-normal">
                                {tag}
                              </Badge>
                            ))}
                            {c.tags.length > 3 && (
                              <span className="text-xs text-zinc-400">
                                +{c.tags.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-zinc-500 dark:text-zinc-400">
                          {lastContacted
                            ? new Date(lastContacted).toLocaleDateString("id-ID", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Page {page + 1} of {totalPages} · {total.toLocaleString("id-ID")} contacts
              </p>
              <div className="flex gap-2">
                {page > 0 && (
                  <Link
                    href={`/w/${slug}/contacts?${new URLSearchParams({ ...sp, page: String(page - 1) }).toString()}`}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <ChevronLeft className="h-3 w-3" />
                    Previous
                  </Link>
                )}
                {page + 1 < totalPages && (
                  <Link
                    href={`/w/${slug}/contacts?${new URLSearchParams({ ...sp, page: String(page + 1) }).toString()}`}
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
