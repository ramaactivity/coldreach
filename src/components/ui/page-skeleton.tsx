import { Skeleton } from "./skeleton";
import { cn } from "@/lib/utils";

type Variant = "list" | "detail" | "kanban" | "form" | "stats" | "inbox";

type Props = {
  variant?: Variant;
  maxWidth?: "3xl" | "4xl" | "5xl" | "6xl" | "7xl";
};

const MAX_WIDTH_CLASS: Record<NonNullable<Props["maxWidth"]>, string> = {
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
};

/**
 * Pixel-close skeleton matching the most common page layouts in the app.
 * Used by every loading.tsx so navigation never shows a blank screen.
 */
export function PageSkeleton({ variant = "list", maxWidth = "5xl" }: Props) {
  return (
    <div className={cn("mx-auto px-6 py-8", MAX_WIDTH_CLASS[maxWidth])}>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>

      {variant === "list" && <ListBody />}
      {variant === "detail" && <DetailBody />}
      {variant === "kanban" && <KanbanBody />}
      {variant === "form" && <FormBody />}
      {variant === "stats" && <StatsBody />}
      {variant === "inbox" && <InboxBody />}
    </div>
  );
}

function ListBody() {
  return (
    <>
      <div className="mb-4 space-y-3">
        <Skeleton className="h-10 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="border-b border-border bg-surface-sunken px-5 py-3">
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
              <Skeleton className="h-4 w-4" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function DetailBody() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-surface p-4"
          >
            <Skeleton className="mb-2 h-3 w-16" />
            <Skeleton className="h-7 w-12" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-surface p-5">
        <Skeleton className="mb-3 h-4 w-32" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-border bg-surface p-5">
        <Skeleton className="mb-4 h-4 w-32" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KanbanBody() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, col) => (
        <div
          key={col}
          className="rounded-lg border border-border bg-bg-base p-3"
        >
          <Skeleton className="mb-3 h-4 w-24" />
          <div className="space-y-2">
            {Array.from({ length: 3 + (col % 2) }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-surface p-3"
              >
                <Skeleton className="mb-2 h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FormBody() {
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, section) => (
          <div key={section} className="space-y-3">
            <Skeleton className="h-3 w-28" />
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsBody() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-surface p-5"
          >
            <Skeleton className="mb-3 h-3 w-16" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
      <div className="mt-10">
        <Skeleton className="mb-3 h-4 w-32" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-surface p-5"
            >
              <Skeleton className="mb-3 h-4 w-32" />
              <Skeleton className="mb-2 h-6 w-40" />
              <Skeleton className="h-3 w-48" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function InboxBody() {
  return (
    <>
      <div className="mb-4">
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-5 py-4">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
                <div className="flex gap-2 pt-1">
                  <Skeleton className="h-7 w-24" />
                  <Skeleton className="h-7 w-20" />
                  <span className="grow" />
                  <Skeleton className="h-7 w-20" />
                  <Skeleton className="h-7 w-28" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
