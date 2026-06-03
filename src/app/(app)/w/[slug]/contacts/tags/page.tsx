import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Tag } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { getTagUsage } from "@/lib/tags";
import { PageHeader } from "@/components/ui/page-header";
import { TagManager } from "./tag-manager";

export default async function TagsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const tags = await getTagUsage();

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 pb-32">
      <Link
        href={`/w/${slug}/contacts`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali ke Contacts
      </Link>

      <PageHeader
        title="Tag Manager"
        description={
          tags.length > 0
            ? `${tags.length} tag unik di ${tags
                .reduce((sum, t) => sum + t.contact_count, 0)
                .toLocaleString("id-ID")} contact-tag binding (across all workspaces).`
            : "Tag user-wide — share antar workspace."
        }
      />

      <div className="mb-6 flex items-start gap-2 rounded-lg border border-zinc-200/60 bg-zinc-50/50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
        <Tag className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">
            Tag itu user-wide
          </strong>
          , beda dari pipeline stages yang per-workspace. Rename / merge / hapus
          di sini akan mempengaruhi kontak di semua workspace lu.
        </p>
      </div>

      <TagManager slug={slug} initial={tags} />
    </div>
  );
}
