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
As of the add-placeholder-members feature, `add_placeholder_member`/
`rename_placeholder_member`/`remove_placeholder_member` also require
`is_trip_open(trip_id)` and reject with a clear error once a trip is
completed — removing a placeholder retroactively shifts a completed trip's
live-computed split (see below), so this was deliberately locked down rather
than left open the way `join_trip` still is. `join_trip` itself remains
**unlocked** — a real member can still join a completed trip today; that
pre-existing gap was out of scope for this feature and was left as-is rather
than solved unprompted.

**Client-local device state**: not everything needs to be server state.
Browser `localStorage` is used for small, non-sensitive, per-device
conveniences that don't warrant a DB column or session data (e.g. the
sign-in screen remembering the last-used email — see
`src/lib/remembered-email.ts`). Convention for this kind of module: a
namespaced key, and every read/write wrapped in try/catch so the feature
degrades to today's behavior (not an error) when storage is unavailable or
blocked (private browsing, disabled storage).

**Additive `not null` schema changes on populated tables**: sequence as add
nullable -> backfill -> set DB-level default -> set `not null`, all in one
migration file (see
`supabase/migrations/0007_add_expense_date.sql` and
[ADR 0003](adr/0003-expense-date-column-sequencing.md) for the worked
example). This matters because a Supabase migration and a Vercel deploy are
not atomic — old, not-yet-redeployed app code can still be inserting rows
against the new schema for a window after the migration lands, and a DB-level
default is what keeps those inserts (which don't yet send the new column)
succeeding until the new frontend is live. The *reverse* direction —
loosening an existing `not null` column to nullable, or adding a new nullable
column with an always-correct default — needs no such phasing; see
`supabase/migrations/0008_add_placeholder_members.sql` for that simpler case.

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
  to remove a *real* member from a trip (no "leave trip" flow exists anywhere
  in `src/`). As of the add-placeholder-members feature, `user_id` is
  **nullable** and a new `is_placeholder boolean not null default false`
  column marks name-only members with no Supabase auth account — a check
  constraint ties the two together (`is_placeholder` iff `user_id is null`).
  Placeholders are created/renamed/removed exclusively through
  `add_placeholder_member`/`rename_placeholder_member`/
  `remove_placeholder_member` (`security definer`, organizer-only, and for
  rename/remove, placeholder-only-by-query — see
  `docs/features/add-placeholder-members/architecture.md`), following the
  same "RPC is the only write path" pattern as `create_trip`/`join_trip`.
  The existing `unique (trip_id, user_id)` constraint needed no change to
  support multiple placeholders per trip: Postgres's default unique-index
  semantics already treat every `NULL` as distinct from every other `NULL`.
  **Important for any code reading `trip_members`**: because `user_id` is no
  longer guaranteed unique-and-non-null per row, `src/lib/data/trips.ts`
  identifies a member by `trip_members.id` (the row's own primary key), not
  `user_id`, in everything it returns (`members[].id`, `you.id`,
  `expense.payer.id`, etc.) — see
  [ADR 0004](adr/0004-placeholder-member-nullable-user-id-and-identity-key.md).
  `user_id` remains available on the raw row for matching against
  `expenses.paid_by` (which is still always a real user id), but is not used
  as the display-layer identity key anymore.
- `expenses` — one row per logged expense; `paid_by` (set once, at insert,
  to the submitting user) is the **only** ownership signal — there is no
  separate `created_by` column. `amount` is `numeric(10,2)` dollars,
  converted to/from integer cents at the `src/lib/currency.ts` boundary.
  `date` (added by the expense-date-month feature,
  `supabase/migrations/0007_add_expense_date.sql`) is the calendar date the
  expense happened, distinct from `created_at` (the insert-time log
  timestamp) — `not null` with a `current_date` DB-level default and a
  `date <= current_date` check, backfilled from `created_at::date` for
  pre-feature rows. Splits are **not** stored per-expense — every screen
  that needs a member's share computes it dynamically (equal split across
  current `trip_members` count) via `src/lib/settlement.ts`, so changing an
  expense's `amount` needs no reconciliation of separate split rows. This
  also means a placeholder member (add-placeholder-members feature) is
  included in that count with zero settlement-logic changes — it's just a
  member row with no expenses ever attached to it, since `paid_by` still
  references `auth.users(id)` directly and a placeholder never has a
  corresponding `auth.users` row to reference.
- `feedback` — free-standing, scoped to `user_id = auth.uid()` on both
  read and write.

**RLS on `expenses`** (the policy set most likely to need attention as
future features touch expenses — see ADRs before changing further):
- `select` — any trip member.
- `insert` — any trip member, only while `is_trip_open(trip_id)`, and only
  if `paid_by` is itself a trip member. This `exists` check against
  `trip_members` (`user_id = expenses.paid_by`) can never match a
  placeholder row, since a placeholder's `user_id` is `null` and SQL's
  `null = <anything>` is never true — combined with `paid_by`'s own `not
  null` FK to `auth.users(id)` (a table placeholders never appear in at
  all), this policy needed no change to keep placeholders permanently
  unable to be a payer.
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
  As of the add-placeholder-members feature, this is also where the
  `user_id`-nullable-per-row reality of `trip_members` is translated into a
  stable `trip_members.id`-based identity for every shaped member object it
  returns — see the `trip_members` entry above and ADR 0004. Any new
  function added here that shapes member data should reuse that same
  row-id-based identity rather than reintroducing `user_id` as a display key.
- Amount/description validation for an expense (positive amount, non-empty
  description) lives in `src/lib/validation/expense.ts`
  (`isValidExpenseInput`), shared by `src/app/trip/[id]/add-expense/page.tsx`
  and `src/app/trip/[id]/expense/[expenseId]/edit/page.tsx` — extracted as
  part of edit-own-expense once a second call site existed. New expense-form
  surfaces should import this rather than reinlining the rule. Date
  validation (real calendar date, not in the future) lives alongside it as
  `isValidExpenseDate`, added by the expense-date-month feature.
- `src/lib/dates.ts` — shared date-formatting/date-math helpers
  (`formatDate`, `formatDateRange`, and, as of expense-date-month,
  `todayIso` and `formatDayDate`), used by trip-date display and now
  expense-date display/defaulting. New date formatting or "what's today"
  logic anywhere in the app should go through here rather than reimplementing
  `Date` handling at the call site — in particular, `todayIso()` is the
  browser-local "today," deliberately not the DB's `current_date` (UTC);
  see [ADR 0003](adr/0003-expense-date-column-sequencing.md) for why the
  distinction matters.
- `src/lib/avatar.ts` — per-member display derivations (`initialsFor`,
  `avatarColorFor`); recommended home for a shared "name, with `
  (placeholder)` suffix if applicable" helper added by the
  add-placeholder-members feature, rather than reimplementing that string
  concatenation at each of the several places a member's name is rendered.
- `is_trip_member(_trip_id)` and `is_trip_open(_trip_id)` (both
  `security definer` SQL functions, `supabase/migrations/0001_init.sql` and
  `0005_lock_expenses_when_trip_completed.sql`) are the shared building
  blocks nearly every RLS policy on `trips`/`trip_members`/`expenses` is
  built from — extend by composing with these rather than re-deriving
  membership/lock logic inline in a new policy. `is_trip_member` continues
  to work unchanged for placeholders: it matches on `user_id = auth.uid()`,
  which a placeholder (no auth session, ever) can never satisfy either as
  caller or as target.
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
- [0003](adr/0003-expense-date-column-sequencing.md) — Sequencing the `expenses.date` migration for zero-downtime, and sourcing "today" from the app not the DB
- [0004](adr/0004-placeholder-member-nullable-user-id-and-identity-key.md) — Nullable `user_id` for placeholder members, and keying member identity off `trip_members.id`
