import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { decrypt } from "@/lib/crypto";

/** email_accounts.smtp_config for provider='smtp' rows. Username = email. */
export type SmtpConfig = {
  smtp_host: string;
  smtp_port: number;
  imap_host: string;
  imap_port: number;
  password_encrypted: string;
};

export type InboxMessage = {
  uid: number;
  from: string;
  subject: string;
  date: Date;
  inReplyTo: string | null;
  references: string[];
  autoSubmitted: string | null;
  xAutoreply: string | null;
  precedence: string | null;
  text: string;
  /** Raw RFC 822 source (capped). DSNs carry the failed recipient in a
   *  message/delivery-status part that mailparser leaves out of `text`. */
  raw: string;
};

function headerText(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function smtpTransport(email: string, cfg: SmtpConfig, password: string) {
  return nodemailer.createTransport({
    host: cfg.smtp_host,
    port: cfg.smtp_port,
    secure: cfg.smtp_port === 465,
    auth: { user: email, pass: password },
  });
}

function imapClient(email: string, cfg: SmtpConfig, password: string) {
  return new ImapFlow({
    host: cfg.imap_host,
    port: cfg.imap_port,
    secure: cfg.imap_port === 993,
    auth: { user: email, pass: password },
    logger: false,
  });
}

/** Send a pre-built RFC 2822 message verbatim (headers incl. Message-ID kept). */
export async function sendRawViaSmtp(
  email: string,
  cfg: SmtpConfig,
  to: string,
  rawMime: string,
): Promise<void> {
  // ponytail: one SMTP connection per message; pool per account if send
  // latency ever matters (queue-runner sends sequentially under a deadline).
  const transport = smtpTransport(email, cfg, decrypt(cfg.password_encrypted));
  try {
    await transport.sendMail({ envelope: { from: email, to }, raw: rawMime });
  } finally {
    transport.close();
  }
}

/** Log in to both SMTP and IMAP with a plaintext password. Throws on failure. */
export async function verifySmtpImap(
  email: string,
  cfg: Omit<SmtpConfig, "password_encrypted">,
  password: string,
): Promise<void> {
  const full = { ...cfg, password_encrypted: "" };
  const transport = smtpTransport(email, full, password);
  try {
    await transport.verify();
  } catch (err) {
    throw new Error(`SMTP: ${err instanceof Error ? err.message : "gagal login"}`);
  } finally {
    transport.close();
  }
  const client = imapClient(email, full, password);
  try {
    await client.connect();
  } catch (err) {
    throw new Error(`IMAP: ${err instanceof Error ? err.message : "gagal login"}`);
  } finally {
    await client.logout().catch(() => {});
  }
}

/** Parsed INBOX messages received in the last `sinceDays` days, newest last. */
export async function fetchRecentInbox(
  email: string,
  cfg: SmtpConfig,
  sinceDays: number,
  max = 300,
): Promise<InboxMessage[]> {
  const client = imapClient(email, cfg, decrypt(cfg.password_encrypted));
  await client.connect();
  const out: InboxMessage[] = [];
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000);
      const uids = (await client.search({ since }, { uid: true })) || [];
      const recent = uids.slice(-max);
      if (recent.length === 0) return out;
      for await (const msg of client.fetch(
        recent,
        { uid: true, source: { maxLength: 256 * 1024 } },
        { uid: true },
      )) {
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const refs = parsed.references;
        out.push({
          uid: msg.uid,
          from: (parsed.from?.value[0]?.address ?? "").toLowerCase(),
          subject: parsed.subject ?? "",
          date: parsed.date ?? new Date(),
          inReplyTo: parsed.inReplyTo ?? null,
          references: Array.isArray(refs) ? refs : refs ? [refs] : [],
          autoSubmitted: headerText(parsed.headers.get("auto-submitted")),
          xAutoreply: headerText(parsed.headers.get("x-autoreply")),
          precedence: headerText(parsed.headers.get("precedence")),
          text: parsed.text ?? "",
          raw: msg.source.toString("utf8"),
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return out;
}
