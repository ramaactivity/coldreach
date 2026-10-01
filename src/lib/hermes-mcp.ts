import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { corporateDomainOf } from "@/lib/lang-detect";
import { effectiveWarmupQuota, describeWarmupStage } from "@/lib/warmup";
import { startOfTodayWibIso } from "@/lib/quota-reset";
import { addDaysWIB, todayWIB } from "@/lib/holidays-id";
import { wibDate } from "@/lib/ooo";
import { senderScope } from "@/lib/sender-account";

/**
 * MCP server for the Hermes sales agent: plain JSON-RPC over one stateless
 * POST (initialize, ping, tools/list, tools/call; notifications → 202), same
 * pattern as Tetra Ops. Every query runs as service role but is locked to ONE
 * user + ONE workspace from env (HERMES_USER_ID, HERMES_WORKSPACE_SLUG).
 * Sending is never done here: drafts become queue_recipients rows and the
 * normal queue-runner (quota, warmup, cooldown, domain caps, suppression,
 * holidays) sends them.
 *
 * ponytail: no sessions/SSE/batch — add when a client needs them.
 */

const PROTOCOL_VERSION = "2025-06-18";
const COOLDOWN_DAYS = 45; // = queue-runner DEDUP_COOLDOWN_DAYS
const DOMAIN_PER_DAY = 2; // = MAX_PER_COMPANY_DOMAIN_PER_DAY
const DOMAIN_PER_WINDOW = 8; // = MAX_PER_COMPANY_DOMAIN_PER_WINDOW
const DOMAIN_WINDOW_DAYS = 14;
const DAY_MS = 24 * 3600 * 1000;
const EMAIL_RE = /^[^\s@,()"'<>;]+@[^\s@,()"'<>;]+\.[a-z]{2,}$/i;

type Scope = {
  admin: SupabaseClient;
  userId: string;
  ws: {
    id: string;
    name: string;
    slug: string;
    approval_mode: "manual" | "auto" | null;
    daily_new_cap: number | null;
  };
  queue: {
    id: string;
    daily_target: number;
    schedule_days: number[];
    schedule_start_time: string;
    schedule_end_time: string;
  };
};

class ToolError extends Error {}

async function resolveScope(): Promise<Scope> {
  const userId = process.env.HERMES_USER_ID?.trim();
  const slug = process.env.HERMES_WORKSPACE_SLUG?.trim() || "hermes-sales";
  if (!userId) throw new ToolError("Server belum dikonfigurasi (HERMES_USER_ID kosong).");
  const admin = createAdminClient();
  const { data: ws } = await admin
    .from("workspaces")
    .select("id, name, slug, approval_mode, daily_new_cap")
    .eq("user_id", userId)
    .eq("slug", slug)
    .eq("is_archived", false)
    .maybeSingle();
  if (!ws) throw new ToolError(`Workspace "${slug}" tidak ditemukan di Cold Reach.`);
  const { data: queue } = await admin
    .from("send_queues")
    .select("id, daily_target, schedule_days, schedule_start_time, schedule_end_time")
    .eq("workspace_id", ws.id)
    .eq("is_one_shot", false)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!queue) throw new ToolError(`Workspace "${slug}" belum punya antrean kirim.`);
  return { admin, userId, ws: ws as Scope["ws"], queue: queue as Scope["queue"] };
}

const norm = (e: string) => e.trim().toLowerCase();
const one = <T>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
const day = (iso: string | null | undefined) => (iso ? wibDate(Date.parse(iso)) : null);

async function workspaceNames(s: Scope): Promise<Map<string, string>> {
  const { data } = await s.admin.from("workspaces").select("id, name").eq("user_id", s.userId);
  return new Map((data ?? []).map((w) => [w.id as string, w.name as string]));
}

type ContactRow = {
  id: string;
  email: string;
  alt_emails: string[] | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  website: string | null;
  phone: string | null;
  position: string | null;
  tags: string[] | null;
  custom_fields: Record<string, unknown> | null;
  status: string;
  archived_at: string | null;
  archive_reason: string | null;
};

/** Contacts of this user matching any of `emails` (primary or alt), keyed by the asked email. */
async function findContacts(s: Scope, emails: string[]): Promise<Map<string, ContactRow>> {
  const cols =
    "id, email, alt_emails, first_name, last_name, company, website, phone, position, tags, custom_fields, status, archived_at, archive_reason";
  const [byEmail, byAlt] = await Promise.all([
    // ilike: a handful of legacy rows are stored mixed-case.
    s.admin
      .from("contacts")
      .select(cols)
      .eq("user_id", s.userId)
      .is("deleted_at", null)
      .or(emails.map((e) => `email.ilike.${e}`).join(",")),
    s.admin
      .from("contacts")
      .select(cols)
      .eq("user_id", s.userId)
      .is("deleted_at", null)
      .overlaps("alt_emails", emails),
  ]);
  const out = new Map<string, ContactRow>();
  for (const c of [...(byEmail.data ?? []), ...(byAlt.data ?? [])] as ContactRow[]) {
    const keys = [c.email, ...(c.alt_emails ?? [])].map(norm);
    for (const e of emails) if (keys.includes(e) && !out.has(e)) out.set(e, c);
  }
  return out;
}

type Check = {
  email: string;
  bisa_dikirim: boolean;
  alasan?: string[];
  /** Hard reasons block draf_kirim; domain caps only delay (runner defers). */
  keras: boolean;
  terakhir_dihubungi?: { tanggal: string; workspace: string };
  contact?: ContactRow;
};

async function checkEmails(s: Scope, rawEmails: string[]): Promise<Check[]> {
  const emails = Array.from(new Set(rawEmails.map(norm)));
  const valid = emails.filter((e) => EMAIL_RE.test(e));
  const names = await workspaceNames(s);
  const now = Date.now();

  const contacts = valid.length ? await findContacts(s, valid) : new Map<string, ContactRow>();
  const contactIds = Array.from(new Set(Array.from(contacts.values()).map((c) => c.id)));
  const domains = Array.from(
    new Set(valid.map((e) => corporateDomainOf(e)).filter((d): d is string => !!d)),
  );

  const [crRes, qrRes, domRes] = await Promise.all([
    valid.length
      ? s.admin
          .from("campaign_recipients")
          .select("contact_email, status, created_at, sent_at, replied_at, workspace_id")
          .eq("user_id", s.userId)
          .in("contact_email", valid)
      : Promise.resolve({ data: [] }),
    contactIds.length
      ? s.admin
          .from("queue_recipients")
          .select("contact_id, workspace_id, status")
          .in("contact_id", contactIds)
      : Promise.resolve({ data: [] }),
    domains.length
      ? s.admin.rpc("domain_send_counts", {
          p_user_id: s.userId,
          p_domains: domains,
          p_today_start: startOfTodayWibIso(),
          p_window_start: new Date(now - DOMAIN_WINDOW_DAYS * DAY_MS).toISOString(),
        })
      : Promise.resolve({ data: [] }),
  ]);

  type Cr = {
    contact_email: string;
    status: string;
    created_at: string;
    sent_at: string | null;
    replied_at: string | null;
    workspace_id: string | null;
  };
  const crs = (crRes.data ?? []) as Cr[];
  const qrs = (qrRes.data ?? []) as Array<{ contact_id: string; workspace_id: string; status: string }>;
  const dom = new Map(
    ((domRes.data ?? []) as Array<{ domain: string; today: number; recent: number; repliers: string[] | null }>).map(
      (d) => [d.domain, d],
    ),
  );

  return emails.map((email): Check => {
    if (!EMAIL_RE.test(email)) {
      return { email, bisa_dikirim: false, keras: true, alasan: ["format email tidak valid"] };
    }
    const hard: string[] = [];
    const soft: string[] = [];
    const c = contacts.get(email);
    const wsName = (id: string | null) => (id && names.get(id)) || "lain";

    if (c && c.status !== "active") hard.push(`status kontak: ${c.status}`);
    else if (c?.archived_at) hard.push(`kontak diarsipkan (${c.archive_reason ?? "manual"})`);

    const mine = crs.filter((r) => r.contact_email === email);
    if (mine.some((r) => r.status === "bounced")) hard.push("pernah bounce");
    const replied = mine.find((r) => r.status === "replied");
    if (replied) {
      hard.push(`pernah membalas (${wsName(replied.workspace_id)}, ${day(replied.replied_at)})`);
    }
    const touched = mine
      .filter((r) => ["sending", "sent", "opened", "replied"].includes(r.status))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const terakhir = touched
      ? { tanggal: day(touched.sent_at ?? touched.created_at)!, workspace: wsName(touched.workspace_id) }
      : undefined;
    if (touched && now - Date.parse(touched.created_at) < COOLDOWN_DAYS * DAY_MS) {
      const until = wibDate(Date.parse(touched.created_at) + COOLDOWN_DAYS * DAY_MS);
      hard.push(`cooldown sampai ${until} (terakhir dihubungi ${terakhir!.workspace})`);
    }

    if (c) {
      for (const q of qrs.filter((r) => r.contact_id === c.id)) {
        if (q.workspace_id === s.ws.id) {
          hard.push(`sudah ada di antrean ${s.ws.name} (${q.status})`);
          break;
        }
        if (q.status === "pending" || q.status === "awaiting_approval") {
          hard.push(`sudah di antrean workspace ${wsName(q.workspace_id)}`);
          break;
        }
      }
    }

    const d = corporateDomainOf(email);
    const counts = d ? dom.get(d) : undefined;
    if (counts?.repliers?.length && !counts.repliers.includes(email)) {
      hard.push(`rekan sekantor di ${d} sudah membalas, jeda 30 hari`);
    }
    if (counts && counts.today >= DOMAIN_PER_DAY) {
      soft.push(`domain ${d} sudah dihubungi ${counts.today}x hari ini (akan dikirim di hari lain)`);
    } else if (counts && counts.recent >= DOMAIN_PER_WINDOW) {
      soft.push(`domain ${d} sudah ${counts.recent}x dalam ${DOMAIN_WINDOW_DAYS} hari (akan ditunda)`);
    }

    const alasan = Array.from(new Set([...hard, ...soft]));
    return {
      email,
      bisa_dikirim: alasan.length === 0,
      keras: hard.length > 0,
      ...(alasan.length ? { alasan } : {}),
      ...(terakhir ? { terakhir_dihubungi: terakhir } : {}),
      contact: c,
    };
  });
}

/** Upsert per section 2: existing contacts only get blanks filled + tag; new ones are source='hermes'. */
async function upsertContact(s: Scope, item: DraftItem, existing: ContactRow | undefined): Promise<string> {
  const [first, ...rest] = (item.nama_pic ?? "").trim().split(/\s+/).filter(Boolean);
  const fields = {
    company: item.nama_perusahaan.trim(),
    website: item.website?.trim() || null,
    phone: item.telepon?.trim() || null,
    position: item.jabatan_pic?.trim() || null,
  };
  if (existing) {
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v && !existing[k as keyof typeof fields]) patch[k] = v;
    }
    if (first && !existing.first_name && !existing.last_name) {
      patch.first_name = first;
      patch.last_name = rest.join(" ") || null;
    }
    const tags = existing.tags ?? [];
    if (!tags.includes("hermes")) patch.tags = [...tags, "hermes"];
    patch.custom_fields = { ...(existing.custom_fields ?? {}), tetra_ops_prospek_id: item.external_ref };
    const { error } = await s.admin.from("contacts").update(patch).eq("id", existing.id);
    if (error) throw new ToolError(`gagal memperbarui kontak: ${error.message}`);
    return existing.id;
  }
  const { data, error } = await s.admin
    .from("contacts")
    .insert({
      user_id: s.userId,
      email: norm(item.email),
      first_name: first ?? null,
      last_name: rest.join(" ") || null,
      ...fields,
      tags: ["hermes"],
      source: "hermes",
      custom_fields: { tetra_ops_prospek_id: item.external_ref },
    })
    .select("id")
    .single();
  if (error || !data) throw new ToolError(`gagal membuat kontak: ${error?.message}`);
  return data.id as string;
}

const STATUS_OUT: Record<string, string> = {
  awaiting_approval: "menunggu_persetujuan",
  pending: "dijadwalkan",
  sent: "terkirim",
  replied: "dibalas",
  bounced: "bounce",
  skipped: "dibatalkan",
};

/** Next `n` send days (Mon–Fri per queue, skipping id_holidays), starting today if the window is still open. */
async function sendDays(s: Scope, n: number): Promise<string[]> {
  const today = todayWIB();
  const { data: hol } = await s.admin
    .from("id_holidays")
    .select("date")
    .eq("enabled", true)
    .gte("date", today)
    .lte("date", addDaysWIB(today, 120));
  const holidays = new Set((hol ?? []).map((h) => h.date as string));
  const nowTime = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(11, 19);
  const out: string[] = [];
  for (let i = 0; out.length < n && i < 366; i++) {
    const d = addDaysWIB(today, i);
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay() || 7;
    if (!s.queue.schedule_days.includes(dow) || holidays.has(d)) continue;
    if (i === 0 && nowTime > s.queue.schedule_end_time) continue;
    out.push(d);
  }
  return out;
}

async function accountInfo(s: Scope) {
  const { accountWorkspaceId } = await senderScope(s.admin, s.ws.id);
  const { data: acc } = await s.admin
    .from("email_accounts")
    .select("email, provider, daily_quota, emails_sent_today, quota_reset_at, warmup_mode, warmup_started_at, health_status")
    .eq("workspace_id", accountWorkspaceId)
    .eq("is_active", true)
    .maybeSingle();
  if (!acc) return null;
  const opts = {
    warmupMode: !!acc.warmup_mode,
    warmupStartedAt: acc.warmup_started_at as string | null,
    fallbackQuota: acc.daily_quota as number,
  };
  const fresh = acc.quota_reset_at && acc.quota_reset_at >= startOfTodayWibIso();
  return {
    acc,
    shared: accountWorkspaceId !== s.ws.id,
    quota: effectiveWarmupQuota(opts),
    sentToday: fresh ? (acc.emails_sent_today as number) : 0,
    warmup: describeWarmupStage(opts),
  };
}

async function newSentToday(s: Scope): Promise<number> {
  const { count } = await s.admin
    .from("queue_recipients")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", s.ws.id)
    .gte("sent_at", startOfTodayWibIso());
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const DraftItemSchema = z.object({
  email: z.string().describe("Email resmi kantor, mis. hr@perusahaan.co.id"),
  nama_perusahaan: z.string().min(1),
  website: z.string().optional(),
  telepon: z.string().optional(),
  nama_pic: z.string().optional(),
  jabatan_pic: z.string().optional(),
  subjek: z.string().min(1).max(200),
  isi: z
    .string()
    .min(20)
    .max(5000)
    .describe(
      "Isi email polos, diakhiri 'Salam,'. Tanda tangan (Rama — Tetra Photobooth, tetraphoto.com) dan link berhenti berlangganan ditambahkan otomatis.",
    ),
  external_ref: z.string().min(1).describe("ID prospek di Tetra Ops; kunci idempotensi."),
});
type DraftItem = z.infer<typeof DraftItemSchema>;

type Tool = {
  name: string;
  description: string;
  schema: z.ZodObject;
  readOnly: boolean;
  run: (args: never, s: Scope) => Promise<unknown>;
};

const tool = <S extends z.ZodObject>(t: {
  name: string;
  description: string;
  schema: S;
  readOnly: boolean;
  run: (args: z.infer<S>, s: Scope) => Promise<unknown>;
}): Tool => t as unknown as Tool;

const DRAFT_COLS =
  "id, status, status_reason, scheduled_for_date, custom_subject, custom_body, external_ref, sent_at, created_at, contact:contacts!inner(email, company)";

type DraftRow = {
  id: string;
  status: string;
  status_reason: string | null;
  scheduled_for_date: string | null;
  custom_subject: string | null;
  custom_body: string | null;
  external_ref: string | null;
  sent_at: string | null;
  created_at: string;
  contact: { email: string; company: string | null } | Array<{ email: string; company: string | null }>;
};

function draftOut(r: DraftRow, fullBody = false) {
  const c = one(r.contact);
  const deferred = r.status === "pending" && r.scheduled_for_date && r.scheduled_for_date > todayWIB();
  return {
    id: r.id,
    status: deferred ? "tertunda" : (STATUS_OUT[r.status] ?? r.status),
    perusahaan: c?.company ?? null,
    email: c?.email ?? null,
    subjek: r.custom_subject,
    isi: fullBody ? r.custom_body : (r.custom_body ?? "").slice(0, 200),
    external_ref: r.external_ref,
    ...(deferred ? { tanggal_baru: r.scheduled_for_date } : {}),
    ...(r.status_reason ? { alasan: r.status_reason } : {}),
    ...(r.sent_at ? { terkirim: r.sent_at } : {}),
  };
}

const IdsSchema = z.array(z.string().uuid()).max(200);

const TOOLS: Tool[] = [
  tool({
    name: "kontak_cek",
    description:
      "Cek apakah email boleh dihubungi sebelum menulis draf: alasan penolakan (unsubscribe, bounce, cooldown, sudah di antrean lain, pernah membalas, batas domain) dan kapan terakhir dihubungi.",
    schema: z.object({ emails: z.array(z.string()).min(1).max(50) }),
    readOnly: true,
    run: async ({ emails }, s) =>
      (await checkEmails(s, emails)).map((r) => ({
        email: r.email,
        bisa_dikirim: r.bisa_dikirim,
        ...(r.alasan ? { alasan: r.alasan } : {}),
        ...(r.terakhir_dihubungi ? { terakhir_dihubungi: r.terakhir_dihubungi } : {}),
      })),
  }),
  tool({
    name: "draf_kirim",
    description:
      "Kirim prospek + draf email personal ke antrean Hermes Sales. Kontak digabung dengan database (yang sudah ada tidak ditimpa); draf menunggu persetujuan Rama kecuali mode auto. Idempoten per external_ref.",
    schema: z.object({ items: z.array(DraftItemSchema).min(1).max(25) }),
    readOnly: false,
    run: async ({ items }, s) => {
      const { data: existingRefs } = await s.admin
        .from("queue_recipients")
        .select("id, status, external_ref")
        .eq("queue_id", s.queue.id)
        .in("external_ref", items.map((i) => i.external_ref));
      const byRef = new Map((existingRefs ?? []).map((r) => [r.external_ref as string, r]));
      const checks = new Map((await checkEmails(s, items.map((i) => i.email))).map((c) => [c.email, c]));
      const initial = s.ws.approval_mode === "auto" ? "pending" : "awaiting_approval";
      const out = [];
      for (const item of items) {
        const base = { email: norm(item.email), external_ref: item.external_ref };
        const prev = byRef.get(item.external_ref);
        if (prev) {
          out.push({ ...base, id: prev.id, status: STATUS_OUT[prev.status] ?? prev.status, alasan: "sudah pernah dikirim (idempoten)" });
          continue;
        }
        const chk = checks.get(norm(item.email))!;
        if (chk.keras) {
          out.push({ ...base, id: null, status: "ditolak", alasan: chk.alasan!.join("; ") });
          continue;
        }
        try {
          const contactId = await upsertContact(s, item, chk.contact);
          const { data, error } = await s.admin
            .from("queue_recipients")
            .insert({
              queue_id: s.queue.id,
              contact_id: contactId,
              user_id: s.userId,
              workspace_id: s.ws.id,
              status: initial,
              priority: 0,
              shuffle_key: Math.floor(Math.random() * 1e9),
              custom_subject: item.subjek.trim(),
              custom_body: item.isi.trim(),
              external_ref: item.external_ref,
            })
            .select("id")
            .single();
          if (error) {
            const dup = error.code === "23505";
            out.push({ ...base, id: null, status: "ditolak", alasan: dup ? "kontak ini sudah ada di antrean Hermes" : error.message });
            continue;
          }
          out.push({
            ...base,
            id: data.id,
            status: STATUS_OUT[initial],
            ...(chk.alasan ? { catatan: chk.alasan.join("; ") } : {}),
          });
        } catch (e) {
          out.push({ ...base, id: null, status: "ditolak", alasan: e instanceof Error ? e.message : String(e) });
        }
      }
      await s.admin.rpc("sync_queue_counters", { p_queue_id: s.queue.id });
      return { mode_persetujuan: s.ws.approval_mode ?? "manual", hasil: out };
    },
  }),
  tool({
    name: "draf_daftar",
    description: "Daftar draf Hermes: menunggu persetujuan, dijadwalkan (termasuk tertunda), dan terkirim hari ini.",
    schema: z.object({
      status: z.enum(["menunggu_persetujuan", "dijadwalkan", "terkirim_hari_ini"]).optional(),
    }),
    readOnly: true,
    run: async ({ status }, s) => {
      let q = s.admin.from("queue_recipients").select(DRAFT_COLS).eq("queue_id", s.queue.id);
      if (status === "menunggu_persetujuan") q = q.eq("status", "awaiting_approval");
      else if (status === "dijadwalkan") q = q.eq("status", "pending");
      else if (status === "terkirim_hari_ini") q = q.gte("sent_at", startOfTodayWibIso());
      else q = q.or(`status.in.(awaiting_approval,pending),sent_at.gte.${startOfTodayWibIso()}`);
      const { data, error } = await q.order("created_at").limit(200);
      if (error) throw new ToolError(error.message);
      return ((data ?? []) as DraftRow[]).map((r) => draftOut(r));
    },
  }),
  tool({
    name: "draf_setujui",
    description:
      "Setujui draf (ids tertentu atau semua=true) sehingga ikut jadwal dan kuota kirim normal. Mengembalikan jumlah disetujui dan perkiraan hari terkirim.",
    schema: z.object({ ids: IdsSchema.optional(), semua: z.boolean().optional() }),
    readOnly: false,
    run: async ({ ids, semua }, s) => {
      if (!semua && !ids?.length) throw new ToolError("Isi ids atau semua=true.");
      let q = s.admin
        .from("queue_recipients")
        .update({ status: "pending", status_reason: null })
        .eq("queue_id", s.queue.id)
        .eq("status", "awaiting_approval");
      if (!semua) q = q.in("id", ids!);
      const { data, error } = await q.select("id");
      if (error) throw new ToolError(error.message);
      await s.admin.rpc("sync_queue_counters", { p_queue_id: s.queue.id });
      return { disetujui: data?.length ?? 0, ...(await estimate(s)) };
    },
  }),
  tool({
    name: "draf_ubah",
    description: "Ubah subjek dan/atau isi draf yang belum terkirim.",
    schema: z.object({
      id: z.string().uuid(),
      subjek: z.string().min(1).max(200).optional(),
      isi: z.string().min(20).max(5000).optional(),
    }),
    readOnly: false,
    run: async ({ id, subjek, isi }, s) => {
      if (!subjek && !isi) throw new ToolError("Isi subjek atau isi yang baru.");
      const { data, error } = await s.admin
        .from("queue_recipients")
        .update({
          ...(subjek ? { custom_subject: subjek.trim() } : {}),
          ...(isi ? { custom_body: isi.trim() } : {}),
        })
        .eq("queue_id", s.queue.id)
        .eq("id", id)
        .in("status", ["awaiting_approval", "pending"])
        .select(DRAFT_COLS);
      if (error) throw new ToolError(error.message);
      if (!data?.length) throw new ToolError("Draf tidak ditemukan atau sudah terkirim/dibatalkan.");
      return draftOut(data[0] as DraftRow, true);
    },
  }),
  tool({
    name: "draf_batalkan",
    description: "Batalkan draf yang belum terkirim; tidak akan dikirim.",
    schema: z.object({ ids: IdsSchema.min(1), alasan: z.string().max(300).optional() }),
    readOnly: false,
    run: async ({ ids, alasan }, s) => {
      const { data, error } = await s.admin
        .from("queue_recipients")
        .update({ status: "skipped", status_reason: alasan?.trim() || "dibatalkan" })
        .eq("queue_id", s.queue.id)
        .in("id", ids)
        .in("status", ["awaiting_approval", "pending"])
        .select("id");
      if (error) throw new ToolError(error.message);
      await s.admin.rpc("sync_queue_counters", { p_queue_id: s.queue.id });
      return { dibatalkan: data?.length ?? 0 };
    },
  }),
  tool({
    name: "status_kiriman",
    description:
      "Status tiap penerima Hermes sejak tanggal tertentu (default 30 hari): terkirim, follow-up ke-n, dibalas, bounce, unsubscribe, tertunda. Sertakan external_ref untuk sinkron ke Tetra Ops.",
    schema: z.object({ sejak: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD") }),
    readOnly: true,
    run: async ({ sejak }, s) => {
      const from = sejak ?? addDaysWIB(todayWIB(), -30);
      const { data, error } = await s.admin
        .from("queue_recipients")
        .select(
          "id, contact_id, status, status_reason, scheduled_for_date, external_ref, sent_at, campaign_recipient_id, contact:contacts!inner(email, company, status)",
        )
        .eq("queue_id", s.queue.id)
        .gte("created_at", `${from}T00:00:00+07:00`)
        .order("created_at")
        .limit(500);
      if (error) throw new ToolError(error.message);
      type Row = {
        id: string;
        contact_id: string;
        status: string;
        status_reason: string | null;
        scheduled_for_date: string | null;
        external_ref: string | null;
        sent_at: string | null;
        campaign_recipient_id: string | null;
        contact: { email: string; company: string | null; status: string } | Array<{ email: string; company: string | null; status: string }>;
      };
      const rows = (data ?? []) as Row[];
      const contactIds = rows.map((r) => r.contact_id);
      const crIds = rows.map((r) => r.campaign_recipient_id).filter((x): x is string => !!x);
      const [crRes, fuRes] = await Promise.all([
        contactIds.length
          ? s.admin
              .from("campaign_recipients")
              .select("contact_id, status, replied_at, reply_classification, bounced_at")
              .eq("workspace_id", s.ws.id)
              .in("contact_id", contactIds)
              .in("status", ["replied", "bounced"])
          : Promise.resolve({ data: [] }),
        crIds.length
          ? s.admin
              .from("followup_history")
              .select("campaign_recipient_id, followup_step, sent_at")
              .in("campaign_recipient_id", crIds)
              .order("followup_step")
          : Promise.resolve({ data: [] }),
      ]);
      type Cr = { contact_id: string; status: string; replied_at: string | null; reply_classification: string | null; bounced_at: string | null };
      const crs = (crRes.data ?? []) as Cr[];
      const fus = (fuRes.data ?? []) as Array<{ campaign_recipient_id: string; followup_step: number; sent_at: string }>;
      return rows.map((r) => {
        const c = one(r.contact);
        const reply = crs.find((x) => x.contact_id === r.contact_id && x.status === "replied");
        const bounce = crs.find((x) => x.contact_id === r.contact_id && x.status === "bounced");
        const deferred = r.status === "pending" && r.scheduled_for_date && r.scheduled_for_date > todayWIB();
        let status = deferred ? "tertunda" : (STATUS_OUT[r.status] ?? r.status);
        if (reply) status = "dibalas";
        else if (bounce) status = "bounce";
        else if (c?.status === "unsubscribed") status = "unsubscribe";
        return {
          id: r.id,
          external_ref: r.external_ref,
          email: c?.email ?? null,
          perusahaan: c?.company ?? null,
          status,
          ...(r.sent_at ? { terkirim: day(r.sent_at) } : {}),
          ...(r.campaign_recipient_id
            ? {
                follow_up: fus
                  .filter((f) => f.campaign_recipient_id === r.campaign_recipient_id)
                  .map((f) => ({ ke: f.followup_step, tanggal: day(f.sent_at) })),
              }
            : {}),
          ...(reply ? { dibalas: { tanggal: day(reply.replied_at), klasifikasi: reply.reply_classification } } : {}),
          ...(bounce ? { bounce: day(bounce.bounced_at) } : {}),
          ...(deferred ? { tanggal_baru: r.scheduled_for_date } : {}),
          ...(r.status_reason && (deferred || r.status === "skipped") ? { alasan: r.status_reason } : {}),
        };
      });
    },
  }),
  tool({
    name: "balasan_daftar",
    description:
      "Balasan atas kiriman Hermes: perusahaan, email, klasifikasi, cuplikan isi balasan, waktu, link thread, external_ref. Default hanya yang belum ditangani.",
    schema: z.object({ belum_ditangani: z.boolean().optional() }),
    readOnly: true,
    run: async ({ belum_ditangani = true }, s) => {
      let q = s.admin
        .from("campaign_recipients")
        .select("id, contact_id, contact_email, replied_at, reply_classification, reply_snippet, gmail_thread_id, handled_at, contact:contacts!inner(company)")
        .eq("workspace_id", s.ws.id)
        .eq("status", "replied");
      if (belum_ditangani) q = q.is("handled_at", null);
      const [{ data, error }, info] = await Promise.all([
        q.order("replied_at", { ascending: false }).limit(100),
        accountInfo(s),
      ]);
      if (error) throw new ToolError(error.message);
      type Row = {
        id: string;
        contact_id: string;
        contact_email: string;
        replied_at: string;
        reply_classification: string | null;
        reply_snippet: string | null;
        gmail_thread_id: string | null;
        handled_at: string | null;
        contact: { company: string | null } | Array<{ company: string | null }>;
      };
      const rows = (data ?? []) as Row[];
      const { data: refs } = rows.length
        ? await s.admin
            .from("queue_recipients")
            .select("contact_id, external_ref")
            .eq("queue_id", s.queue.id)
            .in("contact_id", rows.map((r) => r.contact_id))
        : { data: [] };
      const refBy = new Map((refs ?? []).map((r) => [r.contact_id as string, r.external_ref as string | null]));
      const gmail = info?.acc.provider !== "smtp";
      return rows.map((r) => ({
        id: r.id,
        perusahaan: one(r.contact)?.company ?? null,
        email: r.contact_email,
        klasifikasi: r.reply_classification,
        cuplikan: r.reply_snippet,
        waktu: r.replied_at,
        link_thread:
          gmail && r.gmail_thread_id ? `https://mail.google.com/mail/u/0/#inbox/${r.gmail_thread_id}` : null,
        external_ref: refBy.get(r.contact_id) ?? null,
        ditangani: !!r.handled_at,
      }));
    },
  }),
  tool({
    name: "balasan_tandai",
    description: "Tandai balasan sudah ditangani setelah Rama menanggapinya.",
    schema: z.object({ id: z.string().uuid() }),
    readOnly: false,
    run: async ({ id }, s) => {
      const { data, error } = await s.admin
        .from("campaign_recipients")
        .update({ handled_at: new Date().toISOString() })
        .eq("workspace_id", s.ws.id)
        .eq("id", id)
        .eq("status", "replied")
        .select("id");
      if (error) throw new ToolError(error.message);
      if (!data?.length) throw new ToolError("Balasan tidak ditemukan.");
      return { ditandai: true };
    },
  }),
  tool({
    name: "kuota",
    description:
      "Kapasitas kirim: akun pengirim, kuota hari ini dan terpakai, tahap warmup, batas email baru workspace, mode persetujuan, panjang antrean, jendela kirim berikutnya.",
    schema: z.object({}),
    readOnly: true,
    run: async (_args, s) => {
      const [info, newToday, counts, days] = await Promise.all([
        accountInfo(s),
        newSentToday(s),
        s.admin.from("queue_recipients").select("status").eq("queue_id", s.queue.id).in("status", ["awaiting_approval", "pending"]),
        sendDays(s, 1),
      ]);
      const rows = (counts.data ?? []) as Array<{ status: string }>;
      return {
        akun_pengirim: info
          ? { email: info.acc.email, provider: info.acc.provider, kesehatan: info.acc.health_status }
          : null,
        ...(info?.shared
          ? { catatan_kuota: "Kuota akun dipakai bersama workspace pemilik akun; draf Hermes yang disetujui didahulukan." }
          : {}),
        ...(info ? {} : { peringatan: "Belum ada akun pengirim terhubung; draf tidak akan terkirim." }),
        kuota_akun_hari_ini: info?.quota ?? 0,
        terpakai_akun_hari_ini: info?.sentToday ?? 0,
        warmup: info?.warmup ? { hari_ke: info.warmup.day, batas: info.warmup.cap } : null,
        batas_email_baru_per_hari: s.ws.daily_new_cap,
        email_baru_terkirim_hari_ini: newToday,
        mode_persetujuan: s.ws.approval_mode ?? "manual",
        antrean: {
          menunggu_persetujuan: rows.filter((r) => r.status === "awaiting_approval").length,
          dijadwalkan: rows.filter((r) => r.status === "pending").length,
        },
        jendela_kirim_berikutnya: days[0]
          ? `${days[0]} ${s.queue.schedule_start_time.slice(0, 5)}–${s.queue.schedule_end_time.slice(0, 5)} WIB`
          : null,
      };
    },
  }),
];

/** Rough send-date estimate for everything currently pending. */
async function estimate(s: Scope) {
  const [info, newToday, { count: pending }] = await Promise.all([
    accountInfo(s),
    newSentToday(s),
    s.admin.from("queue_recipients").select("id", { count: "exact", head: true }).eq("queue_id", s.queue.id).eq("status", "pending"),
  ]);
  if (!info) {
    return { peringatan: "Belum ada akun pengirim terhubung; draf tidak akan terkirim sampai akun disambungkan." };
  }
  // ponytail: assumes follow-ups never crowd out first touches (they're capped at 50%).
  const perDay = Math.max(1, Math.min(s.ws.daily_new_cap ?? Infinity, s.queue.daily_target, info.quota));
  let left = pending ?? 0;
  const days = await sendDays(s, Math.ceil(left / perDay) + 1);
  if (left === 0 || days.length === 0) return { dijadwalkan: left };
  let i = 0;
  if (days[0] === todayWIB()) {
    // Today's room is also bounded by the (possibly shared) account quota.
    left -= Math.max(0, Math.min(perDay - newToday, info.quota - info.sentToday));
  }
  while (left > 0 && i + 1 < days.length) {
    i++;
    left -= perDay;
  }
  const todayFull = days[0] === todayWIB() && Math.min(perDay - newToday, info.quota - info.sentToday) <= 0;
  return {
    dijadwalkan: pending ?? 0,
    per_hari: perDay,
    perkiraan_mulai: todayFull ? (days[1] ?? days[0]) : days[0],
    perkiraan_selesai: days[i],
  };
}

// ---------------------------------------------------------------------------
// JSON-RPC
// ---------------------------------------------------------------------------

export type McpReply = { status: number; body?: unknown };
type JsonRpcId = string | number | null;

const ok = (id: JsonRpcId, result: unknown): McpReply => ({ status: 200, body: { jsonrpc: "2.0", id, result } });
const fail = (id: JsonRpcId, code: number, message: string): McpReply => ({
  status: 200,
  body: { jsonrpc: "2.0", id, error: { code, message } },
});
const toolResult = (id: JsonRpcId, result: unknown, isError: boolean) =>
  ok(id, { content: [{ type: "text", text: JSON.stringify(result) }], isError });

export function listTools() {
  return TOOLS.map((t) => {
    const inputSchema = z.toJSONSchema(t.schema) as Record<string, unknown>;
    delete inputSchema.$schema;
    return {
      name: t.name,
      description: t.description,
      inputSchema,
      annotations: { readOnlyHint: t.readOnly, ...(t.readOnly ? {} : { destructiveHint: false }) },
    };
  });
}

export async function handleMcpRequest(raw: unknown): Promise<McpReply> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail(null, -32600, "Invalid Request");
  const req = raw as { id?: JsonRpcId; method?: string; params?: Record<string, unknown> };
  const id = req.id ?? null;
  const method = req.method ?? "";
  const params = req.params ?? {};

  if (method.startsWith("notifications/")) return { status: 202 };

  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "cold-reach-hermes", version: "1.0.0" },
        instructions:
          "Antrean email Cold Reach untuk workspace Hermes Sales. Cold Reach yang mengirim (kuota, warmup, jendela kirim, libur, cooldown, batas domain). " +
          "Alur: kontak_cek → draf_kirim → Rama menyetujui → draf_setujui → status_kiriman/balasan_daftar. Tanggal dalam WIB.",
      });
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: listTools() });
    case "tools/call": {
      const name = String(params.name ?? "");
      const t = TOOLS.find((x) => x.name === name);
      if (!t) return fail(id, -32602, `Unknown tool: ${name}`);
      const parsed = t.schema.safeParse(params.arguments ?? {});
      if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "argumen"}: ${i.message}`).join("; ");
        return toolResult(id, { error: `Argumen tidak valid — ${msg}` }, true);
      }
      try {
        const scope = await resolveScope();
        return toolResult(id, await t.run(parsed.data as never, scope), false);
      } catch (e) {
        const msg = e instanceof ToolError ? e.message : `Tool gagal: ${e instanceof Error ? e.message : String(e)}`;
        return toolResult(id, { error: msg }, true);
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}
