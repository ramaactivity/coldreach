import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Soft-tone badge. `neutral` is the canonical name; `default`/`secondary`/
 * `outline` are kept for existing call sites (default = solid ink count badge,
 * secondary/outline = neutral). Status badges may prefix a solid-tone dot.
 */
const badge = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[13px] font-medium leading-none tabular-nums",
  {
    variants: {
      variant: {
        default: "bg-action text-on-action",
        neutral: "bg-surface-sunken text-ink-secondary",
        secondary: "bg-surface-sunken text-ink-secondary",
        outline: "border border-border text-ink-secondary",
        success: "bg-success-soft text-success-text",
        warning: "bg-warning-soft text-warning-text",
        danger: "bg-danger-soft text-danger-text",
        info: "bg-info-soft text-info-text",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badge> & {
    /** Data-driven dot color (e.g. pipeline stage hex). Renders an 8px leading dot. */
    dotColor?: string;
  };

export function Badge({
  variant,
  dotColor,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span className={cn(badge({ variant }), className)} {...props}>
      {dotColor && (
        <span
          className="inline-block size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
      )}
      {children}
    </span>
  );
}
