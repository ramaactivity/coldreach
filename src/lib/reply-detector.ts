import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken, refreshAccessToken } from "@/lib/gmail";

const REPLY_LOOKBACK_DAYS = 30;
const MAX_RECIPIENTS_PER_ACCOUNT_PER_RUN = 100;

type EmailAccountRow = {
  id: string;
  user_id: string;
  email: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string;
};

type RecipientRow = {
  id: string;
  user_id: string;
  workspace_id: string;
  contact_id: string;
  contact_email: string;
  gmail_thread_id: string;
  sent_at: string;
};

export type ReplyPollResult = {
  account_email: string;
  checked: number;
  replies_found: number;
  errors: string[];
};

async function getFreshToken(
  admin: SupabaseClient,
  account: EmailAccountRow,
): Promise<string> {
  const expiresAt = new Date(account.token_expires_at);
  const now = new Date();
  if (expiresAt.getTime() - now.getTime() > 60_000) {
    return decryptToken(account.access_token_encrypted);
  }
  const refreshed = await refreshAccessToken(account.refresh_token_encrypted);
  await admin
    .from("email_accounts")
    .update({
      access_token_encrypted: encryptToken(refreshed.access_token),
      token_expires_at: refreshed.expires_at.toISOString(),
    })
    .eq("id", account.id);
  return refreshed.access_token;
}

function extractFrom(headerValue: string | null | undefined): string {
  if (!headerValue) return "";
  // "Name <email@example.com>" or just "email@example.com"
  const m = headerValue.match(/<([^>]+)>/);
  return (m?.[1] ?? headerValue).trim().toLowerCase();
}

/**
 * Poll Gmail threads for replies to sent emails. Updates campaign_recipients
 * status to 'replied' when a thread has a message from a non-account address
 * after our sent_at.
 */
export async function pollRepliesForAccount(
  admin: SupabaseClient,
  account: EmailAccountRow,
): Promise<ReplyPollResult> {
  const result: ReplyPollResult = {
    account_email: account.email,
    checked: 0,
    replies_found: 0,
    errors: [],
  };

  const cutoff = new Date(
    Date.now() - REPLY_LOOKBACK_DAYS * 24 * 3600 * 1000,
  ).toISOString();

  const { data: candidates } = await admin
    .from("campaign_recipients")
    .select(
      "id, user_id, workspace_id, contact_id, contact_email, gmail_thread_id, sent_at",
    )
    .eq("user_id", account.user_id)
    .in("status", ["sent", "opened"])
    .not("gmail_thread_id", "is", null)
    .gte("sent_at", cutoff)
    .order("sent_at", { ascending: false })
    .limit(MAX_RECIPIENTS_PER_ACCOUNT_PER_RUN);

  if (!candidates || candidates.length === 0) {
    return result;
  }

  let accessToken: string;
  try {
    accessToken = await getFreshToken(admin, account);
  } catch (err) {
    result.errors.push(
      `Token refresh failed: ${err instanceof Error ? err.message : "unknown"}`,
    );
    return result;
  }

  const oauth = new google.auth.OAuth2();
  oauth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth });

  const accountEmailLower = account.email.toLowerCase();

  for (const cand of candidates as RecipientRow[]) {
    result.checked++;
    try {
      const thread = await gmail.users.threads.get({
        userId: "me",
        id: cand.gmail_thread_id,
        format: "metadata",
        metadataHeaders: ["From", "Date"],
      });

      const messages = thread.data.messages ?? [];
      if (messages.length <= 1) continue; // no replies yet

      const sentAtMs = new Date(cand.sent_at).getTime();

      const replyMessage = messages.find((msg) => {
        const fromHeader = msg.payload?.headers?.find(
          (h) => h.name?.toLowerCase() === "from",
        )?.value;
        const fromEmail = extractFrom(fromHeader);
        if (!fromEmail || fromEmail === accountEmailLower) return false;
        const internalDate = parseInt(msg.internalDate ?? "0", 10);
        return internalDate > sentAtMs;
      });

      if (!replyMessage) continue;

      const repliedAt = new Date(
        parseInt(replyMessage.internalDate ?? Date.now().toString(), 10),
      ).toISOString();

      // Update campaign_recipient
      await admin
        .from("campaign_recipients")
        .update({
          status: "replied",
          replied_at: repliedAt,
        })
        .eq("id", cand.id);

      // Update workspace data stats
      await admin
        .from("contact_workspace_data")
        .upsert(
          {
            contact_id: cand.contact_id,
            workspace_id: cand.workspace_id,
            user_id: cand.user_id,
            last_replied_at: repliedAt,
          },
          { onConflict: "contact_id,workspace_id" },
        );

      // Update queue_recipients linked to this campaign_recipient
      await admin
        .from("queue_recipients")
        .update({ status: "replied" })
        .eq("campaign_recipient_id", cand.id);

      // Activity log
      await admin.from("activity_log").insert({
        user_id: cand.user_id,
        workspace_id: cand.workspace_id,
        activity_type: "email_replied",
        entity_type: "campaign_recipient",
        entity_id: cand.id,
        metadata: { contact_email: cand.contact_email },
      });

      result.replies_found++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      result.errors.push(`Thread ${cand.gmail_thread_id}: ${msg}`);
    }
  }

  return result;
}
