"use client";

import * as React from "react";
import * as RCheckbox from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 16px checkbox, rounded-sm, border-strong hairline. Checked = action ink fill
 * with a white check. Supports indeterminate via `checked="indeterminate"`.
 */
export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof RCheckbox.Root>) {
  return (
    <RCheckbox.Root
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-sm border border-border-strong bg-surface text-on-action outline-none transition-colors",
        "data-[state=checked]:border-action data-[state=checked]:bg-action",
        "data-[state=indeterminate]:border-action data-[state=indeterminate]:bg-action",
        "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <RCheckbox.Indicator>
        {props.checked === "indeterminate" ? (
          <Minus className="h-3 w-3" strokeWidth={3} />
        ) : (
          <Check className="h-3 w-3" strokeWidth={3} />
        )}
      </RCheckbox.Indicator>
    </RCheckbox.Root>
  );
}
