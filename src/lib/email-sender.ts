import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken, refreshAccessToken } from "@/lib/gmail";
import { plainToHtml, renderPreview } from "@/lib/template-helpers";
import { buildClickTrackingHref } from "@/lib/click-tracking";

export type EmailContact = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  position: string | null;
};

export type EmailTemplate = {
  id: string;
  subject_lines: string[];
  body_plain: string;
};

export type EmailAttachment = {
  filename: string;
  storage_path: string;
  mime_type: string;
};

export type EmailAccount = {
  id: string;
  email: string;
  display_name: string | null;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string;
};

export type SendResult = {
  ok: true;
  gmail_message_id: string;
  gmail_thread_id: string;
  subject_used: string;
} | {
  ok: false;
  error: string;
};

function buildContactValues(
  contact: EmailContact,
  aiOpener: string | null,
): Record<string, string> {
  return {
    first_name: contact.first_name ?? "",
    last_name: contact.last_name ?? "",
    full_name: [contact.first_name, contact.last_name].filter(Boolean).join(" "),
    email: contact.email,
    company: contact.company ?? "",
    position: contact.position ?? "",
    ai_opener: aiOpener ?? "",
  };
}

function pickRandomSubject(subjects: string[]): string {
  if (subjects.length === 0) return "(no subject)";
  return subjects[Math.floor(Math.random() * subjects.length)];
}

function encodeRFC2047(str: string): string {
  // For non-ASCII characters in headers — use UTF-8 base64 encoding
  if (/^[\x20-\x7E]*$/.test(str)) return str;
  return `=?UTF-8?B?${Buffer.from(str, "utf8").toString("base64")}?=`;
}

function buildTrackingPixelHtml(trackingUrl: string | null): string {
  if (!trackingUrl) return "";
  return `<img src="${trackingUrl}" width="1" height="1" alt="" border="0" style="display:block;border:0;outline:none;text-decoration:none;height:1px;width:1px;" />`;
}

function buildUnsubscribeFooterHtml(unsubscribeUrl: string | null): string {
  if (!unsubscribeUrl) return "";
  return `
<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;line-height:1.4;color:#6b7280;font-family:-apple-system,system-ui,sans-serif;">
  Don't want to receive these emails?
  <a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
</div>`;
}

function buildUnsubscribeFooterPlain(unsubscribeUrl: string | null): string {
  if (!unsubscribeUrl) return "";
  return `\n\n--\nDon't want to receive these emails? Unsubscribe: ${unsubscribeUrl}`;
}

function buildMimeMessage(
  fromName: string | null,
  fromEmail: string,
  toEmail: string,
  subject: string,
  bodyPlain: string,
  attachments: Array<{ filename: string; mime_type: string; data: Buffer }>,
  trackingUrl: string | null,
  clickTrackingBase: string | null,
  inReplyToMessageId: string | null,
  unsubscribeUrl: string | null,
): string {
  const fromHeader = fromName
    ? `${encodeRFC2047(fromName)} <${fromEmail}>`
    : fromEmail;
  const subjectHeader = encodeRFC2047(subject);
  const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@coldreach>`;

  const baseHeaders = [
    `From: ${fromHeader}`,
    `To: ${toEmail}`,
    `Subject: ${subjectHeader}`,
    `Message-ID: ${messageId}`,
    `MIME-Version: 1.0`,
  ];

  // RFC 2369 / RFC 8058 — gives Gmail/Outlook a one-click unsubscribe
  // button in the inbox UI without needing the recipient to scroll to a
  // tiny footer link. POST=List-Unsubscribe also flags us as legitimate
  // bulk sender to spam filters.
  if (unsubscribeUrl) {
    baseHeaders.push(`List-Unsubscribe: <${unsubscribeUrl}>`);
    baseHeaders.push(`List-Unsubscribe-Post: List-Unsubscribe=One-Click`);
  }

  // Threading headers — when replying to a previous message, include
  // both In-Reply-To and References so email clients display the
  // follow-up as part of the original thread.
  if (inReplyToMessageId) {
    baseHeaders.push(`In-Reply-To: ${inReplyToMessageId}`);
    baseHeaders.push(`References: ${inReplyToMessageId}`);
  }

  // Build the bodies. HTML version: auto-links URLs (wrapped in click
  // tracker when base is provided) + open-tracking pixel + unsubscribe
  // footer. Plain version keeps original URLs as-is plus its own footer.
  const linkWrapper = clickTrackingBase
    ? (url: string) => buildClickTrackingHref(clickTrackingBase, url)
    : undefined;
  const bodyPlainWithFooter =
    bodyPlain + buildUnsubscribeFooterPlain(unsubscribeUrl);
  const bodyHtml = `${plainToHtml(bodyPlain, linkWrapper)}${buildUnsubscribeFooterHtml(unsubscribeUrl)}${buildTrackingPixelHtml(trackingUrl)}`;

  // Outer boundary (only used if attachments)
  const altBoundary = `----coldreach-alt-${Date.now().toString(36)}`;
  const altPart = [
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    "",
    `--${altBoundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: quoted-printable`,
    "",
    quotedPrintable(bodyPlainWithFooter),
    "",
    `--${altBoundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: quoted-printable`,
    "",
    quotedPrintable(bodyHtml),
    "",
    `--${altBoundary}--`,
  ];

  if (attachments.length === 0) {
    return [...baseHeaders, ...altPart].join("\r\n");
  }

  // Multipart with attachments wrapping the alternative section
  const mixedBoundary = `----coldreach-mixed-${Date.now().toString(36)}`;
  const lines: string[] = [
    ...baseHeaders,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    "",
    `--${mixedBoundary}`,
    ...altPart,
    "",
  ];

  for (const att of attachments) {
    const base64 = att.data.toString("base64");
    const chunks = base64.match(/.{1,76}/g) ?? [];
    lines.push(
      `--${mixedBoundary}`,
      `Content-Type: ${att.mime_type}; name="${att.filename}"`,
      `Content-Transfer-Encoding: base64`,
      `Content-Disposition: attachment; filename="${att.filename}"`,
      "",
      ...chunks,
      "",
    );
  }

  lines.push(`--${mixedBoundary}--`);
  return lines.join("\r\n");
}

function quotedPrintable(input: string): string {
  // Encode UTF-8 bytes; preserve printable ASCII except = and whitespace at line end.
  const bytes = Buffer.from(input, "utf8");
  let result = "";
  let lineLength = 0;

  for (const byte of bytes) {
    let chunk: string;
    if (byte === 0x3d) {
      chunk = "=3D";
    } else if (byte === 0x0a) {
      result += "\r\n";
      lineLength = 0;
      continue;
    } else if (byte === 0x0d) {
      continue; // strip \r, we add \r\n on \n
    } else if (byte >= 0x21 && byte <= 0x7e) {
      chunk = String.fromCharCode(byte);
    } else if (byte === 0x20 || byte === 0x09) {
      chunk = String.fromCharCode(byte);
    } else {
      chunk = `=${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }

    // Soft line break at 75 chars
    if (lineLength + chunk.length > 75) {
      result += "=\r\n";
      lineLength = 0;
    }
    result += chunk;
    lineLength += chunk.length;
  }

  return result;
}

/**
 * Get a fresh access token, refreshing if expired. Updates DB if refreshed.
 */
async function ensureFreshToken(
  supabase: SupabaseClient,
  account: EmailAccount,
): Promise<string> {
  const expiresAt = new Date(account.token_expires_at);
  const now = new Date();
  const buffer = 60 * 1000; // refresh if less than 60 sec until expiry

  if (expiresAt.getTime() - now.getTime() > buffer) {
    return decryptToken(account.access_token_encrypted);
  }

  const refreshed = await refreshAccessToken(account.refresh_token_encrypted);
  await supabase
    .from("email_accounts")
    .update({
      access_token_encrypted: encryptToken(refreshed.access_token),
      token_expires_at: refreshed.expires_at.toISOString(),
    })
    .eq("id", account.id);

  return refreshed.access_token;
}

async function downloadAttachment(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<Buffer | null> {
  const { data, error } = await supabase.storage
    .from("template-attachments")
    .download(storagePath);
  if (error || !data) {
    console.error("downloadAttachment error:", error);
    return null;
  }
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export type SendEmailParams = {
  account: EmailAccount;
  contact: EmailContact;
  template: EmailTemplate;
  attachments: EmailAttachment[];
  aiOpener: string | null;
  /** When set, embeds an open-tracking pixel pointing to this URL in HTML body. */
  trackingUrl: string | null;
  /** When set, every URL in the HTML body is wrapped with this tracker base
   *  (e.g., `${APP}/api/track/click/{recipient_id}`) plus an HMAC signature. */
  clickTrackingBase?: string | null;
  /** When set, threads this email under the given Gmail thread (for follow-ups). */
  gmailThreadId?: string | null;
  /** Original Gmail Message-ID (with angle brackets) for In-Reply-To header. */
  inReplyToMessageId?: string | null;
  /** Subject prefix override — e.g., "Re:" for follow-ups. */
  subjectPrefix?: string | null;
  /** Override the subject (e.g., for follow-ups, reuse original subject). */
  forcedSubject?: string | null;
  /** Workspace plain-text signature appended to body. RFC-3676 separator. */
  signature?: string | null;
  /** When set, adds an unsubscribe footer + List-Unsubscribe headers. */
  unsubscribeUrl?: string | null;
};

export async function sendEmail(
  supabase: SupabaseClient,
  params: SendEmailParams,
): Promise<SendResult> {
  const {
    account,
    contact,
    template,
    attachments,
    aiOpener,
    trackingUrl,
    clickTrackingBase,
    gmailThreadId,
    inReplyToMessageId,
    subjectPrefix,
    forcedSubject,
    signature,
    unsubscribeUrl,
  } = params;

  try {
    const accessToken = await ensureFreshToken(supabase, account);
    const oauth = new google.auth.OAuth2();
    oauth.setCredentials({ access_token: accessToken });

    // Render variables
    const values = buildContactValues(contact, aiOpener);
    const baseSubject =
      forcedSubject ?? pickRandomSubject(template.subject_lines);
    const renderedSubject = renderPreview(baseSubject, values);
    const subject = subjectPrefix
      ? `${subjectPrefix} ${renderedSubject}`
      : renderedSubject;
    const renderedBody = renderPreview(template.body_plain, values);
    // Append signature with RFC-3676 separator ("\n-- \n") so email
    // clients can detect and collapse it. Skip when signature is empty.
    const sigText = signature?.trim();
    const body = sigText
      ? `${renderedBody}\n\n-- \n${sigText}`
      : renderedBody;

    // Download attachment files
    const attachmentBuffers: Array<{
      filename: string;
      mime_type: string;
      data: Buffer;
    }> = [];
    for (const att of attachments) {
      const data = await downloadAttachment(supabase, att.storage_path);
      if (data) {
        attachmentBuffers.push({
          filename: att.filename,
          mime_type: att.mime_type,
          data,
        });
      }
    }

    // Build MIME (with tracking pixel if URL provided, threading if reply)
    const mime = buildMimeMessage(
      account.display_name,
      account.email,
      contact.email,
      subject,
      body,
      attachmentBuffers,
      trackingUrl,
      clickTrackingBase ?? null,
      inReplyToMessageId ?? null,
      unsubscribeUrl ?? null,
    );

    // Encode as base64url
    const raw = Buffer.from(mime, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // Send via Gmail API
    const gmail = google.gmail({ version: "v1", auth: oauth });
    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: gmailThreadId
        ? { raw, threadId: gmailThreadId }
        : { raw },
    });

    return {
      ok: true,
      gmail_message_id: result.data.id ?? "",
      gmail_thread_id: result.data.threadId ?? "",
      subject_used: subject,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}
