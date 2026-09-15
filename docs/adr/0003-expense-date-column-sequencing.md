# 0003. Sequencing the `expenses.date` migration for zero-downtime, and sourcing "today" from the app not the DB

Status: accepted
Date: 2026-09-14

## Context

The expense-date-month feature
(`docs/features/expense-date-month/requirements.md`) adds a `date` column to
`expenses` that must end up `not null` (every expense — including the
~all-existing rows — needs a real date, per acceptance criterion 7's
backfill requirement), but Supabase migrations and Vercel deploys are two
separate, non-atomic operations. There is a real window — sometimes seconds,
sometimes longer if a deploy is slow or rolled back — where the migration
has run against the production DB but the previously-deployed app code (which
calls `addExpense`/`.insert()` without any `date` field, since that field
doesn't exist in its build) is still serving traffic. If the migration adds
`date date not null` with no default in one step, every expense insert from
that old code fails with a not-null violation until the new frontend deploys
— a self-inflicted outage for a routine additive feature.

Separately, "today" for the optional-date default (acceptance criterion 1:
blank date defaults to the add date) can be sourced two ways: computed in
the browser (the member's local calendar date) or computed in Postgres
(`current_date`, evaluated in the DB server's timezone, effectively UTC).
These disagree for part of every day for any user not in UTC — e.g. someone
in PST adding an expense at 8pm local time is still on the *previous* UTC
calendar date.

## Decision

1. **Sequence the migration as: add nullable column -> backfill from
   `created_at::date` -> set a DB-level default (`current_date`) -> set
   `not null`.** All four steps ship in one migration file
   (`0007_add_expense_date.sql`), each safe at the moment it runs, so the
   column is never `not null` without either a value (backfilled rows) or a
   default (new rows from not-yet-updated app code) covering it.
2. **The app always computes and sends an explicit date, in the member's
   local timezone, on both add and edit — the DB default is a
   backward-compatibility safety net for the deploy-ordering race above,
   not the steady-state mechanism for "defaults to today."** `addExpense`
   accepts an optional `date`; when the caller omits it (i.e., the add-form
   field was left blank), the data-access layer itself fills in the local
   "today" (via a shared `todayIso()` helper in `src/lib/dates.ts`) before
   the insert, rather than relying on Postgres's `current_date`.
3. Add a DB-level `check (date <= current_date)` constraint, mirroring the
   existing `amount > 0` check on the same table, as defense-in-depth
   alongside the app-level `isValidExpenseDate` check
   (`src/lib/validation/expense.ts`) — not a replacement for it, since the
   app validation runs before the request is sent and gives a better error
   message.

## Alternatives considered

- **Three separate migration files (add-nullable / backfill / constrain),
  merged over multiple deploys.** More conservative for very large tables
  where a single-transaction backfill could hold a long lock, but
  `expenses` is small (no batching/backpressure concerns at this app's
  scale) and splitting into three files means three PRs' worth of
  in-between states to reason about for no real benefit here. Rejected as
  unnecessary ceremony for this table's size; revisit if `expenses` ever
  grows large enough that a single `update` becomes a real lock-contention
  risk.
- **Skip the DB-level default; require the new frontend and migration to
  deploy in the same atomic step.** Rejected — Vercel/Supabase deploys
  genuinely aren't atomic in this stack (confirmed via
  `docs/ARCHITECTURE.md`'s deployment description), so this would be
  relying on a guarantee the platform doesn't provide. The DB default costs
  nothing and removes the risk entirely.
- **Source "today" from `current_date` in the DB (e.g. via the column
  default alone, letting every blank-date insert fall through to it) instead
  of computing local time in the app.** Rejected as the steady-state
  behavior — it's silently wrong by up to ~12 hours for non-UTC users near
  midnight UTC, which is exactly the kind of off-by-one-day bug this
  feature exists to prevent. Keeping the DB default as a fallback-only
  mechanism (case 2 above) rather than the primary path avoids this.
- **Bound `date` to the trip's `starts_on`/`ends_on` via a check
  constraint.** Explicit non-goal in requirements; not implemented at any
  layer.

## Consequences

- Any future column-addition-to-`not null` on a populated table in this
  project should follow the same four-step shape (nullable -> backfill ->
  default -> not null) rather than reaching for a single `add column ...
  not null` statement, unless the table is provably always-empty at
  migration time.
- The DB default (`current_date`) will drift from what the app actually
  writes as soon as the new frontend is live — that's expected and fine, but
  worth remembering if someone is later debugging why a row's `date` doesn't
  match `created_at::date` exactly for rows inserted through some other path
  (e.g. a future admin tool or direct SQL) that doesn't set `date` itself.
- The `check (date <= current_date)` constraint means any expense insert
  timed exactly at a UTC-date boundary discrepancy between the client's
  computed local date and the DB server's `current_date` could theoretically
  be rejected if the client's local date is *ahead* of UTC (e.g. a user in a
  timezone ahead of UTC, just after their local midnight, whose local date
  is already "tomorrow" relative to UTC). This is an edge case (a few hours
  wide, timezone-dependent) inherent to any future-date check split across
  client and server clocks; not fully solvable without either trusting the
  client's clock unconditionally or losing the DB-level defense-in-depth
  layer. Accepted as-is — no reports of this class of bug on the existing
  `starts_on`/`ends_on` date fields, which have the same theoretical
  exposure and no server-side check at all today.
