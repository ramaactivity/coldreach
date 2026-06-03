import { cn } from "@/lib/utils";

/**
 * Workspace avatar = squircle (rounded-md) with a solid accent fill — the one
 * place the accent appears as a large solid (workspace identity).
 */
export function WorkspaceAvatar({
  initial,
  className,
}: {
  initial: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-md bg-accent font-semibold text-accent-fg",
        className,
      )}
    >
      {initial}
    </span>
  );
}

/** User avatar = circle (rounded-full). Neutral by default; accent optional. */
export function UserAvatar({
  initial,
  className,
}: {
  initial: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full bg-surface-sunken text-sm font-medium text-ink-secondary",
        className,
      )}
    >
      {initial}
    </span>
  );
}
