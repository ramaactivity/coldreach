import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "danger"
  | "info";

const variantClasses: Record<Variant, string> = {
  default:
    "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900",
  secondary:
    "bg-zinc-100 text-zinc-700 ring-1 ring-inset ring-zinc-900/5 dark:bg-zinc-800/80 dark:text-zinc-300 dark:ring-white/5",
  outline:
    "border border-zinc-200/80 text-zinc-700 dark:border-zinc-800/80 dark:text-zinc-300",
  success:
    "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/25",
  warning:
    "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-500/25",
  danger:
    "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/15 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-500/25",
  info:
    "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/15 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-500/25",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: Variant;
  dotColor?: string;
};

export function Badge({
  variant = "secondary",
  dotColor,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[10.5px] font-semibold leading-tight tabular-nums",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {dotColor && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
      )}
      {children}
    </span>
  );
}
