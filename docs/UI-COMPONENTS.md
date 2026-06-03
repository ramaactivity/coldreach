# ColdReach — UI Components Implementation Guide

Companion to `DESIGN.md`. This file is for the agent doing the refresh (Claude Code in Antigravity).
It contains: the rebuild protocol, the per-component checklist, and **reference implementations** for the core
primitives. `DESIGN.md` is the spec (the "what"); this file is the "how".

---

## 0. Read this first — Source-of-Truth Protocol

The frontend keeps regressing to pre-refresh styling because there is no single anchor. Fix that:

1. **`src/components/ui/*` is the ONLY home for visual primitives.** Feature components and pages *compose* these.
   They never re-style a primitive and never hardcode hex/px.
2. **Tokens live in ONE file.** Copy `theme.css` into `src/app/globals.css` (after `@import "tailwindcss";`).
   Every color/radius/shadow comes from a token. The only inline style allowed in the whole app is the per-workspace
   accent (`data-accent="orange"` on the app-shell wrapper).
3. **Rebuild order — do not skip or reorder:**
   1. Token layer (`globals.css`) + fonts (Geist via `next/font`).
   2. Primitives in `ui/` rebuilt to match `DESIGN.md` (the files below).
   3. Composed components: `stat-card`, `page-header`, data table, kanban card, `notice` (apollo/holiday), `empty-state`.
   4. Page sweep: every page consumes only rebuilt primitives; remove leftover inline styling.
4. **No legacy bridges.** Do not keep an old variant "for compatibility". If a primitive's prop API changes, fix every
   call site in the same pass. Search the repo for the old class strings and delete them.
5. **Never reference a "v1"/old version.** There is one version: the one defined here.

### Per-primitive done-checklist
- [ ] Matches its `DESIGN.md` spec token-for-token
- [ ] Zero hardcoded hex/px (role-token Tailwind classes only)
- [ ] `focus-visible` ring present (inherited from base layer or explicit)
- [ ] `disabled` state present
- [ ] Numeric content uses `.tabular` / `tabular-nums`
- [ ] Uses role tokens (`bg-surface`, `text-ink`, `border-border`…), never raw `zinc-*`, so dark mode is a token swap

---

## 1. Setup

### Fonts (`src/app/layout.tsx`)
```tsx
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
// npm i geist

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```
`GeistSans.variable` exposes `--font-geist-sans`; `theme.css` already points `--font-sans` at it.

### Tailwind v4
You're on v4, so tokens come from `@theme` in CSS — no `tailwind.config.js` color block needed. The role-token names
in `theme.css` (`--color-surface`, `--color-ink`, `--radius-lg`…) auto-generate utilities: `bg-surface`, `text-ink`,
`border-border`, `bg-accent`, `text-accent`, `rounded-lg`, etc.

### The `cn` util (`src/lib/utils.ts`) — keep if it exists
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

> Reference code uses `class-variance-authority` (`npm i class-variance-authority`). If a primitive below has a
> different prop API than your current file, **adopt this API and refactor the call sites** — don't fork.

---

## 2. Reference primitives

### `ui/button.tsx`
```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap " +
  "transition-colors disabled:pointer-events-none disabled:bg-surface-sunken " +
  "disabled:text-faint disabled:border disabled:border-border",
  {
    variants: {
      variant: {
        primary: "bg-action text-on-action hover:bg-action-hover",
        secondary: "bg-surface text-ink border border-border-strong hover:bg-surface-hover",
        ghost: "bg-transparent text-ink-secondary hover:bg-surface-hover hover:text-ink",
        destructive: "bg-transparent text-danger-text border border-border-strong hover:bg-danger-soft",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-9 px-3.5 text-sm",
        icon: "h-8 w-8 px-0 text-muted hover:text-ink",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(button({ variant, size }), className)} {...props} />;
}
```

### `ui/badge.tsx`
```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badge = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[13px] font-medium leading-none",
  {
    variants: {
      tone: {
        neutral: "bg-surface-sunken text-ink-secondary",
        success: "bg-success-soft text-success-text",
        warning: "bg-warning-soft text-warning-text",
        danger:  "bg-danger-soft text-danger-text",
        info:    "bg-info-soft text-info-text",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badge> {
  dot?: boolean;
}
const dotColor: Record<string, string> = {
  neutral: "bg-muted", success: "bg-success", warning: "bg-warning", danger: "bg-danger", info: "bg-info",
};

export function Badge({ className, tone = "neutral", dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badge({ tone }), className)} {...props}>
      {dot && <span className={cn("size-1.5 rounded-full", dotColor[tone])} />}
      {children}
    </span>
  );
}
```

### `ui/card.tsx`
```tsx
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  // Flat by design: hairline border, NO shadow.
  return <div className={cn("rounded-lg border border-border bg-surface", className)} {...props} />;
}
export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-[15px] font-semibold text-ink", className)} {...props} />;
}
```

### `ui/input.tsx`
```tsx
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-ink",
        "placeholder:text-faint transition-shadow",
        "focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft",
        "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-faint",
        className
      )}
      {...props}
    />
  );
}
```
Apply the same border/focus classes to your Radix `SelectTrigger`, `TextArea`, `DatePicker` trigger, etc., so all
fields share one focus signal. The Select dropdown panel uses: `rounded-lg border border-border bg-surface
shadow-[var(--shadow-md)] p-1`, with the active item `bg-accent-soft text-accent-text rounded-md`.

### `ui/stat-card.tsx`
```tsx
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const numberTone: Record<Tone, string> = {
  neutral: "text-ink", success: "text-success", warning: "text-warning",
  danger: "text-danger", info: "text-info",
};
const iconTone: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-muted",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger:  "bg-danger-soft text-danger",
  info:    "bg-info-soft text-info",
};

export function StatCard({
  label, value, caption, icon, tone = "neutral",
}: {
  label: string; value: React.ReactNode; caption?: string;
  icon?: React.ReactNode; tone?: Tone;   // tone only when the metric has valence
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between">
        <span className="label-eyebrow">{label}</span>
        {icon && (
          <span className={cn("grid size-8 place-items-center rounded-md", iconTone[tone])}>
            {icon}
          </span>
        )}
      </div>
      <div className={cn("mt-3 text-3xl font-semibold tracking-tight tabular", numberTone[tone])}>
        {value}
      </div>
      {caption && <p className="mt-1 text-[13px] text-muted">{caption}</p>}
    </div>
  );
}
```
**Rule reminder:** pass `tone` ONLY when the number carries meaning (bounce → `danger`, reply → `success`). Plain
counts (Contacts, Templates) stay `neutral`. This is what kills the rainbow look.

### `ui/segmented-tabs.tsx`
```tsx
"use client";
import { cn } from "@/lib/utils";
import { Badge } from "./badge";

export interface SegmentedTabsProps {
  tabs: { value: string; label: string; count?: number }[];
  value: string;
  onValueChange: (v: string) => void;
}

export function SegmentedTabs({ tabs, value, onValueChange }: SegmentedTabsProps) {
  return (
    <div className="inline-flex h-9 items-center gap-0.5 rounded-md bg-surface-sunken p-0.5">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            onClick={() => onValueChange(t.value)}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-[6px] px-3 text-sm font-medium transition-colors",
              active ? "bg-surface text-ink shadow-[var(--shadow-sm)]" : "text-muted hover:text-ink"
            )}
          >
            {t.label}
            {typeof t.count === "number" && <Badge tone="neutral">{t.count}</Badge>}
          </button>
        );
      })}
    </div>
  );
}
```

### `ui/chip.tsx`  (input tokens + job-title / location pills)
```tsx
import { cn } from "@/lib/utils";

export function Chip({ children, onRemove, className }: {
  children: React.ReactNode; onRemove?: () => void; className?: string;
}) {
  return (
    <span className={cn(
      "inline-flex h-[26px] items-center gap-1.5 rounded-sm bg-surface-sunken px-2 text-[13px] text-ink-secondary",
      className
    )}>
      {children}
      {onRemove && (
        <button onClick={onRemove} className="text-faint transition-colors hover:text-ink" aria-label="Remove">
          ✕
        </button>
      )}
    </span>
  );
}
```

### `ui/filter-chip.tsx`  (quick filters: "Belum dikontak", "Bounced"…)
```tsx
import { cn } from "@/lib/utils";

export function FilterChip({ active, icon, children, ...props }: {
  active?: boolean; icon?: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "border border-action bg-action text-on-action"
          : "border border-border bg-surface text-ink-secondary hover:bg-surface-hover"
      )}
      {...props}
    >
      {icon}{children}
    </button>
  );
}
```

### `ui/progress.tsx`
```tsx
import { cn } from "@/lib/utils";

export function Progress({ value, cap = 100 }: { value: number; cap?: number }) {
  const pct = Math.min(100, (value / cap) * 100);
  const tone = pct >= 100 ? "bg-danger" : pct >= 90 ? "bg-warning" : "bg-success";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
      <div className={cn("h-full rounded-full transition-[width]", tone)} style={{ width: `${pct}%` }} />
    </div>
  );
}
```

### `ui/empty-state.tsx`
```tsx
import { cn } from "@/lib/utils";

export function EmptyState({ icon, title, description, action, className }: {
  icon?: React.ReactNode; title: string; description?: string;
  action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center",
      className
    )}>
      {icon && (
        <span className="grid size-14 place-items-center rounded-xl bg-surface-sunken text-faint">{icon}</span>
      )}
      <h3 className="mt-4 text-[15px] font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
```

### `ui/notice.tsx`  (apollo-credit-notice, holiday-notice, quota warnings)
```tsx
import { cn } from "@/lib/utils";

type Tone = "accent" | "info" | "warning" | "danger" | "success";
const bar: Record<Tone, string> = {
  accent: "bg-accent", info: "bg-info", warning: "bg-warning", danger: "bg-danger", success: "bg-success",
};

export function Notice({ tone = "accent", icon, children, action }: {
  tone?: Tone; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-surface p-4">
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", bar[tone])} />
      {icon && <span className="ml-1 text-muted">{icon}</span>}
      <div className="flex-1 text-sm text-ink-secondary">{children}</div>
      {action}
    </div>
  );
}
```

### `ui/avatar.tsx`
```tsx
import { cn } from "@/lib/utils";

// Workspace = squircle accent fill; User = circle.
export function WorkspaceAvatar({ initial, className }: { initial: string; className?: string }) {
  return (
    <span className={cn("grid size-9 place-items-center rounded-md bg-accent font-semibold text-accent-fg", className)}>
      {initial}
    </span>
  );
}
export function UserAvatar({ initial, className }: { initial: string; className?: string }) {
  return (
    <span className={cn("grid size-8 place-items-center rounded-full bg-accent text-sm font-medium text-accent-fg", className)}>
      {initial}
    </span>
  );
}
```

### Data table — composition pattern (not a single component)
Use semantic `<table>` wrapped in a `Card`; style with role tokens. Two-line cell is the workhorse.
```tsx
import { cn } from "@/lib/utils";

export function DataTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}
export function Th({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("label-eyebrow h-10 bg-surface-sunken px-4 text-left font-medium", className)} {...p} />;
}
export function Tr({ selected, className, ...p }: { selected?: boolean } & React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "h-14 border-b border-border transition-colors hover:bg-surface-hover",
        selected && "border-l-2 border-l-accent bg-accent-soft",
        className
      )}
      {...p}
    />
  );
}
export function Td({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 align-middle", className)} {...p} />;
}
// Two-line cell:
export function CellStack({ primary, secondary }: { primary: React.ReactNode; secondary?: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="font-medium text-ink">{primary}</span>
      {secondary && <span className="text-[13px] text-muted">{secondary}</span>}
    </div>
  );
}
```

### Kanban card — composition pattern
```tsx
export function KanbanCard({ name, org, date }: { name: string; org: string; date?: string }) {
  return (
    <div className="group rounded-lg border border-border bg-surface p-3 transition-colors hover:border-border-strong">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-semibold text-ink">{name}</span>
        <span className="text-faint opacity-0 transition-opacity group-hover:opacity-100">→</span>
      </div>
      <p className="mt-0.5 truncate text-[13px] text-muted">{org}</p>
      {date && <p className="mt-2 text-xs text-faint">✉ {date}</p>}
    </div>
  );
}
```
Column header: `<span class="size-2 rounded-full bg-stage-new" />` + `<h3>` name + `<Badge tone="neutral">{count}</Badge>`.
Swap `bg-stage-new` for the matching `stage-*` token per column.

---

## 3. Page-level sweep notes

- **Sidebar:** brand row = `<span class="size-2 rounded-full bg-accent" /> ColdReach`. Nav-item idle:
  `text-ink-secondary hover:bg-surface-hover rounded-md h-9 px-3`; active: `bg-action text-on-action`.
  Group label = `.label-eyebrow`.
- **Page header:** `<h1>` (24/600) + optional `<p class="text-[13px] text-muted">`; actions right-aligned with
  `Button` (primary for the main action, secondary for the rest). Kill all 700/800-weight titles.
- **App-shell wrapper:** `<div data-accent={workspace.colorTheme}>` so the accent presets resolve.
- **Numbers:** wrap every metric/table number context in `.tabular`.
- **Remove:** any `shadow-*` on cards/stat-cards/tables; any gradient; any inline hex; any `font-bold`/`font-extrabold`
  on headings (→ `font-semibold`).
