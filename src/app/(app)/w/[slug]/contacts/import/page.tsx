import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { ImportForm } from "./import-form";
import { PageHeader } from "@/components/ui/page-header";

export default async function ImportContactsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-8">
      <Link
        href={`/w/${slug}/contacts`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to contacts
      </Link>
      <PageHeader
        title="Import Contacts dari CSV"
        description="Import database existing dari Google Sheet atau Excel. Email yang sudah ada akan di-skip otomatis (deduplikasi)."
      />
      <ImportForm slug={slug} />
    </div>
  );
}
