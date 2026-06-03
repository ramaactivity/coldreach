"use client";

import * as React from "react";
import * as RSelect from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Drop-in replacement for native <select> using Radix primitives.
 * Same accessibility / keyboard nav, fully styled to match the app.
 *
 * Usage matches our existing native pattern as closely as possible:
 *
 *   <Select value={v} onValueChange={setV} placeholder="Pick one">
 *     <SelectItem value="a">Apple</SelectItem>
 *     <SelectItem value="b">Banana</SelectItem>
 *   </Select>
 */

type SelectProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  size?: "sm" | "md";
  className?: string;
  triggerClassName?: string;
  children: React.ReactNode;
  /** Optional dot color shown left of the trigger value (for stage chips, etc). */
  dotColor?: string;
};

const sizeClasses = {
  sm: "h-7 text-xs px-2 pr-7",
  md: "h-9 text-sm px-3 pr-8",
};

export function Select({
  value,
  defaultValue,
  onValueChange,
  placeholder,
  disabled,
  required,
  name,
  size = "md",
  className,
  triggerClassName,
  children,
  dotColor,
}: SelectProps) {
  return (
    <RSelect.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={disabled}
      required={required}
      name={name}
    >
      <RSelect.Trigger
        className={cn(
          "group inline-flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white font-medium text-zinc-900 shadow-sm outline-none transition-colors hover:bg-zinc-50 focus-visible:border-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900/10 disabled:opacity-50 data-[placeholder]:text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus-visible:border-zinc-100 dark:data-[placeholder]:text-zinc-600",
          sizeClasses[size],
          triggerClassName,
          className,
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-left">
          {dotColor && (
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: dotColor }}
            />
          )}
          <RSelect.Value placeholder={placeholder} />
        </span>
        <RSelect.Icon asChild>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform group-data-[state=open]:rotate-180 dark:text-zinc-400" />
        </RSelect.Icon>
      </RSelect.Trigger>

      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          sideOffset={4}
          className="relative z-50 max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg ring-1 ring-black/5 data-[side=bottom]:animate-in data-[side=bottom]:slide-in-from-top-1 data-[side=top]:animate-in data-[side=top]:slide-in-from-bottom-1 dark:border-zinc-800 dark:bg-zinc-900 dark:ring-white/5"
        >
          <RSelect.ScrollUpButton className="flex h-6 items-center justify-center bg-white text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <ChevronUp className="h-3 w-3" />
          </RSelect.ScrollUpButton>
          <RSelect.Viewport className="p-1">{children}</RSelect.Viewport>
          <RSelect.ScrollDownButton className="flex h-6 items-center justify-center bg-white text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <ChevronDown className="h-3 w-3" />
          </RSelect.ScrollDownButton>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

type SelectItemProps = {
  value: string;
  disabled?: boolean;
  children: React.ReactNode;
  /** Optional color dot rendered left of the label (e.g., pipeline stage). */
  dotColor?: string;
  hint?: string;
};

export function SelectItem({
  value,
  disabled,
  children,
  dotColor,
  hint,
}: SelectItemProps) {
  return (
    <RSelect.Item
      value={value}
      disabled={disabled}
      className="relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 pr-7 text-sm text-zinc-700 outline-none transition-colors data-[highlighted]:bg-zinc-100 data-[highlighted]:text-zinc-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 dark:text-zinc-300 dark:data-[highlighted]:bg-zinc-800 dark:data-[highlighted]:text-zinc-100"
    >
      {dotColor && (
        <span
          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
      )}
      <RSelect.ItemText>{children}</RSelect.ItemText>
      {hint && (
        <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
          {hint}
        </span>
      )}
      <RSelect.ItemIndicator className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center text-zinc-900 dark:text-zinc-100">
        <Check className="h-3.5 w-3.5" />
      </RSelect.ItemIndicator>
    </RSelect.Item>
  );
}

export function SelectGroup({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <RSelect.Group>
      {label && (
        <RSelect.Label className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {label}
        </RSelect.Label>
      )}
      {children}
    </RSelect.Group>
  );
}

export function SelectSeparator() {
  return (
    <RSelect.Separator className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
  );
}
