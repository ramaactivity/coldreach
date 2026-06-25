import { google } from "googleapis";
import {
  renderSignatureHtml,
  renderSignaturePlain,
  type SignatureData,
} from "@/lib/signature";
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
  subject_lines_en?: string[] | null;
  body_plain: string;
  body_plain_en?: string | null;
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
  subject_index: number;
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

function pickRandomSubject(subjects: string[]): { value: string; index: number } {
  if (subjects.length === 0) return { value: "(no subject)", index: -1 };
  const index = Math.floor(Math.random() * subjects.length);
  return { value: subjects[index], index };
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

/**
 * Drop the plain-text signature block from a plain body so we can re-render
 * the signature as structured HTML in the HTML part. Convention: "-- " on
 * its own line (RFC 3676) is the signature separator. Returns body up to
 * (but not including) that separator.
 */
function stripPlainSignature(plainBody: string): string {
  // Match the separator line: two dashes + optional space, surrounded by
  // newlines. Trailing whitespace on separator line is preserved per RFC
  // but we accept both "-- " and "--".
  const m = plainBody.match(/\n\n-- ?\n/);
  if (!m) return plainBody;
  return plainBody.slice(0, m.index);
}

/**
 * Insert the AI opener as its own paragraph right after the greeting line.
 * Templates open with "Dear Bapak/Ibu {name}," then a blank line then the body;
 * we splice the opener into that first blank-line break. Falls back to
 * prepending if the body has no paragraph break.
 */
function injectOpenerAfterGreeting(body: string, opener: string): string {
  const m = body.match(/\r?\n\r?\n/);
  if (!m || m.index === undefined) return `${opener}\n\n${body}`;
  const cut = m.index + m[0].length;
  return `${body.slice(0, cut)}${opener}\n\n${body.slice(cut)}`;
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
  /** Pre-rendered structured signature HTML, injected between body and
   *  footer. Kept separate from `bodyPlain` so we don't naïvely convert
   *  the structured layout via plainToHtml. */
  signatureHtml: string,
  /** Cold mode: send a single text/plain part that reads like a personal 1:1
   *  email — no open pixel, no link rewriting, no HTML/logo. Far better inbox
   *  (Primary tab) placement for cold outreach than a tracked HTML email. */
  coldMode: boolean,
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

  const bodyPlainWithFooter =
    bodyPlain + buildUnsubscribeFooterPlain(unsubscribeUrl);

  // The content section. Cold mode → a single text/plain part (no HTML, no
  // pixel, no link rewriting) so the email reads like a person typed it.
  // Otherwise → multipart/alternative with the tracked, signature-rich HTML.
  let contentPart: string[];
  if (coldMode) {
    // Lightweight HTML: a clean, personal-looking email — the body + plain-text
    // signature auto-linked into clickable anchors, plus a hyperlinked
    // "Unsubscribe" (URL hidden, not shown raw). Deliberately NO tracking
    // pixel, NO click-link rewriting, and NO logo/branded signature card, so it
    // stays out of the Promotions/spam bucket while still looking polished.
    const coldBodyHtml = `${plainToHtml(bodyPlain)}${buildUnsubscribeFooterHtml(unsubscribeUrl)}`;
    const altBoundary = `----coldreach-alt-${Date.now().toString(36)}`;
    contentPart = [
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      "",
      `--${altBoundary}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      `Content-Transfer-Encoding: quoted-printable`,
      "",
      quotedPrintable(bodyPlain),
      "",
      `--${altBoundary}`,
      `Content-Type: text/html; charset="UTF-8"`,
      `Content-Transfer-Encoding: quoted-printable`,
      "",
      quotedPrintable(coldBodyHtml),
      "",
      `--${altBoundary}--`,
    ];
  } else {
    // HTML version: auto-links URLs (wrapped in click tracker when base is
    // provided) + open-tracking pixel + unsubscribe footer. `bodyPlain`
    // already has the plain-text signature appended by the caller; the HTML
    // signature here is the structured rich version.
    const linkWrapper = clickTrackingBase
      ? (url: string) => buildClickTrackingHref(clickTrackingBase, url)
      : undefined;
    const bodyHtml = `${plainToHtml(stripPlainSignature(bodyPlain), linkWrapper)}${signatureHtml}${buildUnsubscribeFooterHtml(unsubscribeUrl)}${buildTrackingPixelHtml(trackingUrl)}`;
    const altBoundary = `----coldreach-alt-${Date.now().toString(36)}`;
    contentPart = [
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
  }

  if (attachments.length === 0) {
    return [...baseHeaders, ...contentPart].join("\r\n");
  }

  // Multipart with attachments wrapping the alternative section
  const mixedBoundary = `----coldreach-mixed-${Date.now().toString(36)}`;
  const lines: string[] = [
    ...baseHeaders,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    "",
    `--${mixedBoundary}`,
    ...contentPart,
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
  /** Structured signature (logo, contacts, socials). Renders as HTML in the
   *  HTML part and plain text in the plain part. NULL = no signature. */
  signatureData?: SignatureData | null;
  /** Brand color fallback (e.g. workspace.color_theme) when signatureData
   *  doesn't override. Drives the accent border + icon tints. */
  signatureFallbackColor?: string | null;
  /** When set, adds an unsubscribe footer + List-Unsubscribe headers. */
  unsubscribeUrl?: string | null;
  /** Language code to pick body variant. 'en' uses body_plain_en if set, else falls back to body_plain. */
  language?: "id" | "en";
  /** Cold mode: plain-text-only personal-looking email — no pixel, no link
   *  rewriting, no HTML/logo signature. Best inbox placement for cold
   *  first-touch. Defaults to true; pass false for warm/branded sends. */
  coldMode?: boolean;
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
    signatureData,
    signatureFallbackColor,
    unsubscribeUrl,
    language,
    coldMode = true,
  } = params;

  try {
    const accessToken = await ensureFreshToken(supabase, account);
    const oauth = new google.auth.OAuth2();
    oauth.setCredentials({ access_token: accessToken });

    // Render variables
    const values = buildContactValues(contact, aiOpener);
    // Subject pool follows the same language as the body. Falls back to the
    // Indonesian subject_lines when no English variants are authored.
    const subjectPool =
      language === "en" &&
      template.subject_lines_en &&
      template.subject_lines_en.length > 0
        ? template.subject_lines_en
        : template.subject_lines;
    const picked = forcedSubject
      ? { value: forcedSubject, index: -1 }
      : pickRandomSubject(subjectPool);
    const baseSubject = picked.value;
    const renderedSubject = renderPreview(baseSubject, values);
    const subject = subjectPrefix
      ? `${subjectPrefix} ${renderedSubject}`
      : renderedSubject;
    // Pick body variant by language. Falls back to body_plain when EN not
    // authored on this template.
    const sourceBody =
      language === "en" && template.body_plain_en
        ? template.body_plain_en
        : template.body_plain;
    let renderedBody = renderPreview(sourceBody, values);
    // If the template doesn't explicitly place {ai_opener} but we generated one,
    // slot it in as the first personal line right after the greeting paragraph.
    // This makes AI personalization work without rewriting every template.
    if (aiOpener && aiOpener.trim() && !sourceBody.includes("{ai_opener}")) {
      renderedBody = injectOpenerAfterGreeting(renderedBody, aiOpener.trim());
    }
    // Append plain-text signature with RFC-3676 separator. The HTML version
    // is rendered separately by renderSignatureHtml and embedded in the
    // HTML MIME part — see buildMimeMessage(...signatureHtml).
    const sigPlain = renderSignaturePlain(signatureData).trim();
    const body = sigPlain
      ? `${renderedBody}\n\n-- \n${sigPlain}`
      : renderedBody;
    const sigHtml = renderSignatureHtml(signatureData, {
      fallbackBrandColor: signatureFallbackColor ?? undefined,
    });

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

    // Build MIME. In cold mode the pixel + click-tracking base are dropped
    // entirely (passed as null) so no tracking artifacts leak into the
    // plain-text body — the metrics still work via reply/bounce detection.
    const mime = buildMimeMessage(
      account.display_name,
      account.email,
      contact.email,
      subject,
      body,
      attachmentBuffers,
      coldMode ? null : trackingUrl,
      coldMode ? null : (clickTrackingBase ?? null),
      inReplyToMessageId ?? null,
      unsubscribeUrl ?? null,
      sigHtml,
      coldMode,
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
      subject_index: picked.index,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}
