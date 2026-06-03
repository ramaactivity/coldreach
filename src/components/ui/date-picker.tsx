"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { DayPicker } from "react-day-picker";
import { id as idLocale } from "date-fns/locale/id";
import { Calendar, X } from "lucide-react";
import { cn } from "@/lib/utils";
import "react-day-picker/style.css";

/**
 * Custom date picker. Replaces native <input type="date">.
 * Stores ISO yyyy-MM-dd in a hidden input so existing form-data flow
 * keeps working unchanged.
 */
export function DatePicker({
  value,
  onValueChange,
  name,
  required,
  placeholder = "Pilih tanggal",
  disabled,
  className,
}: {
  value?: string; // yyyy-MM-dd
  onValueChange?: (value: string) => void;
  name?: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [internal, setInternal] = React.useState<string>(value ?? "");
  const [open, setOpen] = React.useState(false);
  const current = value !== undefined ? value : internal;

  function setValue(v: string) {
    if (value === undefined) setInternal(v);
    onValueChange?.(v);
  }

  const selectedDate = current ? parseISODate(current) : undefined;
  const display = selectedDate
    ? selectedDate.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

  return (
    <>
      {/* Hidden input so server actions reading FormData still work */}
      {name && (
        <input type="hidden" name={name} value={current} required={required} />
      )}

      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "inline-flex h-9 w-full items-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-ink outline-none transition-colors hover:bg-surface-hover focus:border-accent focus:ring-[3px] focus:ring-accent-soft disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-faint",
              className,
            )}
          >
            <Calendar className="h-3.5 w-3.5 shrink-0 text-muted" />
            <span
              className={cn(
                "flex-1 truncate text-left tabular",
                display ? "text-ink" : "text-faint",
              )}
            >
              {display || placeholder}
            </span>
            {current && !disabled && (
              <span
                role="button"
                aria-label="Clear"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setValue("");
                  setOpen(false);
                }}
                className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-faint transition-colors hover:bg-surface-hover hover:text-ink"
              >
                <X className="h-3 w-3" />
              </span>
            )}
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            sideOffset={4}
            align="start"
            className="z-50 rounded-lg border border-border bg-surface p-3 shadow-[var(--shadow-md)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          >
            <DayPicker
              mode="single"
              selected={selectedDate}
              onSelect={(d) => {
                if (d) {
                  setValue(formatISODate(d));
                  setOpen(false);
                }
              }}
              locale={idLocale}
              showOutsideDays
              weekStartsOn={1}
              className="rdp-cold"
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}

function parseISODate(s: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return undefined;
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
