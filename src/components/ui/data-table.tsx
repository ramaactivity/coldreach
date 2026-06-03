import { cn } from "@/lib/utils";

/**
 * Data-table composition pattern (not a monolith). Semantic <table> wrapped in
 * a flat card; sunken label headers, 56px rows, hairline rules. Two-line cell
 * (CellStack) is the workhorse. Selected rows get an accent left-border + tint.
 */
export function DataTable({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-surface",
        className,
      )}
    >
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "label-eyebrow h-10 bg-surface-sunken px-4 text-left font-medium",
        className,
      )}
      {...props}
    />
  );
}

export function Tr({
  selected,
  className,
  ...props
}: { selected?: boolean } & React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "h-14 border-b border-border transition-colors hover:bg-surface-hover",
        selected && "border-l-2 border-l-accent bg-accent-soft",
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 align-middle", className)} {...props} />;
}

/** Two-line cell: emphasized primary over a muted secondary line. */
export function CellStack({
  primary,
  secondary,
}: {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <span className="font-medium text-ink">{primary}</span>
      {secondary && <span className="text-[13px] text-muted">{secondary}</span>}
    </div>
  );
}
