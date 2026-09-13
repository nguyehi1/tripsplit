# Edit own expense — QA report

## Verdict

**Pass.** All 7 acceptance criteria verified, no regressions found. Full suite green:
`npm test` (23/23), `npm run lint` (clean), `npm run typecheck` (clean).

## What was tested and how

1. **Static review** of the migration, RLS policy history (`0001` → `0005` → `0006`), the new
   `updateExpense` data-access function, the new edit page, the refactored add-expense page, the
   shared validator, and the dashboard's edit-affordance wiring — cross-checked every claim in
   `architecture.md` and `design.md` against the actual code rather than trusting the write-up.
2. **New automated tests** (Vitest), added under this QA pass:
   - `src/lib/validation/expense.test.ts` — 8 cases covering the validator's boundary conditions
     (zero, negative, 1-cent minimum, empty/whitespace-only description, trimmed-but-valid
     description, both invalid at once).
   - `src/lib/data/trips.test.ts` — exercises `updateExpense` and `addExpense` against a fake
     chainable Supabase client, asserting exact payload shape, that `updateExpense` never sends
     `paid_by`/`trip_id`/`id` in its update body, that it scopes via `.eq("id", …)`, and that a
     `PGRST116` ("0 rows", i.e. RLS-excluded) error is rethrown rather than swallowed. Also pins
     down that `addExpense`'s insert payload is byte-for-byte unchanged after the refactor.
   - Had to add a `resolve.alias` for `@` to `vitest.config.mts` — `src/lib/data/trips.ts` (and
     by extension any test importing it) uses the `@/...` path alias, which vitest wasn't
     resolving; the one pre-existing test file (`settlement.test.ts`) had simply never imported
     anything that needed it. This is a test-infra fix, not an application change.
3. **Live RLS verification against a real Postgres instance** (not just reading the SQL): spun up
   a throwaway local PostgreSQL 10 cluster, stubbed the minimal Supabase-platform scaffolding
   TripSplit's migrations assume (an `auth.users` table + `auth.uid()` backed by a settable GUC,
   a minimal `storage` schema, the `anon`/`authenticated`/`service_role` roles, and the default
   table grants Supabase's project template normally provides), then applied
   `0001_init.sql` → `0002` → `0003` → `0005` → `0006` unmodified (see note on `0004` below) and
   ran real `UPDATE` statements through the `authenticated` role with `SET ROLE` +
   `app.current_uid` standing in for different signed-in users. This is what backs the AC5/AC6/AC7
   results below — they're observed database behavior, not inferred from reading the policy SQL.
   Instance and all fixtures were torn down after; nothing persists outside the scratchpad.
   - `0004_lock_down_rls_auto_enable.sql` failed to apply in this stub environment because it
     revokes execute on `public.rls_auto_enable()`, a function the migration's own comment says
     is "installed outside of migrations… by the Supabase dashboard/template" — i.e. a
     platform-provided function this bare-Postgres harness has no equivalent for. This is a gap
     in my stub, not a defect in the migration or a blocker for this feature (0005 and 0006 both
     applied cleanly immediately after skipping it, and neither touches anything `0004` cares
     about). Flagging for completeness, not as a finding against this feature.
4. Ran `npm test`, `npm run lint`, `npm run typecheck` for the full repo.

## Acceptance criteria — pass/fail

1. **Edit affordance only on your own expense, only on an open trip** — **Pass.** Dashboard code
   (`src/app/trip/[id]/page.tsx`) computes `editable = expense.payer.id === you?.id &&
   !trip.isCompleted` and only renders `role="button"`, `tabIndex`, the click/keydown handlers,
   and the `PencilIcon` when `editable`. `you.id` is `getTripView`'s `memberById.get(currentUserId)`
   where `currentUserId` comes from `supabase.auth.getUser()` and `payer.id` is `paid_by` — i.e.
   the UI check compares the same identity the DB policy checks. Confirmed rows for other payers
   render with no `role`, no handlers, no pencil (identical to pre-feature markup).
2. **Same validation as add-expense; invalid input shows inline error, doesn't save** — **Pass.**
   Both `add-expense/page.tsx` and the new `expense/[expenseId]/edit/page.tsx` import and call the
   same `isValidExpenseInput` from `src/lib/validation/expense.ts`, with the identical error copy
   ("Enter an amount and what it was for.") and the identical short-circuit (`return` before
   calling the mutation) on failure. Verified with 8 new unit tests on the validator itself,
   including boundaries (`0` and `-100` cents rejected, `1` cent accepted; empty and
   whitespace-only descriptions rejected; a description with surrounding whitespace but real
   content accepted).
3. **Saved changes reflected immediately on dashboard, settle-up, My Trips** — **Pass.** Grepped
   `src/app` and `src/lib` for any caching directive (`revalidate`, `cache:`, `unstable_cache`,
   `force-cache`, `no-store`) — none exist anywhere in the app. All three consumers
   (`src/app/trip/[id]/page.tsx`, `src/app/trip/[id]/settle-up/page.tsx`,
   `src/app/trips/page.tsx`) are client components that `useEffect`-fetch `getTripView`/
   `getMyTrips` fresh on mount with no memoization keyed on anything but the route param, so a
   `router.push` back to any of them after a save re-fetches from Postgres. `getTripView` and
   `getMyTrips` were also read end-to-end and both simply `select("*")` on every call.
4. **Cancel leaves the original expense unchanged** — **Pass.** The edit page's close button
   (`CloseIcon` in the `TopBar`) calls only `router.push`, with no call to `updateExpense` on that
   path — there is no code path from "cancel" to a mutation, so this holds by construction, same
   as add-expense's existing close behavior.
5. **Editing someone else's expense is rejected server-side (RLS), not just hidden in the UI** —
   **Pass, verified live.** Seeded a real Postgres instance running TripSplit's actual `0001`→`0006`
   migrations with two users (Alice paid, Bob didn't) on the same open trip. As `authenticated`
   impersonating Bob (`app.current_uid` = Bob's id), `UPDATE public.expenses SET amount = 999.00
   WHERE id = <Alice's expense>` returned **`UPDATE 0`** — the row was silently excluded by the
   `using` clause (`paid_by = auth.uid()`), and the amount was confirmed unchanged afterward. A
   control case (Alice editing her own expense) in the same session returned `UPDATE 1` and
   persisted the change, confirming the harness itself isn't just failing every update. This 0-row
   result is exactly what `updateExpense` (via `.select().single()`) turns into a `PGRST116` error,
   which the edit page's `catch` maps to "You can only edit expenses you paid for." — confirmed
   that error-code branch exists and is reachable in `edit/page.tsx`.
6. **Editing any expense on a completed/locked trip is rejected, UI and DB** — **Pass, verified
   live.** UI: dashboard hides the pencil/tap-target for every row once `trip.isCompleted`,
   including the payer's own rows (code inspection). Edit page: if the trip is locked, the load
   effect sets `locked = true` and the full-screen locked state (mirroring add-expense's) replaces
   the form entirely, covering the race where a trip is completed between opening the row and the
   edit screen finishing its load. DB: in the same live-Postgres session, after `UPDATE
   public.trips SET completed_at = now()`, Alice (the real payer) attempting `UPDATE
   public.expenses SET amount = 1.00 WHERE id = <her own expense>` returned **`UPDATE 0`**, and the
   amount was confirmed unchanged — `is_trip_open(trip_id)` in the policy blocks it even for the
   legitimate payer, exactly as designed.
7. **`paid_by`/`trip_id` never change on edit** — **Pass**, with one nuance worth recording.
   `updateExpense`'s signature/payload never includes either column (confirmed via the new
   `trips.test.ts` payload assertions), so no code path in the app can attempt it. At the DB
   level, live-tested Alice (the real payer) attempting `UPDATE public.expenses SET paid_by =
   Bob's id WHERE id = <her own expense>`: this does **not** come back as a quiet 0-row result —
   because the *old* row still matches `using` (she's still the payer of the pre-update row),
   Postgres proceeds to build the new row, and *that* fails `with check` (new `paid_by` = Bob ≠
   `auth.uid()` = Alice), which Postgres surfaces as a **hard error** (`ERROR: new row violates
   row-level security policy for table "expenses"`, i.e. `42501`), not a 0-row PostgREST result.
   `paid_by` was confirmed unchanged afterward either way. Functionally AC7 holds — the value
   cannot be changed — but note for whoever builds on this: a payer-initiated attempt to reassign
   `paid_by` surfaces as a Postgres RLS-violation error (`42501`), a *different* failure shape than
   the "0 rows"/`PGRST116` shape AC5 relies on and that `edit/page.tsx`'s `catch` branch currently
   special-cases. Not a bug against this feature (the app never sends `paid_by`, so this path is
   unreachable through the shipped UI, and `edit/page.tsx`'s generic "Couldn't save those changes —
   try again." fallback would still catch it if it were ever hit some other way), but worth
   knowing if a future change ever lets `paid_by` reach `updateExpense`'s payload.

## Regression check (architecture.md's consumer list)

- **`addExpense` / add-expense page** — the one call site actually refactored to use the shared
  validator. Re-read the diff-equivalent behavior line by line: identical validation rule,
  identical error message, identical submit/insert payload shape (`trip_id`, `paid_by`, `amount`,
  `description` — confirmed unchanged via a new unit test), identical locked-trip UI, identical
  navigation. No behavior change found.
- **`getTripView` (trip dashboard, settle-up)** and **`getMyTrips` (My Trips)** — neither function
  nor their SELECT policy was touched by this feature; confirmed by re-reading both in full. Live
  Postgres check additionally confirmed the SELECT policy still lets a non-payer (Bob) read an
  expense he didn't pay for (needed for the dashboard to render other members' rows, and for the
  edit page's "not reachable through normal navigation but let's confirm anyway" load-then-reject
  path) — unaffected by the UPDATE policy narrowing.
- **Delete policy / delete affordance** — no delete UI exists (explicit non-goal); confirmed the
  delete policy text is byte-identical to before (`0005`'s version, untouched by `0006`). The
  resulting update/delete permission asymmetry is flagged in architecture.md as a known, deliberate
  sequencing choice — not a regression, not re-litigated here.
- **Direct PostgREST/API callers relying on the old "any member can edit any expense" policy** —
  architecture.md correctly notes no shipped code exercises this; confirmed by grep. No
  in-repo consumer affected.
- **Migration ordering / applies cleanly** — applied `0006` on top of a freshly-migrated `0001`→
  `0005` chain in a live Postgres instance with no errors; the `drop policy "members can edit
  expenses"` target exists at that point (recreated under that exact name by `0005`), so the drop
  doesn't fail. **Reversibility**: this migration only swaps a policy definition (drop + create,
  no data mutated, no column/table change) — a follow-up migration doing the inverse drop/create
  would cleanly restore prior behavior with no data loss. No down-migration file exists, but that
  matches every other migration in this repo (no down-migration convention is used anywhere in
  `supabase/migrations/`), so this isn't a deviation from project norms.

## Full suite results

| Check | Result |
|---|---|
| `npm test` | **Pass** — 23/23 tests, 3 test files (`settlement.test.ts` pre-existing, `expense.test.ts` and `trips.test.ts` added this pass) |
| `npm run lint` | **Pass** — no output, no errors |
| `npm run typecheck` | **Pass** — no output, no errors |

## Files touched by this QA pass

- `src/lib/validation/expense.test.ts` — new
- `src/lib/data/trips.test.ts` — new
- `vitest.config.mts` — added `resolve.alias` for `@` so tests can import modules that use the
  `@/...` path alias (test-infra fix, required to exercise `trips.ts` at all; no application code
  changed)

No implementation files were modified to make anything pass.
