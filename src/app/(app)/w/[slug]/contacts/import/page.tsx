import { notFound } from "next/navigation";
import Link from "next/link";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { ImportForm } from "./import-form";

export default async function ImportContactsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href={`/w/${slug}/contacts`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← Back to contacts
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Import Contacts dari CSV
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Import database existing dari Google Sheet atau Excel. Email yang sudah ada akan di-skip otomatis (deduplikasi).
      </p>

      <div className="mt-6">
        <ImportForm slug={slug} />
      </div>
    </div>
  );
}
