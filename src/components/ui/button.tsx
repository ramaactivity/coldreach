import { forwardRef, type ButtonHTMLAttributes } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "destructive" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const baseClasses =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-zinc-900/40 focus-visible:ring-offset-white dark:focus-visible:ring-zinc-100/40 dark:focus-visible:ring-offset-zinc-950 disabled:pointer-events-none disabled:opacity-50 select-none whitespace-nowrap active:scale-[0.97]";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-zinc-900 text-zinc-50 shadow-[0_1px_2px_0_rgb(0_0_0/0.08)] hover:bg-zinc-800 hover:shadow-[0_2px_4px_-1px_rgb(0_0_0/0.1)] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white",
  secondary:
    "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700",
  outline:
    "border border-zinc-200/80 bg-white text-zinc-900 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] hover:bg-zinc-50 hover:border-zinc-300 hover:shadow-[0_1px_3px_0_rgb(0_0_0/0.08)] dark:border-zinc-800/80 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800/80 dark:hover:border-zinc-700",
  ghost:
    "text-zinc-700 hover:bg-zinc-100/80 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100",
  destructive:
    "border border-red-200 bg-white text-red-700 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] hover:bg-red-50 hover:border-red-300 dark:border-red-900/50 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/30",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-3.5 text-sm",
  lg: "h-10 px-5 text-sm",
  icon: "h-9 w-9 text-sm",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading,
      disabled,
      className,
      children,
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          baseClasses,
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : null}
        {children}
      </button>
    );
  },
);

type ButtonLinkProps = React.ComponentProps<typeof Link> & {
  variant?: Variant;
  size?: Size;
};

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
