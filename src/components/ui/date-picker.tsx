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
              "inline-flex h-9 w-full items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium shadow-sm outline-none transition-colors hover:bg-zinc-50 focus-visible:border-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900/10 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:focus-visible:border-zinc-100",
              className,
            )}
          >
            <Calendar className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
            <span
              className={cn(
                "flex-1 truncate text-left",
                display
                  ? "text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-400 dark:text-zinc-500",
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
                className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
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
            className="z-50 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg ring-1 ring-black/5 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 dark:border-zinc-800 dark:bg-zinc-900 dark:ring-white/5"
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
