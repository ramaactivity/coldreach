import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const baseFieldClasses =
  "w-full rounded-lg border border-zinc-200/80 bg-white px-3 py-2 text-sm text-zinc-900 shadow-[0_1px_2px_0_rgb(0_0_0/0.03)] transition-all duration-150 placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-900 focus:outline-none focus:ring-4 focus:ring-zinc-900/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800/80 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:hover:border-zinc-700 dark:focus:border-zinc-100 dark:focus:ring-zinc-100/15";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(baseFieldClasses, "h-9", className)}
      {...props}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(baseFieldClasses, "min-h-20", className)}
      {...props}
    />
  );
});

// Custom Select primitive lives at @/components/ui/select.
// Native <select> shouldn't be used in this app — replace with Radix-based Select.

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
    <div className={cn("mb-1.5 flex items-center justify-between gap-2", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
      >
        {children}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {hint && (
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</span>
      )}
    </div>
  );
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">
      {children}
    </p>
  );
}

export function FieldDescription({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
      {children}
    </p>
  );
}
