import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Input token / job-title / location pill. Sunken fill, ink-secondary text,
 * rounded-sm, with an optional removable ✕.
 */
export function Chip({
  children,
  onRemove,
  className,
}: {
  children: React.ReactNode;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[26px] items-center gap-1.5 rounded-sm bg-surface-sunken px-2 text-[13px] text-ink-secondary",
        className,
      )}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-faint transition-colors hover:text-ink"
          aria-label="Remove"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
