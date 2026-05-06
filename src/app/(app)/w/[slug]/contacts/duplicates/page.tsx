import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  AtSign,
  Users,
  Sparkles,
} from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { getDuplicateReport } from "@/lib/duplicates";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CrossLinkCard } from "./cross-link-card";
import { ClusterCard } from "./cluster-card";

export default async function DuplicatesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const report = await getDuplicateReport();
  const totalIssues = report.crossLinks.length + report.nameCompanyClusters.length;

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
        title="Duplicate Detector"
        description={`Scan ${report.totalContacts.toLocaleString("id-ID")} kontak buat cari potensi duplikat — cross-link primary↔alt + nama+company yang sama dengan email beda.`}
      />

      {totalIssues === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Database bersih! 🎉"
          description="Gak ada cross-link ke alt email, gak ada nama+company yang clash dengan email beda. Database lu rapi."
        />
      ) : (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KPI
              label="Cross-link primary ↔ alt"
              value={report.crossLinks.length}
              icon={AtSign}
              tone={report.crossLinks.length > 0 ? "amber" : "default"}
              hint="Email muncul di 2 kontak"
            />
            <KPI
              label="Nama + company sama"
              value={report.nameCompanyClusters.length}
              icon={Users}
              tone={report.nameCompanyClusters.length > 0 ? "blue" : "default"}
              hint="Cluster (mungkin orang yg sama)"
            />
            <KPI
              label="Total kontak"
              value={report.totalContacts}
              icon={Sparkles}
            />
          </div>

          {/* Cross-link section */}
          {report.crossLinks.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                <AtSign className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                Cross-link Email
                <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                  · {report.crossLinks.length} kasus
                </span>
              </h2>
              <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                Kontak A punya alt email yang juga jadi primary email kontak B.
                Kemungkinan duplikat. Klik <strong>Merge jadi 1 kontak</strong>{" "}
                untuk gabungin (pilih primary) atau buka detail buat verify
                manual.
              </p>
              <Card className="overflow-hidden p-0">
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {report.crossLinks.map((link, i) => (
                    <CrossLinkCard
                      key={`${link.email}-${i}`}
                      slug={slug}
                      email={link.email}
                      primaryContact={link.primaryContact}
                      altOwnerContact={link.altOwnerContact}
                    />
                  ))}
                </ul>
              </Card>
            </section>
          )}

          {/* Name+company section */}
          {report.nameCompanyClusters.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                Nama + Company Sama
                <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                  · {report.nameCompanyClusters.length} cluster
                </span>
              </h2>
              <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                Beberapa kontak punya nama + company sama tapi email beda.
                Bisa jadi 1 orang dengan email kerja + personal, atau 2 orang
                beda. Klik <strong>Merge cluster</strong> untuk gabungin atau
                verify manual dulu.
              </p>
              <div className="space-y-3">
                {report.nameCompanyClusters.map((cluster) => (
                  <ClusterCard
                    key={cluster.key}
                    slug={slug}
                    contacts={cluster.contacts}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function KPI({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
}: {
  label: string;
  value: number;
  icon?: typeof AtSign;
  tone?: "default" | "amber" | "blue";
  hint?: string;
}) {
  const colors = {
    default: "text-zinc-900 dark:text-zinc-100",
    amber: "text-amber-700 dark:text-amber-400",
    blue: "text-blue-600 dark:text-blue-400",
  };
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] dark:border-zinc-800/80 dark:bg-zinc-900">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {label}
          </p>
        </div>
        {Icon && <Icon className="h-3.5 w-3.5 text-zinc-400" />}
      </div>
      <p
        className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight ${colors[tone]}`}
      >
        {value.toLocaleString("id-ID")}
      </p>
      {hint && (
        <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
          {hint}
        </p>
      )}
    </div>
  );
}
