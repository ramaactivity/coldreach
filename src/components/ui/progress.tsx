import { cn } from "@/lib/utils";

/**
 * Quota / queue progress bar. Fill is success when healthy, switches to
 * warning at >=90% of cap and danger when over. 6px track, rounded-full.
 */
export function Progress({
  value,
  cap = 100,
  className,
}: {
  value: number;
  cap?: number;
  className?: string;
}) {
  const pct = cap > 0 ? Math.min(100, (value / cap) * 100) : 0;
  const tone =
    pct >= 100 ? "bg-danger" : pct >= 90 ? "bg-warning" : "bg-success";
  return (
    <div
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken",
        className,
      )}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemax={cap}
    >
      <div
        className={cn("h-full rounded-full transition-[width]", tone)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
