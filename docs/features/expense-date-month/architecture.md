# Architecture: expense date and month

See `docs/features/expense-date-month/requirements.md` for the approved
product requirements this implements, and
[ADR 0003](../../adr/0003-expense-date-column-sequencing.md) for the
migration-sequencing and "where does 'today' come from" decisions in detail
— this doc summarizes the resulting design and its impact.

## Data model

New migration `supabase/migrations/0007_add_expense_date.sql`, additive to
`expenses` (no other table touched):

```sql
alter table public.expenses add column date date;                          -- 1
update public.expenses set date = created_at::date where date is null;     -- 2
alter table public.expenses alter column date set default current_date;    -- 3
alter table public.expenses alter column date set not null;                -- 4
alter table public.expenses add constraint expenses_date_not_future
  check (date <= current_date);
create index on public.expenses (trip_id, date desc);
```

- `date` (not `timestamptz`) — matches the requirement (a calendar date, no
  time-of-day) and the existing convention for `trips.starts_on`/`ends_on`.
- Steps 1-4 run in one migration file but must stay in that order — see ADR
  0003 for why (an old, not-yet-redeployed app instance can still be
  inserting into this table in the window between migration and frontend
  deploy; the default in step 3 keeps those inserts succeeding, and step 4
  can't happen before every row has a value, which requires step 2).
- `expenses_date_not_future` mirrors the existing `amount > 0` check
  already on this table (`0001_init.sql`) — same pattern, defense-in-depth
  alongside app-level validation, not a replacement for it.
- New composite index `(trip_id, date desc)` supports the list's per-trip
  newest-first-by-date query (previously ordered by `created_at` alone,
  which had `expenses(trip_id)` from `0001_init.sql`).
- No RLS policy changes. `date` is just another user-writable column
  covered by the existing `insert`/`update` policies
  (`0001_init.sql`, narrowed to payer-only update by `0006_...sql`) — no new
  permission surface, matching what requirements.md's grounding section
  already concluded.

## Type changes

`src/lib/supabase/types.ts` (hand-maintained, not generated) — add `date:
string` to `expenses.Row`. `Insert` is already `Partial<Row> & {
trip_id, paid_by, amount, description }`, so `date` becomes optional on
insert automatically (matches the DB default covering omission) with no
further change needed there.

## Data-layer changes (`src/lib/data/trips.ts`)

- `addExpense`: signature gains an optional `date?: string` (ISO
  `YYYY-MM-DD`). When omitted (user left the add-form date field blank),
  the function itself fills in `todayIso()` (new helper, see below) before
  the insert — the "defaults to today" rule lives here, once, not
  duplicated in the form component or left to the DB default (which is a
  fallback only — see ADR 0003).

  ```ts
  export async function addExpense(
    supabase: Client,
    input: { tripId: string; paidBy: string; amountCents: number; description: string; date?: string },
  ) {
    const { data, error } = await supabase
      .from("expenses")
      .insert({
        trip_id: input.tripId,
        paid_by: input.paidBy,
        amount: centsToDollars(input.amountCents),
        description: input.description,
        date: input.date ?? todayIso(),
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  ```

- `updateExpense`: signature gains a required `date: string` (the edit form
  always has a value to prefill from the fetched row, so there's no "blank
  means default" case on edit — unlike add). `tripId`/`paidBy` stay
  deliberately absent from the signature, per the existing comment on this
  function (immutable once created, enforced by RLS).
- `getTripView`: 
  - order the `expenses` query by date first, `created_at` as tiebreaker,
    matching acceptance criterion 6: `.order("date", { ascending: false
    }).order("created_at", { ascending: false })` (was `.order("created_at",
    { ascending: false })` alone).
  - replace the module-local `formatDayLabel(e.created_at)` (weekday-only,
    derived from the log timestamp) with `formatDayDate(e.date)` (new
    helper in `src/lib/dates.ts`, described below) — same `expenses[].day`
    field name and shape (a display string) on the returned `TripView`, so
    no consumer beyond the formatting itself changes.
  - `expenses[].date` (raw ISO date) is not otherwise added to the returned
    shape — nothing needs the raw value today, `day` (the formatted label)
    is what the list renders. Add it only if/when the edit page needs the
    raw value (it fetches its own copy of the row directly, see below).
- `getMyTrips`, `createTrip`, `joinTrip`, `completeTrip`, settlement
  (`src/lib/settlement.ts`) — untouched. `date` doesn't feed balances or
  settlement math (requirement 8); `getMyTrips`'s `select("*")` on
  `expenses` will pull the new column but nothing in its return shape uses
  it.

## `src/lib/dates.ts` additions

Two additions, both following this file's existing pattern (pure functions,
no dependencies, reused by both data layer and forms rather than
reimplemented at each call site):

```ts
/** Today's calendar date in the browser's local timezone, as YYYY-MM-DD. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Mon, 9/14" — weekday + numeric date, replacing the old weekday-only expense-list label. */
export function formatDayDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const date = d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
  return `${weekday}, ${date}`;
}
```

`todayIso()` is also what the add-expense/edit-expense forms should use for
any client-side "today" display (e.g. a date `<input>`'s implicit max), so
the browser's and the data layer's idea of "today" can't disagree within
one submission.

## Validation (`src/lib/validation/expense.ts`)

Add a second exported function alongside `isValidExpenseInput`, rather than
folding date into it — date is optional on add (empty string is valid,
meaning "use today") but always-present on edit, so the caller decides
when to invoke it rather than the shared function encoding an
add-vs-edit-specific optionality rule:

```ts
import { todayIso } from "@/lib/dates";

/** A real calendar date, not in the future. Call only when a date string is present — the
 *  add-expense form's blank state (→ defaults to today) is valid and not this function's concern. */
export function isValidExpenseDate(dateIso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return false;
  const d = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  return dateIso <= todayIso();
}
```

Call sites:
- `src/app/trip/[id]/add-expense/page.tsx`: date input is optional; validate
  with `isValidExpenseDate` only if the field is non-empty before calling
  `addExpense` (blank passes through as `undefined`).
- `src/app/trip/[id]/expense/[expenseId]/edit/page.tsx`: date field is
  always populated (prefilled from the fetched row via `expense.date`, the
  raw column, fetched directly here rather than through `getTripView`);
  validate unconditionally alongside the existing
  `isValidExpenseInput(amountCents, description)` check before calling
  `updateExpense`.

## UI

- `src/app/trip/[id]/page.tsx` (expense list): no change needed beyond what
  falls out of the data layer — `expense.day` (already rendered at the
  existing `{expense.payer.displayName} · {expense.day}` line) now reads
  "Mon, 9/14" instead of "Mon" because `getTripView` now populates it via
  `formatDayDate` instead of `formatDayLabel`. No month headers/grouping
  added, per the explicit non-goal.
- Add-expense/edit-expense forms: add an optional (add) / required (edit)
  date `<input type="date">`-style field, wired to `addExpense`/
  `updateExpense`'s new `date` param and the new validation function above.
  Implementation of the form markup itself is the engineer agent's job, not
  specified further here.

## Impact analysis

`addExpense` and `updateExpense` are exported from `src/lib/data/trips.ts`,
the single data-access module for trips/expenses (per
`docs/ARCHITECTURE.md`'s "known integration points"). Grepped all
call sites:

- `addExpense`: only `src/app/trip/[id]/add-expense/page.tsx`. One
  call site.
- `updateExpense`: only `src/app/trip/[id]/expense/[expenseId]/edit/page.tsx`.
  One call site.

Both changes are additive to the TypeScript signatures (`date` is a new
optional param on `addExpense`; a new required param on `updateExpense`,
but `updateExpense` has exactly one caller, being changed in the same PR).
**Not a breaking API contract** in the versioned-route sense — this is a
direct-client-to-Supabase mutation (per `docs/ARCHITECTURE.md`'s mutation
pattern), not a `src/app/api/` route with independent consumers, so there's
no `/api/v2/...`-style versioning question here; the TypeScript function and
its one call site ship together in this PR.

The one real cross-deploy compatibility concern is schema-level, not
API-level: **the DB migration and the frontend deploy are not atomic**
(Supabase migration apply and Vercel deploy are separate operations). ADR
0003 covers this in detail; the short version:
- Old (pre-feature) frontend code running against the new schema: still
  works, because the column has a DB-level default
  (`current_date`) by the time it's `not null` — old `addExpense`/`.insert()`
  calls that don't send `date` succeed and get today's UTC date.
- New frontend code running against the old (pre-migration) schema is the
  other direction of the race: if the frontend deploy somehow completes
  before the migration, an insert/update sending a `date` field against a
  schema that doesn't have that column yet would fail (PostgREST rejects
  unknown columns). Mitigation: apply the Supabase migration first, then
  deploy the frontend (standard order for this project already, per how
  prior migrations like `0006` shipped alongside `edit-own-expense`) —
  called out here explicitly since getting the order backwards is the
  actual risk, not the schema change itself.

Other consumers checked and unaffected:
- `getTripView`'s `expenses[].day` field: consumed only by
  `src/app/trip/[id]/page.tsx`'s expense list render. Same field name and
  type (string), just a different formatted value — no destructuring or
  type change needed at the call site.
- `src/lib/settlement.ts` (`computeBalances`/`simplifyDebts`): takes
  `{ id, paidBy, amountCents, description }` shaped objects built in
  `getTripView`/`getMyTrips`; `date` is never passed in, so settlement math
  is untouched (matches requirement 8, and the explicit non-goal on
  settlement/balance changes).
- `getMyTrips`: `select("*")` on `expenses` will include the new `date`
  column in the raw query result, but its mapped return shape doesn't
  reference it — no change to `MyTrip`'s type.
- Storage/receipt-photo RLS (`storage.objects` policies in `0001_init.sql`):
  unrelated, untouched.

## Summary of what's new/changed

| File | Change |
|---|---|
| `supabase/migrations/0007_add_expense_date.sql` | new column, backfill, default, not-null, future-date check, index |
| `src/lib/supabase/types.ts` | `expenses.Row.date: string` |
| `src/lib/dates.ts` | `todayIso()`, `formatDayDate()` (new) |
| `src/lib/validation/expense.ts` | `isValidExpenseDate()` (new) |
| `src/lib/data/trips.ts` | `addExpense` (optional `date` param, defaults via `todayIso()`), `updateExpense` (required `date` param), `getTripView` (order by date then created_at; `day` now via `formatDayDate`) |
| `src/app/trip/[id]/add-expense/page.tsx` | optional date input, wired to `addExpense` + `isValidExpenseDate` |
| `src/app/trip/[id]/expense/[expenseId]/edit/page.tsx` | required date input (prefilled from fetched row), wired to `updateExpense` + `isValidExpenseDate` |
| `src/app/trip/[id]/page.tsx` | no code change; `expense.day` label changes in content only |
| `docs/adr/0003-expense-date-column-sequencing.md` | new ADR |
