# Design: Shared shopping list with per-item claiming (shopping-list)

Inputs: [requirements.md](requirements.md) (scope/acceptance criteria — authoritative),
[design-reference.md](design-reference.md) (approved visual/UX basis for the five core
screens — treated as settled, not reinterpreted below), `src/components/ui.tsx`,
`src/app/trip/[id]/page.tsx`, `src/app/trip/[id]/trip-tabs.tsx`,
`src/app/trip/[id]/add-expense-sheet-content.tsx`, `src/app/trip/[id]/verify-inline.tsx`,
`src/app/trip/[id]/expense/[expenseId]/edit/page.tsx`, `src/app/trip/[id]/invite/page.tsx`.

This doc does **not** redraw design-reference.md's five screens (List tab, Your bag,
Add-an-item sheet, extended Add-an-expense sheet, post-submit Bought state) — it
references them by name and adds only the states, copy, and interaction rules they
don't cover: empty/loading/error states, the two open interaction questions, a11y, and
exact nav placement. Warm-paper only, per design-reference.md's own scope note — no
dark-mode work here.

## 1. Navigation & IA

- **Tab order**: `Expenses / Details / List`, left to right, exactly as design-reference
  Screen 1 states. `TabSwitch` (`src/components/ui.tsx`) gains a third option; no visual
  change to that component beyond a third segment — it already renders N options.
- **No new TopBar icon.** design-reference's Screen 1 nav-row description ("back
  chevron, trip name, settle-up icon, members icon, receipt/List icon") reads as a
  literal 1:1 icon list, but this app's existing TopBar `trailing` icons
  (`VerifiedActionIcons`: roster, settle-up) are all shortcuts to **separate routes**
  (`/trip/[id]/invite`, `/trip/[id]/settle-up`), not to in-page tabs — Expenses/Details
  have never had their own TopBar icon shortcut, only the `TabSwitch` pill. Adding a
  redundant icon button that does the same thing as tapping "List" would be a new,
  un-precedented pattern (two affordances for one destination) for no functional gain.
  **Decision: the List tab is reached only via the `TabSwitch` pill**, like Expenses and
  Details today. The icon set design-reference lists is read as "icons used somewhere
  across these five screens" (plus, x, check, avatar), not a literal nav-bar spec. Flag:
  if the user/PM specifically wants a persistent List shortcut from other tabs, that's a
  small, separable addition — not blocking v1.
- **One FAB slot, contextual by tab**, not a second floating button. The existing
  `BottomBar` capsule (`Add an expense` / locked-muted variant, hidden entirely while
  unverified) already occupies the one-FAB-per-screen slot this app uses everywhere.
  design-reference's `.fab` (`left/right:14px; bottom:16px`) is visually identical to
  that same capsule. Stacking a second floating pill above/beside it would crowd a
  one-handed mobile layout and has no precedent in this app. **Decision: the BottomBar
  capsule becomes tab-aware**:
  - Expenses / Details tab active → unchanged: "Add an expense" (or the locked-muted
    "Trip is locked — no more expenses").
  - List tab active → "Add an item" (or locked-muted "Trip is locked — the list is
    read-only").
  - Unverified organizer (hide-and-reveal state) → hidden on every tab, unchanged.
- **Deep-linkable**: extend `page.tsx`'s existing `tab === "details" ? "details" :
  "expenses"` default-tab logic to also accept `tab=list`, so `/trip/[id]?tab=list`
  works the same way `?tab=details` already does. The Bought-item tap-through (section 7)
  relies on returning to `/trip/[id]?tab=list`, not the bare trip URL, so the user lands
  back where they came from rather than being reset to Expenses.

## 2. Screen 1 — List tab: states not shown in design-reference

**Loading** (first paint, fetching items): plain text under the TopBar/TabSwitch, no
spinner — matches this app's one loading convention everywhere else (`edit/page.tsx`,
`/trips`, `/join/[code]`):
> Loading your list…

…with `DelayedLoadingLine` (`src/components/delayed-loading-line.tsx`) underneath,
unchanged, showing "Taking a little longer than usual…" only past 4s.

**Empty — nothing on the list yet** (no items ever added to this trip): a single
unified empty state replaces both "To get" and "Bought" — showing an empty "Bought"
card under a populated "To get" (or vice versa) reads as broken, not calm. Reuses this
app's established empty-state convention (Miso cameo + short line — see
`trip-tabs.tsx`'s "No expenses logged yet — Miso's ready when you are."):

> [Miso image, 24px, decorative] Nothing on the list yet — Miso's ready when you are.

The "Add an item" FAB stays visible/active below this (subject to the gating in section
6) — the empty state doesn't block the entry point that fixes it.

**"To get" empty, "Bought" populated** (everyone's grabbed everything currently on the
list): keep the "Bought" section, replace "To get"'s card body with a short inline line,
no Miso repeat (mascot is reserved for the all-empty first-time state):
> All caught up — nothing left to grab.

**"Bought" empty, "To get" populated** (nothing logged yet): omit the "Bought" section
entirely — no header, no empty card. Matches how the Expenses tab has no "nothing
settled yet" ghost section either; an empty section header with nothing under it reads
as a bug, not a state.

**Error loading the list** (fetch failed): same terse, non-retry-button convention as
`page.tsx`'s own "Couldn't load this trip — you may not be on it." (this app has no
retry buttons anywhere for a failed read — consistent, not an oversight):
> Couldn't load the list — try again in a moment.

**Locked trip**: sections render normally (items stay browsable — same "still visible,
just frozen" treatment as the Expenses tab post-lock), but every circle/× becomes inert
(plain, non-interactive — not a disabled-looking button, just no longer a `<button>` at
all, mirroring how a non-editable Expenses-tab row today is a plain `<div>`, not a
disabled `<Link>`). BottomBar shows the locked-muted "List" variant from section 1.

**Unverified organizer** (hide-and-reveal state, pre-verification owner viewing their
own trip): List tab itself stays visible and browsable — parity with Expenses/Details,
which are never hidden pre-verification either, only *mutations* are. Circles/×/"Add an
item" are hidden the same way `VerifiedActionIcons`/`VerifiedBottomBarContent` hide
today (not shown-disabled — genuinely absent), relying on the existing
`InlineVerifyWidget` higher on the page as the one CTA. See section 6 for the separate,
already-verified-session-but-unverified-invitee case, which behaves differently.

## 3. Screen 2 — "Your bag": states not shown in design-reference

**Who can tap the × (superseded, 2026-09-29)**: requirements.md's decision 2
originally read "any real trip member can unclaim any item" (design-reference.md's own
source annotation for this control said the same — see that file's now-added historical
note). That was reversed post-implementation: unclaim is claimer-only. This section's
own wording ("shows just their own claimed-unlogged items, each with a release (×)
control") already only ever puts the × in front of the item's own claimer — "Your bag"
is scoped to the viewer's own claims, and no other row anywhere in this feature (not
even "To get"'s claimed-by-someone-else rows) ever shows an unclaim control — so no
visual/UX change follows from the reversal; it only tightens what was previously a
looser requirements-level permission than this section's UI ever actually exposed.

**Appears/disappears live**: the moment the current user's claimed-unlogged count
crosses 0→1, "Your bag" fades/slides in above "To get" (spring, matching this app's
existing sheet/capsule motion vocabulary — `--ease-spring`); the moment it drops back to
0 (last item unclaimed or logged), it disappears the same way rather than lingering as
an empty card. No separate "Your bag is empty" state exists — it simply isn't rendered
at 0.

**Badge**: the Expenses tab pill grows the count badge described in design-reference
Screen 2 whenever the current user's claimed-unlogged count is > 0; absent at 0
(matches AC verbatim). Exact non-visual text (design-reference doesn't specify this):
- `title` attribute on the badge (matches this app's existing `IconButton`/
  `IconLinkButton` tooltip convention): `3 items in your bag`
- The tab button's accessible name gets the count appended rather than just the number
  sitting there unlabeled for a screen reader: `Expenses — 3 items in your bag, ready to
  log` (visually-hidden text, badge itself stays `aria-hidden` since it's now redundant
  with the accessible name).
- At exactly 1 item, still "1 item" (not "1 items") — `n === 1 ? "item" : "items"`.

## 4. Screen 3 — "Add an item" sheet: states not shown in design-reference

**Default/blank**: one empty field, focused, placeholder text matching the sheet's
established input tone (`"Cabin, lift tickets, groceries…"` on the add-expense sheet):
> Placeholder: `Firewood, sunscreen, ice…`

**Submit disabled at zero** (per AC — already required, exact copy):
> Button label always `Add an item` at zero non-empty rows (never `Add 0 to list`) — the
> design's own note that the button reflects a live count means the count only appears
> once it's ≥1: `Add 1 to list`, `Add 3 to list`, etc. Disabled/muted (existing `muted`
> `Button` variant) at zero.

**Soft field cap** (not in requirements — a UX guardrail, not a locked product
decision): cap "+ Add another item" at **8 fields**, hiding the dashed row past that —
prevents an unbounded scroll of blank inputs on a small screen. Flag: arbitrary: pm/
architect should feel free to change this number; it's not tied to any backend limit
that's been specified.

**Submitting**: button label `Adding…`, disabled, matching `add-expense-sheet-content`'s
`submitting ? "Adding…" : "Add an expense"` convention exactly.

**Submit failure** (network/RPC error): inline text under the button, same placement/
style as every other form in this app (`text-terracotta`, no toast — this app has no
toast component anywhere, confirmed by grep; don't introduce one here):
> Couldn't add those — try again.

This assumes the add-multiple-items submission is atomic (all rows succeed or none do)
— **flag to architecture**: if the RPC can't guarantee that, this copy and the
all-or-nothing UX it implies need revisiting (partial success would need per-row error
state, which the sheet doesn't currently have anywhere to show).

**Success**: sheet closes back to the List tab (same `router.push` + `router.refresh()`
pattern as `add-expense-sheet-content.tsx`), new item(s) appear at the bottom of "To
get" without a manual refresh (AC requirement, already covered by the refresh call).

## 5. Screen 4 — "Add an expense", extended: states not shown in design-reference

**Loading claimed items** (first render of the sheet, before the "From your bag" query
resolves): if it resolves within a normal frame or two, no visible state is needed —
don't add a skeleton for something this fast. If it's still unresolved after ~1s, show
the kicker with 2 muted placeholder pill shapes (no text) rather than nothing, so the
block doesn't pop in and shift the amount/description fields below it.

**No claimed-unlogged items**: block is omitted entirely — already specified in
requirements/design-reference, restated here for completeness of the state inventory.

**Fetch of claimed items fails**: per the roadmap's optional-list guardrail ("skipping the
shopping list entirely must remain a fully valid way to log an expense"), this must
never block the primary add-expense flow. **Decision**: don't silently omit the block
(a user who knows they have claimed items and sees nothing would reasonably think the
app lost their claim) and don't hard-block submission either — show the kicker with a
muted inline note, no pills, non-blocking:
> Couldn't load your bag — you can still add this expense the usual way.

**Toggle pill states**: unselected (`ink/6%` bg, per design-reference), selected
(accent-filled + checkmark, per design-reference), and — new here — **disabled while
submitting** (same `disabled:opacity-60` treatment as the rest of this app's buttons),
so a double-tap mid-submit can't re-trigger the description merge logic.

## 6. The description-field merge rule (resolves the open item)

design-reference specifies the *visible* behavior (comma-joined append, live caret,
deselect removes only that item's own text) but not the exact algorithm for hand-typed
text — flagged explicitly by the PM stage as unresolved. Resolution:

1. The field has exactly one hand-typed/free region plus zero or more **pill-owned
   fragments**, tracked by which pill inserted them (by item id), not by re-matching
   text. Hand-typed content — including a blank field — always sits first (leftmost);
   pill fragments are always **appended** after it, in the order the user selected the
   pills, each joined with `, `.
   - Blank field, select "Firewood" → `Firewood`
   - Blank field, select "Firewood" then "Ice" → `Firewood, Ice`
   - Typed `Gas for the rental car`, then select "Firewood" → `Gas for the rental car,
     Firewood`
2. Deselecting a pill removes **only** that pill's own fragment (its name plus its own
   joining comma/space) from wherever it currently sits — the hand-typed prefix and any
   other pill's fragment are untouched and keep their relative order. Selecting A, B, C
   then deselecting B: `Gas for the rental car, Firewood, Ice` → `Gas for the rental
   car, Firewood`.
3. **If the user manually edits the field anywhere** after a pill was selected —
   including editing inside a pill's own inserted text, e.g. changing `Firewood` to
   `Firewood (2 bags)` — that pill's fragment stops being tracked as belonging to it.
   From that instant the whole field is ordinary free text, left exactly as the user
   left it, and **that pill's toggle visually deselects** (checkmark disappears) so the
   UI never shows a pill "selected" for text that no longer matches it. Re-tapping the
   pill re-appends its name fresh, onto whatever's currently in the field, rather than
   trying to reconstruct a prior position.
4. This is a client-side state-tracking rule (an ordered list of `{ itemId, text }`
   fragments plus a hand-typed remainder), not a backend concern — flagging to
   architecture only to confirm it's implementable as local component state with no
   server round-trip per keystroke.

## 7. Screen 5 — Bought / tap-through: the resolved open question

**What existing tap-through does today**: `trip-tabs.tsx`'s Expenses list only makes a
row a `<Link>` when `expense.payer.id === you?.id && !isCompleted` — every other row is
a plain, non-interactive `<div>`. `edit/page.tsx` (the only expense-detail screen that
exists) hard-gates on `expense.paid_by !== user.id` and shows a generic "Couldn't load
this expense." to anyone else. **There is no read-only expense view anywhere in this
app today** — non-payers simply can't open an expense at all.

design-reference's Screen 5 requires tapping *any* Bought item to open its linked
expense, for *any* trip member, not just its payer — this is a real gap, not a copy
omission. **Decision (flagged — see below)**: extend the existing
`/trip/[id]/expense/[expenseId]/edit` route with one more render branch, rather than
building a separate read-only page:

- Viewer is the payer **and** the trip isn't locked → opens exactly as it does today
  (editable, "Save changes"), unchanged.
- Viewer is not the payer, **or** the trip is locked → same screen shell (amount/
  description/date card), but every field renders disabled/read-only, no "Save
  changes" button. Caption text depends on which condition applies:
  - Not the payer: `Only {payer's display name} can edit this expense.`
  - Locked (regardless of payer): reuse the existing locked copy verbatim — `This trip
    is locked — the organizer already settled it up, so expenses can no longer be
    edited.`
- No verification gate on viewing (matches every other read path in this app — Expenses/
  Details tabs are browsable unverified; only mutations are gated).
- Close/back returns to `/trip/${id}?tab=list` (not the bare trip URL), so the viewer
  lands back on the List tab they came from.
- Fetch failure opening the linked expense: `Couldn't open that expense — try again.`

**Flag for PM/architect**: this is a small but real scope addition beyond
design-reference's five screens and beyond every existing tap-through precedent in the
app, which is strictly payer-and-unlocked-only. If a read-only view for non-payers is
judged out of scope for this pass, the fallback is narrowing the acceptance criterion to
match today's precedent exactly — only payer-owned, unlocked Bought items are tappable;
everyone else's Bought rows render as plain, non-interactive rows (visually identical,
no tap affordance), same as a non-editable Expenses-tab row today. Either is buildable;
this doc's default assumes the first (full tap-through, matching design-reference's
literal spec) since that's what was explicitly approved in Screen 5.

## 8. Pre-claim delete — not depicted in design-reference, required by AC

design-reference's rows show no delete affordance at all, but the requirements lock in
"an item that has never been claimed can be deleted by whoever added it" as a testable
AC. This needs UI that doesn't exist in the reference:

- A small trailing `×`/trash control appears only on an open (unclaimed) row **the
  current user added**, at the row's trailing edge — same visual slot "Your bag"'s
  unclaim `×` occupies, different rows/meaning, so it doesn't read as a new pattern.
- Tapping it doesn't delete immediately — this app's one existing precedent for a
  destructive action (`invite/page.tsx`'s remove-member flow) is an **inline
  expand-in-place confirm**, not a modal, not instant. Mirror it exactly:
  > Delete "Firewood"? [Cancel] [Delete]
  Submitting shows `Deleting…` on the confirm button (matching `Removing…`'s tense);
  failure: `Couldn't delete that — try again.` inline, same placement as the roster
  page's `removeError`.
- The control disappears the instant the item is claimed by anyone (including the
  adder) — matches the "pre-claim only" rule; no explanation copy needed since it just
  stops being there, same as how claimed rows already look structurally different.

## 9. Cross-cutting edge cases

**Claim race lost** (tapped an open item, someone else claimed it a moment earlier):
optimistic-tap reverts instantly; the row updates to reflect the real claimer (avatar +
"`<Name>`'s got this"); a transient, non-blocking inline line appears at the top of the
"To get" card for ~2.5s then fades — this app has no toast system, so this is the
lightest-weight new pattern that still doesn't require one:
> Too slow — {name} already grabbed that.

**Unclaim/delete attempted on a since-locked trip** (stale UI — trip locked in another
tab between load and tap): inline error, phrasing matching the existing locked-edit copy
family:
> This trip is locked — the organizer already settled it up, so the list can't be
> changed anymore.

**Unclaim/delete/claim/add attempted while unverified** — two distinct existing
patterns in this app apply to two distinct people, not one:
- **Unverified organizer viewing their own trip** (hide-and-reveal): controls are
  hidden, not tappable — this case shouldn't be reachable through the UI at all (see
  section 2). If it is somehow reached (e.g. a stale client), fail the same way as any
  other unexpected-state error: `Couldn't do that — try refreshing the page.`
- **Verified-session-but-unverified-email invitee** (attempt-then-redirect, matching
  `add-expense-sheet-content.tsx`'s `requireVerifiedSession` exactly): the control is
  visible and tappable; on submit, verification fails server-side, and the flow redirects
  to `/check-email?trigger=invitee-shopping-list&next=...&back=...`, same shape as the
  existing `invitee-expense` trigger. **Flag to architecture**: resuming the actual
  claim/unclaim/add after the redirect needs a small "pending shopping-list action"
  mechanism paralleling `savePendingExpenseDraft`/`takePendingExpenseDraft`
  (`src/lib/pending-action.ts`) so the user's tap isn't silently dropped — without it,
  the safe fallback is landing back on the List tab with nothing pre-applied and a line
  reading `You're verified — tap it again.`

**Placeholder members**: no UI needed — placeholders have no session, so nothing
placeholder-owned can ever be the acting user for a claim/unclaim/add/delete. They
simply never appear as an option anywhere in this feature, the same way they already
never appear as `paid_by`.

**Expense created but item-linking fails** (the create-expense and mark-items-logged
steps aren't atomic at the data layer): since an item never carries an amount, this
can't produce a wrong balance — only a stale item status (it'd still show as
claimed-unlogged after its expense already exists). **Decision**: never roll back or
block the expense on this secondary failure — the expense succeeding is what matters for
the optional-list guardrail in the roadmap's product principles. No user-facing message; next time the List tab
loads it shows whatever the actual DB state is. **Flag to architecture**: this is exactly
the failure mode a single-transaction RPC (create expense + mark items logged together)
would eliminate — worth doing at that layer if cheap, but not a blocking UX requirement
either way since it's a staleness bug, not a correctness-of-money bug.

## 10. Copy reference (exact strings)

| Context | Copy |
|---|---|
| Tab label | `List` |
| "To get" hint | `tap a circle to grab it` |
| Open item caption | `{Name} added` |
| Claimed-by-other caption | `{Name}'s got this` |
| Item note (optional) | `{Name} added · {note}` |
| FAB, List tab | `Add an item` |
| FAB, List tab, locked | `Trip is locked — the list is read-only` |
| FAB, Expenses/Details tab | `Add an expense` (unchanged) |
| FAB, Expenses/Details tab, locked | `Trip is locked — no more expenses` (unchanged) |
| Empty list (first time) | `Nothing on the list yet — Miso's ready when you are.` |
| "To get" empty, bought populated | `All caught up — nothing left to grab.` |
| List load error | `Couldn't load the list — try again in a moment.` |
| Loading | `Loading your list…` |
| Add-item field placeholder | `Firewood, sunscreen, ice…` |
| Add-item submit, N=0 | `Add an item` (disabled) |
| Add-item submit, N>0 | `Add {n} to list` |
| Add-item submitting | `Adding…` |
| Add-item failure | `Couldn't add those — try again.` |
| Claimed-items fetch failure (add-expense sheet) | `Couldn't load your bag — you can still add this expense the usual way.` |
| Delete confirm | `Delete "{item}"?` with `[Cancel] [Delete]` |
| Delete submitting | `Deleting…` |
| Delete failure | `Couldn't delete that — try again.` |
| Claim race lost | `Too slow — {name} already grabbed that.` |
| Mutation on locked trip | `This trip is locked — the organizer already settled it up, so the list can't be changed anymore.` |
| Unexpected-state fallback | `Couldn't do that — try refreshing the page.` |
| Post-redirect resume fallback | `You're verified — tap it again.` |
| Expense view, not payer | `Only {payer name} can edit this expense.` |
| Expense view, locked | `This trip is locked — the organizer already settled it up, so expenses can no longer be edited.` (existing, reused) |
| Expense open failure | `Couldn't open that expense — try again.` |
| Expenses-tab badge tooltip | `{n} item{s} in your bag` |
| Expenses-tab badge a11y | `Expenses — {n} item{s} in your bag, ready to log` |

## 11. Accessibility

- **Tap-to-claim circle** (unclaimed row): a real `<button>`, not a styled `<div>`.
  `aria-label="Claim '{item description}'"`. `aria-describedby` pointing at the row's
  caption text (`"{Name} added"`) so a screen reader announces the button and its
  context together, not just "Claim 'Firewood', button."
- **Unclaim `×`** (Your bag row): `<button aria-label="Unclaim '{item description}'">`.
- **Claimed-by-someone-else avatar**: `aria-hidden="true"` — the adjacent caption
  ("`{Name}`'s got this") already states the same information in text; duplicating it
  via the avatar's accessible name would be redundant, not additive.
- **Bought-row avatar**: **not** `aria-hidden` — design-reference deliberately drops the
  visible caption on Bought rows, so the avatar (plus the whole row's `aria-label`,
  below) is the *only* place "who bought this" lives. Whole row:
  `aria-label="Bought by {name} — tap to view the expense"`.
- **Toggle pills** (add-expense "From your bag"): real `<button role="button"
  aria-pressed={selected}>`, not just a color change — `aria-pressed` is the correct ARIA
  state for a toggle and is already paired with a non-color affordance (checkmark icon
  prefix) per design-reference, so this isn't relying on color alone either visually or
  for assistive tech.
- **Delete control**: `<button aria-label="Delete '{item description}'">`.
- **Circle/× touch targets**: the *visual* circle is 24px per design-reference, but the
  tappable hit area should extend to at least 44×44px (invisible padding) — this is a
  list people use one-handed, often mid-errand. Flag as an implementation detail for
  engineering, not a visual change.

## 12. Mobile/responsive

This app has exactly one layout tier (`max-w-md`, single column) and this feature
doesn't add a second one — every state above is written against that. Specific notes:
- FAB position/safe-area handling reuses `BottomBar`'s existing gradient + `pb-6`
  treatment unchanged (section 1's "one FAB slot" decision means there's no new
  safe-area math to redo).
- Add-item sheet reuses `SheetShell`'s existing `overflow-y-auto` body, which already
  handles the on-screen keyboard covering lower fields on a small phone — no new
  behavior needed.
- The claim-race toast-equivalent (section 9) is capped at 2.5s and non-blocking
  specifically because a member is often claiming items while walking through a store,
  not sitting still reading a screen — it shouldn't demand a dismiss tap.

## 13. Summary of flagged product/architecture decisions

Restating everything above that has real product implications, so it doesn't get lost
in the detail:

1. **Bought-item tap-through for non-payers requires a new read-only render branch on
   the existing edit-expense route** — real, if small, scope beyond design-reference's
   five screens and beyond every existing tap-through precedent in this app (section 7).
   Recommended default: build it. Fallback if descoped: narrow tap-through to
   payer-owned, unlocked items only.
2. **Pending shopping-list action after an unverified-invitee redirect** (section 9)
   needs a small mechanism paralleling `savePendingExpenseDraft` or the user's tap is
   silently dropped. Fallback without it: return to the List tab with "You're verified —
   tap it again."
3. **Add-multiple-items atomicity** (section 4) — the "Couldn't add those — try again."
   copy assumes all-or-nothing; partial success needs its own design if the RPC can't
   guarantee atomicity.
4. **Create-expense + mark-items-logged atomicity** (section 9) — not financially
   risky (items carry no amount) but worth an atomic RPC if cheap, to avoid stale
   claimed-unlogged items lingering after their expense already exists.
5. **No new TopBar icon for List** (section 1) and **one shared, tab-aware FAB instead
   of a second floating button** (section 1) — both deviate from a literal reading of
   design-reference's nav-row description, with reasoning given; flagging in case the
   user specifically wanted the extra shortcut icon.
