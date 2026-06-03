import { cn } from "@/lib/utils";

/**
 * Dependency-free SVG data-viz primitives for the ColdReach dashboard.
 * Fills the DESIGN.md "charts" Known Gap: the data series is drawn in the
 * (themeable) accent, tracks/baselines in neutral tokens. Geometry comes from
 * SVG attributes (not inline style), so these stay token-only. Each chart
 * inherits the workspace accent from a `data-accent` ancestor.
 */

/** Tiny trend line + soft area fill. Pass a series of values (e.g. 7 daily counts). */
export function Sparkline({
  data,
  className,
}: {
  data: number[];
  className?: string;
}) {
  const n = data.length;
  const W = 100;
  const H = 32;
  const pad = 3;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - pad * 2);
  const line = data.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `M0,${H} L${line} L${W},${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn("h-8 w-full overflow-visible", className)}
      aria-hidden="true"
    >
      <path d={area} className="fill-accent-soft" />
      <polyline
        points={line}
        fill="none"
        className="stroke-accent"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Compact bar chart (e.g. last 7 days of sends). Tallest bar reads full accent. */
export function MiniBars({
  data,
  className,
}: {
  data: number[];
  className?: string;
}) {
  const n = data.length;
  const max = Math.max(...data, 1);
  const gap = 2;
  const barW = 8;
  const W = n * barW + (n - 1) * gap;
  const H = 32;
  const minH = 2;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn("h-8", className)}
      aria-hidden="true"
    >
      {data.map((v, i) => {
        const h = Math.max(minH, (v / max) * H);
        const isPeak = v === max && v > 0;
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={H - h}
            width={barW}
            height={h}
            rx={2}
            className={isPeak ? "fill-accent" : "fill-accent/35"}
          />
        );
      })}
    </svg>
  );
}

/** Radial quota gauge: value of max, drawn as an accent arc with a centered %. */
export function RadialGauge({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  label?: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const r = 22;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  return (
    <div className={cn("relative size-14 shrink-0", className)} aria-hidden="true">
      <svg viewBox="0 0 56 56" className="size-full -rotate-90">
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          className="stroke-surface-sunken"
          strokeWidth={5}
        />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          className="stroke-accent"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[13px] font-semibold tabular text-ink">
        {label ?? `${pct}%`}
      </span>
    </div>
  );
}
