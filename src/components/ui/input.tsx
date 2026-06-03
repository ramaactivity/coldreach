import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

/** Shared field shell: white fill, border-strong hairline, accent focus ring. */
const baseFieldClasses =
  "w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-ink " +
  "placeholder:text-faint transition-shadow " +
  "focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft " +
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-faint";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input ref={ref} className={cn(baseFieldClasses, "h-9", className)} {...props} />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(baseFieldClasses, "min-h-20 py-2", className)}
      {...props}
    />
  );
});

// Native <select> shouldn't be used in this app — use @/components/ui/select.

export function FieldLabel({
  htmlFor,
  children,
  required,
  hint,
  className,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("mb-1.5 flex items-center justify-between gap-2", className)}
    >
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-ink"
      >
        {children}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="mt-1.5 text-[13px] font-medium text-danger-text">{children}</p>
  );
}

export function FieldDescription({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[13px] leading-relaxed text-muted">{children}</p>;
}
