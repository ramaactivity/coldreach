import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Public endpoint — recipients click this from email footers (GET) or
// Gmail/Outlook fire it via the List-Unsubscribe-Post=One-Click header
// (POST per RFC 8058). One handler covers both.

async function unsubscribeByToken(token: string): Promise<{
  ok: true;
  contactEmail: string;
  alreadyUnsubscribed: boolean;
} | null> {
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return null;
  const admin = createAdminClient();

  const { data: contact } = await admin
    .from("contacts")
    .select("id, user_id, email, status, archived_at")
    .eq("unsubscribe_token", token)
    .maybeSingle();
  if (!contact) return null;

  const c = contact as {
    id: string;
    user_id: string;
    email: string;
    status: string;
    archived_at: string | null;
  };

  if (c.status === "unsubscribed" && c.archived_at) {
    return { ok: true, contactEmail: c.email, alreadyUnsubscribed: true };
  }

  const nowIso = new Date().toISOString();
  await admin
    .from("contacts")
    .update({
      status: "unsubscribed",
      archived_at: c.archived_at ?? nowIso,
      archive_reason: "unsubscribed",
    })
    .eq("id", c.id);

  await admin
    .from("queue_recipients")
    .update({ status: "skipped" })
    .eq("contact_id", c.id)
    .eq("status", "pending");

  await admin.from("activity_log").insert({
    user_id: c.user_id,
    activity_type: "contact_unsubscribed",
    entity_type: "contact",
    entity_id: c.id,
    metadata: { email: c.email },
  });

  return { ok: true, contactEmail: c.email, alreadyUnsubscribed: false };
}

function htmlPage(opts: {
  ok: boolean;
  email?: string;
  alreadyUnsubscribed?: boolean;
}): string {
  const heading = opts.ok
    ? opts.alreadyUnsubscribed
      ? "Kamu sudah unsubscribed"
      : "Unsubscribe berhasil"
    : "Link tidak valid";

  const body = opts.ok
    ? `<p style="margin:0 0 8px;color:#52525b;font-size:14px;line-height:1.5;">
         <strong style="color:#18181b;">${opts.email ?? ""}</strong>
         tidak akan menerima email lagi dari kami.
       </p>
       <p style="margin:16px 0 0;color:#71717a;font-size:12px;line-height:1.5;">
         Kalau ini tidak sengaja, balas email terakhir yang kamu terima dengan
         kata "subscribe" — kami akan re-aktifkan manual.
       </p>`
    : `<p style="margin:0;color:#52525b;font-size:14px;line-height:1.5;">
         Link unsubscribe ini sudah kedaluwarsa atau salah. Email kamu tidak
         ditemukan di sistem kami.
       </p>`;

  return `<!doctype html>
<html><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>${heading} — ColdReach</title>
</head>
<body style="margin:0;background:#fafafa;font-family:-apple-system,system-ui,sans-serif;">
  <div style="display:flex;min-height:100vh;align-items:center;justify-content:center;padding:48px 16px;">
    <div style="width:100%;max-width:460px;background:#fff;border:1px solid #e4e4e7;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      ${
        opts.ok
          ? `<div style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:9999px;background:#dcfce7;margin-bottom:12px;">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </div>`
          : ""
      }
      <h1 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#09090b;">${heading}</h1>
      ${body}
    </div>
  </div>
</body></html>`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const result = await unsubscribeByToken(token);
  return new NextResponse(
    htmlPage({
      ok: !!result,
      email: result?.contactEmail,
      alreadyUnsubscribed: result?.alreadyUnsubscribed,
    }),
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const result = await unsubscribeByToken(token);
  // Gmail just wants a 200 — no body needed.
  return new NextResponse(result ? "OK" : "Not Found", {
    status: result ? 200 : 404,
    headers: { "Content-Type": "text/plain" },
  });
}
