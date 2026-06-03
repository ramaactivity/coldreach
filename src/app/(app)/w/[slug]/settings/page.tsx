import { notFound } from "next/navigation";
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Building2,
  Kanban,
  PenLine,
  ListPlus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { ensureDailyQuotaFresh } from "@/lib/quota-reset";
import { GmailConnectionCard } from "./gmail-connection-card";
import { WorkspaceInfoForm } from "./workspace-info-form";
import { ScheduleForm } from "./schedule-form";
import { SignatureForm } from "./signature-form";
import { PipelineStagesEditor } from "./pipeline-stages-editor";
import { CustomFieldsEditor } from "./custom-fields-editor";
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
      "id, email, display_name, oauth_scope, token_expires_at, is_active, daily_quota, emails_sent_today, quota_reset_at, health_status, health_notes, warmup_mode, warmup_started_at, last_used_at",
    )
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  if (emailAccount) {
    (emailAccount as { emails_sent_today: number }).emails_sent_today =
      await ensureDailyQuotaFresh(
        supabase,
        emailAccount as {
          id: string;
          emails_sent_today: number;
          quota_reset_at: string | null;
        },
      );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-8">
      <PageHeader
        title="Settings"
        description={`Konfigurasi workspace dan Gmail account untuk ${workspace.name}.`}
      />

      {sp.gmail_success && (
        <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-success-soft bg-success-soft p-3.5 text-sm text-success-text">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Gmail <strong>{sp.gmail_success}</strong> berhasil terhubung ke
            workspace ini.
          </span>
        </div>
      )}
      {sp.gmail_error && (
        <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-danger-soft bg-danger-soft p-3.5 text-sm text-danger-text">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Gmail connect gagal: {sp.gmail_error}</span>
        </div>
      )}

      <div className="space-y-12">
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
          <p className="mt-2 text-xs text-muted">
            Slug{" "}
            <code className="rounded bg-surface-sunken px-1 font-mono text-[11px]">
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
            initial={{ signature_data: workspace.signature_data }}
            workspaceColorTheme={workspace.color_theme}
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

        {/* Custom Fields */}
        <section>
          <SectionHeading
            icon={ListPlus}
            title="Custom Fields"
            description="Field tambahan per workspace. Muncul di form contact (new + edit) dan detail page. Beda workspace bisa beda fields — value di-share di JSONB."
          />
          <CustomFieldsEditor
            slug={slug}
            initial={workspace.custom_fields_schema ?? []}
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
        <Icon className="h-4 w-4 text-muted" />
        <h2 className="text-ink">{title}</h2>
      </div>
      <p className="mt-0.5 text-sm text-muted">{description}</p>
    </div>
  );
}
