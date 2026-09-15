# Expense date and month

## Problem statement

Today an expense only has an implicit timestamp: `created_at`, set to whenever
someone hits "Add an expense." The expense list shows just a weekday label
(`Mon`, `Tue`, …) derived from that timestamp — there's no way to see which
actual calendar date (or month) a cost belongs to. That's a real gap once a
trip runs more than a few days, or when someone logs an expense a day or two
after the fact (e.g. entering cash receipts from the night before): the list
implies "this happened on the day I typed it in," which isn't always true,
and there's no way to tell at a glance which costs landed in which week or
month on longer trips.

This feature lets a member record the date an expense actually happened
(separate from when they logged it), and shows/groups expenses by that date
and its month so a longer trip's spending is easier to scan.

## Grounding in current code

- `expenses` (`supabase/migrations/0001_init.sql`) has no date field beyond
  `created_at timestamptz not null default now()`, which is a log/audit
  timestamp, not an editable "this is when it happened" field. This feature
  adds a new column rather than repurposing `created_at`.
- `src/lib/data/trips.ts` → `getTripView` derives the list's `day` label via
  `formatDayLabel(e.created_at)` (`new Date(iso).toLocaleDateString("en-US",
  { weekday: "short" })`). This becomes the new date field once added.
- `addExpense` / `updateExpense` in `src/lib/data/trips.ts` and their forms
  (`src/app/trip/[id]/add-expense/page.tsx`,
  `src/app/trip/[id]/expense/[expenseId]/edit/page.tsx`) only handle
  `amountCents` and `description` today — both need a new date field wired
  through, validated the same way `isValidExpenseInput`
  (`src/lib/validation/expense.ts`) validates amount/description now.
- `trips` already has `starts_on`/`ends_on` (optional — can be null) and
  `formatDateRange`/`formatDate` helpers exist in `src/lib/dates.ts`, so date
  formatting conventions already exist to reuse rather than invent.
- Edit permissions/locking (payer-only edit, locked-trip block) already
  apply to amount/description via `edit-own-expense`
  (`docs/features/edit-own-expense/requirements.md`) — the new date field is
  just another editable attribute under those same existing rules, not a new
  permission surface.

## Acceptance criteria

1. Picking a date is optional when adding an expense. If left blank, the
   expense's date defaults to the date it was added (today).
2. The date is stored per-expense, separate from the existing `created_at`
   log timestamp (which keeps recording when the row was actually inserted).
3. Editing an expense (existing payer-only, open-trip-only edit flow) lets
   the payer change the date, validated the same way as on create.
4. Date validation: must be a real calendar date; cannot be in the future
   (relative to today).
5. The expense list on the trip dashboard (`src/app/trip/[id]/page.tsx`)
   shows each expense's actual date alongside the weekday, e.g.
   "Mon, 9/14" (replacing the current weekday-only label). No separate
   month section headers are added to the list — "month" is used only to
   form this per-expense date label (via existing `formatDate`-style
   helpers in `src/lib/dates.ts`), not for grouping.
6. Expenses remain ordered newest-first by date (falling back to
   `created_at` to order same-day expenses), consistent with the existing
   list's newest-first ordering.
7. Existing expenses created before this feature ships get a backfilled
   date from their existing `created_at` (same calendar date) so the list
   shows a real date for everything already in the database, not a blank
   or placeholder.
8. The "My Trips" summary and settle-up views are unaffected — this feature
   only changes the expense-date-of-record and its display; it does not
   change settlement math (which is unaffected by date).

## Non-goals

- Month section headers or any grouping UI in the expense list — the date
  is shown per-expense only (e.g. "Mon, 9/14"), no separate "March"/"April"
  headers.
- A dedicated month filter/picker UI to narrow the list to a single month.
- Constraining the expense date to fall within the trip's `starts_on`/
  `ends_on` range, or warning when it doesn't.
- Any change to settlement math, balances, or ordering logic beyond the
  per-expense date label.
- Time-of-day tracking (this is a date, not a datetime).
- Multi-month or year grouping/analytics (e.g. no "spend by month" chart/
  summary).
- Sorting/reordering expenses by anything other than date (e.g. no
  drag-reorder).

## Product decisions (confirmed)

1. **Future dates**: not allowed — expense date must be today or earlier.
2. **Bounding to trip dates**: no constraint against the trip's
   `starts_on`/`ends_on` in this pass.
3. **Month display**: no month grouping/headers — each expense row shows
   its own date (e.g. "Mon, 9/14") in place of today's weekday-only label.
4. **Backfill**: existing expenses get their date backfilled from their
   existing `created_at` (same calendar date) so nothing shows blank.

## Semver classification

**Feature** (backward-compatible addition). Existing expenses keep working
(backfilled with a derived date); no existing route, field, or API contract
that other flows depend on changes shape in a breaking way. The one item
worth the architect/reviewer's attention: this adds a `not null` column to
`expenses`, which requires a backfill migration for existing rows before the
`not null` constraint can be applied — sequencing that correctly (backfill
before constrain) matters for zero-downtime deploy on Vercel/Supabase.
