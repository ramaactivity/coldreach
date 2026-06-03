import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "default" | "emerald" | "blue" | "amber" | "red";

const toneAccents: Record<Tone, string> = {
  default: "text-zinc-900 dark:text-zinc-50",
  emerald: "text-emerald-600 dark:text-emerald-400",
  blue: "text-blue-600 dark:text-blue-400",
  amber: "text-amber-600 dark:text-amber-400",
  red: "text-red-600 dark:text-red-400",
};

const toneIconBg: Record<Tone, string> = {
  default:
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400",
  emerald:
    "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  blue:
    "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  amber:
    "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  red:
    "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
};

const toneRing: Record<Tone, string> = {
  default: "",
  emerald: "ring-emerald-100 dark:ring-emerald-900/30",
  blue: "ring-blue-100 dark:ring-blue-900/30",
  amber: "ring-amber-100 dark:ring-amber-900/30",
  red: "ring-red-100 dark:ring-red-900/30",
};

type StatCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: Tone;
  trend?: {
    direction: "up" | "down" | "flat";
    value: string;
  };
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
        "group relative overflow-hidden rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-[0_1px_2px_0_rgb(0_0_0/0.03)] transition-all duration-200",
        "hover:-translate-y-px hover:border-zinc-300/80 hover:shadow-[0_4px_12px_-2px_rgb(0_0_0/0.06),0_2px_4px_-2px_rgb(0_0_0/0.04)]",
        "dark:border-zinc-800/70 dark:bg-zinc-900",
        "dark:hover:border-zinc-700/80",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">
          {label}
        </p>
        {Icon && (
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-xl ring-1 ring-inset ring-zinc-200/60 transition-transform duration-200 group-hover:scale-105 dark:ring-zinc-800/60",
              toneIconBg[tone],
              toneRing[tone],
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <p
        className={cn(
          "mt-3.5 text-[28px] font-semibold leading-none tracking-tight tabular-nums",
          toneAccents[tone],
        )}
      >
        {value}
      </p>
      {(hint || trend) && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium tabular-nums",
                trend.direction === "up" &&
                  "text-emerald-600 dark:text-emerald-400",
                trend.direction === "down" && "text-red-600 dark:text-red-400",
                trend.direction === "flat" && "text-zinc-500 dark:text-zinc-400",
              )}
            >
              {trend.direction === "up" && "↑"}
              {trend.direction === "down" && "↓"}
              {trend.direction === "flat" && "→"} {trend.value}
            </span>
          )}
          {hint && (
            <span className="truncate text-zinc-500 dark:text-zinc-400">
              {hint}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
