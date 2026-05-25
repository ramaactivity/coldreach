"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { sendEmail, type EmailAccount } from "@/lib/email-sender";
import { generateOpener } from "@/lib/ai-opener";
import { ensureDailyQuotaFresh } from "@/lib/quota-reset";

export type SendOneEmailResult =
  | {
      ok: true;
      gmail_thread_id: string;
      gmail_message_id: string;
      subject_used: string;
    }
  | {
      ok: false;
      error: string;
    };

export type SendOneEmailOptions = {
  contactId: string;
  templateId: string;
  useAiOpener: boolean;
  testMode: boolean;
};

export async function sendOneEmailToContact(
  slug: string,
  opts: SendOneEmailOptions,
): Promise<SendOneEmailResult> {
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return { ok: false, error: "Workspace not found" };

  // Use admin client for the rest (bypass RLS so internal joins work consistently)
  const admin = createAdminClient();

  // Verify contact belongs to user
  const { data: contact } = await admin
    .from("contacts")
    .select(
      "id, user_id, email, first_name, last_name, company, position, status, total_emails_sent_all_workspaces",
    )
    .eq("id", opts.contactId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!contact) return { ok: false, error: "Contact tidak ditemukan" };
  if (contact.status !== "active") {
    return { ok: false, error: `Contact status: ${contact.status} (gak bisa kirim)` };
  }

  // Email account
  const { data: account } = await admin
    .from("email_accounts")
    .select(
      "id, email, display_name, access_token_encrypted, refresh_token_encrypted, token_expires_at, is_active, daily_quota, emails_sent_today, quota_reset_at",
    )
    .eq("workspace_id", workspace.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!account) {
    return {
      ok: false,
      error: "Belum ada Gmail terhubung di workspace ini. Connect dulu di Settings.",
    };
  }
  // Self-heal stale daily counter (pg_cron reset is best-effort backup).
  const freshSentToday = await ensureDailyQuotaFresh(admin, {
    id: account.id,
    emails_sent_today: account.emails_sent_today,
    quota_reset_at:
      (account as { quota_reset_at?: string | null }).quota_reset_at ?? null,
  });
  account.emails_sent_today = freshSentToday;

  if (account.emails_sent_today >= account.daily_quota) {
    return {
      ok: false,
      error: `Daily quota Gmail (${account.daily_quota}/hari) habis. Tunggu reset besok atau naikkan quota.`,
    };
  }

  // Template + attachments
  const { data: template } = await admin
    .from("templates")
    .select("id, subject_lines, body_plain")
    .eq("id", opts.templateId)
    .eq("workspace_id", workspace.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!template) {
    return { ok: false, error: "Template tidak ditemukan" };
  }
  const { data: attachments } = await admin
    .from("template_attachments")
    .select("filename, storage_path, mime_type")
    .eq("template_id", opts.templateId);

  // AI opener
  let aiOpener: string | null = null;
  if (opts.useAiOpener) {
    const { data: cached } = await admin
      .from("contact_workspace_data")
      .select("ai_opener")
      .eq("contact_id", contact.id)
      .eq("workspace_id", workspace.id)
      .maybeSingle();
    aiOpener = (cached as { ai_opener?: string | null } | null)?.ai_opener ?? null;
    if (!aiOpener) {
      aiOpener = await generateOpener({
        workspace_name: workspace.name,
        workspace_business_type: workspace.business_type,
        contact_first_name: contact.first_name,
        contact_company: contact.company,
        contact_position: contact.position,
      });
      if (aiOpener) {
        await admin
          .from("contact_workspace_data")
          .upsert(
            {
              contact_id: contact.id,
              workspace_id: workspace.id,
              user_id: user.id,
              ai_opener: aiOpener,
              ai_opener_generated_at: new Date().toISOString(),
            },
            { onConflict: "contact_id,workspace_id" },
          );
      }
    }
  }

  // Pre-create campaign_recipient
  const { data: campaignRecipient } = await admin
    .from("campaign_recipients")
    .insert({
      campaign_id: null,
      contact_id: contact.id,
      user_id: user.id,
      workspace_id: workspace.id,
      contact_email: contact.email,
      status: "sending",
    })
    .select("id")
    .maybeSingle();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const trackingUrl = campaignRecipient?.id
    ? `${appUrl}/api/track/open/${campaignRecipient.id}`
    : null;
  const clickTrackingBase = campaignRecipient?.id
    ? `${appUrl}/api/track/click/${campaignRecipient.id}`
    : null;

  // Test mode override
  const sendContact = opts.testMode
    ? {
        ...contact,
        email: account.email,
        first_name: contact.first_name
          ? `[TEST → ${contact.email}] ${contact.first_name}`
          : contact.first_name,
      }
    : contact;

  const sendResult = await sendEmail(admin, {
    account: account as EmailAccount,
    contact: sendContact,
    template,
    attachments: attachments ?? [],
    aiOpener,
    trackingUrl,
    clickTrackingBase,
    subjectPrefix: opts.testMode ? "[TEST]" : null,
    signatureData: workspace.signature_data,
    signatureFallbackColor: workspace.color_theme,
  });

  if (!sendResult.ok) {
    if (campaignRecipient?.id) {
      await admin
        .from("campaign_recipients")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          error_message: sendResult.error,
        })
        .eq("id", campaignRecipient.id);
    }
    return { ok: false, error: sendResult.error };
  }

  // Mark CR sent
  if (campaignRecipient?.id) {
    await admin
      .from("campaign_recipients")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        gmail_message_id: sendResult.gmail_message_id,
        gmail_thread_id: sendResult.gmail_thread_id,
        gmail_subject_used: sendResult.subject_used,
      })
      .eq("id", campaignRecipient.id);
  }

  // Bookkeeping (only when not test mode — don't pollute real stats)
  if (!opts.testMode) {
    await admin
      .from("contact_workspace_data")
      .upsert(
        {
          contact_id: contact.id,
          workspace_id: workspace.id,
          user_id: user.id,
          last_contacted_at: new Date().toISOString(),
        },
        { onConflict: "contact_id,workspace_id" },
      );

    await admin
      .from("contacts")
      .update({
        total_emails_sent_all_workspaces:
          (contact.total_emails_sent_all_workspaces ?? 0) + 1,
        last_contacted_at_any: new Date().toISOString(),
      })
      .eq("id", contact.id);
  }

  // Always count against today's Gmail quota (even test mode uses real send)
  await admin
    .from("email_accounts")
    .update({
      emails_sent_today: account.emails_sent_today + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", account.id);

  await admin.from("activity_log").insert({
    user_id: user.id,
    workspace_id: workspace.id,
    activity_type: opts.testMode ? "email_test_sent" : "email_sent",
    entity_type: "contact",
    entity_id: contact.id,
    metadata: {
      contact_email: contact.email,
      template_id: opts.templateId,
      direct_send: true,
      test_mode: opts.testMode,
    },
  });

  revalidatePath(`/w/${slug}/contacts/${contact.id}`);
  return {
    ok: true,
    gmail_thread_id: sendResult.gmail_thread_id,
    gmail_message_id: sendResult.gmail_message_id,
    subject_used: sendResult.subject_used,
  };
}
