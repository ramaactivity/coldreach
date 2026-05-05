import { notFound } from "next/navigation";
import Link from "next/link";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { listContacts } from "@/lib/contacts";

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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Contacts
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {total.toLocaleString("id-ID")} contacts · shared antar workspace,
            tampak status workspace ini ({workspace.name})
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/w/${slug}/contacts/import`}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            Import CSV
          </Link>
          <Link
            href={`/w/${slug}/contacts/new`}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            + New Contact
          </Link>
        </div>
      </div>

      {/* Search bar */}
      <form action={`/w/${slug}/contacts`} method="get" className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Cari nama, email, company..."
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100"
          />
          <button
            type="submit"
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            Search
          </button>
          {sp.q && (
            <Link
              href={`/w/${slug}/contacts`}
              className="rounded-md px-4 py-2 text-sm font-medium text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-100"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {/* Empty state */}
      {contacts.length === 0 && (
        <div className="mt-12 flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="text-base font-medium text-zinc-900 dark:text-zinc-100">
            {sp.q || sp.tag
              ? "Gak ada kontak yang match filter"
              : "Belum ada kontak"}
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {sp.q || sp.tag
              ? "Coba clear filter atau search yang lain"
              : "Mulai dengan import CSV atau tambah satu kontak manual"}
          </p>
          {!sp.q && !sp.tag && (
            <div className="mt-4 flex gap-2">
              <Link
                href={`/w/${slug}/contacts/import`}
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Import CSV
              </Link>
              <Link
                href={`/w/${slug}/contacts/new`}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                + New Contact
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Contacts list */}
      {contacts.length > 0 && (
        <>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Company</th>
                  <th className="px-4 py-2 font-medium">Stage</th>
                  <th className="px-4 py-2 font-medium">Tags</th>
                  <th className="px-4 py-2 font-medium">Last Contacted</th>
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
                      className="border-b border-zinc-100 transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/w/${slug}/contacts/${c.id}`}
                          className="block"
                        >
                          <div className="font-medium text-zinc-900 dark:text-zinc-100">
                            {fullName || c.email}
                          </div>
                          {fullName && (
                            <div className="text-xs text-zinc-500">{c.email}</div>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {c.company ?? "—"}
                        {c.position && (
                          <div className="text-xs text-zinc-500">{c.position}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {stage ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-2 py-0.5 text-xs dark:border-zinc-800">
                            <span
                              className="inline-block h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: stage.color }}
                            />
                            <span className="text-zinc-700 dark:text-zinc-300">
                              {stage.name}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {c.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                            >
                              {tag}
                            </span>
                          ))}
                          {c.tags.length > 3 && (
                            <span className="text-xs text-zinc-500">
                              +{c.tags.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {lastContacted
                          ? new Date(lastContacted).toLocaleDateString("id-ID")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-zinc-500">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex gap-2">
                {page > 0 && (
                  <Link
                    href={`/w/${slug}/contacts?${new URLSearchParams({ ...sp, page: String(page - 1) }).toString()}`}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    Previous
                  </Link>
                )}
                {page + 1 < totalPages && (
                  <Link
                    href={`/w/${slug}/contacts?${new URLSearchParams({ ...sp, page: String(page + 1) }).toString()}`}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    Next
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
