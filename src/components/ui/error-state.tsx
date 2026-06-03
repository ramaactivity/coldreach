import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "./button";

/**
 * Inline error state (DESIGN-PATTERNS §3.17). Display-only: the retry button
 * just calls the `onRetry` callback you pass (e.g. a Next error-boundary
 * `reset()` or `router.refresh()`) — it does not own any fetching logic.
 */
export function ErrorState({
  title = "Gagal memuat",
  description = "Ada yang error pas ngambil data. Coba lagi — kalau masih, refresh halaman.",
  retryLabel = "Coba lagi",
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center " +
        (className ?? "")
      }
    >
      <span className="grid size-14 place-items-center rounded-xl bg-danger-soft text-danger">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-[15px] font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">
        {description}
      </p>
      {onRetry && (
        <div className="mt-5">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RotateCcw className="h-3.5 w-3.5" />
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
