-- Adds `expenses.date` — the calendar date an expense actually happened, separate from
-- `created_at` (the insert-time log timestamp). See
-- docs/features/expense-date-month/architecture.md and
-- docs/adr/0003-expense-date-column-sequencing.md for the sequencing rationale.
--
-- Sequenced as add-nullable -> backfill -> set default -> set not null so that the column is
-- never `not null` without either a value or a default in place. This matters because a Supabase
-- migration and a Vercel deploy are not atomic: for the window between "migration applied" and
-- "new app code live," the *old* app code (which does not send `date` on insert) is still
-- running against the *new* schema. A DB-level default keeps those old inserts succeeding.

-- 1. Add nullable first — cheap, no rewrite of existing rows, no lock contention with concurrent
--    reads/writes.
alter table public.expenses add column date date;

-- 2. Backfill every existing row from created_at's calendar date (product decision: same
--    calendar date, no other heuristic).
update public.expenses set date = created_at::date where date is null;

-- 3. Set a default *before* the not-null constraint, and before old app code (which never sends
--    `date`) can hit this table again post-migration. current_date is UTC (Postgres server tz);
--    the app always computes and sends an explicit local-date value once deployed, so this
--    default is a backward-compatibility safety net for the deploy race above, not the
--    steady-state source of truth for "today."
alter table public.expenses alter column date set default current_date;

-- 4. Now safe to require it — every existing row has a value (step 2) and every future row gets
--    one (either the app's explicit value or step 3's default).
alter table public.expenses alter column date set not null;

-- Defense in depth, mirroring the existing `amount > 0` check on this same table: reject a
-- future-dated expense at the DB layer too, not just in app validation
-- (src/lib/validation/expense.ts). current_date is evaluated per-write, not baked into the
-- constraint, so this doesn't need to be revisited as time passes.
alter table public.expenses add constraint expenses_date_not_future check (date <= current_date);

create index on public.expenses (trip_id, date desc);
