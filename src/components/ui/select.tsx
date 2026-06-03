"use client";

import * as React from "react";
import * as RSelect from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Radix-based <select> replacement. Trigger matches the Input field shell
 * (border-strong + accent focus ring); the menu is a floating surface panel
 * (shadow allowed). Active option gets accent-soft bg + accent-text.
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
  /** Data-driven dot color shown left of the trigger value (e.g. stage chips). */
  dotColor?: string;
};

const sizeClasses = {
  sm: "h-8 text-[13px] px-2.5 pr-7",
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
          "group inline-flex w-full items-center justify-between gap-2 rounded-md border border-border-strong bg-surface font-medium text-ink outline-none transition-colors",
          "hover:bg-surface-hover focus:border-accent focus:ring-[3px] focus:ring-accent-soft",
          "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-faint data-[placeholder]:text-faint",
          sizeClasses[size],
          triggerClassName,
          className,
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-left">
          {dotColor && (
            <span
              className="inline-block size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: dotColor }}
            />
          )}
          <RSelect.Value placeholder={placeholder} />
        </span>
        <RSelect.Icon asChild>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted transition-transform group-data-[state=open]:rotate-180" />
        </RSelect.Icon>
      </RSelect.Trigger>

      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          sideOffset={4}
          className="relative z-50 max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-[var(--shadow-md)] data-[side=bottom]:animate-in data-[side=bottom]:slide-in-from-top-1 data-[side=top]:animate-in data-[side=top]:slide-in-from-bottom-1"
        >
          <RSelect.ScrollUpButton className="flex h-6 items-center justify-center bg-surface text-muted">
            <ChevronUp className="h-3 w-3" />
          </RSelect.ScrollUpButton>
          <RSelect.Viewport>{children}</RSelect.Viewport>
          <RSelect.ScrollDownButton className="flex h-6 items-center justify-center bg-surface text-muted">
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
  /** Data-driven color dot left of the label (e.g. pipeline stage). */
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
      className="relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 pr-7 text-sm text-ink-secondary outline-none transition-colors data-[highlighted]:bg-surface-hover data-[highlighted]:text-ink data-[state=checked]:bg-accent-soft data-[state=checked]:text-accent-text data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
    >
      {dotColor && (
        <span
          className="inline-block size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
      )}
      <RSelect.ItemText>{children}</RSelect.ItemText>
      {hint && <span className="ml-auto text-xs text-faint">{hint}</span>}
      <RSelect.ItemIndicator className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center text-accent-text">
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
        <RSelect.Label className="label-eyebrow px-2 pt-2 pb-1">
          {label}
        </RSelect.Label>
      )}
      {children}
    </RSelect.Group>
  );
}

export function SelectSeparator() {
  return <RSelect.Separator className="my-1 h-px bg-border" />;
}
