# 0013. A `before delete` trigger on `trip_members` to release shopping-list claims on member removal

Status: accepted
Date: 2026-09-29

## Context

The shopping-list feature (`docs/features/shopping-list/requirements.md`)
adds `public.shopping_list_items`, with `added_by`/`claimed_by` referencing
`trip_members.id` (per ADR 0004's identity convention — member identity is
keyed off the `trip_members` row id, not the raw `auth.users` id). Separately,
the already-shipped remove-member-access feature
(`supabase/migrations/0014_remove_and_leave_trip_member.sql`) added
`remove_trip_member`/`leave_trip`, both of which **hard-delete** a
`trip_members` row — there is no soft-delete/tombstone (see ADR 0012, which
deliberately chose "reconstruct a removed member's history at read time from
`expenses.paid_by`" over a stored tombstone, specifically to avoid a new
column/table for that purpose).

Shopping-list's own data-shape constraint
(`shopping_list_items_shape_check`) requires `status = 'claimed'` to imply
`claimed_by is not null`. If a member holding an open (not-yet-logged) claim
is removed via either RPC, a plain declarative `on delete set null` on
`claimed_by` would null the column while leaving `status = 'claimed'` —
**violating that check constraint**, which means the `DELETE` itself would
fail. That's not a hypothetical: it would make `remove_trip_member`/
`leave_trip`, both already shipped and in production, start failing for any
trip where the removed member currently holds a shopping-list claim — a real
regression introduced by this feature against existing, working
functionality, not a new-feature-only concern.

Even setting the constraint violation aside, silently nulling `claimed_by`
while leaving `status = 'claimed'` would produce a genuinely stuck item: it
would disappear from "To get" (filtered to `status = 'open'`) *and* from
everyone's "Your bag" (filtered to `claimed_by = you.id`), with no UI path
to recover it — unlike a past `expenses` row (immutable, never needs to be
"actionable" again, which is exactly why ADR 0012's read-time reconstruction
works for that case), a `claimed`, not-yet-logged shopping-list item is live,
actionable state that must remain renderable and resolvable.

## Decision

Add the app's **first trigger**: a `before delete on trip_members` row
trigger, `release_shopping_list_claims_on_member_removal`, that — before the
member row is actually removed — reverts any of that member's still-`claimed`
items back to `open` (identical semantics to a normal unclaim) and clears
`claimed_by` on any `logged` item referencing them, plus clears `added_by` on
anything they added. By the time Postgres checks the (default, unnamed) FK
constraints on `shopping_list_items.added_by`/`claimed_by` at the end of the
statement, nothing references the row being deleted, so the delete proceeds
without error regardless of whether that member held any claims.

This ships in the same migration as the table/RLS/RPCs it protects
(`supabase/migrations/0015_shopping_list.sql`), so there is no deploy window
where the hazard exists without the fix already in place.

## Alternatives considered

- **Declarative `on delete set null` on `claimed_by`, do nothing else.**
  Rejected — shown above to violate the shape-check constraint the moment a
  claimed (not logged) item's claimer is removed, breaking
  `remove_trip_member`/`leave_trip` outright. Not viable, not just
  suboptimal.
- **Relax `shopping_list_items_shape_check` to allow `status = 'claimed'`
  with `claimed_by is null`.** Rejected — this trades a hard constraint
  violation for a silent, permanently-stuck-item bug (the "disappears from
  every filtered view" problem above), which is worse: no error, no
  recovery path, just a row nobody can ever act on again through the app's
  UI.
- **`on delete restrict`/leave the FK at its default blocking behavior, with
  no trigger.** Rejected — this would make it impossible to ever remove a
  member who holds any shopping-list claim, a much larger regression
  (permanently locking the roster for that member) than the one being
  fixed, and directly contradicts remove-member-access's own stated design
  (any non-organizer member can be removed from an open trip, no
  exceptions carved out for other in-flight state).
- **Reconstruct "was this claim released by removal" at read time instead of
  storing/triggering the correction**, mirroring ADR 0012's own precedent
  for `expenses`/ghost payers. Rejected for this specific case: ADR 0012's
  approach works because a past `expenses` row is immutable and only ever
  needs a *display* fix (who to show as the payer). A `claimed`,
  not-yet-logged shopping-list item is not immutable, historical data — it's
  live state that other members need to see and act on (claim it themselves)
  going forward. There is no "read-time reconstruction" that can put an item
  back in the `open` bucket other members' claim-listing queries scan; the
  underlying row's `status` has to actually change. This is exactly the
  class of problem RLS's `using`/`with check` split and read-time
  reconstruction both structurally cannot solve (neither can correlate "old
  state" with "a different table's row disappearing"), and a trigger is
  Postgres's standard, idiomatic mechanism for exactly this — a
  referential-integrity-adjacent side effect that has to run as part of the
  same transaction as the row deletion that triggers it.
- **A second, application-level cleanup step** (e.g., the client or a
  Vercel cron sweeps for orphaned claims). Rejected — this app has no
  background job infrastructure today, and an app-level sweep can't be
  transactionally atomic with the `DELETE` itself the way a DB trigger is;
  there would always be a window (between the member being removed and the
  sweep running) where the exact stuck-item state described above is
  visible to other members.

## Consequences

- This is the first trigger in the codebase — every other piece of
  business logic to date lives in RLS policies or `security definer` RPCs
  (see ARCHITECTURE.md's "Mutation pattern"). Future features should not
  read this as license to reach for triggers generally; it's used here
  specifically because RLS structurally cannot correlate two tables' before/
  after states across one statement, and every other option above was
  either unsafe or a larger regression. The existing RLS/RPC-first default
  stands for everything else.
- `remove_trip_member`/`leave_trip` (migration 0014) needed no changes to
  their own function bodies — the trigger is attached to `trip_members`
  itself, so it fires for *any* row deletion against that table, including
  from those two RPCs, without either needing to know this feature exists.
- **Known, accepted gap**: if a `logged` (already-linked-to-a-real-expense)
  item's claimer is later removed, `claimed_by` nulls out with no
  replacement — the not-yet-built expense-delete feature, when it reverts a
  logged item back to claimed-unlogged, will have no claimer to reassign
  for that specific item. This mirrors the exact class of gap ADR 0012
  already accepts for `expenses`' ghost payers (a removed member's history
  outliving their roster row) — not a new risk category, just the same one
  recurring in a second table. Flagged for whoever builds expense-delete
  next: that feature will need its own fallback (e.g., revert to `open`
  instead of `claimed` when `claimed_by` is null) for this case.
- Any future feature adding another `trip_members`-referencing table with
  its own "must stay actionable, not just historically accurate" state
  should check this ADR before reaching for ADR 0012's read-time-
  reconstruction pattern by default — that pattern's applicability depends
  on the referencing data being immutable/historical, which won't always be
  true.
