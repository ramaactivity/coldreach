"use client";

import { cn } from "@/lib/utils";
import { Badge } from "./badge";

export interface SegmentedTabsProps {
  tabs: { value: string; label: string; count?: number }[];
  value: string;
  onValueChange: (v: string) => void;
  className?: string;
}

/**
 * Mutually-exclusive views of one list (Inbox Pending/Snoozed/Handled).
 * Sunken track; active segment is a white thumb with shadow-sm (the one place
 * a non-floating element carries a shadow, per spec).
 */
export function SegmentedTabs({
  tabs,
  value,
  onValueChange,
  className,
}: SegmentedTabsProps) {
  return (
    <div
      className={cn(
        "inline-flex h-9 items-center gap-0.5 rounded-md bg-surface-sunken p-0.5",
        className,
      )}
    >
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onValueChange(t.value)}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-[6px] px-3 text-sm font-medium transition-colors",
              active
                ? "bg-surface text-ink shadow-[var(--shadow-sm)]"
                : "text-muted hover:text-ink",
            )}
          >
            {t.label}
            {typeof t.count === "number" && (
              <Badge variant="neutral">{t.count}</Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}
