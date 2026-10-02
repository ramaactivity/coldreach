import { HeartPulse } from "lucide-react";
import { requireCurrentUser } from "@/lib/supabase/session-helpers";
import { createClient } from "@/lib/supabase/server";
import { getUserWorkspaces } from "@/lib/workspaces";
import { addDaysWIB, todayWIB } from "@/lib/holidays-id";
import { startOfTodayWibIso } from "@/lib/quota-reset";
import { describeWarmupStage, effectiveWarmupQuota } from "@/lib/warmup";
import { corporateDomainOf } from "@/lib/lang-detect";
import { SimpleTopbar } from "@/components/simple-topbar";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { DailyBars, type Day } from "./daily-bars";
import { ArchiveDomainButton } from "./archive-domain-button";

export const dynamic = "force-dynamic";

const DAYS = 30;
const BOUNCE_TYPES = [
  { key: "hard", label: "Alamat tidak ada", hint: "salah ketik / orangnya sudah keluar" },
  { key: "block", label: "Ditolak server", hint: "kebijakan atau reputasi pengirim" },
  { key: "soft", label: "Sementara", hint: "kotak penuh / server sibuk" },
  { key: "spam", label: "Ditandai spam", hint: "" },
] as const;

type Health = {
  daily: Array<Day & { workspace_id: string }>;
  bounce_types: Array<{ workspace_id: string; bounce_type: string; n: number }>;
  domains: Array<{ domain: string; sent: number; bounced: number; blocked: number; active_contacts: number }>;
};
type Account = {
  id: string;
  email: string;
  workspace_id: string;
  provider: string | null;
  daily_quota: number;
  emails_sent_today: number;
  quota_reset_at: string | null;
  warmup_mode: boolean;
  warmup_started_at: string | null;
  auto_ramp_enabled: boolean;
  health_status: string | null;
};

const pct = (n: number, of: number) => (of ? (100 * n) / of : 0);
const fmtPct = (v: number) => `${v.toFixed(v < 1 && v > 0 ? 2 : 1)}%`;

/** Bounce-rate text tone: <2% is the safe line, ≥5% is hurting reputation. */
function BounceRate({ bounced, sent }: { bounced: number; sent: number }) {
  const v = pct(bounced, sent);
  return (
    <span className={cn("tabular-nums", v >= 5 ? "text-danger-text font-medium" : v >= 2 ? "text-warning-text font-medium" : "text-ink")}>
      {fmtPct(v)}
      {v >= 5 ? " · tinggi" : v >= 2 ? " · waspada" : ""}
    </span>
  );
}

export default async function HealthPage() {
  const user = await requireCurrentUser();
  const supabase = await createClient();
  const [{ data: health }, workspaces, { data: accountRows }] = await Promise.all([
    supabase.rpc("send_health", { p_days: DAYS }),
    getUserWorkspaces(),
    supabase
      .from("email_accounts")
      .select("id, email, workspace_id, provider, daily_quota, emails_sent_today, quota_reset_at, warmup_mode, warmup_started_at, auto_ramp_enabled, health_status")
      .eq("is_active", true)
      .order("created_at"),
  ]);
  const h = (health ?? { daily: [], bounce_types: [], domains: [] }) as Health;
  const accounts = (accountRows ?? []) as Account[];
  const wsName = new Map(workspaces.map((w) => [w.id, w.name]));

  const today = todayWIB();
  const dayList = Array.from({ length: DAYS }, (_, i) => addDaysWIB(today, i - DAYS + 1));
  const seriesFor = (wsIds: string[]): Day[] =>
    dayList.map((day) => {
      const rows = h.daily.filter((d) => d.day === day && wsIds.includes(d.workspace_id));
      return {
        day,
        sent: rows.reduce((a, r) => a + r.sent, 0),
        bounced: rows.reduce((a, r) => a + r.bounced, 0),
        replied: rows.reduce((a, r) => a + r.replied, 0),
      };
    });
  const sum = (days: Day[]) => ({
    sent: days.reduce((a, d) => a + d.sent, 0),
    bounced: days.reduce((a, d) => a + d.bounced, 0),
    replied: days.reduce((a, d) => a + d.replied, 0),
  });
  const dayStart = startOfTodayWibIso();

  const wsRows = workspaces
    .map((w) => {
      const t = sum(seriesFor([w.id]));
      const types = Object.fromEntries(
        h.bounce_types.filter((b) => b.workspace_id === w.id).map((b) => [b.bounce_type, b.n]),
      );
      return { w, ...t, types };
    })
    .filter((r) => r.sent > 0)
    .sort((a, b) => pct(b.bounced, b.sent) - pct(a.bounced, a.sent));
  const all = sum(seriesFor(workspaces.map((w) => w.id)));
  const allTypes = Object.fromEntries(
    BOUNCE_TYPES.map((t) => [t.key, h.bounce_types.filter((b) => b.bounce_type === t.key).reduce((a, b) => a + b.n, 0)]),
  );

  return (
    <>
      <SimpleTopbar email={user.email ?? ""} />
      <main className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-8">
        <PageHeader
          eyebrow={
            <>
              <HeartPulse className="h-3 w-3 text-accent" />
              <span>{DAYS} hari terakhir · semua workspace</span>
            </>
          }
          title="Kesehatan kirim"
          description="Bounce di atas 2% merusak reputasi pengirim: email berikutnya makin sering masuk spam. Angka termasuk follow-up."
        />

        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          <Tile label="Terkirim" value={all.sent.toLocaleString("id-ID")} />
          <Tile label="Bounce" value={<BounceRate bounced={all.bounced} sent={all.sent} />} sub={`${all.bounced.toLocaleString("id-ID")} email`} />
          <Tile label="Dibalas" value={fmtPct(pct(all.replied, all.sent))} sub={`${all.replied} balasan`} />
        </div>

        {/* 1. Per sender account */}
        <h2 className="mb-3 text-ink">Per akun pengirim</h2>
        <div className="mb-10 grid gap-4 lg:grid-cols-2">
          {accounts.map((a) => {
            const wsIds = [a.workspace_id, ...workspaces.filter((w) => w.sender_workspace_id === a.workspace_id).map((w) => w.id)];
            const days = seriesFor(wsIds);
            const t = sum(days);
            const opts = { warmupMode: a.warmup_mode, warmupStartedAt: a.warmup_started_at, fallbackQuota: a.daily_quota };
            const warm = describeWarmupStage(opts);
            const sentToday = a.quota_reset_at && a.quota_reset_at >= dayStart ? a.emails_sent_today : 0;
            return (
              <section key={a.id} className="rounded-lg border border-border bg-surface p-5">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{a.email}</p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {wsIds.map((id) => wsName.get(id)).filter(Boolean).join(" + ")}
                    </p>
                  </div>
                  <div className="text-right text-[12px] text-muted">
                    <p>
                      Hari ini <span className="tabular-nums text-ink">{sentToday}/{effectiveWarmupQuota(opts)}</span>
                    </p>
                    <p>
                      {warm ? `Warmup hari ke-${warm.day}` : "Warmup selesai"} · auto-ramp {a.auto_ramp_enabled ? "aktif" : "mati"}
                      {a.health_status && a.health_status !== "healthy" ? ` · ${a.health_status}` : ""}
                    </p>
                  </div>
                </div>
                <DailyBars days={days} />
                <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-[12px]">
                  <Stat label="Terkirim" value={t.sent.toLocaleString("id-ID")} />
                  <Stat label="Bounce" value={<BounceRate bounced={t.bounced} sent={t.sent} />} />
                  <Stat label="Dibalas" value={`${t.replied} (${fmtPct(pct(t.replied, t.sent))})`} />
                </dl>
              </section>
            );
          })}
        </div>

        {/* 2 + 4. Workspace comparison with bounce types */}
        <h2 className="mb-1 text-ink">Perbandingan workspace</h2>
        <p className="mb-3 text-[13px] text-muted">
          {BOUNCE_TYPES.map((t) => `${t.label}${t.hint ? ` = ${t.hint}` : ""}`).join(" · ")}
        </p>
        <div className="mb-10 overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-[13px]">
            <thead className="border-b border-border text-left text-[12px] text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Workspace</th>
                <th className="px-4 py-2.5 text-right font-medium">Terkirim</th>
                <th className="px-4 py-2.5 text-right font-medium">Bounce</th>
                <th className="px-4 py-2.5 text-right font-medium">Dibalas</th>
                {BOUNCE_TYPES.map((t) => (
                  <th key={t.key} className="px-4 py-2.5 text-right font-medium">{t.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {wsRows.map((r) => (
                <tr key={r.w.id}>
                  <td className="px-4 py-2.5 text-ink">{r.w.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.sent.toLocaleString("id-ID")}</td>
                  <td className="px-4 py-2.5 text-right"><BounceRate bounced={r.bounced} sent={r.sent} /></td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.replied} ({fmtPct(pct(r.replied, r.sent))})</td>
                  {BOUNCE_TYPES.map((t) => (
                    <td key={t.key} className="px-4 py-2.5 text-right tabular-nums text-ink-secondary">{r.types[t.key] ?? 0}</td>
                  ))}
                </tr>
              ))}
              <tr className="bg-surface-sunken font-medium">
                <td className="px-4 py-2.5 text-ink">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{all.sent.toLocaleString("id-ID")}</td>
                <td className="px-4 py-2.5 text-right"><BounceRate bounced={all.bounced} sent={all.sent} /></td>
                <td className="px-4 py-2.5 text-right tabular-nums">{all.replied} ({fmtPct(pct(all.replied, all.sent))})</td>
                {BOUNCE_TYPES.map((t) => (
                  <td key={t.key} className="px-4 py-2.5 text-right tabular-nums">{allTypes[t.key]}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* 3. Domains */}
        <h2 className="mb-1 text-ink">Domain penyumbang bounce</h2>
        <p className="mb-3 text-[13px] text-muted">
          Domain dengan ≥2 bounce. Alamat yang bounce sudah otomatis diarsipkan; &ldquo;Kontak aktif&rdquo; adalah sisa kontak di domain itu yang masih akan dikirimi.
          Kalau sebagian besar bounce berjenis &ldquo;ditolak server&rdquo;, server perusahaan itu memblokir pengirim kita, jadi kontak lain di sana kemungkinan ikut gagal.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-[13px]">
            <thead className="border-b border-border text-left text-[12px] text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Domain</th>
                <th className="px-4 py-2.5 text-right font-medium">Terkirim</th>
                <th className="px-4 py-2.5 text-right font-medium">Bounce</th>
                <th className="px-4 py-2.5 text-right font-medium">Ditolak server</th>
                <th className="px-4 py-2.5 text-right font-medium">Kontak aktif</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {h.domains.map((d) => {
                const corporate = corporateDomainOf(`x@${d.domain}`) === d.domain;
                return (
                  <tr key={d.domain}>
                    <td className="px-4 py-2.5 text-ink">
                      {d.domain}
                      {!corporate && <span className="ml-2 text-[12px] text-muted">(webmail)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{d.sent}</td>
                    <td className="px-4 py-2.5 text-right"><BounceRate bounced={d.bounced} sent={d.sent} /></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{d.blocked}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{d.active_contacts}</td>
                    <td className="px-4 py-2.5 text-right">
                      {corporate && d.active_contacts > 0 && (
                        <ArchiveDomainButton domain={d.domain} count={d.active_contacts} />
                      )}
                    </td>
                  </tr>
                );
              })}
              {h.domains.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted">Tidak ada domain dengan bounce berulang.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-[12px] text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-muted tabular-nums">{sub}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 tabular-nums text-ink">{value}</dd>
    </div>
  );
}
