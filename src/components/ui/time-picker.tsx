"use client";

import * as React from "react";
import { Clock } from "lucide-react";
import { Select, SelectItem } from "./select";
import { cn } from "@/lib/utils";

/**
 * Time picker built from two Select primitives (hour + minute).
 * Returns HH:MM string. Hidden input keeps form-data flow intact.
 */
export function TimePicker({
  value, // "HH:MM" or "HH:MM:SS"
  onValueChange,
  name,
  required,
  disabled,
  step = 30, // minute granularity
  className,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  step?: 5 | 10 | 15 | 30 | 60;
  className?: string;
}) {
  const initial = (value ?? "09:00").slice(0, 5);
  const [internalH, setInternalH] = React.useState(initial.split(":")[0]);
  const [internalM, setInternalM] = React.useState(initial.split(":")[1]);

  React.useEffect(() => {
    if (value) {
      const [h, m] = value.slice(0, 5).split(":");
      setInternalH(h);
      setInternalM(m);
    }
  }, [value]);

  const composed = `${internalH}:${internalM}`;

  const hours = React.useMemo(
    () => Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")),
    [],
  );
  const minutes = React.useMemo(
    () =>
      Array.from(
        { length: Math.floor(60 / step) },
        (_, i) => String(i * step).padStart(2, "0"),
      ),
    [step],
  );

  function update(h: string, m: string) {
    setInternalH(h);
    setInternalM(m);
    onValueChange?.(`${h}:${m}`);
  }

  return (
    <div className={cn("inline-flex w-full items-center gap-2", className)}>
      {name && (
        <input type="hidden" name={name} value={composed} required={required} />
      )}
      <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
      <div className="flex flex-1 items-center gap-1">
        <Select
          value={internalH}
          onValueChange={(h) => update(h, internalM)}
          disabled={disabled}
          size="md"
          className="flex-1"
        >
          {hours.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </Select>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">:</span>
        <Select
          value={internalM}
          onValueChange={(m) => update(internalH, m)}
          disabled={disabled}
          size="md"
          className="flex-1"
        >
          {minutes.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </Select>
      </div>
    </div>
  );
}
