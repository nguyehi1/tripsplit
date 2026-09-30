# Design reference: Shopping list (shopping-list)

Source: claude.ai/design project "TripSplit mobile app design"
(`2098174b-e7fa-417b-9c85-3b7febaac590`), turn 5 ("Claiming moves onto the row, and
the List tab stops talking about money"), options `5a`–`5j`. Turn 4 exists in the same
project as an earlier, rejected alternative — **not** the basis for this feature; do
not build from it.

Per the user: build the **warm-paper** variant only for v1. The dark-glass variant
(`p3d`, `cardD`, `navD`, `.p3d .*` CSS already present in this design) is real design
work already done and should stay on `docs/ROADMAP.md` for a future dark-mode pass —
this app has no dark mode today (see general UI summary from this session: no
`next-themes`, no `dark:` classes anywhere).

All colors/type/radii below already match the app's existing tokens
(`src/app/globals.css`, `src/components/ui.tsx`) — this is an extension of the
existing system, not a new one.

> **Addendum, 2026-09-29 — superseded product decision, not a rewrite of this reference.**
> Screen 2's own source annotation (quoted below, kept as-written) says the unclaim ×
> is "usable by anyone, not just the claimer." That was the shipped v1 rule briefly,
> per requirements.md decision 2 and an earlier session's checkpoint, but was reversed
> after implementation review: unclaim is now claimer-only, enforced at the RPC layer
> (`unclaim_shopping_list_item`) — see requirements.md/architecture.md/design.md for the
> current rule and rationale. This file is left otherwise unchanged below, as an honest
> record of the original design mockup's intent, not the shipped behavior.

## Screen 1 — List tab (`5a`)

Trip screen has three tabs: **Expenses / Details / List** (segmented pill control,
active = accent-filled). The List tab:

- Sticky nav row (back chevron, trip name, settle-up icon, members icon, receipt/List
  icon) — reuses `TopBar` glass pattern.
- **"To get"** section: kicker label + right-aligned hint "tap a circle to grab it".
  Card (`rounded-22`, white, `shadow-card`) containing rows. Each row: 24px circle
  outline (unclaimed) OR a claimer's avatar initials + tinted row background + "<Name>
  added" / "<Name>'s got this" caption (claimed-by-someone-else). Claimed rows get
  `background: ink/4%` full-bleed within the card and slightly dimmed text
  (`opacity:.82`).
- **"Bought"** section below: same card style, rows show the buyer's avatar,
  strikethrough-weight dimmed text (`opacity:.6`), no caption.
- Floating full-width capsule button pinned above the bottom safe area: **"Add an
  item"** (never changes label — always this verb, regardless of state).
- Row content: item name (15px/600), a small caption line underneath (12px, `ink/70`)
  showing who added it, or an optional note after a `·` separator (e.g. "Dev added ·
  the dark one").

## Screen 2 — "Grabbed" state (`5e`)

Once the current user has claimed ≥1 item, a **"Your bag"** section appears above "To
get": rows show a filled checkmark tick (not a circle), item name, caption, and a small
× to release it back — annotated in the source as usable by **anyone**, not just the
claimer (confirmed as the v1 rule in this session's checkpoint — not claimer-only).
The **Expenses tab pill grows a count badge** (small circular badge, accent-filled,
white bold number) showing how many claimed-unlogged items are waiting to be turned
into an expense — this is the only cross-tab signal, replacing any per-row "in other
bags" concept (explicitly removed in this design).

## Screen 3 — "Add an item" sheet (`5c`)

Bottom sheet (existing `sheet-shell` intercepting-route pattern), spring-up animation.
One text field per item (`Field`-style input, no visible border, white bg, 54px tall),
each with an inline "×" clear button; a dashed "+ Add another item" row appends a new
blank field. Primary button: **"Add N to list"** (count reflects how many non-empty
rows are filled) — disabled/muted state at zero. Copy: "everyone sees them" next to the
sheet title, i.e. no per-item privacy option.

## Screen 4 — "Add an expense" sheet, extended (`5k`→`5g`)

The **existing** add-expense sheet gains one new block, unconditionally shown when the
current user has claimed-unlogged items on this trip:

- Kicker **"From your bag"** + right-aligned "`n` of `m` selected" counter.
- Each claimed item renders as a toggle pill (unselected: neutral `ink/6%` bg; selected:
  accent-filled with a checkmark icon prefix).
- Selecting pills **appends their names into the description field**, comma-joined
  (e.g. "Firewood, coffee beans, ice"), with a small animated caret shown while it's
  live-updating. **Amount is never auto-filled** — always typed by hand. This is the
  resolved v1 behavior: multi-item selection into one expense is in scope (overrides
  the original planning-stage exclusion — confirmed in this session).
- On successful submit, every selected item is marked logged and linked to the new
  expense (`expense_id`).

## Screen 5 — Post-submit list state (`5i`)

Newly-logged items move into "Bought", tagged with the payer's avatar. A caption under
the Bought card reads: *"Tapping a bought item opens the expense it landed in."*
(tap-through to the linked expense — a real interaction to implement, not just copy).

## Component/class notes for the engineer stage

The design's inline CSS (not to be copied verbatim, but useful naming/behavior
reference — real implementation should extend `src/components/ui.tsx` idiomatically):

- `.sl-nav` — sticky, blurred glass tab bar, matches existing `TopBar` sticky variant.
- `.sl-card` — identical to existing `Card` (`rounded-22`, white, `shadow-card`).
- `.row` — 13px vertical padding, bottom hairline divider (`ink/7%`), last-child no
  divider.
- `.circ` — 24px circle, 1.8px `ink/26%` border (unclaimed state).
- `.tick` — 24px filled circle, accent bg, white checkmark (claimed-by-me state, shown
  in "Your bag").
- `.av` — 24px circular avatar, initials, per-member color (reuses existing
  `AvatarColor`/`Avatar`).
- `.qty` — small pill badge, `ink/6%` bg, 12px/600 `ink/66%` text (referenced in tokens
  but not used in the final v1 screens — no quantity field in this design; flag to
  pm/ux if quantity turns out to be wanted, it is **not** in scope per this design).
- `.fab` — floating full-bleed button container, `left/right:14px; bottom:16px`.
- `.fld` — form input, 54px tall, 18px radius, matches existing `Field`.
- `.chipbg` — soft accent chip background (`oklch(0.95 0.04 88)`), matches existing
  badge/pill convention.

No new icons needed beyond what's already hand-drawn in `src/components/icons.tsx`
style (chevron-left, settle-up/exchange, users, receipt/list, plus, x, check) — all
24x24 stroke-based, `currentColor`, matching the existing icon set exactly.
