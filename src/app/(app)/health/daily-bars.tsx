/**
 * Stacked daily bars: delivered (info blue) + bounced (danger red) per WIB day.
 * One axis (email count). Native <title> per day is the hover tooltip; the
 * workspace table below the charts is the table view. Palette validated with
 * the dataviz script: #2563eb / #dc2626 pass all checks on white.
 */
export type Day = { day: string; sent: number; bounced: number; replied: number };

const W = 600;
const H = 120;
const PAD_B = 16;
const DELIVERED = "#2563eb";
const BOUNCED = "#dc2626";

export function DailyBars({ days }: { days: Day[] }) {
  const max = Math.max(1, ...days.map((d) => d.sent));
  const slot = W / days.length;
  const bar = Math.max(2, slot - 2); // 2px surface gap between bars
  const y = (n: number) => ((H - PAD_B) * n) / max;
  const label = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full" role="img" aria-label="Email terkirim dan bounce per hari, 30 hari terakhir">
        <line x1={0} x2={W} y1={H - PAD_B} y2={H - PAD_B} stroke="var(--color-border)" />
        {days.map((d, i) => {
          const x = i * slot + 1;
          const hb = y(d.bounced);
          const hd = y(d.sent - d.bounced);
          const base = H - PAD_B;
          return (
            <g key={d.day}>
              <title>
                {`${label(d.day)}: ${d.sent} terkirim, ${d.bounced} bounce` +
                  (d.sent ? ` (${((100 * d.bounced) / d.sent).toFixed(1)}%)` : "") +
                  `, ${d.replied} balasan`}
              </title>
              {/* Full-height hit target, invisible. */}
              <rect x={x - 1} y={0} width={slot} height={base} fill="transparent" />
              {hd > 0 && <rect x={x} y={base - hd} width={bar} height={hd} fill={DELIVERED} rx={1} />}
              {hb > 0 && <rect x={x} y={base - hd - hb - (hd > 0 ? 2 : 0)} width={bar} height={hb} fill={BOUNCED} rx={1} />}
            </g>
          );
        })}
        {[0, Math.floor(days.length / 2), days.length - 1].map((i) => (
          <text key={i} x={i * slot + slot / 2} y={H - 3} textAnchor="middle" fontSize={10} fill="var(--color-muted)">
            {label(days[i].day)}
          </text>
        ))}
        <text x={W} y={10} textAnchor="end" fontSize={10} fill="var(--color-muted)">
          maks {max}/hari
        </text>
      </svg>
      <figcaption className="mt-2 flex gap-4 text-[12px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: DELIVERED }} /> Terkirim
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: BOUNCED }} /> Bounce
        </span>
      </figcaption>
    </figure>
  );
}
