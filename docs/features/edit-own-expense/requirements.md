# Edit own expense

## Problem statement

Every balance in TripSplit — the trip dashboard, settle-up plan, and the
"My Trips" summary — is computed live from the `expenses` table. Today a
member can log an expense (amount + description) but has no way to fix it
afterward: a typo'd amount or wrong description stays wrong for the whole
trip, with no path to correct it short of asking someone else to intervene
(and no such intervention flow exists either). This erodes trust in the
one thing the app promises: accurate settlement math.

This feature lets the member who paid for an expense correct it after the
fact, within the same guardrails that already govern expense creation.

## Grounding in current code

- There is currently no edit UI, route, or data-layer function for
  expenses anywhere in `src/` — only `addExpense` (insert) exists in
  `src/lib/data/trips.ts`, used by `src/app/trip/[id]/add-expense/page.tsx`.
  This is a net-new UI surface, not a fix to something partially built.
- `expenses` has no separate "created by" column — `paid_by` is set to the
  submitting user's id at insert time and is the only signal of who
  logged it (see `supabase/migrations/0001_init.sql`). "The expense they
  created" is therefore equivalent to "the expense they paid for."
- Row-level security today (`0001_init.sql`, tightened by
  `0005_lock_expenses_when_trip_completed.sql`) already permits **any**
  trip member to `update`/`delete` **any** expense on an open trip — this
  was a deliberate "small trusted group" call, not scoped to the payer.
  Restricting edits to the expense's own payer is therefore a real
  narrowing of current DB permissions, not just adding a UI affordance —
  worth the architect's attention when designing this, since it changes
  an existing RLS policy rather than only adding a new route.
- `is_trip_open()` already blocks writes once a trip is completed; the
  same lock should cover edits (mirrors the existing "Trip is locked — no
  more expenses" state in `src/app/trip/[id]/page.tsx` and
  `add-expense/page.tsx`).
- Splits are computed dynamically (equal split across current member
  count) — there's no per-expense split data to reconcile when the amount
  changes; recomputing from the updated `amount` is sufficient.

## Acceptance criteria

1. On an open (not completed) trip, an expense the signed-in user paid
   for exposes an edit affordance; an expense paid by anyone else does
   not expose one for the current user.
2. Editing lets the user change amount and/or description, reusing the
   same validation as add-expense (amount must be a positive number;
   description required, non-empty). Invalid input shows an inline error
   and does not save.
3. Saving valid changes persists them, and the trip dashboard, settle-up
   plan, and My Trips list all reflect the updated amount/description
   immediately (they already read live from `expenses`, so no caching
   fix should be needed — verify this holds).
4. Canceling out of the edit leaves the original expense unchanged.
5. Attempting to edit an expense paid by another member is rejected even
   if attempted directly against the API/DB (not just hidden in the UI) —
   enforced server-side (RLS), not only client-side.
6. Attempting to edit any expense on a completed/locked trip is rejected
   both in the UI (edit affordance hidden or disabled, consistent with
   the existing locked-trip messaging) and at the DB level.
7. Editing an expense never changes `paid_by` or `trip_id` — who paid and
   which trip it belongs to are immutable in this pass.

## Non-goals

- Reassigning an expense to a different payer.
- Deleting expenses (a separate, distinct ask — despite a `delete` RLS
  policy already existing at the DB level, no delete UI/flow is proposed
  here).
- Letting a trip organizer edit expenses they didn't pay for ("override"
  editing) — a separate, larger permissions question.
- Unequal/custom per-person splits on an expense — expenses continue to
  split evenly across all current trip members, matching today's
  behavior.
- Receipt photo attach or edit — no receipt upload UI exists yet in the
  product; out of scope here.
- Edit history or an audit trail of who changed what and when.
- Any way to re-open/un-lock a completed trip to allow edits.

## Semver classification

**Feature** (backward-compatible addition). It adds new capability
without changing any existing route's behavior or public data shape that
other flows depend on. Flag for the architect: implementing this
correctly requires *tightening* the existing `expenses` UPDATE RLS policy
from "any trip member" to "only the paying member," which changes
currently-permitted (if unused) DB behavior — call this out explicitly in
the PR/migration description even though it doesn't change any
user-facing API contract.
