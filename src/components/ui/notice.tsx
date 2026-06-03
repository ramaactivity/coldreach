import { cn } from "@/lib/utils";

type Tone = "accent" | "info" | "warning" | "danger" | "success";

const bar: Record<Tone, string> = {
  accent: "bg-accent",
  info: "bg-info",
  warning: "bg-warning",
  danger: "bg-danger",
  success: "bg-success",
};

const iconColor: Record<Tone, string> = {
  accent: "text-accent-text",
  info: "text-info-text",
  warning: "text-warning-text",
  danger: "text-danger-text",
  success: "text-success-text",
};

/**
 * Persistent inline banner (Apollo credit, holiday, quota). Flat surface card
 * with a 3px left accent-bar; tone switches the bar + icon color. Pair with a
 * button-ghost action. (Ephemeral feedback uses a toast instead.)
 */
export function Notice({
  tone = "accent",
  icon,
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  icon?: React.ReactNode;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-surface p-4",
        className,
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", bar[tone])} />
      {icon && <span className={cn("ml-1 shrink-0", iconColor[tone])}>{icon}</span>}
      <div className="flex-1 text-sm text-ink-secondary">
        {title && <p className="font-medium text-ink">{title}</p>}
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
