import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { GmailConnectionCard } from "./gmail-connection-card";

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
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Settings — {workspace.name}
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Konfigurasi workspace dan Gmail account untuk kirim email.
      </p>

      {sp.gmail_success && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          ✓ Gmail <strong>{sp.gmail_success}</strong> berhasil terhubung ke workspace ini.
        </div>
      )}
      {sp.gmail_error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          Gmail connect gagal: {sp.gmail_error}
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Gmail Account
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          1 workspace = 1 Gmail. Email dikirim atas nama akun ini, masuk Sent folder Gmail seperti biasa.
        </p>
        <div className="mt-4">
          <GmailConnectionCard
            slug={slug}
            account={emailAccount}
          />
        </div>
      </div>

      <div className="mt-10">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Workspace Info
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <Stat label="Name" value={workspace.name} />
          <Stat label="Slug" value={workspace.slug} />
          <Stat label="Business Type" value={workspace.business_type ?? "—"} />
          <Stat
            label="Schedule"
            value={`${workspace.schedule_start_time.slice(0, 5)} – ${workspace.schedule_end_time.slice(0, 5)} WIB`}
          />
          <Stat label="Daily Target" value={`${workspace.daily_target} email/hari`} />
          <Stat label="Pipeline Stages" value={`${workspace.pipeline_stages.length} stages`} />
        </dl>
        <p className="mt-3 text-xs text-zinc-500">
          Edit workspace settings (nama, schedule, pipeline stages) — fitur ini akan ditambah di Fase 11.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {value}
      </dd>
    </div>
  );
}
