import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles, AlertCircle } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { requireCurrentUser } from "@/lib/supabase/session-helpers";
import { createClient } from "@/lib/supabase/server";
import { getApolloCreditStatus } from "@/lib/apollo-credits";
import { PageHeader } from "@/components/ui/page-header";
import { DiscoverClient } from "./discover-client";
import type { ApolloPersona } from "./actions";

export const dynamic = "force-dynamic";

// Sensible default target titles per business type (editable in the form).
function presetTitles(businessType: string | null): string {
  switch (businessType) {
    case "catering":
    case "photography":
      return "HR Manager, General Affairs, Event Manager, Procurement Manager, Office Manager";
    case "design":
      return "Marketing Manager, Brand Manager, Creative Director, Head of Marketing";
    default:
      return "HR Manager, General Affairs, Procurement Manager, Marketing Manager";
  }
}

// Jabodetabek + kantong industri terjangkau dari Kota Bogor. Nama kota saja —
// negara "Indonesia" otomatis ditambahkan per kota saat search (biar tidak
// ketukar kota bernama sama di negara lain).
// Only Apollo-recognized location tokens (Cikarang→Bekasi, Sentul→Bogor are
// not indexed separately, so they're omitted; their parent covers them).
const PRESET_LOCATIONS =
  "Bogor, Cibinong, Jakarta, Depok, Tangerang, Tangerang Selatan, Bekasi, Karawang";

export default async function DiscoverPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [user, workspace] = await Promise.all([
    requireCurrentUser(),
    getWorkspaceBySlug(slug),
  ]);
  if (!workspace) notFound();

  const supabase = await createClient();
  const credit = await getApolloCreditStatus(supabase, user.id);
  const apiKeyConfigured = !!process.env.APOLLO_API_KEY;

  // Saved personas (named presets) live in users.preferences.
  const { data: prefRow } = await supabase
    .from("users")
    .select("preferences")
    .eq("id", user.id)
    .maybeSingle();
  const personas = (
    ((prefRow as { preferences?: { apollo_personas?: unknown } } | null)
      ?.preferences?.apollo_personas as ApolloPersona[] | undefined) ?? []
  ).filter((p) => p && p.id && p.name);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href={`/w/${slug}/contacts`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali ke Contacts
      </Link>

      <PageHeader
        eyebrow={
          <>
            <Sparkles className="h-3 w-3 text-amber-500" />
            <span>Apollo · cari lead baru</span>
          </>
        }
        title="Cari Lead"
        description="Cari kontak di database Apollo (gratis, tanpa kredit), pilih yang relevan, lalu import — kredit cuma kebakar saat reveal email lead baru yang kamu pilih. Kontak yang sudah ada otomatis dilewati."
      />

      {!apiKeyConfigured && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">APOLLO_API_KEY belum diset.</p>
            <p className="mt-0.5 text-xs leading-relaxed">
              Buat API key di portal Apollo (API Keys → Create new key, beri
              akses People Search + Enrichment), lalu set sebagai env{" "}
              <code className="rounded bg-amber-100 px-1 font-mono dark:bg-amber-900/50">
                APOLLO_API_KEY
              </code>
              . Pencarian belum bisa jalan sampai ini diisi.
            </p>
          </div>
        </div>
      )}

      <DiscoverClient
        slug={slug}
        presetTitles={presetTitles(workspace.business_type)}
        presetLocations={PRESET_LOCATIONS}
        credit={credit}
        personas={personas}
        disabled={!apiKeyConfigured}
      />
    </div>
  );
}
