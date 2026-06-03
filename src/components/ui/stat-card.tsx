import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Metric color rule: the number is ink by default and only takes a semantic
 * color when the metric carries valence (bounce -> danger, reply -> success).
 * Legacy tone names (emerald/blue/amber/red) are mapped onto the semantic
 * tokens; prefer the semantic names (success/info/warning/danger) going forward.
 */
type Tone =
  | "default"
  | "neutral"
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "emerald"
  | "blue"
  | "amber"
  | "red";

const numberTone: Record<Tone, string> = {
  default: "text-ink",
  neutral: "text-ink",
  success: "text-success",
  emerald: "text-success",
  info: "text-info",
  blue: "text-info",
  warning: "text-warning",
  amber: "text-warning",
  danger: "text-danger",
  red: "text-danger",
};

const iconTone: Record<Tone, string> = {
  default: "bg-surface-sunken text-muted",
  neutral: "bg-surface-sunken text-muted",
  success: "bg-success-soft text-success",
  emerald: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  blue: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  amber: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  red: "bg-danger-soft text-danger",
};

const trendTone = {
  up: "text-success-text",
  down: "text-danger-text",
  flat: "text-muted",
} as const;

type StatCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: Tone;
  trend?: { direction: "up" | "down" | "flat"; value: string };
  className?: string;
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  trend,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="label-eyebrow">{label}</span>
        {Icon && (
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-md",
              iconTone[tone],
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p
        className={cn(
          "mt-3 text-3xl font-semibold leading-none tracking-tight tabular",
          numberTone[tone],
        )}
      >
        {value}
      </p>
      {(hint || trend) && (
        <div className="mt-2 flex items-center gap-2 text-[13px]">
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium tabular",
                trendTone[trend.direction],
              )}
            >
              {trend.direction === "up" && "↑"}
              {trend.direction === "down" && "↓"}
              {trend.direction === "flat" && "→"} {trend.value}
            </span>
          )}
          {hint && <span className="truncate text-muted">{hint}</span>}
        </div>
      )}
    </div>
  );
}
