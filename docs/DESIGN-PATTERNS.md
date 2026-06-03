# ColdReach — Patterns & Extension Protocol

Companion to `DESIGN.md` / `theme.css` / `UI-COMPONENTS.md`. This file governs **everything not explicitly
screenshotted**: undocumented screens, popups, flows, future features. Its job is to keep the system coherent when
the agent hits a surface the spec didn't name — so it *composes* from the existing vocabulary instead of inventing
generic new patterns (which is how "AI slop" creeps back in).

Core law: **Compose, don't invent.** The token ramp + the `ui/` primitives + the recipes below can express almost
any screen ColdReach needs. A brand-new token or primitive is a last resort with a documented bar (see §5).

---

## 1. Audit first — turn unknowns into a list

Before treating anything as "uncovered," enumerate what actually exists. Do this once, early (it's a phase in the
implementation prompt):

1. List every route under `src/app/**/page.tsx` and every `*.tsx` in `src/components/**`.
2. List every modal/dialog/sheet/popover/menu/tooltip usage (grep for `Dialog`, `Modal`, `Popover`, `Sheet`,
   `DropdownMenu`, `Tooltip`, `role="dialog"`, Radix portals).
3. Produce a **coverage map**: each surface → the `DESIGN.md` component or the §3 recipe that covers it.
4. Anything with no match → **flag list**. For each flagged item, pick the closest recipe in §3, or escalate via §5.

The flag list is the real deliverable here. It converts "what about the screens I didn't show you" into a finite,
reviewable checklist.

---

## 2. The derivation decision tree

When you hit a UI need not named in `DESIGN.md`, walk this in order and **stop at the first yes**:

1. **Is it an existing primitive with different content?** → use the primitive. (A "delete workspace?" box is a
   `dialog`; a "Gmail connected" strip is a `notice`; a row's "⋯" menu is a dropdown — §3.2.)
2. **Is it two+ primitives composed?** → assemble per the nearest §3 recipe. Don't restyle the primitives.
3. **Is it the same primitive in a new layout?** → new layout is fine; the *primitive* stays untouched. Layout lives
   in the page/feature component, never inside `ui/`.
4. **Does it only need a new tone/size of an existing primitive?** → add a *variant* to that primitive's cva
   (`button` gets no new color — it gets a documented variant). Update the primitive's spec comment.
5. **Genuinely new primitive or token?** → §5 bar. Almost always the answer above is "no, compose it."

Two questions to ask at every step: *"Which existing token carries this color/space/radius?"* and *"Am I about to
hardcode a value the system already names?"* If yes to the second, stop.

---

## 3. Composition recipes (token + primitive only — no new tokens)

Each recipe is expressed in existing tokens from `DESIGN.md`. Build these in `ui/` (the reusable shell) and let
pages pass content in.

### 3.1 Modal / confirmation dialog
Base = `{component.dialog}` (white, `{rounded.xl}`, `{shadows.lg}`, 24px padding, over `{colors.scrim}`).
- **Title** `{typography.card-title}`, optional `{typography.sm}` `{colors.muted}` subtitle.
- **Body** `{typography.body}`.
- **Footer** right-aligned: secondary button + primary button, gap `{spacing.sm}`.
- **Destructive confirm** (delete template, disconnect Gmail, archive N contacts): confirm button uses
  `button-destructive`; lead the body with the consequence in plain `{colors.ink}` ("735 email kekirim gak bisa
  dibatalin"), name the object, and put the irreversible count in `{typography.body-strong}`. Never auto-focus the
  destructive button.
- **Sizing:** `sm` ~400px (confirm), `md` ~560px (forms), `lg` ~720px (wizards). Mobile → bottom sheet,
  `{rounded.xl}` top-only, footer pinned.

### 3.2 Dropdown / context menu (the row "⋯" actions)
A floating panel like `{component.select-menu}`: `{colors.surface}`, 1px `{colors.border}`, `{rounded.lg}`,
`{shadows.md}`, `{spacing.xs}` padding. Items: 32px tall, `{rounded.md}`, `{typography.body}`, leading icon
`{colors.muted}`, hover `{colors.surface-hover}`. Destructive item is `{colors.danger-text}` with a
`{colors.border}` divider above it. Use Radix `DropdownMenu` for a11y + positioning.

### 3.3 Tooltip
Tiny dark chip: `{colors.zinc-900}` bg, `{colors.on-action}` text, `{typography.caption}`, `{rounded.md}`,
`6px 8px` padding, `{shadows.md}`. ~150ms fade. Reserve for icon-only buttons and truncated values — never for text
that should just be visible.

### 3.4 Slide-over / detail panel (contact detail, queue detail)
A right-anchored sheet: `{colors.surface}`, fixed width ~480px (full-width on mobile), 1px `{colors.border}` left
edge, `{shadows.lg}`, over `{colors.scrim}`. Header = `{component.page-header}` rules at smaller scale
(`{typography.section}` title + close `icon-button`). Body scrolls; an optional sticky footer holds primary actions.
Use this for a contact's profile + activity timeline (§3.12) rather than a full route when it's a quick look.

### 3.5 Multi-step wizard (Import CSV, New Queue, New Campaign, Cari Lead → Ambil)
Inside a `lg` dialog (or a route for long flows). A **step rail** at top: numbered dots connected by a 1px
`{colors.border}` line; current step dot = `{colors.accent}`, done = `{colors.success}`, future = `{colors.faint}`.
Step label `{typography.body-strong}`. Footer: "Kembali" (`button-secondary`) left, "Lanjut/Selesai" (`button-primary`)
right; disable "Lanjut" until the step validates. One screen per step; never cram two steps together.
- *Import CSV* steps: Upload → Map columns → Preview/dedup → Import. Show the dedup result as a `notice` ("263 sudah
  ada, di-skip").
- *Cari Lead* "Ambil" is a confirm step: show credits-burned estimate as `{typography.mono}` before commit.

### 3.6 Form layout (New/Edit Contact, Settings, Signature, Template)
- Field = label (`{typography.body-strong}`) above an `input`/`select`/`textarea`, with `{spacing.sm}` gap and
  optional `{typography.sm}` `{colors.muted}` helper below.
- Two-column grid on desktop for short fields (Nama | Title, Email | Phone — exactly like the signature editor),
  single column on mobile. Gap `{spacing.lg}`.
- **Sections** separated by a labeled divider: `{typography.section}` heading + `{typography.sm}` description +
  the field group (this is the "Gmail Account" / "Workspace Info" / "Email Signature" pattern in Settings).
- Footer actions sticky at the bottom of the form/panel; primary right, secondary left.
- **Inline validation:** error message `{typography.sm}` `{colors.danger-text}` below the field; the field border
  flips to `{colors.danger}` with a `{colors.danger-soft}` ring (mirror the focus ring, danger hue). Success/“tersimpan”
  → a transient `toast`, not persistent green.
- A **danger zone** (delete workspace) sits last: a `card` with a `{colors.danger}` left accent-bar and a
  `button-destructive`.

### 3.7 Bulk-action bar (select multiple contacts)
When ≥1 row is selected, a bar appears (top of the table or floating bottom-center): `{colors.surface}`, 1px
`{colors.border}`, `{rounded.lg}`, `{shadows.md}`. Left: "{n} dipilih" in `{typography.body-strong}` + a "Clear"
`button-ghost`. Right: action buttons (`Tag`, `Export`, `Archive` = secondary; destructive = `button-destructive`).
Selected rows use the selected-row treatment from `{component.table-row}` (2px `{colors.accent}` left border +
`{colors.accent-soft}`).

### 3.8 Pagination (8,173 results · 164 pages)
A row below the table: left `{typography.sm}` `{colors.muted}` count ("8.173 hasil · hal 1/164"); right a cluster of
`icon-button` prev/next + a few `button-ghost` page numbers, current page = `button-secondary` (bordered) or
`{colors.accent-text}`. Prefer **load-more / infinite scroll** for the discovery grids; reserve numbered pagination
for the contacts table. Either way, show a `skeleton` while the next page loads.

### 3.9 Search + filter bar
`input` with a leading magnifier `{colors.muted}` (the Contacts search). Filters to its right as `select` or
`filter-chip`s. A "sort" `select` ("Terbaru ditambah"). Active filters render as removable `chip`s below the bar so
state is visible. Don't bury filter state inside menus only.

### 3.10 Toast (action feedback)
`{component.toast}` (dark). Three forms via a leading icon + 2px left bar: success `{colors.success}`, error
`{colors.danger}`, info `{colors.accent}`. One line `{typography.body}`, optional "Undo" `button-ghost` (white text).
Bottom-right, stack max 3, auto-dismiss ~4s (errors stay until dismissed). Toast = ephemeral; `notice` = persistent.

### 3.11 In-page tabs vs segmented control
- **Segmented control** (`{component.segmented-control}`) = mutually-exclusive *views of the same list* (Inbox
  Pending/Snoozed/Handled). Small, pill-track.
- **Underline tabs** = sections of a *detail page* (a contact's Overview / Emails / Activity). Tab label
  `{typography.body-strong}`, active gets a 2px `{colors.ink}` bottom border + `{colors.ink}` text; idle
  `{colors.muted}`. Row sits on a 1px `{colors.border}` baseline. Don't use accent for the active tab — ink.

### 3.12 Activity timeline (contact / queue history)
Vertical list: a 1px `{colors.border}` rail on the left, each event a node (8px dot, tone per event type — sent
`{colors.muted}`, opened `{colors.info}`, replied `{colors.success}`, bounced `{colors.danger}`) + a
`{typography.body}` line + `{typography.caption}` `{colors.muted}` timestamp. Tight `{spacing.md}` vertical rhythm.

### 3.13 Trend / delta indicator (on stat-cards, optional)
A small inline `{typography.caption}` next to the metric: `▲ 12%` `{colors.success-text}` for good-direction,
`▼ 8%` `{colors.danger-text}` for bad. Honor the metric color rule — a rising *bounce* rate is `danger`, not success.

### 3.14 Date / time / range picker
You already have `date-picker`/`time-picker`. A **range** is two `date-picker`s in a popover sharing one
`{component.select-menu}` panel. Snooze-until (Inbox) = a small popover with quick options (`filter-chip`s: "Besok",
"3 hari", "Minggu depan") + a custom date-picker. Selected option = `filter-chip-active`.

### 3.15 File upload / dropzone (CSV import, signature logo)
A dashed `{colors.border-strong}` `{rounded.lg}` zone on `{colors.surface-sunken}`, centered: an upload glyph
`{colors.faint}`, `{typography.body-strong}` prompt, `{typography.sm}` `{colors.muted}` constraints ("PNG/JPG · max
512KB" — exactly the signature-logo pattern). On drag-over, border → `{colors.accent}`, bg → `{colors.accent-soft}`.
After select, show a preview + `button-secondary` "Replace" / `button-ghost` "Remove".

### 3.16 OAuth / connect flow (Gmail)
The connected card (Settings) is a `card` with the account, a `badge-success` "Healthy", quota `progress`, and a
`button-destructive` "Disconnect". Disconnected state = a `notice` (accent bar) + `button-primary` "Connect Gmail".
The OAuth popup itself is the provider's — don't style it; just handle the loading (`spinner` on the button) and the
success/error `toast` on return.

### 3.17 Error & boundary states
- **Inline error** (a panel failed to load): a centered `empty-state` variant with a `{colors.danger}` glyph,
  `{typography.card-title}` "Gagal memuat", `{typography.sm}` reason, and a `button-secondary` "Coba lagi".
- **404 / 500 route:** same `empty-state` language, full-page, with a `button-primary` back to Dashboard. Keep the
  gua/lo voice, stay calm — no giant red.
- **Error boundary:** wrap route segments; render the inline-error pattern, log, offer retry.

---

## 4. Mandatory state coverage (every data surface)

The biggest source of "unfinished/slop" feel is shipping only the happy path. **Every list, table, card grid, and
panel must define all of:**

| State | Treatment |
|---|---|
| **Loading** | `skeleton` matching the real layout's shape (rows for tables, tiles for stat grids). Never a bare spinner for full-page loads. |
| **Empty** | `empty-state` (§ DESIGN.md) in the gua/lo voice, with the primary next action ("Belum ada campaign" → New Campaign). |
| **Error** | inline-error pattern (§3.17) with retry. |
| **Partial / pending** | e.g. queue "Pending 126" — show the in-progress treatment, don't hide it. |
| **Populated** | the documented component. |

If a surface lacks any of these in the code, that's a gap to fill — even if it was never screenshotted.

---

## 5. Controlled growth — the bar for new tokens / primitives

Adding to the system is allowed but rare and procedural:

1. **Prove composition fails.** State which recipe you tried and why tokens/primitives can't express it. "It'd look
   nicer" is not a reason.
2. **Prefer a variant over a token.** A new button intent = a documented cva variant, not a new color. A new
   semantic meaning is the only justification for a new *color* token — and ColdReach's four semantics + accent
   already cover sent/opened/replied/bounced/skipped.
3. **If a token is truly justified:** add it to `theme.css` as a role token (never a raw hex in a component), add its
   entry to `DESIGN.md` front matter + a spec paragraph, and reference it by name everywhere. One PR, docs + code
   together.
4. **Radius/spacing are closed.** Do not add values between existing tokens. If something "needs" 10px radius, it's
   `md` (8) or `lg` (12) — pick one.
5. **Record it.** Anything added goes into `DESIGN.md` "Known Gaps" → resolved, so the next agent inherits it.

The system's strength is how rarely it needs to grow. Default answer to "do we need a new token?" is **no, compose it.**

---

## 6. Voice for uncovered copy
New screens inherit the brand voice from `DESIGN.md`: casual Indonesian (gua/lo) in helper text, empty-states, and
confirmations; neutral and scannable in labels, table headers, and metrics; buttons are verbs. One expressive emoji
max per empty/success moment, never in dense views. Destructive copy is plain and honest about consequences.
