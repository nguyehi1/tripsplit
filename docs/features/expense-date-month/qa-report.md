# QA report: expense date and month

## Summary

Typecheck fix applied (5 missing `date` args in `trips.test.ts`), new automated
test coverage added for the feature's acceptance criteria, full suite +
lint + typecheck run. **One real bug found**: `isValidExpenseDate` accepts
invalid calendar dates (e.g. "2024-02-30") because JS `Date` silently
rolls them over instead of rejecting them — violates acceptance criterion 4
("must be a real calendar date"). Everything else verified passes.

## What was fixed as part of QA

- `src/lib/data/trips.test.ts`: added a `date` fixture (`FIXED_DATE =
  "2024-05-10"`) to the 5 `updateExpense(...)` call sites that were missing
  the now-required `date` argument, which was failing `npm run typecheck`.
- `src/lib/data/trips.test.ts`: the pre-existing `addExpense` "insert shape"
  regression test asserted an exact payload `toEqual` without a `date` key;
  updated to pass an explicit `date` and added two new tests asserting the
  default-to-`todayIso()` behavior when `date` is omitted/`undefined` (this
  was a real, if narrow, test failure before the fix — not just a typecheck
  issue).

## New test coverage added

- `src/lib/dates.test.ts` (new file): `todayIso()` format/local-date
  correctness; `formatDayDate()` weekday+date formatting, no leading zeros,
  no year, correct weekday across two distinct dates; regression checks that
  `formatDate`/`formatDateRange` are unchanged.
- `src/lib/validation/expense.test.ts`: added `isValidExpenseDate` coverage
  — accepts today/past dates, rejects future dates, empty string, malformed
  string, non-zero-padded string, and (this one fails — see Bug below)
  non-existent calendar dates like Feb 30.
- `src/lib/data/trips.test.ts`:
  - `addExpense` AC1 tests: date defaults to `todayIso()` when omitted or
    `undefined`.
  - New `getTripView` describe block (new `makeTripViewFake` helper
    supporting the thenable Postgrest-style chain used by `trips`/
    `trip_members`/`expenses` queries): asserts the expenses query is
    ordered `.order("date", {ascending:false}).order("created_at",
    {ascending:false})` (AC6); asserts `expenses[].day` is built from the
    per-expense `date` field via `formatDayDate` (AC5); asserts an old/
    unrelated expense date does not perturb settlement balances (AC8).

## Acceptance criteria — pass/fail

| # | Criterion | Result |
|---|---|---|
| 1 | Date optional on add, defaults to today when blank | **Pass** — `addExpense` defaults via `todayIso()`; form pre-fills today and sends `date: date || undefined`; covered by new tests. |
| 2 | Date stored separately from `created_at` | **Pass** — new `date` column, migration confirmed additive, `created_at` untouched. |
| 3 | Editing lets payer change date, same validation as create | **Pass** — edit form validates with `isValidExpenseDate` unconditionally; `updateExpense` requires `date`; payer-only/locked-trip gating reused unchanged. |
| 4 | Must be a real calendar date, not in the future | **Fail (partial)** — future-date rejection works correctly (string-compare against `todayIso()`, plus DB check constraint as defense-in-depth). But **"real calendar date" is not enforced**: `isValidExpenseDate("2024-02-30")` returns `true` because `new Date("2024-02-30T00:00:00")` silently rolls over to March 1 instead of producing `Invalid Date`. Same issue applies to e.g. "2024-04-31", "2023-02-29". See Bug section below. |
| 5 | List shows "Mon, 9/14" style date label, no month headers | **Pass** — `getTripView` uses `formatDayDate(e.date)` for `day`; format verified (weekday, numeric M/D, no year); no grouping/headers added (confirmed by reading `page.tsx`, no change there). |
| 6 | Newest-first by date, `created_at` tiebreak | **Pass** — query verified via new test to send `.order("date", desc).order("created_at", desc)`. |
| 7 | Backfill existing rows from `created_at`'s calendar date | **Pass (static review only)** — migration SQL correctly sequences add-nullable → backfill (`created_at::date`) → default → not-null → check → index, matching architecture.md/ADR 0003. **Could not execute against a live/local Postgres instance** in this environment (no `supabase` CLI available) to confirm it applies cleanly against real data; reviewed statically only. |
| 8 | No change to settlement math / My Trips / settle-up | **Pass** — `settlement.ts` untouched (8 existing tests still green); `getMyTrips`'s settlement-shaped objects never reference `date`; new regression test confirms an out-of-order/old expense date doesn't shift computed balances; `src/app/trips/page.tsx`, `src/app/trip/[id]/settle-up/page.tsx`, `src/app/trip/[id]/invite/page.tsx`, `src/app/join/[code]/welcome/page.tsx` all consume `getTripView`/`getMyTrips`'s unchanged shapes (`.day` stays a string, just different content) — no call-site changes needed, confirmed by grep. |

## Bug found (send back to engineer)

**`isValidExpenseDate` in `src/lib/validation/expense.ts` does not actually
reject invalid calendar dates**, contradicting acceptance criterion 4 ("must
be a real calendar date"). Root cause: the regex `^\d{4}-\d{2}-\d{2}$` only
checks shape, and `new Date("2024-02-30T00:00:00")` does not produce
`Invalid Date` in JS — it silently normalizes to `2024-03-01`, so
`Number.isNaN(d.getTime())` is `false` and the function returns `true`.

Reproduction (added as a test, currently failing —
`src/lib/validation/expense.test.ts`, "rejects a string that matches the
pattern but isn't a real calendar date"):
```
isValidExpenseDate("2024-02-30") // returns true, should be false
```
Same class of bug affects any nonexistent day-of-month (e.g. "2024-04-31",
"2023-02-29"). Practical exposure is low since the form uses a native
`<input type="date">` which won't normally produce these values through the
picker UI, but per the design doc's own stated threat model ("a user can
type a date directly into some browsers' date inputs bypassing the
picker"), this is exactly the bypass path the validator is supposed to
catch, and it doesn't — and the DB check constraint (`date <=
current_date`) doesn't help either, since Postgres's `date` parser would
similarly need a real invalid string to fail (it actually would reject
"2024-02-30" at the SQL layer with an error, but the app-level validator
should be catching this before ever reaching the DB, per the app's stated
UX pattern of a friendly inline error rather than a raw Postgres error
surfacing to the user).

**Suggested fix** (for the engineer, not applied by QA): after constructing
`d`, verify the round-trip, e.g. check that
`d.getFullYear() === Number(dateIso.slice(0,4))`, `d.getMonth() + 1 ===
Number(dateIso.slice(5,7))`, and `d.getDate() === Number(dateIso.slice(8,10))`
— rejects any date that got silently normalized.

## Full suite results

- `npm run typecheck`: **Pass** (after QA's fix to `trips.test.ts`).
- `npm run lint`: **Pass**, no warnings/errors.
- `npm test`: **1 failing test** — `src/lib/validation/expense.test.ts >
  isValidExpenseDate > rejects a string that matches the pattern but isn't
  a real calendar date`. This is a QA-authored test that correctly encodes
  acceptance criterion 4 and fails because of the bug above; all other 67
  tests pass (68 total, 6 files: `settlement.test.ts` 8/8, `auth-
  errors.test.ts`, `remembered-email.test.ts`, `expense.test.ts` 16/16 (1
  failing as noted), `trips.test.ts` 12/12, `route.test.ts`).

## Regression check (per architecture.md impact analysis)

- `addExpense` — only call site `src/app/trip/[id]/add-expense/page.tsx`, updated in this PR. Confirmed via grep no other callers.
- `updateExpense` — only call site `src/app/trip/[id]/expense/[expenseId]/edit/page.tsx`, updated in this PR. Confirmed via grep no other callers.
- `getTripView`'s `expenses[].day` — consumed only by the trip dashboard list render (`src/app/trip/[id]/page.tsx`); same field name/type, content changes as intended, no destructuring changes needed elsewhere.
- `src/lib/settlement.ts` (`computeBalances`/`simplifyDebts`) — untouched; existing 8 tests still green; new regression test confirms date has zero influence on computed balances.
- `getMyTrips` / My Trips summary (`src/app/trips/page.tsx`) — unaffected; `select("*")` picks up the new column but the mapped return shape doesn't reference it (confirmed by reading `trips.ts`).
- Settle-up (`src/app/trip/[id]/settle-up/page.tsx`) and invite/join-welcome pages (`src/app/trip/[id]/invite/page.tsx`, `src/app/join/[code]/welcome/page.tsx`) — all consume `getTripView`'s unchanged shape, no code changes present or needed there, confirmed by grep.
- DB migration (`supabase/migrations/0007_add_expense_date.sql`) — reviewed statically: correct add-nullable → backfill → default → not-null → check-constraint → index sequencing, consistent with prior migrations' forward-only pattern (no down-migrations exist anywhere in this repo, so this is consistent with existing convention, not a new gap). **Not executed against a live database** in this QA pass (no Supabase CLI/local Postgres available in this environment) — recommend the engineer or a deploy-time check confirm it applies cleanly against a staging copy of production data before shipping, particularly the backfill step's behavior on any rows with unexpected `created_at` values.

## Edge cases covered

- Add: blank date → defaults to today (string match against `todayIso()`).
- Add/Edit: future date rejected (both via `isValidExpenseDate` unit test and by reading the form's `max={todayIso()}` + submit-time validation).
- Edit: date validated unconditionally (form code reviewed — `!date || !isValidExpenseDate(date)` blocks submit on empty, matching design.md's explicit "empty on edit is an error, not a re-default" decision).
- Ordering: same-day expenses tiebreak on `created_at` (query-level assertion).
- Formatting: no leading zeros, no year, weekday computed independently for two different dates.
- Calendar-date validity: **exposed a real bug** (see above) — invalid day-of-month values like Feb 30 are wrongly accepted.

## Files touched by QA

- `/Users/hiennguyen/Desktop/10. TripSplit/src/lib/data/trips.test.ts` (fixed typecheck failures, added coverage)
- `/Users/hiennguyen/Desktop/10. TripSplit/src/lib/validation/expense.test.ts` (added `isValidExpenseDate` coverage, including the failing bug-reproduction test)
- `/Users/hiennguyen/Desktop/10. TripSplit/src/lib/dates.test.ts` (new file, `todayIso`/`formatDayDate` coverage)
- `/Users/hiennguyen/Desktop/10. TripSplit/docs/features/expense-date-month/qa-report.md` (this report)
