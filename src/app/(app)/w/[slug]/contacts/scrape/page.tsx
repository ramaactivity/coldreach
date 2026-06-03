import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Globe } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { requireCurrentUser } from "@/lib/supabase/session-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { ScrapeClient } from "./scrape-client";

export const dynamic = "force-dynamic";
// The JS-render fallback (Jina) can take ~20s per page; give the action room.
export const maxDuration = 60;

export default async function ScrapePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [, workspace] = await Promise.all([
    requireCurrentUser(),
    getWorkspaceBySlug(slug),
  ]);
  if (!workspace) notFound();

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-8">
      <Link
        href={`/w/${slug}/contacts`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali ke Contacts
      </Link>

      <PageHeader
        eyebrow={
          <>
            <Globe className="h-3 w-3 text-accent-text" />
            Scrape Website
          </>
        }
        title="Cari kontak dari website"
        description="Tempel satu URL — sistem mengambil homepage + halaman kontak/about, lalu menarik email, telepon, dan akun sosial. Hanya hasil ber-email yang bisa diimpor."
      />

      <ScrapeClient slug={slug} />
    </div>
  );
}
