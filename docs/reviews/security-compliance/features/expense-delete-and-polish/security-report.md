# Security report (final): expense-delete-and-polish

Date: 2026-10-19. Mode: final. Reviewed the working tree: `supabase/migrations/0024_expense_delete_undo_and_erase.sql`, `src/lib/data/trips.ts`, `src/lib/errors.ts`, `src/lib/supabase/types.ts`, `src/app/trip/[id]/{expense-undo-provider,edit-expense-sheet-content,layout,shopping-list-tab,floating-notice}`, the Settle-up / Invite / You / Trips diffs, and the QA report. No new dependencies (package.json unchanged).

Independent verification (not just reading): I built my own scratch Postgres 10.5 in the scratchpad (own port, socket only, stopped afterwards), applied 0001 to 0023 (only the PG11 `execute function` syntax adapted), then 0024 twice. Results:
- Re-apply is clean. `pg_policies` for `public.expenses` is exactly one select (`... and deleted_at is null`), one insert (`paid_by = auth.uid()`, `deleted_at is null`), one update (`deleted_at is null` in using and with check), zero delete. No stale policy survives (B1 fixed in the code).
- Privileges (with Supabase-style default ACLs emulated): `authenticated` has no table DELETE, no table UPDATE, UPDATE only on `amount`, `description`, `date` (not `deleted_at`, not `trip_id`). `anon` cannot execute `delete_expense`, `erase_expired_expenses`; `authenticated` cannot execute `erase_expired_expenses*` or the interval helpers; `get_trip_summary` still not executable by anon or authenticated (create or replace kept the 0021 revoke).
- Behaviour as `authenticated`: non-payer delete fails with EX001; insert naming another payer rejected by RLS; payer delete hides the row; second delete EX001; Undo restores; direct `update ... set deleted_at` is permission denied; signed-out call EX001; `anon` calls are permission denied.
- QA's own real-Postgres scripts (docs/features/expense-delete-and-polish/qa-sql) cover the two-session races, boundary times, items, trigger and cron-absent path; I read their reported results and found them consistent with the code.

## Verdict

**PASS. No blocking findings.** Two should-fix items and several notes. Nothing found late that an earlier mode missed, so no baseline gap beyond the rule already added at design time (name policies exactly and assert the full policy set; present in the baseline).

## Pass/fail per constraint (checked against the real code)

| Constraint | Result | Evidence |
|---|---|---|
| C1/C2 definer RPCs, trip derived from the row, fixed errors, hygiene | PASS | `delete_expense`/`undo_delete_expense`: `auth.uid()` null check, payer match, `is_verified_trip_member`, trip lock, fixed `EX001`/`EX002`, `set search_path = public, pg_temp`, uuid param only, no defaults, revoke public/anon, grant authenticated. All plpgsql variables `_v_` prefixed; no OUT parameters. |
| C1/B4 insert pinned to caller | PASS | Policy text above; add-expense RPC unchanged (definer uses `auth.uid()`), never sets `deleted_at`. |
| C3/S2 mark unwritable; `paid_by`/`trip_id` immutable | PASS | Column grants verified; the only client UPDATE in the app (`updateExpense`) sends exactly `amount`, `description`, `date`. |
| C4/H1 no hard delete | PASS | Policy dropped, privilege revoked, no BEFORE DELETE trigger. Cascade/purge unaffected (not client roles). |
| B1 exact policy set | PASS | Dropped by live 0009 names plus older names plus the new names (re-run safe); final set verified on scratch; QA test asserts the set. |
| C5/C6/L1-L5 list-item link | PASS | Delete revert sets `open`/`claimed` (shape check holds); Undo re-link predicate (marker, `expense_id is null`, `claimed`, same member, same trip) then marker cleanup; claim/unclaim clear marker (bodies copied from 0015 plus one assignment); erase clears via the same update and the FK `on delete set null`. |
| C10/S1/S4/N1 hiding independent of erase | PASS | Select policy hides any marked row; `get_trip_summary` filters in `total` and in the LEFT JOIN `ON` (members with no live expenses stay); edit read treats PGRST116 as not-found; no TS query filters (guard test pins the sites). |
| C12 purge / was_removed counting an in-window row | PASS | Unchanged functions, deliberately count the row; documented. |
| C14/C15 code-only errors, no raw error, name-only analytics | PASS | `deleteExpense`/`undoDeleteExpense` throw `ExpenseActionError(code)` only; the mapper reads the SQLSTATE and only the throttle message prefix; no `console`, no storage use in the provider or sheet; events `expense_delete_complete` and `expense_undo_complete` carry no properties; timing labels are fixed strings. |
| C16/C26 no trigger/realtime leak | PASS (this DB), release check open | No triggers on `expenses`; no `.channel(` in code. Live `supabase_realtime` publication must be checked on release (G-list). |
| C17 Undo state memory only | PASS | Provider state is in-memory; nothing in URL or storage. |
| C18/A1/N6 rate limit | PASS | `throttle_rpc('expense-change:<uid>:<trip>', 20, 60)` after entitlement checks, shared by delete and Undo; failed calls roll back their own increment so probes neither consume nor change anything; no second write path (no DELETE privilege, mark not client-writable). |
| F1 hiding does not depend on finalize | PASS | See above. |
| F2/N2 two layers, delay, check query, cron-absent path | PASS (runbook pending) | pg_cron job each minute, guarded, idempotent (unschedule then schedule), exception-safe; opportunistic batch inside delete and Undo; cron-absent path tested by QA. The runbook check query is not yet written (see S-2). |
| F4/N3 erase predicate | PASS | `erase_expired_expenses_batch`: no parameters; predicate inside the locking select (`deleted_at is not null and deleted_at < clock_timestamp() - 30 s`, `order by`, `limit 50`, `for update skip locked`); the DELETE re-asserts both `deleted_at is not null` and the age (design S2 done). Never references trip state, so locked trips are erased. |
| F5 erase not executable by clients | PASS | Verified with `has_function_privilege` on emulated Supabase default ACLs; no member-callable wrapper built. |
| U1-U6/N4 DB-clock window, ordering, no extension | PASS | Mark from `clock_timestamp()`; Undo accepted until +15 s, judged after the row lock; erase from +30 s; second delete raises EX001 without rewriting; Undo of a live or erased row EX002. |
| T1-T3 trip lock | PASS | `select ... from trips ... for share` in both RPCs before the expense lock; completion read from that locked row, not `is_trip_open()`; lock order trips, expenses, items consistent with erase, claim/unclaim, add-expense. |
| S5 membership re-check after lock | PASS | Both RPCs repeat `is_verified_trip_member` after taking the trip lock. |
| S1 (design) one neutral delete error; double-tap guard | PASS | `expenseDeleteErrorCopy()` is a single line for every failure; both buttons disabled while a request is in flight. |
| S4 (design) no explicit begin/commit | PASS | Removed; file states how it is applied. Cron block last with its own handler. |
| M1-M6 migration safety | PASS | Additive nullable columns, partial indexes, `if not exists`, drop-by-name, applies twice, new-code/old-schema maps PGRST202/42883 to "unavailable" with no direct-delete fallback (and the privilege is revoked anyway). |
| Items 2-4 (Settle-up, Invite, Feedback) | PASS | UI-only diffs; `/feedback` link has no query; feedback route/proxy untouched. |
| Dependencies | PASS | No package changes. (`npm audit` reports pre-existing advisories unrelated to this diff; not assessed here.) |

## Findings

S-1 (should-fix). `/api` end-to-end behaviour of the new RPCs through PostgREST was not exercised by anyone (QA says PGRST202 mapping is unit-tested only). Custom SQLSTATEs `EX001`/`EX002` should come back as `code: "EX001"`; if PostgREST reshaped them, the mapper would return `unknown` and the user would see the neutral copy, which fails safe. Confirm once on the scratch Supabase stack or in the release smoke test (delete then Undo on a throwaway trip). No data risk either way.

S-2 (should-fix, release gate). Runbook `docs/runbooks/account-deletion-and-export.md` is not updated (no diff). The overdue-rows query, the "run `erase_expired_expenses()` before case A" step and the erase note are what back the 24-hour cap. Must land before ship.

Release gates (not code defects): confirm pg_cron is enabled on the live project and `cron.job` has `erase-expired-expenses` (when absent, rows are still hidden and un-undoable, only free-text retention is affected); run `select * from pg_publication_tables where tablename in ('expenses','shopping_list_items')` on live (expect zero rows).

Notes:
- N-1. `is_verified_trip_member` counts the trip creator even if their `trip_members` row is gone (QA observation 5), so such a creator could still delete their own expense. Harmless: own row, open trip only.
- N-2. `TRUNCATE` stays granted to `anon`/`authenticated` by Supabase default ACLs on every table including `expenses`. It ignores RLS but is not reachable through PostgREST; pre-existing and project-wide.
- N-3. `service_role` keeps execute on the erase functions by default ACLs (server-only key, expected).
- N-4. The product choice that a second delete replaces the earlier toast means the first expense can no longer be undone from the screen although the database would accept Undo until +15 s. Safe either way.
- N-5. Accepted residual risk (compliance M1, architecture section 12): a payer can irreversibly remove their own expense on an open trip after the Undo window, with no record. Any future "settled/paid" state must re-review every delete, Undo and erase path.
- N-6. `unlinked_from_expense_id` is returned by `select("*")` on shopping-list items and may point at an expense the member can no longer read. No content; accepted.
- N-7. Unverified by anyone: live Postgres major version differs from the 10.5 scratch (no 0024 feature is newer than 9.6); browser rendering.

## Baseline gap
None new. The design-mode rule (drop RLS policies by their live name and assert the full `pg_policies` set) is already in `docs/reviews/security-compliance/project/security-baseline.md`; the implementation followed it.
