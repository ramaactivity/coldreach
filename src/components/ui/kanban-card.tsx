import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pipeline card. Flat surface, hairline border, 12px padding. Name + muted
 * "company · role" + an optional footer meta line. A trailing arrow appears on
 * hover to signal it's draggable/clickable.
 */
export function KanbanCard({
  name,
  org,
  meta,
  className,
}: {
  name: React.ReactNode;
  org?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group rounded-lg border border-border bg-surface p-3 transition-colors hover:border-border-strong",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[15px] font-semibold text-ink">
          {name}
        </span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      {org && <p className="mt-0.5 truncate text-[13px] text-muted">{org}</p>}
      {meta && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-faint">
          {meta}
        </div>
      )}
    </div>
  );
}
