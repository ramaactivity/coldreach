import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-zinc-300/70 bg-zinc-50/40 px-6 py-14 text-center dark:border-zinc-800/70 dark:bg-zinc-900/30",
        className,
      )}
    >
      {/* Subtle radial glow behind the icon */}
      <div className="pointer-events-none absolute left-1/2 top-1/4 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-900/[0.025] blur-2xl dark:bg-zinc-100/[0.03]" />
      {Icon && (
        <div className="relative mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-[0_1px_3px_0_rgb(0_0_0/0.06)] ring-1 ring-zinc-200/70 dark:bg-zinc-800 dark:ring-zinc-700/70">
          <Icon className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
        </div>
      )}
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </p>
      {description && (
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
