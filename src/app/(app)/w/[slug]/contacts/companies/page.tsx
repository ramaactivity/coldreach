import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Row = {
  domain: string;
  company: string | null;
  contacts: number;
  active: number;
  emailed: number;
  replied: number;
  bounced: number;
  last_contacted: string | null;
  deals: number;
  deal_value: number | string;
};

/** Contacts rolled up by company email domain, most-engaged first. */
export default async function CompaniesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { slug } = await params;
  const { q } = await searchParams;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("company_overview", {
    p_workspace_id: workspace.id,
    p_search: q?.trim() || null,
    p_limit: 200,
  });
  const rows = (data ?? []) as Row[];
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 pb-32 lg:px-8">
      <Link
        href={`/w/${slug}/contacts`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali ke Kontak
      </Link>
      <PageHeader
        title="Perusahaan"
        description="Kontak dikelompokkan per domain email. Angka email, balasan, dan bounce dihitung dari semua workspace; deal dari workspace ini."
      />

      <form className="mb-4 flex max-w-md items-center gap-2" role="search">
        <Search className="h-4 w-4 text-muted" aria-hidden />
        <Input name="q" defaultValue={q ?? ""} placeholder="Cari nama perusahaan atau domain" aria-label="Cari perusahaan" />
      </form>

      {error ? (
        <p className="text-sm text-danger-text">Gagal memuat data: {error.message}</p>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-wider text-muted">
                <th className="px-5 py-2.5">Perusahaan</th>
                <th className="px-3 py-2.5 text-right">Kontak aktif</th>
                <th className="px-3 py-2.5 text-right">Sudah dikirimi</th>
                <th className="px-3 py-2.5 text-right">Membalas</th>
                <th className="px-3 py-2.5 text-right">Bounce</th>
                <th className="px-3 py-2.5 text-right">Terakhir dikirim</th>
                <th className="px-5 py-2.5 text-right">Deal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.domain} className="hover:bg-surface-sunken/60">
                  <td className="px-5 py-3">
                    <Link href={`/w/${slug}/contacts?q=${encodeURIComponent("@" + r.domain)}`} className="font-medium text-ink hover:underline">
                      {r.company || r.domain}
                    </Link>
                    <div className="text-xs text-muted">{r.domain}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular text-ink-secondary">{r.active} / {r.contacts}</td>
                  <td className="px-3 py-3 text-right tabular text-ink-secondary">{r.emailed}</td>
                  <td className={`px-3 py-3 text-right tabular ${r.replied > 0 ? "font-medium text-success" : "text-ink-secondary"}`}>{r.replied}</td>
                  <td className={`px-3 py-3 text-right tabular ${r.bounced > 0 ? "text-danger-text" : "text-ink-secondary"}`}>{r.bounced}</td>
                  <td className="px-3 py-3 text-right tabular text-ink-secondary">{fmtDate(r.last_contacted)}</td>
                  <td className="px-5 py-3 text-right tabular text-ink-secondary">
                    {r.deals > 0 ? `${r.deals} · Rp${Number(r.deal_value).toLocaleString("id-ID")}` : "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-muted">Tidak ada perusahaan yang cocok.</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="border-t border-border px-5 py-2.5 text-[11px] text-faint">
            Diurutkan dari yang paling banyak membalas. Menampilkan 200 perusahaan teratas — pakai pencarian untuk yang lain.
          </p>
        </Card>
      )}
    </div>
  );
}
