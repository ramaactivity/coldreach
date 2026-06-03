import { cn } from "@/lib/utils";

/**
 * Quick-filter pill ("Belum dikontak", "Bounced"…). Default = white + hairline;
 * active flips to action ink fill (not accent — action is the click signal).
 */
export function FilterChip({
  active,
  icon,
  children,
  className,
  ...props
}: {
  active?: boolean;
  icon?: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "border border-action bg-action text-on-action"
          : "border border-border bg-surface text-ink-secondary hover:bg-surface-hover",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
