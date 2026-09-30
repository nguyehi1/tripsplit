# Requirements: Shared shopping list with per-item claiming (shopping-list)

Status: ready for architecture/design stages
Inputs: [planning.md](planning.md) (2026-09-19 pm + product-strategist convergence),
[design-reference.md](design-reference.md) (approved visual/UX basis, imported
2026-09-28), and this session's user checkpoint (2026-09-28), which is authoritative
over both where they conflict. See "Decisions this doc locks in" below for exactly
which points came from which source.

## Problem statement

Trip members currently have no shared way to coordinate "who's grabbing what" before
an expense exists — someone remembers halfway through a grocery run that the group
also needs firewood, texts the group chat, and whoever picks it up then has to
manually type a description into the add-expense sheet from memory. There's no link
between "we agreed someone would get this" and "the expense that resulted." This
feature gives a trip a shared, always-visible list of needed items that any member can
add to and claim, and lets a claimer's claimed items pre-fill the description of the
expense they log for it — removing retyping, not changing who owes what. Per
`docs/v2-vision.md`'s carve-out condition, claiming must never become a new place the
settlement number can be wrong or unclear, and skipping the list entirely must remain
a fully valid way to log an expense.

## Decisions this doc locks in

Most of the shape below is planning.md's converged recommendation, unchanged. Three
points are overridden or newly resolved by design-reference.md and this session's
checkpoint — called out explicitly so downstream stages don't silently revert to
planning.md's original text:

1. **Multi-item prefill is in scope for v1** (reverses planning.md's original
   exclusion, per design-reference.md Screen 4 and this session's checkpoint). A user
   can select more than one of their own claimed-unlogged items as toggle pills in the
   add-expense sheet; selected items' names are bundled comma-joined into one expense's
   description field. Still only ever one expense per submission — no splitting one
   claim across multiple expenses, no creating multiple expenses from one submission.
2. ~~**Any real trip member can unclaim any item**~~ **Superseded post-implementation
   (2026-09-29): unclaim is claimer-only after all.** This originally reversed
   planning.md's claimer-only default per design-reference.md Screen 2 and an earlier
   session's checkpoint, but was reversed back after implementation review — confirmed
   with the user. **Current rule**: only the member who currently holds a claim (i.e.
   `claimed_by`) can release it; the × control in "Your bag" is the only place an
   unclaim affordance appears at all, and it's only ever shown to that item's own
   claimer (never to any other member), so this needs no separate UI gate beyond "Your
   bag" already being scoped to the viewer's own claims. Enforced at the RPC layer
   (`unclaim_shopping_list_item`), same pattern as every other write here — never
   trusting a client-supplied member id.
3. **Placeholder members cannot be claimed for** (confirms planning.md's original
   lean — not a change). Claiming is restricted to real, session-backed trip members
   only, consistent with placeholders never being able to hold `expenses.paid_by`
   (ADR 0004).

Everything else in planning.md's "Recommended direction" and hard exclusion list
holds unchanged: description-only prefill (an item never carries a price or amount,
before or after claim), unclaim is gated exactly as point 2 above now describes
(claimer-only, no organizer override), no description edits to an item after it's
claimed (a never-claimed item can still be deleted outright by whoever added it,
pre-claim only), no cost-splitting across claimers, no claim notifications, no
cross-trip "common items" template, no quantity field (flagged as explicitly out of
scope by design-reference.md's own component notes). Amount is always typed by hand in
the add-expense sheet — never auto-filled, even when one or more items are selected.

**Sequencing**: per this session's checkpoint, shopping-list proceeds now, ahead of
the still-open ROADMAP items (invite-code RPC throttle live-deployment
re-verification, `get_trip_summary`'s invite-code leak, the `check-email` open
redirect, missing privacy policy/ToS) and ahead of the not-yet-built expense-delete
feature. This is an explicit, accepted-risk sequencing call, not an oversight.

## Known limitation, accepted up front

A "Bought" item links to the expense it produced (`expense_id`), and design-reference.md's
Screen 5 requires tapping it to open that expense. Because expense-delete doesn't exist
yet, **there is currently no UI path to delete or undo that expense**, and therefore
none to un-link or revert the shopping-list item either — a bought item is permanently
bought in this v1, short of an edit to the expense's description (edit-own-expense is
shipped and unaffected). This is accepted as a known gap per this session's checkpoint,
not something this feature must solve; the architecture stage should still leave the
data model able to revert an item to claimed-unlogged later without a schema change,
since expense-delete is expected to need exactly that when it ships.

## Scope

### Data & lifecycle (functional, not a schema spec — architecture stage owns the shape)
- A shopping-list item belongs to exactly one trip, has free-text description, records
  who added it, and moves through a status lifecycle: **open** (unclaimed) → **claimed**
  (by exactly one real trip member — no co-claim) → **logged** (linked to exactly one
  expense via `expense_id` after the claimer submits that expense).
- Claim races: two members attempting to claim the same open item concurrently must
  result in exactly one successful claim, enforced at the data layer (not just in the
  UI) — this is the vision doc's own guardrail against claiming becoming a new
  disputed/unclear state.
- Unclaim moves a claimed item back to open (available for anyone to claim again),
  performed via the × control by the item's current claimer only (decision 2 above).
- Pre-claim delete: an item that has never been claimed can be deleted outright by
  whoever added it. Deleting a claimed or logged item is not supported in v1.
- No description edits once an item has been claimed (matches planning.md's exclusion,
  unchanged).
- Gating: adding, claiming, unclaiming, and deleting items are all organizer/member
  mutations subject to the same hide-until-verified rule already applied to other
  mutating actions (simplified-onboarding), and blocked once the trip is
  locked/completed, mirroring the existing "no changes after settlement" pattern used
  elsewhere in the app.

### UI acceptance criteria (basis: design-reference.md's five screens — content/behavior
required; exact visuals/spacing/tokens are the ux-designer stage's call, not locked
here)
1. **List tab** (Screen 1): the trip screen's tab control gains a third tab alongside
   the existing two, showing a "To get" section (unclaimed items, tap-to-claim) and a
   "Bought" section (logged items, tagged with the payer) below it. An "Add an item"
   floating action is reachable from this tab at all times the tab itself is reachable
   (i.e., subject to the same gating as other mutations, not additionally hidden).
   Each row shows the item's description and who added it; a claimed-by-someone-else
   row visibly shows who claimed it.
2. **"Your bag" / grabbed state** (Screen 2): once the current user has claimed at
   least one item, a distinct section shows just their own claimed-unlogged items, each
   with a release (×) control, per decision 2 above usable only by that item's own
   claimer. The tab housing the add-expense entry point (Expenses) shows a count badge
   of the current user's claimed-unlogged
   items whenever that count is greater than zero, and no such badge when it's zero.
3. **Add-an-item sheet** (Screen 3): supports adding one or more items in a single
   submission (multiple text fields, add-another affordance), disabled/inert submit
   when every field is empty, and no per-item privacy/visibility option — every added
   item is visible to the whole trip.
4. **Add-an-expense sheet, extended** (Screen 4): when the current user has any
   claimed-unlogged items on this trip, the sheet shows them as multi-selectable
   toggles; selecting/deselecting updates the description field live as a comma-joined
   list of the selected items' names (decision 1 above); the amount field is never
   auto-filled by this interaction, on either of the sheet's existing two entry call
   sites (per ADR 0008). Deselecting an item that was toggled removes only its own
   contribution from the joined description text without disturbing other user-typed
   or other-item text in the field (exact text-merge behavior when the user has
   hand-edited the field is an open question for architecture/ux, not resolved here —
   see below).
5. **Post-submit state** (Screen 5): on successful expense submission, every item that
   was selected in step 4 moves to "logged" and links to the new expense; the List
   tab's "Bought" section reflects this without a manual refresh; tapping a bought item
   navigates to the expense it's linked to.

### Non-goals (explicitly excluded from v1)
- Any amount/price on a shopping-list item, at add time or claim time.
- Claiming or unclaiming on behalf of a placeholder member.
- Co-claiming (more than one claimer per item) or cost-splitting an item's eventual
  expense across multiple claimers.
- Editing an item's description after it has been claimed.
- Deleting a claimed or logged item.
- Claim/unclaim notifications (email, push, or in-app toast to other members).
- A cross-trip "common items" template or reusable list.
- A quantity field.
- Any delete/undo/revert path for a logged item or its linked expense (blocked on the
  not-yet-built expense-delete feature — see "Known limitation" above).
- Fixing or re-sequencing ahead of any of the currently-open ROADMAP items
  (invite-code RPC hardening's live re-verification, `get_trip_summary`'s invite-code
  leak, `check-email`'s open redirect, missing privacy policy/ToS) — this feature does
  not touch or resolve any of them.

### Open items carried forward for the next stages (not resolved here)
- Exact text-merge behavior in the add-expense description field when a user hand-types
  around auto-inserted item names (design-reference.md flags the live-update caret but
  not this edge case) — ux-designer/architect call.
- Nav/IA specifics beyond "a third tab" (icon choice, badge placement details) —
  ux-designer stage, per design-reference.md's component notes.
- DB-level claim-race constraint and RLS policy shape, following the existing
  `is_trip_member`/`is_trip_open` pattern (ADR 0002, ADR 0004) — architecture stage.

## Acceptance criteria (testable, for `qa`)
- [ ] Any verified real trip member can add one or more items via the add-item sheet;
  each appears immediately in "To get" for every trip member.
- [ ] Tapping an open item's circle claims it for the current user; it moves to "Your
  bag" for that user and shows as claimed-by-that-person to everyone else.
- [ ] Two members cannot both successfully claim the same item — a concurrent claim
  attempt on an already-claimed item fails for the second caller (verified at the data
  layer, not just via UI race conditions in manual testing).
- [ ] Only the member who currently holds an item's claim can unclaim it via the ×
  control (it returns to "To get" as open); a different member attempting to unclaim
  someone else's claim fails cleanly, verified at the data layer (the RPC), not just by
  the UI never offering that member a control to try it with.
- [ ] An item that has never been claimed can be deleted by the member who added it; a
  claimed or logged item cannot be deleted by anyone through this feature's UI.
- [ ] A placeholder member never appears as a claim option and cannot be set as
  `claimed_by` through any code path.
- [ ] Adding, claiming, unclaiming, and deleting items are all hidden/blocked for an
  unverified organizer and for a locked/completed trip, consistent with existing
  mutation gating elsewhere in the app.
- [ ] In the add-expense sheet, a user with claimed-unlogged items sees them as
  selectable pills; selecting two or more and submitting produces exactly one expense
  whose description is the comma-joined list of the selected items' names, and whose
  amount is whatever the user typed (never auto-filled).
- [ ] On successful submission, every item selected in that submission becomes
  "logged," links to the new expense, and moves to "Bought" on the List tab.
- [ ] Tapping a "Bought" item navigates to its linked expense.
- [ ] The Expenses tab shows a numeric badge equal to the current user's
  claimed-unlogged item count when greater than zero, and no badge at zero.
- [ ] Skipping the shopping list entirely (adding an expense with no items selected)
  continues to work exactly as it does today, unchanged.

## Semver classification

**Feature** (backward-compatible, minor bump). This is wholly additive: a new tab, a
new table/RPCs, and one new conditionally-rendered block in the existing add-expense
sheet that only appears when the current user has claimed-unlogged items. No existing
route, schema field, or default UI behavior changes for a user who never touches this
feature — the "skip it entirely" path is required to keep working identically per the
vision doc's own carve-out condition and is asserted directly in the acceptance
criteria above.
