# 0012. Detecting "you were removed" without an audit table, and rendering a removed member's historical expenses

Status: accepted
Date: 2026-09-22

## Context

`docs/features/remove-member-access/requirements.md` locks in two constraints that pull in
opposite directions for this feature's UX requirements:

1. **Hard-delete the `trip_members` row** (not soft-delete/status column) — the row, including
   the member's `display_name`, is gone the moment they're removed or leave. No new logging
   table either ("no audit trail beyond what's naturally reconstructable... matches the existing
   placeholder-removal precedent").
2. But the notification-mechanism section and AC4/AC12 require that the removed/left member, on
   a *later* visit ("from a bookmark, the invite link, or navigation" — not necessarily the same
   browser session as the removal itself, especially for organizer-removal, which happens on a
   *different* device from the removed member's), see an explicit "you're no longer on this
   trip" state rather than the same generic view a stranger with the link would see.

Those two requirements are in tension: (2) needs *some* way to distinguish "this session used to
be a member here" from "this session never was," on a later, independent request — but (1) rules
out the two most direct ways to store that fact (a status flag on the row, or a new table
recording who/when).

Separately, but discovered while designing the fix for (2): `src/lib/data/trips.ts`'s
`getTripView` resolves each expense's `payer` by looking up the paying member's *current*
`trip_members` row. That lookup has always succeeded before this feature, because nobody could
previously stop being a member while still having `paid_by` rows attached to their user id. Once
removal/leaving exists, a remaining member's expense list will contain expenses paid by someone
who is no longer in `memberById` — the existing code resolves this to `undefined` and crashes on
render (`expense.payer.initials`, etc. — see architecture.md's "Impact analysis — the ghost-payer
bug" for the exact code path). This is a second data-model consequence of hard-delete plus
"expenses are untouched" (scope decision 4) that needed its own decision, not just a bugfix
reflex — it's really the same underlying question as (2): what does the UI show for an identity
that `trip_members` can no longer describe?

## Decision

**For "you were removed" detection**: reconstruct it from `expenses`, which already exists and
is explicitly untouched by removal. A new `security definer` RPC,
`was_removed_from_trip(_trip_id)`, returns true iff the caller (a) is not anonymous, (b) is not
currently a `trip_members` row on that trip, and (c) has at least one `expenses.paid_by = auth.uid()`
row on that trip. `renderTripDashboard`'s existing "not currently a member" fallback branch calls
this before falling back to the generic public-summary view, and renders a new, distinct
"removed from this trip" screen when it's true.

This is deliberately *not* a new stored fact — it's a boolean derived, at request time, from data
(`expenses.paid_by`) that already exists for the ledger's own reasons and was already going to be
preserved untouched regardless of this decision. No `removed_at`, no `removed_by`, no new row of
any kind is written by removal/leaving.

**Known, accepted gap**: a member removed/left before ever logging an expense on that trip has no
signal to reconstruct from, and sees the pre-existing generic fallback instead of the explicit
one. Accepted rather than closed, per "Alternatives considered" below.

**For ghost-payer rendering**: `getTripView` synthesizes an in-memory-only "ghost payer" entry
(display name a fixed placeholder, `isRemoved: true` marker) for any `paid_by` id that doesn't
resolve to a current `trip_members` row, used *only* to give `expense.payer` a defined value.
This synthetic entry is never added to the roster (`members`) returned to the UI and never passed
into `computeBalances` as a share-owing party — it exists solely so the expense list can render
without crashing and can style a former member's row distinctly.

## Alternatives considered

- **Soft-delete / `left_at` or `removed_at` column on `trip_members`.** Would trivially solve
  both problems (row stays queryable, has the real display name, and "was I removed" is a direct
  lookup). Rejected — this is the data-model shape requirements.md explicitly locked out in favor
  of hard-delete, for reasons already settled before this doc (see requirements.md's "Data model
  decision" section); re-opening it here would relitigate a decision this pass isn't scoped to
  revisit.
- **New tombstone table** (e.g. `trip_member_removals(trip_id, user_id, removed_at)`, no
  "removed_by"/reason column) written by the same transaction as the delete. Would fully close
  the "never logged an expense" gap the chosen approach leaves open, and is arguably not the
  "audit log of who removed whom and when" the non-goals list excludes, since it would carry no
  "who removed" field. Rejected anyway: it's still a new table whose only purpose is recording
  that a specific user was removed from a specific trip at a specific time, which is close enough
  to what scope decision 8 and the "no audit log... of who removed whom and when" non-goal are
  guarding against that shipping it without re-confirming with product first would be a scope
  reinterpretation, not an implementation detail — the boolean-from-`expenses` approach fully
  respects the letter and spirit of the locked decision with no new storage at all, at the cost of
  the disclosed gap.
- **Client-local marker (`localStorage`), same pattern as `src/lib/remembered-email.ts`.**
  Considered for both problems. Rejected as the *primary* mechanism because it can only ever work
  when the state-observing device is the same device that performed the mutating action — true
  for a self-leaver checking their own device later, but never true for an organizer-removed
  member, whose own browser never runs any code at removal time (the organizer's browser does).
  Since organizer-removal is the harder and more explicitly-specified half of this feature
  (AC1–10), a mechanism that structurally can't cover it isn't a viable primary solution; the
  immediate post-action case it *would* cover is already handled for free by ordinary
  post-mutation UI state (the actor's own screen already knows their own RPC call just
  succeeded), so it adds no coverage the chosen approach doesn't already provide elsewhere.
- **Do nothing / accept the generic fallback for every removed member.** Rejected — fails AC4 and
  AC12 outright, not a partial/degraded version of them.
- **For ghost-payer rendering: drop or hide the removed member's past expenses from the list
  instead of rendering them with a placeholder name.** Rejected outright — directly contradicts
  scope decision 4 and AC5/AC13 ("past expenses remain in the expense list... unchanged"), and
  would be a silent data-loss-looking behavior change to the ledger for a feature that explicitly
  promises the ledger is untouched.

## Consequences

- No new tables or columns from this feature at all — the entire "was this session ever a member
  here" question is answered by data (`expenses.paid_by`) that would exist with or without this
  feature.
- The disclosed detection gap (never-logged-an-expense members see the generic fallback, not the
  explicit one) is a real, known product gap, not a bug — flag it back to product/PM if "every
  removed member, including one who never paid for anything, must see the explicit state" turns
  out to be a harder requirement than requirements.md's current wording suggests. Closing it
  later would mean revisiting this ADR (soft-delete or a tombstone table), not a
  `getTripView`-level fix.
- `expense.payer` for a former member's historical row now carries a synthetic, non-roster
  identity (`isRemoved: true`, placeholder display name) rather than their real name — a member
  removed after logging expenses does *not* keep their name visible on those expenses going
  forward, only their amount/description. Future features touching expense-payer rendering
  (e.g. a search/filter by member) need to account for `isRemoved` payers existing and not being
  present in the roster they'd otherwise expect to cross-reference against.
- `get_trip_summary` and `getMyTrips` need no equivalent ghost-payer handling — neither exposes
  per-expense payer identity to a caller (aggregates only) — but any *future* function added to
  `src/lib/data/trips.ts` that maps `expenses.paid_by` through `userIdToMemberId` and then
  dereferences a `memberById`-style map needs to check whether it can encounter a removed payer's
  id and, if so, apply the same ghost-entry treatment rather than reintroducing this bug in a new
  place.
