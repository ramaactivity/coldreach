---
version: alpha
name: ColdReach-design-system
description: |
  An operator's-console design system for a dense B2B cold-outreach tool (CRM + sending engine).
  The chrome is a calm, near-monochrome zinc neutral palette where structure is carried by hairline
  borders, not shadows — the data is the load-bearing element, and the system gets out of the data's way.
  A single themeable workspace accent (orange for Tiska Catering by default) runs through the otherwise
  monochrome instrument as a thin identity thread: the brand dot, focus ring, selected states, link color,
  and a 2px left accent-bar on key panels. Action is ink (zinc-900) — every primary button and active nav
  item is near-black; accent is identity, never the action color. All numerics render in tabular figures
  so metric and table columns align like a spreadsheet-grade tool. Type is Geist at a compact 14px base
  with disciplined 600-weight headings and tight tracking — no 800-weight display slop, no rainbow metrics,
  no decorative gradients, no card shadows.

# ── Neutral ramp (zinc) ─────────────────────────────────────────────
colors:
  zinc-50: "#fafafa"
  zinc-100: "#f4f4f5"
  zinc-200: "#e4e4e7"
  zinc-300: "#d4d4d8"
  zinc-400: "#a1a1aa"
  zinc-500: "#71717a"
  zinc-600: "#52525b"
  zinc-700: "#3f3f46"
  zinc-800: "#27272a"
  zinc-900: "#18181b"
  zinc-950: "#09090b"
  white: "#ffffff"

  # ── Role tokens (semantic aliases — components reference THESE, never raw zinc) ──
  bg-base: "#fafafa"          # app content wash (zinc-50)
  surface: "#ffffff"          # cards, sidebar, panels, popovers
  surface-sunken: "#f4f4f5"   # table headers, input idle fill, progress track (zinc-100)
  surface-hover: "#f4f4f5"    # row / item hover (zinc-100)
  border: "#e4e4e7"           # default hairline (zinc-200)
  border-strong: "#d4d4d8"    # emphasis divider, input border (zinc-300)

  ink: "#18181b"              # primary text, headings (zinc-900)
  ink-secondary: "#3f3f46"    # secondary body (zinc-700)
  muted: "#71717a"            # labels, captions, metadata (zinc-500)
  faint: "#a1a1aa"            # placeholder, disabled text (zinc-400)

  # ── Interaction = INK (not accent) ──
  action: "#18181b"           # primary button bg, active nav bg
  action-hover: "#27272a"     # zinc-800
  action-pressed: "#000000"
  on-action: "#ffffff"

  # ── Accent = workspace IDENTITY (themeable; default = Tiska orange) ──
  accent: "#ea580c"           # solid fill, AA with white text (orange-600)
  accent-soft: "#fff7ed"      # tinted bg for accent chips / selected rows (orange-50)
  accent-border: "#fed7aa"    # accent hairline on soft surfaces (orange-200)
  accent-fg: "#ffffff"        # text/icon on solid accent
  accent-text: "#c2410c"      # accent used AS text on light bg (orange-700, AA)

  # ── Semantic (FIXED across all accent themes) ──
  success: "#16a34a"
  success-soft: "#f0fdf4"
  success-text: "#15803d"
  warning: "#d97706"
  warning-soft: "#fffbeb"
  warning-text: "#b45309"
  danger: "#dc2626"
  danger-soft: "#fef2f2"
  danger-text: "#b91c1c"
  info: "#2563eb"
  info-soft: "#eff6ff"
  info-text: "#1d4ed8"

  # ── Pipeline / stage categorical dots (configurable per workspace) ──
  stage-new: "#a1a1aa"        # zinc-400 — "Baru"
  stage-contacted: "#3b82f6"  # blue-500 — "Sudah Dikontak"
  stage-interested: "#f59e0b" # amber-500 — "Tertarik"
  stage-scheduled: "#a855f7"  # purple-500 — "Tasting Terjadwal"
  stage-won: "#22c55e"        # green-500
  stage-lost: "#ef4444"       # red-500

  focus-ring: "#ea580c"       # = accent (themeable)
  scrim: "rgba(9,9,11,0.45)"  # dialog backdrop

typography:
  display:                    # rare; dashboard workspace title only
    fontFamily: Geist
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.02em
  page-title:                 # the H1 on every page ("Contacts", "Pipeline")
    fontFamily: Geist
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.015em
  section:                    # H2 / panel headers ("Recent Replies")
    fontFamily: Geist
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.01em
  card-title:                 # H3 / stat-card metric label container, dialog title
    fontFamily: Geist
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  body:                       # default UI text — 14px base
    fontFamily: Geist
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-strong:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0
  sm:                         # secondary / helper / metadata
    fontFamily: Geist
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0
  label:                      # uppercase stat labels ("SENT TODAY", table headers)
    fontFamily: Geist
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.04em
    textTransform: uppercase
  caption:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  metric:                     # big numbers in stat-cards — tabular figures
    fontFamily: Geist
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.02em
    fontVariantNumeric: tabular-nums
  mono:                       # IDs, credit counts, code-ish values
    fontFamily: Geist Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
    fontVariantNumeric: tabular-nums
  button:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0
  button-sm:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0

rounded:
  none: 0px
  sm: 6px      # chips inner, tags, small controls
  md: 8px      # buttons, inputs, segmented control
  lg: 12px     # cards, stat-cards, panels, kanban cards
  xl: 16px     # dialogs, large containers, empty-state frame
  full: 9999px # pills, avatars, dots, toggle, count badges

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  "2xl": 32px
  "3xl": 48px
  section: 64px

shadows:
  none: "none"
  sm: "0 1px 2px rgba(9,9,11,0.05)"
  md: "0 4px 12px rgba(9,9,11,0.08), 0 1px 2px rgba(9,9,11,0.04)"
  lg: "0 12px 32px rgba(9,9,11,0.12), 0 2px 6px rgba(9,9,11,0.05)"

components:
  app-shell:
    backgroundColor: "{colors.bg-base}"
  sidebar:
    backgroundColor: "{colors.surface}"
    borderRight: "1px solid {colors.border}"
    width: 248px
    padding: "{spacing.md}"
  nav-item:
    textColor: "{colors.ink-secondary}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: 36px
  nav-item-hover:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.ink}"
  nav-item-active:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    rounded: "{rounded.md}"
  nav-group-label:
    textColor: "{colors.faint}"
    typography: "{typography.label}"
  workspace-switcher:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.lg}"
    padding: "8px 10px"
  page-header:
    titleTypography: "{typography.page-title}"
    descriptionTypography: "{typography.sm}"
    descriptionColor: "{colors.muted}"
    gap: "{spacing.lg}"
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: 36px
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    border: "1px solid {colors.border-strong}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: 36px
  button-secondary-hover:
    backgroundColor: "{colors.surface-hover}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: 36px
  button-ghost-hover:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.ink}"
  button-destructive:
    backgroundColor: "transparent"
    textColor: "{colors.danger-text}"
    border: "1px solid {colors.border-strong}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: 36px
  button-disabled:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.faint}"
    border: "1px solid {colors.border}"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    size: 32px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    placeholderColor: "{colors.faint}"
    border: "1px solid {colors.border-strong}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: 36px
  input-focused:
    border: "1px solid {colors.accent}"
    ring: "0 0 0 3px {colors.accent-soft}"
  select-trigger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    border: "1px solid {colors.border-strong}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: 36px
  select-menu:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.lg}"
    shadow: "{shadows.md}"
    padding: "{spacing.xs}"
  checkbox:
    border: "1px solid {colors.border-strong}"
    rounded: "{rounded.sm}"
    size: 16px
    checkedBg: "{colors.action}"
    checkedFg: "{colors.on-action}"
  toggle:
    trackOff: "{colors.border-strong}"
    trackOn: "{colors.action}"
    thumb: "{colors.white}"
    rounded: "{rounded.full}"
    width: 36px
    height: 20px
  chip:                       # input tokens / job-title & location pills
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.sm}"
    rounded: "{rounded.sm}"
    padding: "3px 8px"
    height: 26px
  filter-chip:                # quick filters ("Belum dikontak", "Bounced")
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-secondary}"
    border: "1px solid {colors.border}"
    typography: "{typography.button-sm}"
    rounded: "{rounded.full}"
    padding: "6px 12px"
  filter-chip-active:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    border: "1px solid {colors.action}"
    rounded: "{rounded.full}"
  badge-neutral:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.button-sm}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  badge-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success-text}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  badge-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning-text}"
    rounded: "{rounded.full}"
  badge-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger-text}"
    rounded: "{rounded.full}"
  badge-info:
    backgroundColor: "{colors.info-soft}"
    textColor: "{colors.info-text}"
    rounded: "{rounded.full}"
  segmented-control:          # tabs (Pending / Snoozed / Handled)
    backgroundColor: "{colors.surface-sunken}"
    rounded: "{rounded.md}"
    padding: "{spacing.xxs}"
    height: 36px
  segmented-item-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "6px"
    shadow: "{shadows.sm}"
  card:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
    shadow: "{shadows.none}"
  stat-card:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.lg}"
    padding: "20px"
    labelTypography: "{typography.label}"
    labelColor: "{colors.muted}"
    metricTypography: "{typography.metric}"
    captionTypography: "{typography.sm}"
    captionColor: "{colors.muted}"
  stat-card-icon:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    size: 32px
  table:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.lg}"
  table-header:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    height: 40px
  table-row:
    borderBottom: "1px solid {colors.border}"
    height: 56px
  table-row-hover:
    backgroundColor: "{colors.surface-hover}"
  kanban-column:
    backgroundColor: "{colors.bg-base}"
    headerTypography: "{typography.card-title}"
    gap: "{spacing.sm}"
  kanban-card:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  progress-track:
    backgroundColor: "{colors.surface-sunken}"
    rounded: "{rounded.full}"
    height: 6px
  progress-fill:
    backgroundColor: "{colors.success}"   # default; switches to warning/danger near cap
    rounded: "{rounded.full}"
  notice:                     # apollo-credit-notice, holiday-notice inline banners
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.border}"
    accentBar: "3px solid {colors.accent}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  empty-state:
    iconFrameBg: "{colors.surface-sunken}"
    iconColor: "{colors.faint}"
    iconFrameRounded: "{rounded.xl}"
    iconFrameSize: 56px
    titleTypography: "{typography.card-title}"
    bodyTypography: "{typography.sm}"
    bodyColor: "{colors.muted}"
  dialog:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    shadow: "{shadows.lg}"
    padding: "{spacing.xl}"
    scrim: "{colors.scrim}"
  toast:
    backgroundColor: "{colors.zinc-900}"
    textColor: "{colors.on-action}"
    rounded: "{rounded.lg}"
    shadow: "{shadows.lg}"
    padding: "12px 16px"
  avatar:
    rounded: "{rounded.full}"   # NOTE: workspace avatar uses rounded.md (squircle), user avatar uses full
    accentBg: "{colors.accent}"
    accentFg: "{colors.accent-fg}"
---

## Overview

ColdReach is a dense B2B cold-outreach instrument: a contacts CRM, a pipeline board, an email template/queue
engine, and a reply inbox — used by a small team that stares at metrics, queues, and tables for hours. The design
system is built around a single instructional principle, borrowed in spirit from Pinterest's "get out of the
photograph's way" but inverted for data: **get out of the data's way.** The chrome is a quiet zinc neutral palette;
structure is carried by 1px hairline borders, not shadows; and every number renders in tabular figures so columns
align like a spreadsheet-grade tool.

The system runs on a deliberate **two-tier color contract** that resolves the central tension visible in the current
build (orange accent fighting black buttons for "primary" status):

- **Ink is action.** Every primary button and active nav item is near-black (`{colors.action}` — zinc-900). Black
  is what you *click*.
- **Accent is identity.** The themeable workspace color (orange for Tiska by default) is never a large solid CTA. It
  appears only as a thin identity thread: the brand dot, the focus ring, selected-state borders, link text, a 2px
  left accent-bar on notices, and the workspace avatar. Accent is what tells you *whose workspace you're in*.

This contract is the spine of the system. It is non-negotiable, because the accent is user-themeable across eight
hues (including red and green, which collide with semantic colors) — keeping action on ink means changing the accent
never breaks meaning.

**Key characteristics:**
- Two-tier color contract: ink = action, themeable accent = identity. Semantic colors (success/warning/danger/info)
  are fixed and never themeable.
- Near-monochrome zinc chrome with a two-tone canvas: `{colors.bg-base}` (zinc-50) content wash, `{colors.surface}`
  (white) cards — depth from a value step, not from shadow.
- Hairline borders are the primary structural device. Cards have **no shadow**; only floating layers
  (select menu, dialog, toast) cast one.
- Tabular numerals (`font-variant-numeric: tabular-nums`) on every metric and table cell — the signature data gesture.
- Geist (UI) + Geist Mono (numerics/IDs) at a compact 14px base. Headings are weight 600, never 800.
- Three-step radius core (8 / 12 / 16) plus `sm` for chips and `full` for pills — crisp, not the friendly 16/32 of
  a consumer site.

## Colors

### The two-tier contract
- **Action (ink)** — `{colors.action}` (zinc-900). Primary buttons, active nav item, checkbox/toggle "on",
  segmented-control... no: segmented active is white-on-sunken. Action ink is reserved for genuine primary actions
  and the single active nav row. Hover deepens to `{colors.action-hover}`.
- **Accent (identity, themeable)** — `{colors.accent}`. Default Tiska orange (`#ea580c`). Used for: the ColdReach
  brand dot, workspace avatar, focus rings, selected-row left border, the `{component.notice}` accent-bar, link text
  (`{colors.accent-text}`), and small accent chips on `{colors.accent-soft}`. **Never** a full-width CTA fill.

### Neutral chrome
- **`{colors.bg-base}`** (zinc-50) — the app content wash behind cards.
- **`{colors.surface}`** (white) — cards, sidebar, panels, popovers, dialogs.
- **`{colors.surface-sunken}`** (zinc-100) — table headers, segmented-control track, input idle fill where used,
  progress track, chip background.
- **`{colors.surface-hover}`** (zinc-100) — table-row and nav-item hover.
- **`{colors.border}`** (zinc-200) — the default hairline; every card, table, and divider.
- **`{colors.border-strong}`** (zinc-300) — input borders and emphasis dividers only.

### Text
- **`{colors.ink}`** (zinc-900) — headings and primary text.
- **`{colors.ink-secondary}`** (zinc-700) — secondary body, nav-item idle text.
- **`{colors.muted}`** (zinc-500) — labels, captions, metadata, table-header text, "92/90 quota".
- **`{colors.faint}`** (zinc-400) — placeholders, disabled text, nav-group labels.

### Semantic (FIXED — never themeable, never decorative)
Each semantic color ships as a triplet: `solid` (fills/dots), `soft` (badge background), `text` (text on soft/white).
- **Success** — `{colors.success}` / `{colors.success-soft}` / `{colors.success-text}`. Healthy quota, completed
  progress, positive deltas, "Healthy" account badge, open-rate when framed as good.
- **Warning** — `{colors.warning}` / `{colors.warning-soft}` / `{colors.warning-text}`. Quota near cap, "skipped",
  archived counts, "Quota harian habis" notice.
- **Danger** — `{colors.danger}` / `{colors.danger-soft}` / `{colors.danger-text}`. Bounce rate, destructive
  confirmations, disconnect, errors.
- **Info** — `{colors.info}` / `{colors.info-soft}` / `{colors.info-text}`. Neutral-positive counts (reply rate,
  total contacts), informational banners.

### Metric color rule (kills the rainbow)
A metric number is `{colors.ink}` **by default**. It only takes a semantic color when the metric carries valence:
- Bounce rate / bounced count → `{colors.danger}`.
- Reply rate, open rate (when good), success counts → `{colors.success}` or `{colors.info}`.
- Quota / skipped / archived → `{colors.warning}` only when at/over a meaningful threshold.
- Plain counts with no valence (Contacts 17,396, Templates 3, "Sent 7d") → `{colors.ink}`. Do **not** color them.

### Pipeline stage dots
Categorical, not semantic. `{colors.stage-new}` → `{colors.stage-won}`. These color only the 8px dot before a stage
name and the count-badge text; the rest of the column stays neutral.

## Typography

### Font family
**Geist** (Vercel's grotesque) for all UI text, **Geist Mono** for IDs, credit counts, and any code-ish value.
Geist is chosen over Inter deliberately: it carries more character at UI sizes, has excellent tabular figures for a
data tool, and is contextually correct for a Vercel-deployed app. Fallback stack:
`Geist, -apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`. Mono fallback:
`"Geist Mono", "SF Mono", "JetBrains Mono", ui-monospace, monospace`.

### Hierarchy

| Token | Size | Weight | Tracking | Use |
|---|---|---|---|---|
| `{typography.display}` | 30px | 600 | -0.02em | Dashboard workspace title only ("Tiska Catering") |
| `{typography.page-title}` | 24px | 600 | -0.015em | Every page H1 ("Contacts", "Pipeline", "Cari Lead") |
| `{typography.section}` | 18px | 600 | -0.01em | Panel headers ("Recent Replies", "Today's Gmail quota") |
| `{typography.card-title}` | 15px | 600 | 0 | Card titles, dialog titles, kanban card name |
| `{typography.body}` | 14px | 400 | 0 | Default UI text |
| `{typography.body-strong}` | 14px | 500 | 0 | Emphasis, nav-item, form labels |
| `{typography.sm}` | 13px | 400 | 0 | Secondary text, helper, table cell secondary line |
| `{typography.label}` | 12px | 500 | +0.04em UPPERCASE | Stat labels, table headers |
| `{typography.caption}` | 12px | 400 | 0 | Smallest utility text |
| `{typography.metric}` | 30px | 600 | -0.02em, tabular | Big stat numbers |
| `{typography.mono}` | 13px | 400 | tabular | IDs, "≈139 kredit", queue IDs |
| `{typography.button}` | 14px | 500 | 0 | Button labels |

### Principles
- **No 800-weight headlines.** The current build's ultra-black titles are the loudest "generic AI" tell. Headings
  cap at 600. Hierarchy comes from size + tracking + the 14px body floor, not from weight escalation.
- **Tracking is part of the voice.** Apply the negative tracking on `display` / `page-title` / `section`. It tightens
  headings into something intentional.
- **Tabular numerals everywhere a number can change or align.** Stat cards, table cells, progress labels, quota
  counts. Set `font-variant-numeric: tabular-nums` globally on `.tabular` and apply it to all metric/table contexts.
- **14px is the base.** Dashboards read at 14, not 16. The smaller floor raises density without feeling cramped.

### Voice & microcopy (brand-specific)
ColdReach's product copy is **casual Indonesian (gua/lo register) mixed with English** — "Inbox kosong! 🎉",
"kredit cuma kebakar saat reveal", "pasangin ke queue dulu". Keep it. This warmth is an asset, not slop. Rules:
- One expressive emoji max per empty-state or success moment. Never in dense data views, labels, or buttons.
- Helper text and empty-states speak in the gua/lo voice; labels and metrics stay neutral and scannable.
- Buttons are verbs: "Cari (gratis)", "Ambil", "New Contact". No "Click here".

## Layout

### App shell
A fixed left sidebar (`{component.sidebar}`, 248px, white, 1px right hairline) + a scrolling content area on
`{colors.bg-base}`. Content uses a max-width of ~1200px on wide screens with 32px outer padding; full-bleed below.

### Sidebar structure (top → bottom)
1. **Brand** — "ColdReach" wordmark with an 8px `{colors.accent}` dot to its left.
2. **Workspace switcher** — `{component.workspace-switcher}`: squircle accent avatar + workspace name + business-type
   caption + a vertical chevron. This is the one place the accent appears as a solid fill.
3. **Nav groups** — `{component.nav-group-label}` ("OVERVIEW", "OUTREACH") in uppercase faint label type, each over a
   list of `{component.nav-item}`. The active item is `{component.nav-item-active}` (ink fill, white text); idle items
   are `{colors.ink-secondary}` and hover to `{colors.surface-hover}`.
4. **Footer** (pinned bottom) — Settings nav-item, then a 1px divider, then the user account row (user avatar +
   email) and a Sign-out row.

### Spacing system
- **Base unit: 4px.** Tokens: `{spacing.xs}` (4) · `{spacing.sm}` (8) · `{spacing.md}` (12) · `{spacing.lg}` (16) ·
  `{spacing.xl}` (24) · `{spacing.2xl}` (32) · `{spacing.section}` (64, between major page blocks).
- Card internal padding: `{spacing.xl}` (24). Stat-card: 20px. Dialog: 24px.
- Stat-card grid gutter: `{spacing.lg}` (16). Kanban column gutter: `{spacing.lg}`; card gap within a column:
  `{spacing.sm}` (8).

### Grid & container
- **Stat-card grid:** 4-up at desktop → 2-up at tablet → 1-up at mobile. Cards are equal-height.
- **Pipeline:** horizontal-scroll columns, each ~300px wide, fixed; the board scrolls x, columns don't wrap.
- **Tables:** full-width inside the content max-width; horizontal scroll on overflow with the first (name) column
  optionally sticky.
- **Page rhythm:** `{component.page-header}` → optional `{component.notice}` → content blocks separated by
  `{spacing.xl}`–`{spacing.section}`.

### Whitespace philosophy
Generous *between* blocks, tight *within* data. Page headers and section gaps breathe; tables and stat grids pack.
The system reads as one calm instrument, not a marketing page — density is a feature, achieved through the 14px
floor, 36px control height, and 56px table rows.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 — Flat + hairline | 1px `{colors.border}`, no shadow | **Dominant.** Cards, stat-cards, tables, sidebar, kanban cards, notices |
| 1 — `{shadows.sm}` | 0 1px 2px / 0.05 | Segmented-control active thumb only |
| 2 — `{shadows.md}` | soft 4–12px | Floating layers: select/dropdown menus, popovers, date-picker |
| 3 — `{shadows.lg}` + scrim | 12–32px + `{colors.scrim}` | Dialogs/modals, toast |

**The anti-slop rule:** cards never carry shadow. Depth between a card and the page comes from the value step
(`bg-base` zinc-50 vs `surface` white) + the hairline border. Shadows are reserved exclusively for layers that
genuinely float above the page. No colored shadows, ever.

## Shapes

### Radius scale
| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0 | Full-bleed dividers, progress track edges meeting a card edge |
| `{rounded.sm}` | 6px | Chips, tags, checkbox |
| `{rounded.md}` | 8px | Buttons, inputs, select trigger, segmented control, icon-button |
| `{rounded.lg}` | 12px | Cards, stat-cards, panels, kanban cards, notices, select menu |
| `{rounded.xl}` | 16px | Dialogs, empty-state icon frame, large containers |
| `{rounded.full}` | 9999 | Pills, count badges, filter-chips, avatars, dots, toggle |

Three working values for "real" surfaces (8 / 12 / 16) plus `sm` for chips and `full` for pills. **Never mix radii
within one component**, and never introduce a value between the tokens.

### Avatars
- **Workspace avatar:** squircle at `{rounded.md}`, solid `{colors.accent}` fill, white initial.
- **User avatar:** circle at `{rounded.full}`, neutral or photo.

## Components

> Each spec covers Default + key states. All interactive controls are 36px tall (icon-buttons 32px) and meet a
> 44px tappable target via hit-area padding on touch.

### Buttons
**`button-primary`** — the one true CTA. `{colors.action}` ink fill, white text, `{rounded.md}`, 36px, `{typography.button}`.
Hover → `{colors.action-hover}`. Used for "New Contact", "New Template", "Cari (gratis)", dialog confirms.

**`button-secondary`** — white fill, `{colors.ink}` text, 1px `{colors.border-strong}` border. "Tags", "Duplicates",
"Export CSV", "Import CSV". Hover → `{colors.surface-hover}`.

**`button-ghost`** — transparent, `{colors.ink-secondary}` text. Low-emphasis inline actions, "Back to templates".
Hover → `{colors.surface-hover}` + `{colors.ink}`.

**`button-destructive`** — transparent with border, `{colors.danger-text}` text. "Delete", "Disconnect". Hover tints
to `{colors.danger-soft}`.

**`button-disabled`** — `{colors.surface-sunken}` fill, `{colors.faint}` text. The "Send 1 email" exhausted-quota state.

Icon + label gap is `{spacing.sm}`. Loading state swaps the leading icon for a spinner; label stays.

### Inputs & forms
**`input`** / **`input-focused`** — white fill, 1px `{colors.border-strong}`, 36px, `{rounded.md}`. Focus: border
flips to `{colors.accent}` + a 3px `{colors.accent-soft}` ring (the themeable focus signal). Placeholder `{colors.faint}`.

**`select-trigger`** + **`select-menu`** — trigger matches `input`; menu is a floating `{colors.surface}` panel,
1px `{colors.border}`, `{rounded.lg}`, `{shadows.md}`, with `{spacing.xs}` padding. Active option gets
`{colors.accent-soft}` bg + `{colors.accent-text}`.

**`checkbox`** — 16px, `{rounded.sm}`, 1px `{colors.border-strong}`. Checked: `{colors.action}` fill, white check.

**`toggle`** — 36×20 track `{rounded.full}`; off `{colors.border-strong}`, on `{colors.action}`, white thumb. (The
"Hanya Net New" / "show route" style switches.)

**`chip`** — input tokens and the job-title / location pills on Cari Lead. `{colors.surface-sunken}` fill,
`{colors.ink-secondary}` text, `{rounded.sm}`, with a removable ✕ in `{colors.faint}` → `{colors.ink}` on hover.

### Filters & tabs
**`filter-chip`** / **`filter-chip-active`** — the quick-filter row ("Belum dikontak", "Pernah reply", "Bounced").
Default: white, `{colors.border}`, `{rounded.full}`. Active: flips to `{colors.action}` ink fill, white text. Each
chip pairs a small leading icon with its label.

**`segmented-control`** — the Inbox tabs (Pending / Snoozed / Handled). A `{colors.surface-sunken}` track at
`{rounded.md}` holding equal segments; the active segment is a white `{component.segmented-item-active}` thumb with
`{shadows.sm}`. A trailing count badge (`{component.badge-neutral}`) sits inside the segment ("Handled 5").

### Badges
A single badge primitive with five tones: `neutral` (tags like "apollo", "catering"), `success` ("Healthy"),
`warning`, `danger`, `info`. All `{rounded.full}`, `{typography.button-sm}`, `2px 8px` padding, soft bg + matching
text token. Status badges may prefix an 8px dot in the solid tone.

### Cards & containers
**`card`** — white, 1px `{colors.border}`, `{rounded.lg}`, 24px padding, **no shadow**. The universal container.

**`stat-card`** — the dashboard/contacts metric tile. White card, 20px padding. Layout: top row = `{typography.label}`
metric name (left) + `{component.stat-card-icon}` (a 32px `{rounded.md}` neutral square, right). Then the
`{typography.metric}` number (colored only per the metric color rule). Then a `{typography.sm}` `{colors.muted}` caption
("92/90 quota", "14% bounce rate"). The icon tile is **neutral by default** — it only takes a semantic tint when the
whole card is a semantic alert (e.g. bounced → `{colors.danger-soft}` icon tile + `{colors.danger}` icon).

**`notice`** — inline info banners (Apollo credit, holiday, "Quota harian habis"). White card with a 3px
`{colors.accent}` (or semantic) **left accent-bar**, `{rounded.lg}`, an icon, a `{typography.body-strong}` line, and
optional `{typography.sm}` detail + a `{component.button-ghost}` action. Tone switches the bar + icon color: accent
(default/info), `{colors.warning}` (quota), `{colors.danger}` (error).

### Data table
**`table`** — white card-wrapped. **`table-header`** row: `{colors.surface-sunken}` bg, `{typography.label}` text,
40px tall, with a leading checkbox column. **`table-row`**: 56px tall, 1px `{colors.border}` bottom rule, hover
`{colors.surface-hover}`. A **two-line cell** (the common pattern) stacks a `{typography.body-strong}` primary
(name / company) over a `{typography.sm}` `{colors.muted}` secondary (email / role). Numeric cells use tabular nums and
right-align. Selected rows get a 2px `{colors.accent}` left border + `{colors.accent-soft}` bg.

### Pipeline (kanban)
**`kanban-column`** — header = an 8px stage dot (`{colors.stage-*}`) + `{typography.card-title}` name + a
`{component.badge-neutral}` count. The column body sits on `{colors.bg-base}`; empty columns show a dashed
`{colors.border}` placeholder reading "Kosong". **`kanban-card`** — white, 1px `{colors.border}`, `{rounded.lg}`,
12px padding: `{typography.card-title}` name, `{typography.sm}` `{colors.muted}` "company · role", and a footer meta
row (mail glyph + date in `{typography.caption}`). A trailing → glyph on hover indicates it's draggable/clickable.

### Progress
**`progress-track`** (`{colors.surface-sunken}`, 6px, `{rounded.full}`) + **`progress-fill`**. Fill is
`{colors.success}` for healthy/complete, switches to `{colors.warning}` at ≥90% of a quota cap and `{colors.danger}`
when over. The queue progress and Gmail-quota bars use this.

### Empty state
**`empty-state`** — centered: a 56px `{rounded.xl}` `{colors.surface-sunken}` icon frame holding a `{colors.faint}`
glyph, a `{typography.card-title}` heading (one emoji allowed — "Inbox kosong! 🎉"), a `{typography.sm}`
`{colors.muted}` body in the gua/lo voice, and an optional `{component.button-primary}`.

### Dialog & toast
**`dialog`** — white, `{rounded.xl}`, `{shadows.lg}`, 24px padding, over a `{colors.scrim}` backdrop. Title
`{typography.card-title}`, body `{typography.body}`, footer right-aligned with secondary + primary buttons.
**`toast`** — `{colors.zinc-900}` fill, white text, `{rounded.lg}`, `{shadows.lg}`, bottom-right, auto-dismiss.

### Loading
**`skeleton`** — `{colors.surface-sunken}` blocks with a subtle shimmer, matching the shape/radius of the content they
replace. **`page-skeleton`** composes skeletons into the page-header + content layout. **`spinner`** — a 2px ring,
`{colors.border}` track + `{colors.ink}` head, for inline button-loading.

## Do's and Don'ts

### Do
- Reserve `{colors.action}` (ink) for genuine primary actions and the single active nav row. Reserve `{colors.accent}`
  for identity (dot, avatar, focus, selected, link, notice-bar).
- Build hierarchy from size + tracking + the 14px floor. Heading weight stops at 600.
- Use tabular numerals on every metric and table cell.
- Carry structure with hairline `{colors.border}` and the `bg-base`/`surface` value step. Keep cards flat.
- Color a metric number only when it has valence (bounce = danger, reply = success). Otherwise leave it `{colors.ink}`.
- Keep the casual gua/lo voice in helper text and empty-states; keep labels and metrics neutral and scannable.
- Make every reusable primitive live in `src/components/ui` and consume tokens via CSS variables only.

### Don't
- Don't use the accent as a full-width CTA fill, and don't make primary buttons accent-colored. Action is ink.
- Don't put shadows on cards, stat-cards, tables, or kanban cards. Shadows are for floating layers only.
- Don't color stat numbers as a rainbow. No more than the valence rule allows.
- Don't ship 700/800-weight headlines. That single change removes most of the "generic AI" read.
- Don't introduce gradients, glassmorphism, or atmospheric backgrounds. The chrome is flat and quiet.
- Don't mix radii inside one component or invent a radius between tokens.
- Don't hardcode hex or px in components/pages — reference tokens. The only inline style permitted is the dynamic
  accent CSS variable set per workspace.
- Don't let semantic colors become themeable. Success/warning/danger/info are fixed even when the accent shares a hue.

## Themeable Accent

The workspace accent is a set of CSS variables overridden per workspace (matching the eight Settings swatches).
Everything else in the system is fixed. Set the variables on a wrapper element when the workspace loads.

| Theme | `--accent` (solid) | `--accent-soft` (bg) | `--accent-text` (on light) |
|---|---|---|---|
| orange (Tiska default) | #ea580c | #fff7ed | #c2410c |
| pink | #db2777 | #fdf2f8 | #be185d |
| purple | #9333ea | #faf5ff | #7e22ce |
| blue | #2563eb | #eff6ff | #1d4ed8 |
| teal | #0d9488 | #f0fdfa | #0f766e |
| green | #16a34a | #f0fdf4 | #15803d |
| red | #dc2626 | #fef2f2 | #b91c1c |
| slate | #475569 | #f8fafc | #334155 |

`--accent-fg` is `#ffffff` for every theme (all solids are AA with white text). `--focus-ring` = `--accent`.
**Caveat:** when a workspace picks red or green, the accent shares a hue with danger/success. Because action stays
on ink and semantic tones are fixed, meaning is preserved — but avoid placing an accent chip directly beside a
semantic badge of the same hue.

## Responsive Behavior

### Breakpoints
| Name | Width | Key changes |
|---|---|---|
| desktop-lg | 1440px+ | Default. 248px sidebar, 4-up stat grid, full tables |
| desktop | 1280px | Same; narrower outer gutters |
| tablet | 1024px | Stat grid → 2-up; pipeline scrolls x; sidebar can collapse to icon-rail |
| tablet-sm | 768px | Sidebar becomes an off-canvas drawer (hamburger in a topbar); tables scroll x |
| mobile | 480px | Stat grid → 1-up; tables become stacked cards; dialogs become bottom sheets |

### Collapsing strategy
- **Sidebar:** persistent 248px → 64px icon-rail at tablet → off-canvas drawer (`{component.dialog}`-style sheet)
  below 768px, opened from a `simple-topbar` hamburger.
- **Stat grid:** 4 → 2 → 1.
- **Pipeline:** always horizontal-scroll; column width holds at ~300px, the board scrolls.
- **Data table:** horizontal scroll with sticky name column at tablet; collapses to a stacked list of mini-cards
  (label: value pairs) at mobile.
- **Dialog:** centered card → full-width bottom sheet (rounded `{rounded.xl}` top only) at mobile.
- **Page padding:** 32px desktop → 24px tablet → 16px mobile.

### Touch targets
All controls meet ≥44×44px tappable. 36px-tall controls and 32px icon-buttons extend their hit area via inline
padding. Checkbox/toggle hit areas extend to 44px on touch.

## Migration & Source-of-Truth Protocol

This section governs how the refresh is executed so the agent stops drifting back to pre-refresh styling.

1. **Single source of truth.** `src/components/ui/*` is the ONLY place visual primitives live. Tokens live in ONE
   file (`globals.css` `@theme` / the shipped `theme.css`). Pages and feature components compose primitives; they
   never re-style them and never hardcode hex/px.
2. **Token-only styling.** No raw hex or px in any component or page. Use token-backed Tailwind classes / CSS vars.
   The single permitted inline style is the per-workspace accent variable.
3. **Rebuild order (do not skip):** (a) install the token layer → (b) rebuild primitives in `ui/` to match the specs
   above → (c) rebuild composed components (stat-card, data-table, kanban, notice, page-header) → (d) sweep pages to
   consume only the rebuilt primitives.
4. **No legacy references.** When rebuilding, delete or rewrite any pre-refresh style; do not import or extend the old
   versions "for compatibility". If a call site breaks because a primitive's API changed, fix the call site in the
   same pass.
5. **Per-component checklist** before marking a primitive done: matches its spec token-for-token · no hardcoded values
   · focus-visible ring present · disabled state present · dark-mode-safe (uses role tokens, not raw zinc) ·
   tabular-nums where numeric.

## Iteration Guide

1. Work ONE component at a time. Pull its YAML entry; verify every `{token}` reference resolves.
2. Reference tokens by name (`{colors.action}`, `{component.stat-card}`, `{rounded.lg}`) — never paraphrase a value.
3. Default text to `{typography.body}` (14px). Reach for `{typography.body-strong}` for emphasis. Reserve
   `{typography.page-title}` strictly for the page H1 and `{typography.display}` for the dashboard workspace title.
4. Keep `{colors.accent}` scarce — identity only. If you're reaching for accent on a button, you want `{colors.action}`.
5. Add variants as separate component entries (`-hover`, `-active`, `-disabled`) — don't bury them in prose.
6. Before adding a token, ask whether the existing zinc ramp + role tokens + one accent already express it. The
   system's strength is how rarely it needs a new one.

## Known Gaps

- **Dark mode** not specified here; the role-token structure (`surface`, `ink`, `border`...) is built to support it —
  add a dark token set mapping the same roles to inverted zinc values, keep the accent contract identical.
- **Charts/graphs** (if added to the dashboard) need a categorical data-viz palette derived from the accent + a
  neutral series — not yet specified.
- **Hover micro-interactions** intentionally minimal; document any added motion as ≤150ms ease-out, opacity/translate
  only, never on data-bearing rows beyond the bg tint.
- **Mobile stacked-table** pattern is specified at the layout level but not yet componentized.
