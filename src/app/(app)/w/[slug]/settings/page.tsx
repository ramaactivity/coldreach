import { notFound } from "next/navigation";
import {
  Mail,
  Calendar,
  Clock,
  Target,
  Layers,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { GmailConnectionCard } from "./gmail-connection-card";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";

export default async function WorkspaceSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ gmail_success?: string; gmail_error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const supabase = await createClient();
  const { data: emailAccount } = await supabase
    .from("email_accounts")
    .select(
      "id, email, display_name, oauth_scope, token_expires_at, is_active, daily_quota, emails_sent_today, health_status, health_notes, warmup_mode, warmup_started_at, last_used_at",
    )
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader
        title="Settings"
        description={`Konfigurasi workspace dan Gmail account untuk ${workspace.name}.`}
      />

      {sp.gmail_success && (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Gmail <strong>{sp.gmail_success}</strong> berhasil terhubung ke
            workspace ini.
          </span>
        </div>
      )}
      {sp.gmail_error && (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Gmail connect gagal: {sp.gmail_error}</span>
        </div>
      )}

      {/* Gmail Account section */}
      <section className="mb-10">
        <div className="mb-3 flex items-center gap-2">
          <Mail className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Gmail Account
          </h2>
        </div>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          1 workspace = 1 Gmail. Email dikirim atas nama akun ini, masuk Sent
          folder Gmail seperti biasa.
        </p>
        <GmailConnectionCard slug={slug} account={emailAccount} />
      </section>

      {/* Workspace Info section */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Layers className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Workspace Info
          </h2>
        </div>
        <Card className="p-0">
          <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
            <Row label="Name" value={workspace.name} />
            <Row label="Slug" value={workspace.slug} mono />
            <Row
              label="Business Type"
              value={workspace.business_type ?? "—"}
              capitalize
            />
            <Row
              label="Color Theme"
              value={
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-4 w-4 rounded-full ring-1 ring-zinc-200 dark:ring-zinc-700"
                    style={{ backgroundColor: workspace.color_theme }}
                  />
                  <span className="font-mono text-xs">
                    {workspace.color_theme}
                  </span>
                </span>
              }
            />
            <Row
              label="Default Schedule"
              value={
                <span className="inline-flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-zinc-400" /> Sen-Jum
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3 text-zinc-400" />
                    {workspace.schedule_start_time.slice(0, 5)}–{workspace.schedule_end_time.slice(0, 5)} WIB
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Target className="h-3 w-3 text-zinc-400" />
                    {workspace.daily_target}/hari
                  </span>
                </span>
              }
            />
            <Row
              label="Pipeline Stages"
              value={
                <div className="flex flex-wrap gap-1.5">
                  {workspace.pipeline_stages.map((stage) => (
                    <span
                      key={stage.id}
                      className="inline-flex items-center gap-1 rounded-full border border-zinc-200/80 bg-white px-2 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                    >
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: stage.color }}
                      />
                      <span className="text-zinc-700 dark:text-zinc-300">
                        {stage.name}
                      </span>
                    </span>
                  ))}
                </div>
              }
            />
          </dl>
        </Card>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Edit workspace settings (nama, schedule, pipeline) — fitur ini
          ditambah Phase 2 (post-MVP).
        </p>
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  capitalize,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-3 sm:gap-4">
      <dt className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd
        className={`text-sm text-zinc-900 sm:col-span-2 dark:text-zinc-100 ${
          mono ? "font-mono" : ""
        } ${capitalize ? "capitalize" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
