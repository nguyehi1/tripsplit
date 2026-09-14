# Architecture

Current-state snapshot of the system. The `architect` agent updates this file
(amends it, does not replace it) every time `/feature` touches something
architecturally significant. For *why* a past decision was made — especially
one later reversed or superseded — see [`adr/`](adr/) rather than trying to
reconstruct it from this file's edit history.

## System overview

TripSplit is a Next.js 16 (App Router) app with Supabase for auth, database,
and row-level security, and Gmail SMTP (via `nodemailer`) for transactional
email. Deployed on Vercel.

**Mutation pattern**: almost all writes go directly from client components
through the Supabase browser client (`src/lib/supabase/client.ts`), calling
either a table `.insert()`/`.update()` or a `security definer` RPC (e.g.
`create_trip`, `join_trip`, `complete_trip`), with **RLS as the authorization
boundary** — there is deliberately no Next.js route handler in that path.
`src/app/api/` is reserved for the rare case where a server-held secret is
involved (currently just `trip-email/route.ts`, which needs the Gmail App
Password). New CRUD-style mutations should default to the direct-client pattern
and only add an API route when there's a genuine server-secret or
server-only-computation reason to.

**Locking**: a trip can be marked completed (`trips.completed_at`, set by the
`complete_trip` RPC, organizer-only, one-way — no "reopen" RPC exists). Once
completed, `public.is_trip_open(trip_id)` returns false and every write-side
RLS policy on `expenses` (`insert`/`update`/`delete`) requires it, so no
expense can be added, edited, or deleted on a completed trip. UI mirrors this
with a locked-state screen (see `src/app/trip/[id]/add-expense/page.tsx`).

**Client-local device state**: not everything needs to be server state.
Browser `localStorage` is used for small, non-sensitive, per-device
conveniences that don't warrant a DB column or session data (e.g. the
sign-in screen remembering the last-used email — see
`src/lib/remembered-email.ts`). Convention for this kind of module: a
namespaced key, and every read/write wrapped in try/catch so the feature
degrades to today's behavior (not an error) when storage is unavailable or
blocked (private browsing, disabled storage).

## Data model

Schema is managed via `supabase/migrations/NNNN_*.sql` (sequential, never
edited after merge). See migration files for the authoritative current
schema; summarized here as it stabilizes:

- `trips` — one row per trip; `completed_at` (nullable) is the lock; unique
  `invite_code` is how joining works.
- `trip_members` — join table (`trip_id`, `user_id`, `display_name`); no
  direct `insert` RLS policy — the only way a row is created is through the
  `create_trip`/`join_trip` RPCs (`security definer`), so a client can't
  fabricate membership by guessing a trip's UUID. There is currently no way
  to remove a member from a trip (no "leave trip" flow exists anywhere in
  `src/`).
- `expenses` — one row per logged expense; `paid_by` (set once, at insert,
  to the submitting user) is the **only** ownership signal — there is no
  separate `created_by` column. `amount` is `numeric(10,2)` dollars,
  converted to/from integer cents at the `src/lib/currency.ts` boundary.
  Splits are **not** stored per-expense — every screen that needs a
  member's share computes it dynamically (equal split across current
  `trip_members` count) via `src/lib/settlement.ts`, so changing an
  expense's `amount` needs no reconciliation of separate split rows.
- `feedback` — free-standing, scoped to `user_id = auth.uid()` on both
  read and write.

**RLS on `expenses`** (the policy set most likely to need attention as
future features touch expenses — see ADRs before changing further):
- `select` — any trip member.
- `insert` — any trip member, only while `is_trip_open(trip_id)`, and only
  if `paid_by` is itself a trip member.
- `update` — as of the edit-own-expense feature, only the row's own
  `paid_by` (i.e., only the member who logged it), only while
  `is_trip_open(trip_id)`. See
  [ADR 0002](adr/0002-restrict-expense-update-rls-to-payer.md) for why this
  was narrowed from "any trip member" and what it doesn't (yet) guarantee
  (`trip_id` isn't independently pinned by this policy — mitigated at the
  application layer today, not the DB).
- `delete` — still any trip member, on an open trip — **intentionally not
  yet scoped to `paid_by`**, because no delete UI/flow exists yet. This is
  now *more* permissive than `update` on the same table; a future delete
  feature should revisit whether to apply the same payer-scoping (see ADR
  0002's consequences).

## Known integration points / shared code

Track anything with more than one consumer here, so future features check
this before adding a parallel implementation.

- `src/lib/data/trips.ts` — the one data-access module for trips/expenses;
  wraps every read/write against `trips`, `trip_members`, and `expenses`
  behind typed functions (`createTrip`, `joinTrip`, `completeTrip`,
  `addExpense`, `updateExpense`, `getMyTrips`, `getTripView`). New
  trip/expense read or write logic belongs here, not inlined in a page.
- Amount/description validation for an expense (positive amount, non-empty
  description) lives in `src/lib/validation/expense.ts`
  (`isValidExpenseInput`), shared by `src/app/trip/[id]/add-expense/page.tsx`
  and `src/app/trip/[id]/expense/[expenseId]/edit/page.tsx` — extracted as
  part of edit-own-expense once a second call site existed. New expense-form
  surfaces should import this rather than reinlining the rule.
- `is_trip_member(_trip_id)` and `is_trip_open(_trip_id)` (both
  `security definer` SQL functions, `supabase/migrations/0001_init.sql` and
  `0005_lock_expenses_when_trip_completed.sql`) are the shared building
  blocks nearly every RLS policy on `trips`/`trip_members`/`expenses` is
  built from — extend by composing with these rather than re-deriving
  membership/lock logic inline in a new policy.
- `src/lib/remembered-email.ts` — the one client-`localStorage` helper in
  the app (`getRememberedEmail`/`setRememberedEmail`/`clearRememberedEmail`,
  namespaced key `tripsplit:last-signin-email`), used by the sign-in screen
  (`src/app/page.tsx`) to prefill the last-used email on the same device.
  If a future feature wants a second piece of per-device local state, check
  here first — same try/catch-wrapped pattern applies rather than a new
  ad hoc `localStorage` call site.

## ADR index

Architecture decisions live in [`adr/`](adr/) as immutable, numbered records.
List notable ones here as they're added:

- [0001](adr/0001-record-architecture-decisions.md) — Record architecture decisions as ADRs
- [0002](adr/0002-restrict-expense-update-rls-to-payer.md) — Restrict `expenses` UPDATE RLS to the paying member
