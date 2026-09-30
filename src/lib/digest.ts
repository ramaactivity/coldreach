import type { SupabaseClient } from "@supabase/supabase-js";
import { sendNotificationEmail, type EmailAccount } from "@/lib/email-sender";
import { startOfTodayWibIso } from "@/lib/quota-reset";

// Daily 08:00 WIB digest to the owner: replies still waiting for an answer
// (hottest first), hot leads that stalled, and yesterday's numbers. Replies
// already answered from Gmail/webmail are auto-handled by the reply poller,
// so everything listed here genuinely needs action.

const HEAT: Record<string, number> = { interested: 0, question: 1, other: 2, out_of_office: 3 };
const LABEL: Record<string, string> = {
  interested: "TERTARIK",
  question: "BERTANYA",
  out_of_office: "cuti",
  not_interested: "tidak tertarik",
  unsubscribe_request: "minta berhenti",
};
const STALL_DAYS = 3;
const EARLY = new Set(["new", "contacted"]);
const DAY_MS = 864e5;

type Stage = { id: string; name: string; is_terminal?: boolean };

function ago(iso: string): string {
  const d = Math.floor((Date.now() - Date.parse(iso)) / DAY_MS);
  return d <= 0 ? "hari ini" : `${d} hari lalu`;
}

export async function buildAndSendDigests(
  admin: SupabaseClient,
): Promise<Array<{ user: string; sent: boolean; error?: string }>> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const { data: users } = await admin.from("users").select("id, email");
  const out: Array<{ user: string; sent: boolean; error?: string }> = [];

  for (const user of users ?? []) {
    const { data: workspaces } = await admin
      .from("workspaces")
      .select("id, name, slug, pipeline_stages")
      .eq("user_id", user.id)
      .eq("is_archived", false);
    if (!workspaces?.length) continue;
    const wsById = new Map(workspaces.map((w) => [w.id, w]));
    const nowIso = new Date().toISOString();
    const todayStart = startOfTodayWibIso();
    const yesterdayStart = new Date(Date.parse(todayStart) - DAY_MS).toISOString();

    const [{ data: waiting }, { data: leads }, { data: yRows }] = await Promise.all([
      admin
        .from("campaign_recipients")
        .select("workspace_id, contact_email, replied_at, reply_classification, contact:contacts(first_name, last_name, company)")
        .eq("user_id", user.id)
        .eq("status", "replied")
        .is("handled_at", null)
        .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`)
        // NOT IN alone would also drop unclassified (NULL) replies.
        .or("reply_classification.is.null,reply_classification.not.in.(not_interested,unsubscribe_request)")
        .order("replied_at", { ascending: false })
        .limit(50),
      admin
        .from("contact_workspace_data")
        .select("workspace_id, lead_stage_id, lead_stage_updated_at, contact:contacts(email, first_name, last_name, company)")
        .eq("user_id", user.id)
        .is("deal_closed_at", null)
        .not("lead_stage_id", "is", null)
        .lt("lead_stage_updated_at", new Date(Date.now() - STALL_DAYS * DAY_MS).toISOString())
        .limit(200),
      admin
        .from("campaign_recipients")
        .select("workspace_id, status, sent_at, bounced_at, replied_at")
        .eq("user_id", user.id)
        .gte("created_at", yesterdayStart)
        .lt("created_at", todayStart)
        .limit(1000),
    ]);

    type Person = { first_name: string | null; last_name: string | null; company: string | null; email?: string };
    const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
    const who = (c: Person | null, fallback: string) => {
      const name = [c?.first_name, c?.last_name].filter(Boolean).join(" ") || fallback;
      return c?.company ? `${name} (${c.company})` : name;
    };

    const replyLines = (waiting ?? [])
      .sort((a, b) => (HEAT[a.reply_classification ?? "other"] ?? 2) - (HEAT[b.reply_classification ?? "other"] ?? 2))
      .map((r) => {
        const ws = wsById.get(r.workspace_id);
        const tag = LABEL[r.reply_classification ?? ""] ?? "balasan";
        return `• [${tag}] ${who(one(r.contact as Person | Person[] | null), r.contact_email)} — ${ws?.name ?? ""}, ${ago(r.replied_at)}`;
      });

    const stalled = (leads ?? []).filter((l) => {
      const stages = (wsById.get(l.workspace_id)?.pipeline_stages ?? []) as Stage[];
      const st = stages.find((s) => s.id === l.lead_stage_id);
      return st && !EARLY.has(st.id) && !st.is_terminal;
    });
    const leadLines = stalled.map((l) => {
      const ws = wsById.get(l.workspace_id);
      const stage = ((ws?.pipeline_stages ?? []) as Stage[]).find((s) => s.id === l.lead_stage_id);
      const c = one(l.contact as Person | Person[] | null);
      return `• ${who(c, c?.email ?? "")} — ${ws?.name ?? ""}, tahap "${stage?.name}" sejak ${ago(l.lead_stage_updated_at)}`;
    });

    const statLines = workspaces
      .map((w) => {
        const rows = (yRows ?? []).filter((r) => r.workspace_id === w.id);
        const sent = rows.filter((r) => r.sent_at).length;
        if (!sent) return null;
        const bounced = rows.filter((r) => r.bounced_at).length;
        const replied = rows.filter((r) => r.replied_at).length;
        const pct = ((bounced / sent) * 100).toFixed(0);
        return `• ${w.name}: ${sent} terkirim, ${replied} dibalas, ${bounced} bounce (${pct}%)${bounced / sent > 0.05 ? "  ⚠ bounce tinggi" : ""}`;
      })
      .filter(Boolean);

    if (!replyLines.length && !leadLines.length && !statLines.length) continue;

    const hot = (waiting ?? []).filter((r) => r.reply_classification === "interested" || r.reply_classification === "question").length;
    const subject = replyLines.length
      ? `ColdReach: ${replyLines.length} balasan menunggu${hot ? ` (${hot} panas)` : ""}`
      : "ColdReach: ringkasan harian";
    const text = [
      "Selamat pagi,",
      "",
      replyLines.length
        ? `BALASAN YANG BELUM DIBALAS (${replyLines.length})\n${replyLines.join("\n")}\nBuka inbox: ${appUrl}/inbox`
        : "Semua balasan sudah ditangani.",
      "",
      leadLines.length
        ? `LEAD PANAS YANG MACET ≥${STALL_DAYS} HARI (${leadLines.length})\n${leadLines.join("\n")}\nBuka pipeline masing-masing workspace untuk menindaklanjuti.`
        : "",
      "",
      statLines.length ? `KEMARIN\n${statLines.join("\n")}` : "",
      "",
      "Balasan yang sudah kamu jawab dari Gmail otomatis hilang dari daftar ini.",
    ]
      .filter((l, i, a) => l !== "" || a[i - 1] !== "")
      .join("\n");

    // Send from the owner's own connected mailbox when there is one.
    const { data: accounts } = await admin
      .from("email_accounts")
      .select("id, email, display_name, access_token_encrypted, refresh_token_encrypted, token_expires_at, provider, smtp_config")
      .eq("user_id", user.id)
      .eq("is_active", true);
    const account =
      (accounts ?? []).find((a) => a.email.toLowerCase() === user.email.toLowerCase()) ??
      (accounts ?? []).find((a) => a.provider !== "smtp") ??
      accounts?.[0];
    if (!account) {
      out.push({ user: user.email, sent: false, error: "no connected account" });
      continue;
    }
    const res = await sendNotificationEmail(admin, account as EmailAccount, user.email, subject, text);
    out.push({ user: user.email, sent: res.ok, error: res.ok ? undefined : res.error });
  }
  return out;
}
