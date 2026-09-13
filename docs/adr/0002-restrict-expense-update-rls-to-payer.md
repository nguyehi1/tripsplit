# 0002. Restrict `expenses` UPDATE RLS to the paying member

Status: accepted
Date: 2026-09-12

## Context

`0001_init.sql` gave every trip member `update`/`delete` rights over *any*
expense on their trip — a deliberate "small trusted group" default, not
scoped to `paid_by`. `0005_lock_expenses_when_trip_completed.sql` later
added the `is_trip_open()` lock to that same policy but didn't otherwise
narrow it.

The edit-own-expense feature (`docs/features/edit-own-expense/requirements.md`)
requires that only the member who paid for an expense can edit it, and that
this be enforced server-side, not just hidden in the UI (acceptance
criterion 5) — an app-layer-only check (e.g. only exposing an edit button
when `paid_by === currentUser.id`, without touching RLS) would satisfy the
UI requirement but not the "not just hidden in the UI" requirement, since
anyone with a valid session and the row's `id` could still `PATCH` a
teammate's expense directly against Supabase's REST API.

`expenses` has no `created_by` column separate from `paid_by`, and adding
one is out of scope (per requirements, "the expense they created" already
equals "the expense they paid for") — so the only available ownership
signal to scope the policy to is `paid_by`.

## Decision

Narrow the existing `update` policy on `public.expenses` from "any trip
member" to "the row's own `paid_by`", via a new migration
(`0006_restrict_expense_update_to_payer.sql`) that drops and recreates the
policy:

```sql
create policy "payer can edit their own expenses" on public.expenses
  for update
  using (paid_by = auth.uid() and is_trip_member(trip_id) and is_trip_open(trip_id))
  with check (paid_by = auth.uid() and is_trip_member(trip_id) and is_trip_open(trip_id));
```

Both `using` and `with check` require `paid_by = auth.uid()`, which as a
side effect also makes `paid_by` immutable under this policy (old and new
`paid_by` must both equal the same `auth.uid()`), satisfying acceptance
criterion 7 without any separate immutability logic.

The `delete` policy is left as-is (any trip member, any expense) — there is
no delete UI to scope it for yet, and speculatively narrowing an unrelated
policy isn't warranted by this feature.

## Alternatives considered

- **App-layer check only, leave RLS permissive.** Rejected outright — fails
  the explicit "enforced server-side (RLS), not only client-side"
  acceptance criterion. Would also leave the DB's actual permission model
  silently more permissive than what the product now promises, a trap for
  the next engineer who assumes RLS matches product behavior.
- **Add a `created_by` column instead of keying off `paid_by`.** Rejected —
  there's no scenario yet where "who created the expense row" and "who
  paid" diverge (no assign-to-someone-else flow exists or is planned in
  this pass), so a new column would duplicate `paid_by` with no behavioral
  difference, just migration and read-path overhead for no benefit.
- **Enforce ownership via a `before update` trigger instead of rewriting
  the policy.** Rejected — RLS policies are the idiomatic, already-used
  mechanism for this exact class of rule in this codebase (see
  `is_trip_member`/`is_trip_open` gating every other expense policy); a
  trigger would be a second enforcement mechanism style for the same kind
  of rule, harder to audit alongside the existing policies in one place.
- **Also narrow `delete` in the same migration, for consistency.** Rejected
  for *this* PR — no delete UI exists (explicit non-goal), so there's
  nothing exercising `delete` today and narrowing it now would be
  speculative, not driven by an actual requirement. Recorded as a known
  consequence below instead.
- **Version the data access as a new API route (`/api/expenses/:id`)
  instead of a direct client `.update()` call.** Not really an alternative
  to the RLS decision itself, but adjacent: rejected because it would
  introduce a mutation pattern inconsistent with `createTrip`/`addExpense`/
  `joinTrip`, which all mutate directly from the browser client and rely on
  RLS as the authorization boundary. This feature doesn't need a
  server-held secret (unlike the one existing route, `trip-email`, which
  exists solely to hide the Resend key), so there's no forcing reason to
  deviate from the established pattern.

## Consequences

- The DB now actually matches the product's stated permission model for
  edits ("only the payer, only on an open trip"), closing the gap between
  what RLS allowed and what the UI implied.
- Verified via grep of `src/` that no shipped code path currently performs
  an `update` against `expenses` — so this narrowing has no blast radius
  against the deployed app itself; the only thing it forecloses is
  out-of-band access via Supabase's REST API using another member's
  session, which was never a sanctioned use case.
- **Watch for**: `delete` is now *more* permissive than `update` on the
  same table (any member can delete any expense; only the payer can edit
  their own). This is an intentional, temporary asymmetry, not an
  oversight — whoever builds a delete feature next should revisit whether
  `delete` should get the same `paid_by = auth.uid()` treatment then.
- **Watch for**: `trip_id` is not independently pinned by this policy (see
  `docs/features/edit-own-expense/architecture.md`'s RLS section for the
  detailed gap) — a member who happens to be `paid_by` on the same
  logical caller in two different open trips could in principle move a row
  between them via a hand-crafted PATCH. Pre-existing, not introduced here;
  worth closing with a trigger if it's ever a real threat model, not just a
  theoretical one.
- Any future feature that needs "trip organizer can override/edit a
  teammate's expense" (an explicit non-goal here) will need to *widen*
  this policy again (e.g. `paid_by = auth.uid() or created_by_organizer(trip_id)`)
  rather than add a second, overlapping `update` policy — Postgres RLS
  policies for the same command on the same table are OR'd together, so a
  second permissive policy would silently undo this narrowing rather than
  layering on top of it. Note this explicitly for whoever picks that up.
