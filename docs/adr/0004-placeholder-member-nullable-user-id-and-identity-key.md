# 0004. Nullable `user_id` for placeholder members, and keying member identity off `trip_members.id`

Status: accepted
Date: 2026-09-15

## Context

The add-placeholder-members feature
(`docs/features/add-placeholder-members/requirements.md`) needs a way to
represent a trip member with no Supabase auth account — a name-only
stand-in the organizer adds so the equal split accounts for everyone on the
trip. `trip_members.user_id` is currently `not null references
auth.users(id)`, and every read path in `src/lib/data/trips.ts` (and every
UI consumer downstream of it) uses that `user_id` as *the* identity of a
member — as a `Map` key for balances, as a lookup key for "which member
paid this expense," and as the React `key` prop for member rows/avatars.

Requirements' own "schema note for the architect" explicitly leaves open
two ways to flag a placeholder row: a `null` `user_id` used as the flag
itself, or an explicit boolean alongside a still-non-null `user_id`. This
is a real fork with different consequences for the rest of the codebase,
not a routine column addition — worth recording.

Also relevant: requirements explicitly allow **duplicate names** and (by
implication of the 20/trip cap) **multiple placeholders per trip**. Any
design here has to work correctly with more than one placeholder on the
same trip at once, not just the one-placeholder happy path.

## Decision

1. **`trip_members.user_id` becomes nullable; add `is_placeholder boolean
   not null default false`, with a check constraint tying the two
   together:**

   ```sql
   alter table public.trip_members alter column user_id drop not null;
   alter table public.trip_members add column is_placeholder boolean not null default false;
   alter table public.trip_members add constraint trip_members_placeholder_user_id_check
     check (
       (is_placeholder and user_id is null)
       or (not is_placeholder and user_id is not null)
     );
   ```

   `expenses.paid_by` is untouched — it keeps its `not null references
   auth.users(id)`, per requirements' own note that placeholders can never
   be a payer.

2. **The existing `unique (trip_id, user_id)` constraint needs no change.**
   Postgres's default unique-constraint semantics treat every `NULL` as
   distinct from every other `NULL` (this is standard SQL behavior, not a
   Postgres-specific quirk — `NULLS NOT DISTINCT`, a PG15+ opt-in, is the
   *opposite* of what we want and is deliberately not used here). So N rows
   with the same `trip_id` and `user_id = null` never collide against this
   constraint, exactly what's needed to allow up to 20 placeholders per
   trip with no constraint change.

3. **Member "identity" throughout `src/lib/data/trips.ts` and every UI
   consumer of its output moves from `trip_members.user_id` to
   `trip_members.id` (the row's own primary key).** Concretely:
   `getTripView`/`getMyTrips`'s shaped `members[].id` (and `you.id`,
   `expense.payer.id`, `settlement.from/to.id`) becomes the `trip_members`
   row id, not the auth user id. `paid_by` (still a `user_id`) is
   translated to the corresponding row id via a per-trip `user_id ->
   trip_members.id` lookup built once per call, before being handed to
   `computeBalances`/`simplifyDebts` — those two functions' signatures and
   internal logic in `src/lib/settlement.ts` do not change at all; they
   just receive a different (but still unique-per-member) opaque `id`.

## Alternatives considered

- **Synthetic non-null `user_id` for placeholders (e.g. a random UUID that
  doesn't correspond to any `auth.users` row), keeping `user_id`
  non-nullable and dropping/relaxing its FK instead.** This would avoid the
  null-collision problem in (3) entirely, since every row would have a
  genuinely unique `user_id`. Rejected: it requires dropping the FK to
  `auth.users(id)` on a column whose entire meaning today is "this is a
  real authenticated user," which quietly weakens a constraint every other
  reader of this schema currently relies on for that guarantee (including
  the payer-restriction argument in the architecture doc, which leans on
  "placeholders have no `auth.users` row" as a hard, FK-enforced fact, not
  a convention). A nullable `user_id` + boolean flag keeps "has a real
  account" exactly as legible as it is today (`user_id is not null`
  implies a real `auth.users` row, full stop) at the cost of one `is
  distinct from` fact about NULLs that's already true for free.
- **Keep `member.id === user_id` and dedupe placeholders some other way
  (e.g. give the UI a synthetic client-side key like `` `${trip_id}-ph-${i}` ``
  layered on top, without touching `trips.ts`'s internals).** Rejected —
  this papers over the bug at the React-key layer only; the underlying
  `Map`-keyed aggregation in `getTripView` (`balanceByMember`,
  `memberById`) would still silently collapse multiple placeholders into
  one entry, corrupting the *displayed* per-placeholder share (typically an
  off-by-one-cent discrepancy when the total doesn't divide evenly) even if
  the roster list itself rendered the right number of rows. Fixing the
  actual identity key is the only correct fix, not a targeted patch.
- **Do nothing extra in `trips.ts` and rely on `computeBalances`/
  `simplifyDebts` to somehow handle it.** Not viable — those functions
  operate purely on whatever `id` they're handed; the bug is entirely in
  how `trips.ts` derives that `id` today (from `user_id`), which was a safe
  assumption only as long as `user_id` was unique and non-null per row (it
  was, pre-feature, thanks to the `unique (trip_id, user_id)` constraint
  and the not-null column). This is why requirements.md's note that
  "placeholders need zero changes to settlement.ts" is correct as far as it
  goes but doesn't extend to the data-access layer that feeds it.

## Consequences

- Every place in `src/` that currently treats `members[].id` /
  `you.id` / `expense.payer.id` as interchangeable with a raw
  `supabase.auth.getUser()` user id needs to be re-checked — as of this
  ADR, none do outside `src/lib/data/trips.ts` itself (verified by grep);
  all comparisons of that kind (`expense.payer.id === you?.id`,
  `member.id === view.you?.id`) compare two values that both come from the
  same `trips.ts`-shaped object, so they remain internally consistent
  under the new identity. `src/app/trip/[id]/expense/[expenseId]/edit/page.tsx`'s
  `expenseResult.data.paid_by !== user.id` check is the one place that
  compares a raw DB column to a raw session id directly — it doesn't go
  through `trips.ts`'s member-shaping at all, so it's unaffected.
- `src/lib/data/trips.test.ts` has existing fixtures/assertions of the form
  `members.find((m) => m.id === "u1")` that assume member id equals the
  seeded user id — these need updating by the engineer to assert against
  the new row-id identity (or to give the fixture rows a distinct
  `trip_members.id` and assert against that) as part of this feature's
  implementation, not a pre-existing test to leave alone.
- This is a one-way door for the meaning of `members[].id` in the returned
  shape of `getTripView`/`getMyTrips` — any future feature reading that
  field must not assume it's a valid `auth.users.id` (e.g. usable directly
  in a `paid_by` insert). Worth a code comment at the definition site
  pointing back to this ADR.
