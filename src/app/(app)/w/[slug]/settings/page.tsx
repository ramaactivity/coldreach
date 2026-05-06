import { notFound } from "next/navigation";
import {
  Mail,
  Layers,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Building2,
  Kanban,
  PenLine,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { GmailConnectionCard } from "./gmail-connection-card";
import { WorkspaceInfoForm } from "./workspace-info-form";
import { ScheduleForm } from "./schedule-form";
import { SignatureForm } from "./signature-form";
import { PipelineStagesEditor } from "./pipeline-stages-editor";
import { PageHeader } from "@/components/ui/page-header";

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

      <div className="space-y-10">
        {/* Gmail Account section */}
        <section>
          <SectionHeading
            icon={Mail}
            title="Gmail Account"
            description="1 workspace = 1 Gmail. Email dikirim atas nama akun ini, masuk Sent folder Gmail seperti biasa."
          />
          <GmailConnectionCard slug={slug} account={emailAccount} />
        </section>

        {/* Workspace Info */}
        <section>
          <SectionHeading
            icon={Building2}
            title="Workspace Info"
            description="Nama, business type, dan warna theme yang tampil di sidebar dan dashboard."
          />
          <WorkspaceInfoForm
            slug={slug}
            initial={{
              name: workspace.name,
              business_type: workspace.business_type,
              color_theme: workspace.color_theme,
            }}
          />
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Slug{" "}
            <code className="rounded bg-zinc-100 px-1 font-mono text-[11px] dark:bg-zinc-800">
              {workspace.slug}
            </code>{" "}
            tidak bisa diubah karena ini bagian URL workspace.
          </p>
        </section>

        {/* Schedule */}
        <section>
          <SectionHeading
            icon={Calendar}
            title="Default Schedule"
            description="Schedule default queue auto-send. Tiap queue baru akan pakai value ini sebagai starting point."
          />
          <ScheduleForm
            slug={slug}
            initial={{
              schedule_days: workspace.schedule_days,
              schedule_start_time: workspace.schedule_start_time,
              schedule_end_time: workspace.schedule_end_time,
              daily_target: workspace.daily_target,
            }}
          />
        </section>

        {/* Signature */}
        <section>
          <SectionHeading
            icon={PenLine}
            title="Email Signature"
            description="Otomatis di-append ke setiap email yang dikirim (queue, follow-up, manual send) dari workspace ini."
          />
          <SignatureForm
            slug={slug}
            initial={{ signature: workspace.default_signature }}
          />
        </section>

        {/* Pipeline */}
        <section>
          <SectionHeading
            icon={Kanban}
            title="Pipeline Stages"
            description="Stage lifecycle untuk kontak di workspace ini. Drag dengan tombol panah untuk reorder."
          />
          <PipelineStagesEditor
            slug={slug}
            initial={workspace.pipeline_stages}
          />
        </section>
      </div>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Mail;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
      </div>
      <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
        {description}
      </p>
    </div>
  );
}
