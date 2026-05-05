import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserWorkspaces } from "@/lib/workspaces";
import { SimpleTopbar } from "@/components/simple-topbar";
import { getWorkspaceStats, getRecentReplies } from "@/lib/stats";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaces = await getUserWorkspaces();

  // First-time user: redirect to onboarding
  if (workspaces.length === 0) {
    redirect("/onboarding/workspace");
  }

  // Single workspace: skip the cross-workspace dashboard, go straight to it
  if (workspaces.length === 1) {
    redirect(`/w/${workspaces[0].slug}/dashboard`);
  }

  // Multi-workspace: aggregate
  const [allStats, recentReplies] = await Promise.all([
    Promise.all(workspaces.map((w) => getWorkspaceStats(w.id))),
    getRecentReplies(null, 10),
  ]);

  const totals = allStats.reduce(
    (acc, s) => ({
      sent_today: acc.sent_today + s.sent_today,
      sent_7d: acc.sent_7d + s.sent_7d,
      replied_7d: acc.replied_7d + s.replied_7d,
      pending_replies: acc.pending_replies + s.pending_replies,
      contacts_total: acc.contacts_total + s.contacts_total,
      queues_active: acc.queues_active + s.queues_active,
    }),
    {
      sent_today: 0,
      sent_7d: 0,
      replied_7d: 0,
      pending_replies: 0,
      contacts_total: 0,
      queues_active: 0,
    },
  );

  return (
    <>
      <SimpleTopbar email={user.email ?? ""} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Semua Workspace
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Aggregate view dari {workspaces.length} workspace.
        </p>

        {/* Aggregate KPIs */}
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Sent today" value={totals.sent_today} />
          <Kpi label="Sent (7d)" value={totals.sent_7d} />
          <Kpi
            label="Replied (7d)"
            value={totals.replied_7d}
            color="blue"
          />
          <Kpi
            label="Pending replies"
            value={totals.pending_replies}
            color={totals.pending_replies > 0 ? "blue" : "zinc"}
          />
        </div>

        {/* Per-workspace cards with mini stats */}
        <h2 className="mt-8 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Workspaces
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((ws, i) => {
            const s = allStats[i];
            return (
              <Link
                key={ws.id}
                href={`/w/${ws.slug}/dashboard`}
                className="group rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: ws.color_theme }}
                  />
                  <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {ws.business_type ?? "—"}
                  </span>
                </div>
                <h3 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {ws.name}
                </h3>
                <p className="mt-1 text-xs text-zinc-500">
                  {ws.schedule_start_time.slice(0, 5)} – {ws.schedule_end_time.slice(0, 5)} WIB · {ws.daily_target}/hari
                </p>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <Mini label="Today" value={s.sent_today} />
                  <Mini label="7d sent" value={s.sent_7d} />
                  <Mini label="Replied" value={s.replied_7d} color="blue" />
                </dl>
                {s.queues_active > 0 && (
                  <p className="mt-3 inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {s.queues_active} active queue{s.queues_active > 1 ? "s" : ""}
                  </p>
                )}
              </Link>
            );
          })}

          <Link
            href="/onboarding/workspace"
            className="flex items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-600 transition hover:border-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400"
          >
            + Tambah Workspace
          </Link>
        </div>

        {/* Cross-workspace recent replies */}
        <h2 className="mt-10 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          💬 Recent Replies (semua workspace)
        </h2>
        {recentReplies.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/50">
            Belum ada balasan. Setelah lu kirim email pertama dan ada yang reply, tampak di sini.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {recentReplies.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                    🟣 {r.contact_name ?? r.contact_email}
                    {r.contact_company && (
                      <span className="ml-1 font-normal text-zinc-500">
                        · {r.contact_company}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {r.workspace_name && `${r.workspace_name} · `}
                    {new Date(r.replied_at).toLocaleString("id-ID")}
                  </p>
                </div>
                {r.gmail_thread_id && (
                  <a
                    href={`https://mail.google.com/mail/u/0/#inbox/${r.gmail_thread_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    📧 Open in Gmail
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function Kpi({
  label,
  value,
  color = "zinc",
}: {
  label: string;
  value: number;
  color?: "zinc" | "emerald" | "blue";
}) {
  const colors = {
    zinc: "text-zinc-900 dark:text-zinc-100",
    emerald: "text-emerald-700 dark:text-emerald-400",
    blue: "text-blue-700 dark:text-blue-400",
  };
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold ${colors[color]}`}>
        {value.toLocaleString("id-ID")}
      </p>
    </div>
  );
}

function Mini({
  label,
  value,
  color = "zinc",
}: {
  label: string;
  value: number;
  color?: "zinc" | "blue";
}) {
  const colors = {
    zinc: "text-zinc-900 dark:text-zinc-100",
    blue: "text-blue-700 dark:text-blue-400",
  };
  return (
    <div>
      <dt className="text-zinc-500 dark:text-zinc-500">{label}</dt>
      <dd className={`mt-0.5 font-semibold ${colors[color]}`}>
        {value.toLocaleString("id-ID")}
      </dd>
    </div>
  );
}
