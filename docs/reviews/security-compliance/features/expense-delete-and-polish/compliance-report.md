# Compliance report (final): expense-delete-and-polish

Mode: final. Date: 2026-10-19. Not legal advice. Reviewed the real code: migration
`supabase/migrations/0024_expense_delete_undo_and_erase.sql`, `src/lib/errors.ts`,
`src/lib/data/trips.ts` (deleteExpense / undoDeleteExpense), `src/app/trip/[id]/expense-undo-provider.tsx`,
`src/app/trip/[id]/edit-expense-sheet-content.tsx`, `src/app/you/page.tsx`, `src/app/trips/page.tsx`,
`src/app/trip/[id]/page.tsx`, `docs/ANALYTICS.md`, `src/lib/legal.ts`. QA report not re-audited.

## Verdict

**Pass. No blocking code findings. No new rule missed by earlier modes.** Two gates remain that are
not code defects: the runbook text (docs stage) and confirming pg_cron on the live project before release.

## Pass/fail per constraint

| Constraint | Result | Evidence |
|---|---|---|
| Money: payer only, enforced in DB | Pass | `delete_expense` / `undo_delete_expense` check `auth.uid()`, `paid_by = uid`, `is_verified_trip_member` (twice, before and after the lock); insert policy now `paid_by = auth.uid()`; update policy requires payer, verified, open, `deleted_at is null`; DELETE privilege revoked, no delete policy |
| Money: open trip only, lock race | Pass | Trip row read `for share` then `completed_at` checked in both RPCs; erase ignores lock state, so it changes no locked figure (the row was already excluded) |
| Money: explicit action, Undo | Pass | Delete button, toast with Undo; server accepts Undo to 15 s on DB clock, erase from 30 s |
| Money: no who-deleted record | Pass | Only `deleted_at timestamptz`; no actor column, no text |
| `deleted_at` unwritable by client | Pass | `revoke update`, then `grant update (amount, description, date)` only |
| Hidden rows unreadable by members | Pass | Select policy `... and deleted_at is null`; `get_trip_summary` filters total and the LEFT JOIN `ON` clause, returns no descriptions; grants not re-granted (`create or replace` only) |
| F1 max erase delay stated, second layer | Pass (with gate G1) | pg_cron each minute plus bounded opportunistic batch in both RPCs inside an exception block so it never rolls back the user action; cron block cannot fail the migration and emits a NOTICE if absent |
| F2 erase atomic with list-item links | Pass | Batch reverts items, then deletes with the age re-asserted; FK `on delete set null`; claim/unclaim clear the marker |
| Erase not callable by clients | Pass | `revoke execute ... from public, anon, authenticated` on both erase functions and the interval helpers; no parameters |
| No notification, no trigger/realtime leak | Pass | No code path sends anything; no trigger on `expenses` added |
| C1 copy facts only | Pass | Strings: "Delete expense", "Deleting...", caption "You'll have a few seconds to undo. After that, it can't be brought back." (true: Undo refused after 15 s, row gone from 30 s), "Expense deleted", "Restoring...", "Expense restored", "This expense isn't available anymore." No "erased from all systems", no backup claim, no "only you can see it", no time figure like "2 minutes" in user copy |
| C2 failures plain, no row content | Pass | `ExpenseActionError` carries only a code; raw error dropped, not logged (no `console` in the wrappers); one neutral delete line; Undo line "Couldn't undo — it's too late, or the trip was locked." for window/erased/locked/not-allowed alike; toast and announcements never contain name, amount or description |
| C3 analytics name only | Pass | `trackEvent("expense_delete_complete")` (edit sheet, after success) and `trackEvent("expense_undo_complete")` (provider, after success): no properties. Both listed in `docs/ANALYTICS.md` rows 51-52 with matching names. `timeClient` labels fixed (`deleteExpense`, `undoDeleteExpense`), no ids. Design review fix D1 applied |
| No device storage of pending Undo | Pass | Provider keeps state in memory and timers only, no URL, localStorage or sessionStorage |
| Public summary no free text | Pass | Return table unchanged (member id, name, cents) |
| `/privacy`, `/terms` no change still right | Pass | `LEGAL_LAST_UPDATED` still "October 13, 2026". Retention text "kept while the trip exists and until you ask us to delete it" stays true; nothing is retained after about 2 minutes in normal operation; no new personal data, vendor or message |
| M1 (re-review if settled/paid state ever added) | Pass | Baseline Money records rule, ADR 0017, architecture section 12 |
| Feedback relocation (items 36-41) | Pass | You: third row after Terms linking `/feedback` with no query; trip details keeps the icon (`IconLinkButton href="/feedback"`); Trips/home has no feedback link (only a code comment mentions it). Form, storage and copy untouched |
| Rate limit | Pass | `throttle_rpc('expense-change:<uid>:<trip>', 20, 60)` after entitlement checks. Bucket key holds user and trip ids in `rpc_rate_limits`, covered by the existing purge and by the privacy page's rate-limit line (no new retention) |
| Export / erasure interplay | Pass in code; runbook pending (gate R1) | Export by `paid_by` includes an in-window row; account deletion inside the window fails on the FK until erase (tested per QA); purge skips payers briefly |

## Blocking findings

None.

## Gates (not failures)

**R1. Runbook (`docs/runbooks/account-deletion-and-export.md`), docs stage must include:**
1. A deleted expense is hidden at once, undoable for 15 s on the server, and hard erased about 2 minutes
   after delete at most when pg_cron runs; a row inside its window is exported like any other (export
   query by `paid_by`).
2. Before account-deletion case A or B, if the requester deleted an expense in the last few minutes,
   wait, or run `select public.erase_expired_expenses();` as the postgres owner, then run the usual
   check (the `paid_by` FK has no ON DELETE action).
3. Overdue check, expected 0: `select count(*) as overdue, min(deleted_at) from public.expenses where
   deleted_at is not null and deleted_at < now() - interval '10 minutes';` and
   `select jobname, schedule, active from cron.job where jobname = 'erase-expired-expenses';`
4. An owner and a frequency for that check (recommended: operator, daily), stated as the 24-hour cap
   commitment; plainly say the cap is operational, not a code guarantee, when pg_cron is absent and the
   app is idle.
5. Deploy order: apply 0024 first, then the app; after applying, confirm the `cron.job` row and that
   `pg_publication_tables` has no rows for `expenses` / `shopping_list_items` (expect zero).
6. Note that the migration emits a NOTICE when pg_cron is missing; the fallback (a Vercel cron route) is
   not built.

**G1. Before release:** confirm pg_cron is enabled on the live project and the `erase-expired-expenses`
job exists after applying 0024. If not, "about 2 minutes" is false for an idle deployment; either build the
fallback or accept a weaker stated bound in writing. No user-facing copy states a time, so no copy fix is
needed either way.

## Advisory

- A1: Undo copy for a throttled or network failure reads "check your connection and try again"; acceptable,
  reveals nothing.
- A2: `docs/ANALYTICS.md` rows 49-50 still cite an older edit-page path; pre-existing, not part of this
  feature.
- A3: counsel question stays open and non-blocking: irreversible erase of a money record with no audit
  trail (baseline "Open positions").
- A4: the Settle-up placeholder wording "then mark it paid" implies a feature that does not exist;
  predates this work; fix when M1 is next reviewed.

## Proposed baseline rule

None new: both rules found at requirements and design (irreversible erase conditions; hide-then-erase max
time, DB-level hiding, operator check, second layer) are already in the baseline. One optional
tightening: under Personal data, "A check that depends on an optional extension (pg_cron) is a release
gate: the feature's release checklist confirms the extension is enabled on the live project."
