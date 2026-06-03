import { forwardRef, type ButtonHTMLAttributes } from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Action = ink. Primary buttons are near-black (action), never the accent.
 * Flat: no shadow on any variant; hairline border on secondary/destructive.
 * `outline` is kept as a visual alias of `secondary` for existing call sites —
 * consolidate outline -> secondary during the page sweep.
 */
const button = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap select-none " +
    "transition-colors disabled:pointer-events-none disabled:bg-surface-sunken disabled:text-faint " +
    "disabled:border disabled:border-border",
  {
    variants: {
      variant: {
        primary: "bg-action text-on-action hover:bg-action-hover",
        secondary:
          "bg-surface text-ink border border-border-strong hover:bg-surface-hover",
        outline:
          "bg-surface text-ink border border-border-strong hover:bg-surface-hover",
        ghost:
          "bg-transparent text-ink-secondary hover:bg-surface-hover hover:text-ink",
        destructive:
          "bg-transparent text-danger-text border border-border-strong hover:bg-danger-soft",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-9 px-3.5 text-sm",
        lg: "h-10 px-5 text-sm",
        icon: "h-8 w-8 px-0 text-muted hover:text-ink",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonVariants = VariantProps<typeof button>;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonVariants & { loading?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant, size, loading, disabled, className, children, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(button({ variant, size }), className)}
        {...props}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {children}
      </button>
    );
  },
);

type ButtonLinkProps = React.ComponentProps<typeof Link> & ButtonVariants;

export function ButtonLink({
  variant,
  size,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={cn(button({ variant, size }), className)} {...props}>
      {children}
    </Link>
  );
}
