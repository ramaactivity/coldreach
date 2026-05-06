import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  AtSign,
  Users,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { getDuplicateReport } from "@/lib/duplicates";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

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
                Kemungkinan duplikat. Buka detail kedua kontak untuk verify dan
                hapus salah satu (atau hapus alt email-nya kalau bukan dup).
              </p>
              <Card className="overflow-hidden p-0">
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {report.crossLinks.map((link, i) => (
                    <li
                      key={`${link.email}-${i}`}
                      className="px-5 py-4"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <code className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-mono text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                          {link.email}
                        </code>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          muncul di 2 kontak
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <ContactCard
                          slug={slug}
                          contact={link.primaryContact}
                          role="Primary di sini"
                        />
                        <ContactCard
                          slug={slug}
                          contact={link.altOwnerContact}
                          role="Alt di sini"
                        />
                      </div>
                    </li>
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
                Bisa jadi duplikat (orang yg sama dengan email kerja + personal),
                atau memang 2 orang berbeda. Verify manual.
              </p>
              <div className="space-y-3">
                {report.nameCompanyClusters.map((cluster) => (
                  <Card key={cluster.key} className="overflow-hidden p-0">
                    <div className="border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {cluster.contacts[0]?.full_name ?? "—"}
                        {cluster.contacts[0]?.company && (
                          <span className="ml-1.5 font-normal text-zinc-500 dark:text-zinc-400">
                            · {cluster.contacts[0].company}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        {cluster.contacts.length} kontak
                      </p>
                    </div>
                    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {cluster.contacts.map((c) => (
                        <li key={c.id}>
                          <Link
                            href={`/w/${slug}/contacts/${c.id}`}
                            className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                {c.email}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                                {c.position ?? "—"} · ditambahkan{" "}
                                {new Date(c.created_at).toLocaleDateString(
                                  "id-ID",
                                  {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  },
                                )}
                              </p>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ContactCard({
  slug,
  contact,
  role,
}: {
  slug: string;
  contact: {
    id: string;
    email: string;
    full_name: string | null;
    company: string | null;
  };
  role: string;
}) {
  return (
    <Link
      href={`/w/${slug}/contacts/${contact.id}`}
      className="group flex items-center justify-between gap-2 rounded-lg border border-zinc-200/80 bg-white px-3 py-2.5 transition-all hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/40"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {contact.full_name ?? contact.email}
        </p>
        <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
          {contact.company ?? contact.email}
        </p>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
          {role}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
    </Link>
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
