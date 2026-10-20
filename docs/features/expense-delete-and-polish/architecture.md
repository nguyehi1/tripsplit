# Architecture: expense-delete-and-polish

Stage 6 (architecture), revised after the stage 7 design review (security B1, S1 to S5; compliance D1).
Date: 2026-10-19. Semver: feature (backward-compatible for the app; see section 7). Inputs:
[requirements.md](requirements.md) (41 criteria, approved), [planning.md](planning.md) (follow-up decisions
override), security constraints (incl. Revision 2 and Design review) and compliance constraints under
`docs/reviews/security-compliance/features/expense-delete-and-polish/`, the two project baselines,
`docs/ARCHITECTURE.md`, the ADRs, migrations 0001 to 0023.
Decision record: [ADR 0017](../../adr/0017-expense-delete-soft-mark-then-erase.md).

This document designs; it does not implement. SQL below is predicate-level, not final code.

## 0. Summary

- One new migration, `0024_expense_delete_undo_and_erase.sql`. Two additive nullable columns
  (`expenses.deleted_at`, `shopping_list_items.unlinked_from_expense_id`), a partial index, a replaced
  `expenses` policy set (exact names in 2.2) that hides marked rows, column-level UPDATE grants that make
  the mark unwritable by clients, table-level DELETE revoked, insert pinned to `paid_by = auth.uid()`, new
  SECURITY DEFINER functions (`delete_expense`, `undo_delete_expense`, `erase_expired_expenses` and a batch
  helper), edits to `claim_/unclaim_shopping_list_item` (clear the marker) and `get_trip_summary`
  (filter), and a guarded pg_cron registration.
- Hiding is done by RLS (`deleted_at is null` in the read policy), so every existing client query is
  fail-closed with **no TypeScript read-path change**. This also keeps new code safe against the old
  schema (7.2).
- Numbers: UI toast 10 s; server accepts Undo until `deleted_at + 15 s`; erase-eligible from
  `deleted_at + 30 s`; with pg_cron running, erase at most about 90 s after delete.
- App side: no server action, no API route. Two thin wrappers in `src/lib/data/trips.ts`, a code-only
  error mapper, one client provider mounted in `src/app/trip/[id]/layout.tsx` owning pending-Undo state
  and the toast.
- The three UI items are UI-only edits in four files (section 9).

## 1. Existing code checked (reuse, no parallel implementation)

- Throttle: `public.throttle_rpc(bucket, limit, seconds)` and `rpc_rate_limits` (0013), purged by 0019.
  Reused as is. Nothing similar to delete/undo exists; expense delete has never had a UI.
- Scheduled jobs: 0018 and 0019 register pg_cron jobs behind `if exists (select 1 from pg_extension where
  extname = 'pg_cron')`, `unschedule` then `schedule`. Reused as the pattern, with an exception handler
  added (4.2).
- Definer hygiene: 0015 (`set search_path = public`, `revoke ... from public`, `grant ... to
  authenticated`, claim/unclaim as compare-and-swap updates). Reused, stricter here (2.3).
- Code-only error wrapping and PGRST202/42883 handling already exist for `createTrip` in
  `src/lib/data/trips.ts`; `src/lib/errors.ts` has `errorCode`. Reused.
- Expense reads and writes live in `src/lib/data/trips.ts`; the new wrappers go there.
- No toast exists in the app; the Undo toast is new UI (design stage).
- No trigger exists on `expenses` (only on `trip_members`: 0015, 0020). No realtime channel and no
  publication statement in code or migrations (criterion 29). QA runs `select * from pg_publication_tables
  where tablename in ('expenses','shopping_list_items')` on the scratch database and the release checklist
  on live (expect zero rows).

## 2. Data model (migration 0024)

Number: next is **0024**. File `0024_expense_delete_undo_and_erase.sql`. `docs/adr/` has two files
numbered 0014; next free ADR number is **0017**.

### 2.1 Columns and indexes (additive, metadata-only on populated tables)

- `alter table public.expenses add column if not exists deleted_at timestamptz null;` No default, no NOT
  NULL, no rewrite. Written only by the DB functions, from `clock_timestamp()`.
- `alter table public.shopping_list_items add column if not exists unlinked_from_expense_id uuid null
  references public.expenses(id) on delete set null;` Brief SHARE ROW EXCLUSIVE lock, validates against
  all-NULL values: instant. `shopping_list_items_shape_check` does not mention it and is untouched.
- `create index if not exists expenses_deleted_at_idx on public.expenses (deleted_at) where deleted_at is
  not null;` and `create index if not exists shopping_list_items_unlinked_expense_idx on
  public.shopping_list_items (unlinked_from_expense_id) where unlinked_from_expense_id is not null;`.
- No `deleted_by`, no text column (criterion 30).

### 2.2 Policies and privileges on `expenses`

**How it is applied (security S4).** Migrations are applied by hand to live (as 0022/0023) and by the
Supabase CLI, which runs each file in its own transaction. The file therefore has **no explicit
`begin`/`commit`**: it is one multi-statement script applied in one call (one implicit transaction in the
SQL editor, one transaction per file in the CLI). The policy statements are adjacent in the file, so there
is no gap with no update policy or an open delete policy. The cron block is last and has its own exception
handler (a nested subtransaction), so it cannot abort the rest. If a future runner were to apply
statements individually, the contents are still idempotent and re-runnable.

**Exact policy swap (security B1).** The live policy names on `public.expenses` come from migration 0009
(verified against `supabase/migrations`): select `"owner or verified member can read expense detail"`,
insert `"verified member can add expenses"`, update `"verified payer can edit their own expenses"`, delete
`"verified member can delete expenses"`. Older names from 0001/0005/0006 (`"members can read expenses"`,
`"members can add expenses"`, `"members can edit expenses"`, `"payer can edit their own expenses"`,
`"members can delete expenses"`) were already dropped by 0009 but are dropped again defensively. Permissive
policies are OR-ed, so a surviving old policy would silently defeat the change; therefore 0024:

1. `drop policy if exists` for **all nine names above** (the four live ones, the older five, and the five
   new names below so a re-run works), then
2. creates exactly this final set, under new names so nothing can be confused with the old ones:

| Command | Final policy name | Predicate |
|---|---|---|
| select | `"owner or verified member can read live expense detail"` | `is_owner_or_verified_member(trip_id) and deleted_at is null` |
| insert | `"verified member can add own expenses"` | `is_verified_trip_member(trip_id) and is_trip_open(trip_id) and paid_by = auth.uid() and deleted_at is null and exists (select 1 from public.trip_members where trip_id = expenses.trip_id and user_id = expenses.paid_by)` |
| update | `"verified payer can edit their own live expenses"` | using and with check: `paid_by = auth.uid() and is_verified_trip_member(trip_id) and is_trip_open(trip_id) and deleted_at is null` |
| delete | none | no policy |

So `public.expenses` ends with exactly three policies: one select, one insert, one update, zero delete.

Privileges (idempotent):

- `revoke delete on public.expenses from anon, authenticated;` (privilege, not only policy). Trip cascade
  and the 0018 purge are unaffected (referential actions and the definer purge do not run as the client
  roles); both re-tested (criterion 22).
- `revoke update on public.expenses from anon, authenticated;` then `grant update (amount, description,
  date) on public.expenses to authenticated;`. This makes `deleted_at`, `paid_by` and `trip_id` unwritable
  by direct API (criterion 23) with no trigger; `trip_id` becomes immutable (closes the ADR 0002 gap). The
  only direct update in the app (`updateExpense`) sends exactly those three columns. A new `expenses`
  column is not client-updatable unless its migration grants it.
- Back-dating: `update expenses set deleted_at = now() - interval '1 day'` as `authenticated` fails with
  42501 before RLS.
- `service_role` and the owner keep full access; only `get_trip_summary` (definer) touches expense data
  on that path.

**QA test for the policy set (B1).** A test reads `pg_policies` for `schemaname = 'public' and tablename =
'expenses'` after applying 0001 to 0024 in order (on a database that has the live 0009 policies, not a
clean one) and asserts: exactly three rows; one per `cmd` in (`SELECT`, `INSERT`, `UPDATE`); no `DELETE`
row; the three exact names above; `qual`/`with_check` text containing `deleted_at is null` on all three
and `paid_by = auth.uid()` on insert (and on update). A surviving old policy fails the build. A rule to
the same effect is in the security baseline.

### 2.3 New and changed functions

All SECURITY DEFINER functions: `set search_path = public, pg_temp`, every relation schema-qualified,
every column table-aliased, **all plpgsql variables prefixed `_v_`** (0013 broke on an unqualified
`window_start`; here `deleted_at`, `status`, `expense_id`, `claimed_by`, `trip_id` are column names in
several tables). No `RETURNS TABLE`/OUT parameters on the new functions.

| Function | Signature | Grants |
|---|---|---|
| `delete_expense` | `(_expense_id uuid) returns void`, no defaults | revoke from public, anon; grant authenticated |
| `undo_delete_expense` | `(_expense_id uuid) returns void`, no defaults | same |
| `erase_expired_expenses_batch` | `() returns integer` (one batch, cap 50) | revoke from public, anon, authenticated; no grant |
| `erase_expired_expenses` | `() returns integer` (loops batches, cap 10) | revoke from public, anon, authenticated; no grant |
| `expense_undo_accept_interval`, `expense_erase_after_interval` | `() returns interval`, immutable sql, `15 seconds` and `30 seconds` | revoke from public, anon, authenticated |
| `claim_shopping_list_item`, `unclaim_shopping_list_item` | `create or replace`, same signature | grants preserved; one added assignment (3.4) |
| `get_trip_summary` | **`create or replace` only, never `drop function`**, same signature and return table | grants preserved (0021 revoked anon and authenticated; a drop and recreate would re-grant them by Supabase defaults) |

Supabase grants execute to `anon`, `authenticated`, `service_role` by default on new functions, so the "no
grant" functions need the explicit `revoke ... from public, anon, authenticated`. Definer functions call
the erase helpers internally (privilege check is against the owner). `service_role` keeps execute. The
interval helpers keep the numbers in one place so a test can assert `erase_after > undo_accept > 10 s`.

## 3. Function designs

### 3.1 Fixed error codes and client behaviour

Custom SQLSTATEs, fixed message, no row content, no `detail`/`hint`:

- `EX001` message `expense_not_available`: **every** delete failure (signed out, anonymous or unverified,
  not a member, not the payer, payer departed, trip locked, not found, already deleted). Deliberately one
  code, so nothing distinguishes the cause (no existence or ownership oracle).
- `EX002` message `expense_undo_unavailable`: every Undo failure (same set, plus not deleted, window
  passed, erased).
- Rate limit: the existing `throttle_rpc` error (`rate limited: try again shortly`, P0001); the data layer
  matches the message prefix, the only message it inspects.

**Client rules that follow (security S1).** The client cannot and must not tell the failure causes apart.
(a) One neutral line for EX001, e.g. "Couldn't delete that expense. Refresh and try again." (final copy is
design.md's); one neutral line for EX002. design.md's separate copy for "not the payer", "trip locked in the
meantime" and "already deleted treated as success" cannot be implemented from the error and must be
dropped or reworded to the single line. (b) The delete button is disabled while the request is in flight
(covers double tap; a second tap would otherwise get EX001 for "already deleted"). (c) The locked state is
shown from the already-loaded trip state (`isCompleted`), never inferred from an error. (d) After any
EX001 the page refreshes so the user sees current state.

### 3.2 `delete_expense(_expense_id)`

Cheap checks first, throttle only after the caller is proven entitled, locks in a fixed order.

1. `_v_uid := auth.uid()`; null raises EX001.
2. Read (no lock) the expense's `trip_id` and `paid_by`. No row, or `paid_by <> _v_uid`: EX001. Trip id is
   derived from the row (criterion 16).
3. `public.is_verified_trip_member(_v_trip_id)` false: EX001 (also fails a departed payer, criterion 15,
   and any anonymous session).
4. `public.throttle_rpc('expense-change:' || _v_uid || ':' || _v_trip_id, 20, 60)`. One bucket shared by
   delete and Undo, 20 per user per trip per minute. The throttle write is in the same transaction, so a
   call that later raises rolls back its own increment: failed probes cost nothing and change nothing;
   successful calls count. There is no second write path to bypass it (no DELETE privilege, no
   client-writable mark).
5. Lock the trip row: `select t.completed_at ... from public.trips t where t.id = _v_trip_id for share`.
   `complete_trip` updates that row, so delete/Undo and lock serialize. Completed: EX001. The open check
   reads this locked row, not `is_trip_open()`.
6. **Re-check after the lock (security S5):** repeat `public.is_verified_trip_member(_v_trip_id)`, then
   re-read the expense `for update` and repeat: row exists, `paid_by = _v_uid`, `deleted_at is null`. A
   member removed between steps 3 and 6 now fails; an already-deleted row raises EX001 and `deleted_at` is
   never rewritten (criterion 16).
7. `update public.expenses e set deleted_at = clock_timestamp() where e.id = _expense_id`. `paid_by` and
   `trip_id` are never in the SET list (criterion 12).
8. Revert linked items in one statement: `update public.shopping_list_items i set
   unlinked_from_expense_id = _expense_id, expense_id = null, status = case when i.claimed_by is null then
   'open' else 'claimed' end where i.expense_id = _expense_id`. Keeps `claimed_by` ("Your bag"). A removed
   claimer (already null via the 0015 trigger) gives `open` with a harmless marker (Undo needs `status =
   'claimed'`). Both results satisfy `shopping_list_items_shape_check`.
9. Opportunistic erase (4.1) in a nested `begin ... exception when others then null; end` so a hygiene
   failure never rolls back the delete. It cannot erase the row just deleted.

One transaction (criterion 26). Lock order: trips (share), expenses, items. Erase takes expenses then
items; claim/unclaim items only; `add_expense_and_log_shopping_items` inserts an expense then updates
items. No cycle.

### 3.3 `undo_delete_expense(_expense_id)`

Steps 1 to 6 as above (EX002, same bucket, including the post-lock membership re-check). Step 6 then
also requires: row exists, `deleted_at is not null`, `paid_by = _v_uid`, trip not completed, and
`clock_timestamp() < deleted_at + expense_undo_accept_interval()`; any miss is EX002 (same code and
message for erased, expired, live, locked, not payer). Then:

7. `update public.expenses e set deleted_at = null where e.id = _expense_id`.
8. Caller's member id: `select tm.id from public.trip_members tm where tm.trip_id = _v_trip_id and
   tm.user_id = _v_uid`.
9. Re-link only items still in the state delete left them: `update public.shopping_list_items i set status
   = 'logged', expense_id = _expense_id, unlinked_from_expense_id = null where i.unlinked_from_expense_id =
   _expense_id and i.expense_id is null and i.status = 'claimed' and i.claimed_by = _v_member_id and
   i.trip_id = _v_trip_id`. Never by description (criterion 9).
10. `update public.shopping_list_items i set unlinked_from_expense_id = null where i.unlinked_from_expense_id
    = _expense_id` (no stale marker survives).
11. Opportunistic erase (4.1), wrapped as in delete.

No message about un-relinked items (criterion 9).

### 3.4 Item-marker consistency (criterion 25)

Edit the two existing RPCs, not a trigger (ADR 0013 keeps triggers narrow):

- `claim_shopping_list_item` and `unclaim_shopping_list_item`: add `unlinked_from_expense_id = null` to
  their SET.
- Expense erase: FK `on delete set null` clears the pointer. Item delete (open, adder-only): row and marker
  go together.
- Member removal trigger (`release_shopping_list_claims_on_member_removal`): unchanged; it leaves the marker
  on an item it returns to `open`, which is safe because Undo requires `status = 'claimed'` and the only
  way back to `claimed` is the claim RPC, which clears it. Re-tested with the new column.
- `add_expense_and_log_shopping_items`: unchanged. It sets `expense_id`, so Undo's `expense_id is null`
  rejects an item linked elsewhere; a later delete of that other expense overwrites the marker.

Copy the 0015 bodies verbatim and add the one assignment; all columns are `i.`-qualified, variables
`_`-prefixed, the new column name exists in one table only (0013 check).

## 4. Erase: two layers, numbers, failure paths

### 4.1 Predicate and mechanics (`erase_expired_expenses_batch`)

One batch selects candidate ids with the predicate inside the locking statement,

```
deleted_at is not null
and deleted_at < clock_timestamp() - public.expense_erase_after_interval()
order by deleted_at limit 50 for update skip locked
```

then, for those ids only: (a) revert any list item still pointing at them (`expense_id = any(ids)` back to
`claimed`/`open`, clear markers) so the FK can never block the erase, then (b) `delete from public.expenses
e where e.id = any(ids) and e.deleted_at is not null and e.deleted_at < clock_timestamp() -
public.expense_erase_after_interval()`. **The age is re-asserted in the DELETE itself (security S2)**, not
only `deleted_at is not null`: equivalent today because the rows are locked, but defence in depth for the
irreversible statement against a future edit of the selecting query. No parameters (criterion 21). No
trip-open reference, so locked trips are erased; it cannot touch a live row. `erase_expired_expenses()`
calls the batch up to 10 times (stops early on a short batch): at most 500 rows per run.

Race with Undo: both take the expense row lock. Erase uses `skip locked` and re-evaluates after locking
(READ COMMITTED), so a row Undo just cleared drops out. Undo after erase finds no row (EX002). The numbers
also make them mutually exclusive in time: Undo needs `clock < d + 15 s`, erase needs `clock > d + 30 s`,
so there is a 15 s dead zone. Two-session tests (criterion 18) are still required (section 10), driven by
backdating `deleted_at` as the table owner.

Layer 2 (opportunistic): delete and Undo each call the batch once at the end. Global, not trip-scoped
(security accepted this): only already-expired rows, bounded to 50, skip-locked, errors swallowed.

### 4.2 Layer 1: pg_cron

`cron.schedule('erase-expired-expenses', '* * * * *', 'select public.erase_expired_expenses()')`, after
`cron.unschedule` of the same name, in a DO block that checks the extension exists; on absence raises a
NOTICE (erase NOT scheduled, see runbook); and wraps the calls in `exception when others then raise notice
...` so it can never fail the migration.

### 4.3 The numbers (criteria 18 and 20)

| What | Value | Enforced by |
|---|---|---|
| Undo toast (cosmetic) | 10 s | client timer only |
| Server accepts Undo | until `deleted_at + 15 s` (5 s slack for last-moment tap, latency, skew) | `undo_delete_expense`, DB clock |
| Row eligible for erase | `deleted_at + 30 s` | erase predicate, DB clock |
| Cron period | 60 s | pg_cron |
| Max delay delete to erase, cron running | about 90 s; stated "within 2 minutes" | cron |
| Max delay, pg_cron absent | until the next delete/Undo anywhere runs the opportunistic batch; **not bounded by the database** | operator check |
| Hard cap | 24 hours, an **operational commitment**: runbook check daily by the operator; any row older than 10 minutes means the job is down | runbook |
| Batch caps | 50 per opportunistic call; up to 500 per cron run | functions |

Honest limit: the 24-hour cap cannot be guaranteed by code when pg_cron is missing and the app is idle.
Then hiding and money correctness still hold (section 5); only retention of free text past the stated time
is at stake, which the check surfaces. Controls: migration NOTICE, release checklist item (`cron.job` has
`erase-expired-expenses`), runbook query. If pg_cron is not enabled on live (0018/0019 already depend on
it), the fallback is a Vercel cron route calling the erase function with the service role; not built.

Runbook check (written at the docs stage in `docs/runbooks/account-deletion-and-export.md`):

```sql
-- must be 0, and nothing older than 10 minutes
select count(*) as overdue, min(deleted_at) as oldest
from public.expenses
where deleted_at is not null and deleted_at < now() - interval '10 minutes';
select jobname, schedule, active from cron.job where jobname = 'erase-expired-expenses';
```

Manual remedy: `select public.erase_expired_expenses();` as the postgres owner.

## 5. Every read path of `expenses` (criterion 19)

Principle: **the database hides, TypeScript does not filter.**

| Reader | Treatment |
|---|---|
| `getTripView` (`trips.ts`) | RLS hides; no change. Feeds list, totals, average, per-member paid/share/net, settle-up transfers, Expenses and Details tabs. |
| `getMyTrips` (`trips.ts`) | RLS hides; no change. Home totals and "You owe / You're owed". |
| `get_trip_summary` (0016 body, definer, service-role only since 0021) | `create or replace` in 0024: `total` CTE adds `and deleted_at is null`; `paid` CTE puts `and e.deleted_at is null` **in the LEFT JOIN's ON clause** (not WHERE, or members with no live expenses drop out). Same return table; no descriptions. Grants untouched. |
| `edit-expense-sheet-content.tsx` (`select("*").eq("id").single()`) | RLS returns no row, `.single()` errors PGRST116, today the generic "Couldn't open that expense" with retry. Change: PGRST116 on this read is not-found ("That expense isn't available anymore", close only, no retry). Criterion 11. |
| Bought link (`shopping-list-tab.tsx`) | After delete the item is unlinked server-side; a stale client lands on the not-found state. No change. |
| `updateExpense` | Policy requires `deleted_at is null`; a marked row updates 0 rows (PGRST116, existing copy). Acceptable. |
| `add_expense_and_log_shopping_items` (0015) | Unchanged; never sets `deleted_at`; its `returns public.expenses` row gains a nullable column. |
| `was_removed_from_trip` (0014) | Counts a row inside its window (criterion 31); harmless. |
| `purge_abandoned_anonymous_users` (0018) | Skips a payer with any row, including a marked one; delays at most a day. |
| Trip cascade, account deletion | Cascade works. `paid_by` has no ON DELETE action: account deletion inside the window fails on the FK until erase; runbook step (criterion 31). |
| `settlement.ts`, perf bench | Not readers. |

No TypeScript query adds `.is("deleted_at", null)`: RLS already does it; referencing a missing column would
break **every** read on new code with the old schema; one control is easier to prove. `src/lib/supabase/
types.ts` (hand-written) gains `expenses.Row.deleted_at: string | null`, `shopping_list_items.Row.
unlinked_from_expense_id: string | null` and the two RPC entries. `select("*")` on `shopping_list_items` now
returns the marker uuid (no content; accepted, security S6).

### 5.1 Guard against a future unreviewed query

Static vitest `src/lib/data/expenses-read-guard.test.ts`: (1) non-test `src/**/*.{ts,tsx}` containing
`from("expenses")` must be allowlisted with pinned counts: `trips.ts` 4, `edit-expense-sheet-content.tsx` 1;
(2) `supabase/**/*.sql` mentioning `\bexpenses\b` must be in a pinned file list (current files plus 0024),
a later one added consciously with a note on `deleted_at`; (3) a real-Postgres test (section 10) proves a
marked row is excluded by the read policy, `get_trip_summary` and the edit read.

## 6. Module boundaries (app side)

No server action and no API route (existing direct-client-RPC pattern; no server secret). Authorization is
entirely in the database; the client never sends a user id. Before touching `layout.tsx` read the relevant
pages under `node_modules/next/dist/docs/` (AGENTS.md).

- `src/lib/data/trips.ts`: `deleteExpense(supabase, expenseId)` and `undoDeleteExpense(supabase, expenseId)`
  call `supabase.rpc("delete_expense" | "undo_delete_expense", { _expense_id })` and on error **throw an
  `ExpenseActionError`, never the raw error** (raw message, details, hint dropped, not logged).
- `src/lib/errors.ts`: `ExpenseActionError` (an `Error` whose `message` is its code), code union
  `"not_allowed" | "undo_unavailable" | "rate_limited" | "unavailable" | "unknown"`, and one pure mapper:
  `EX001` to `not_allowed`; `EX002` to `undo_unavailable`; message prefix `rate limited` to
  `rate_limited`; `PGRST202`/`42883` to `unavailable` (never a `.delete()` fallback; the privilege is
  revoked anyway); else `unknown`. A copy function `expenseDeleteErrorCopy(code)` next to `rosterErrorCopy`
  returns one neutral line per code (3.1), facts only, never "erased from all systems" or "only you can see
  it" (criterion 32).
- `src/app/trip/[id]/expense-undo-provider.tsx` (new, `"use client"`): context with the pending Undo state,
  the 10 s timer, a set of locally hidden expense ids (row disappears before the server refresh lands), an
  in-flight flag per expense (disables the delete button, 3.1b), and `requestDelete(id)`/`undo(id)`. It
  owns the toast and calls `router.refresh()` after each success. Mounted in `layout.tsx` around both
  `<TripSheetChrome>{children}</TripSheetChrome>` and `{sheet}`, so page, edit sheet and sub-routes share
  one state. Leaving the trip unmounts it (row stays hidden, erased by the server; no Undo after leaving).
  Layout stays a Server Component; only the provider is a client leaf (ADR 0005 shape).
- **Toast model recommendation: a single toast, a new delete replaces the previous one** (design.md 3.3).
  It is the simpler UI and the simpler test; the cost is that the earlier expense can no longer be undone
  from the screen though the server would still accept it until 15 s. A list of pending entries is also
  safe at the database and is a local change to this provider. Security and compliance both say either is
  fine; the design.md owner decides with the user, and the engineer and QA must test whichever is chosen.
- Undo call: `undo(expenseId)` sends only the id. The 10 s timer is cosmetic (removes the button, sends
  nothing); a tap at 9.9 s plus latency is honoured (server 15 s). Nothing about a pending Undo goes to URL,
  `localStorage` or `sessionStorage`. EX002 shows one plain "Couldn't undo" line.
- Delete control placement is the ux-designer's. It calls `requestDelete` and renders only when
  `expense.payer.id === you?.id && !isCompleted` (the existing `editable` predicate): UX only. Locked trip:
  no control, existing `LOCKED_TRIP_COPY` style (criterion 7), from loaded state.
- Errors from delete/Undo never reach `console`, analytics or UI as raw text (criterion 13). The existing
  `*.raw-db-error.qa.test.tsx` files are the model.
- **Analytics (compliance D1):** exactly two events, **`expense_delete_complete`** and
  **`expense_undo_complete`** (design.md's names, matching `expense_edit_complete`), fired in the success
  callbacks, name only, no properties, no ids, amounts or counts; listed in `docs/ANALYTICS.md`.

## 7. Impact analysis

### 7.1 Changed or removed things and every consumer found

| Thing changed | Consumers found (`src/`, `supabase/`, `docs/`) | Compatible? |
|---|---|---|
| `expenses` DELETE policy dropped, DELETE privilege revoked | No app consumer: `src/` has no `.delete()` on `expenses` (`shopping-list.ts` deletes list items). No existing test deletes an expense directly as a member (`supabase/migrations/*.qa.test.ts` are SQL text-shape tests; the 0022 live test deletes `trips` as admin, which cascades). | Yes for the app. Narrows "any verified member could delete an unlinked expense" to "nobody can" for non-app direct-API clients: intended breaking change, no in-repo consumer. |
| Policy set replaced (names in 2.2) | All policies on `expenses`; no code references policy names. Tests asserting 0009 policy text (search `supabase/migrations/*.qa.test.ts`) must be updated to the new set. | Yes. |
| `expenses` insert: `paid_by = auth.uid()` | `addExpense`, `add-expense-sheet-content.tsx`; `add_expense_and_log_shopping_items` (definer, `auth.uid()`). | Yes. Only a direct call naming another payer is newly rejected. |
| `expenses` update: column grants amount/description/date; policy `deleted_at is null` | `updateExpense` sends exactly those; sole caller `edit-expense-sheet-content.tsx`. | Yes. |
| `expenses` select hides marked rows | `getTripView`, `getMyTrips`, edit read (section 5). | Yes: no marked row exists until the new functions are called. |
| New nullable `expenses.deleted_at` | `select("*")` x3 returns the field; hand-written types; `add_expense_and_log_shopping_items`' row type. | Yes (additive). |
| New nullable `shopping_list_items.unlinked_from_expense_id` | `getShoppingListView` (`select("*")`), `getMyTrips` shopping query (`trip_id, status`), `shopping-list-tab.tsx`, `trip-tabs.tsx`; existing RPCs; 0015 trigger. | Yes (additive). Trigger retested. |
| `claim_/unclaim_shopping_list_item` (one extra SET) | `claimShoppingListItem`, `unclaimShoppingListItem`; used from `shopping-list-tab.tsx` and the add-expense flow. | Yes. |
| `get_trip_summary` (filter, `create or replace`) | `getTripSummary` via service client from `trip/[id]/page.tsx` and `api/trip-invite/[code]/route.ts`. | Yes: same signature, return table and grants. |
| `src/lib/supabase/types.ts` | all importers | Additive. |

### 7.2 Backward compatibility and deploy ordering

- **Old code + new schema:** safe. No old path writes `deleted_at` or calls the new RPCs; old reads work;
  old `updateExpense` passes the column grants; old adds pass the stricter insert policy (they already set
  `paid_by` to the caller); old claim/unclaim behave the same.
- **New code + old schema:** the delete RPC is missing, PGRST202/42883 maps to "unavailable", no `.delete()`
  fallback; new reads never reference the new columns, so lists and balances work.
- **Release rule:** apply 0024 first (by hand on live), verify (policy-set query on `pg_policies`, `cron.job`
  row, the functions exist, publication check, a smoke delete/Undo on a scratch trip), then deploy.
  Rollback is "redeploy the previous build"; schema stays. A row in its window at rollback is erased by
  cron or the opportunistic erase.
- **Breaking contract?** No route or RPC signature changes; two additive RPCs; the narrowings affect only
  non-app direct-API callers. No `/api/v2`; the narrowings ship in the same migration because the DELETE
  revoke is what makes the RPC the only door.
- **Migration safety on populated tables:** no row rewrite; FK validates against all-NULL; policy swap
  adjacent in one script (2.2); small partial indexes. Column ambiguity (0013): rewritten functions
  qualify every column; `deleted_at` exists only on `expenses` (repo grep), `unlinked_from_expense_id` only
  on `shopping_list_items`; `get_trip_summary`'s OUT names are not reused. Required: apply on a scratch
  Postgres seeded with expenses with and without linked items, open and locked trips, a removed-member
  payer, a placeholder, an item whose claimer was removed; **on a database that already carries the 0009
  policies**; then re-apply the file.
- **pg_cron:** absent or unschedulable still succeeds (NOTICE).

## 8. Scratch Postgres note for QA

The Postgres binary known here is 10.5 with no `auth` schema. A scratch instance must stub `auth.uid()`,
`auth.jwt()` and the `anon`/`authenticated`/`service_role` roles (run tests as a non-superuser role so RLS
applies), and **must reproduce Supabase's default ACLs** (`alter default privileges in schema public grant
execute on functions to anon, authenticated, service_role`, and table grants to both client roles) before
applying the migrations, otherwise the revoke tests prove nothing. `pg_cron` is absent, doubling as the
cron-absent test. Used features are available from 9.6. Never run against the live or `.env.local`
project.

## 9. UI-only items

- **Settle-up** (35, 36): `src/app/trip/[id]/settle-up/page.tsx`, locked branch: remove the muted `Button`
  "Trip completed" (about lines 274 to 277) and its `h-2` spacer; keep the status card and "Create a new
  trip"; drop `CheckIcon` import only if unused. Open branch untouched. `complete_trip` unchanged (server
  no-op on repeat; add the test). Update tests asserting the button.
- **Invite** (37): `src/app/trip/[id]/invite/page.tsx`: `p-[14px_18px]` to `p-[11px_18px]` on the member
  row `Card` (about line 480) and placeholder row `Card` (about 575). Not the add-placeholder form card
  (about 673) or dashed "add" rows (about 556, 706).
- **Send feedback** (38 to 41): `src/app/you/page.tsx`: third row after Terms in the same `Card`, same
  markup, `Link href="/feedback"` with no query, `MessageSquareIcon` (exists). `src/app/trips/page.tsx`
  (about line 161): remove the `IconLinkButton` and any now-unused imports; check the top bar. `trip/[id]/
  page.tsx` (about line 334) unchanged. `/feedback`, proxy gating, return destination unchanged. Update
  tests expecting the icon on Trips/home.

## 10. Test plan hooks (QA owns)

Real local Postgres, two sessions where stated, with a table-owner helper that backdates `deleted_at`
(never as `authenticated`), default ACLs reproduced (section 8):

- **Policy set (B1):** `pg_policies` for `public.expenses` after 0001 to 0024: exactly one select, one
  insert, one update, zero delete; exact names; predicate text contains `deleted_at is null` (all three)
  and `paid_by = auth.uid()` (insert, update). Run on a database carrying the 0009 policies.
- **Function privileges (S3):** `has_function_privilege` false for anon, authenticated and public on
  `erase_expired_expenses`, `erase_expired_expenses_batch` and both interval helpers; true for
  authenticated and false for anon on `delete_expense`/`undo_delete_expense`; `get_trip_summary` not
  executable by anon or authenticated after 0024 (guards a drop-and-recreate).
- Delete as payer, other member, non-member, anonymous, unverified, locked trip, departed payer, twice
  (second EX001, `deleted_at` unchanged); a member removed between the pre-lock check and the lock fails
  (S5, two sessions).
- Undo: in window, at 14.9 s, at 15.1 s, after erase, on a live row, on a locked trip, twice, by a
  non-payer; every failure returns the same EX002 code and message.
- **Two-session Undo vs erase at the boundary (S3):** Undo holds the row lock while the batch runs (skipped,
  row survives); batch holds it while Undo waits (Undo then finds no row, EX002); double Undo; delete-Undo-
  delete (second delete gets a fresh mark, a hidden row's life is never extended).
- Erase: never deletes a live row, an in-window row (including one backdated to 29 s) or another trip's row,
  as payer, other member, non-member, anonymous, unverified and owner; locked-trip rows are erased;
  cron-absent path (the opportunistic batch alone clears a backdated row on the next delete/Undo); the
  DELETE statement's own age re-assertion (S2) checked by a test that feeds a candidate set containing a
  young row.
- Direct DELETE as payer, member, non-member affects 0 rows or errors; trip cascade and the 0018 purge work;
  account deletion that meets an in-window row fails on the FK and succeeds after erase, no orphan.
- Direct UPDATE as `authenticated` (including anonymous) of `deleted_at`, `paid_by`, `trip_id`: permission
  denied; of amount, description, date on a live own row: works; on a marked row: 0 rows. Direct INSERT with
  another `paid_by` or `deleted_at` set: rejected.
- List items: delete reverts to claimed/open and sets the marker; Undo re-links only a matching item; unclaim
  then another member's claim between delete and Undo (marker cleared, not re-linked); removed claimer
  returns to `open`; trigger and shape check retested.
- Rate limit on the real path: the 21st successful delete/Undo in a minute is rejected.
- `get_trip_summary`: total and per-member paid exclude a marked row; members with no live expenses appear.
- Apply the migration twice; apply with pg_cron absent; apply to a seeded database.
- Client: one neutral error line for EX001 (no cause-specific copy), delete button disabled in flight,
  locked control hidden from loaded state, name-only analytics events.

## 11. Constraints satisfied

| Constraint (source) | Where the design meets it |
|---|---|
| Definer RPCs, trip from row, caller checks, fixed errors, hygiene (16, 17; sec C1, C2, C14) | 3.1 to 3.3 |
| Re-check payer/membership after the lock (sec S5) | 3.2 step 6, 3.3 |
| No hard delete for any client role (22; sec C4, H1, H2) | 2.2: policy dropped by live name, privilege revoked; cascade/purge re-tested |
| Exact policy set, no surviving old policy (sec B1) | 2.2 drop list and final set; pg_policies test (10); baseline rule |
| Mark unwritable by direct update (23; sec C3, S2, S3) | 2.2 column grants plus policy |
| Insert `paid_by = auth.uid()` (24; sec C1, B4) | 2.2 insert policy |
| Hiding independent of erase (19; sec F1, S1, S4, N1) | 5, 5.1 |
| DB-clock window, numbers, boundary races, no extension (18; sec U1 to U6, N4) | 3.2, 3.3, 4.1, 4.3, 10 |
| Two erase layers, stated delay, runbook check, cron-absent test (20; sec F2, F3, N2; comp F1) | 4.1 to 4.3 |
| Erase predicate incl. age re-asserted in the DELETE, not client-executable (21; sec F4, F5, S2, S3) | 4.1, 2.3, 10 |
| List-item link (8, 9, 25; sec L1 to L5) | 2.1, 3.2 step 8, 3.3, 3.4 |
| Atomicity, lock races (26; sec T1 to T3) | 3.2 step 5 |
| Migration shape, apply method, safe both directions (27; sec C8, M1 to M6, S4) | 2.2 (no explicit begin/commit, adjacent statements), 7.2 |
| Rate limit, real-path test, batch caps (28; sec A1) | 3.2 step 4, 4.1, 10 |
| No trigger/realtime leak (29; sec C16) | 1, 10 |
| One neutral error, button disabled, locked from state (sec S1) | 3.1, 6 |
| `deleted_at` only (30), no long retention (31), copy facts only (32) | 2.1, 4.3, 6 |
| Analytics name-only, exact names (33; comp C3, D1) | 6 |
| M1 (34; comp M1) | 12 |
| Raw errors never shown (13; sec C15) | 6 |
| Settle-up, Invite, Feedback (35 to 41) | 9 |
| Residual risk (comp M2; sec A2, N7) | Not mitigated further; bounded by payer-only, open-trip-only, Undo, rate limit. Counsel question open, non-blocking. |

Deliberate differences from suggestions: global opportunistic erase (4.1, accepted by security); optional
member-callable erase wrapper not built.

## 12. Recorded constraint M1 (compliance)

Irreversible erase of a money record is acceptable only because: payer only, open trip only, explicit
action with Undo, database enforced, and **no settled or paid state exists in the app**. If an in-app
"mark paid / settled" state is ever added, every delete, Undo and erase path (`delete_expense`,
`undo_delete_expense`, `erase_expired_expenses*`, the policies in 2.2) must be re-reviewed before it ships.
Also in the compliance baseline.

## 13. ARCHITECTURE.md amendments (to apply when the feature ships)

ARCHITECTURE.md describes the system as built, so these are pending until then. The architect's tools could
not edit that large file in place; the exact text to add:

1. In "Locking", after the sentence about `is_trip_open` and write policies: "**Pending
   (expense-delete-and-polish, migration 0024):** the `expenses` delete policy no longer exists; an expense
   is removed only by the payer through `delete_expense` on an open trip, with `undo_delete_expense` inside
   a 15 s server window, and is hard-erased from 30 s by `erase_expired_expenses` (pg_cron each minute plus a
   bounded opportunistic erase inside delete/Undo). See ADR 0017."
2. In "RLS on `expenses`", replace the `delete` bullet with: "`delete` — **pending 0024:** no policy and the
   table-level DELETE privilege is revoked from `anon` and `authenticated`; the only deletion paths are the
   definer functions `delete_expense`/`erase_expired_expenses`, trip cascade and the anonymous purge."
   Amend `select`: "...and `deleted_at is null`". Amend `insert`: "...and `paid_by = auth.uid()` and
   `deleted_at is null`". Amend `update`: "...and `deleted_at is null`; table-level UPDATE is revoked and
   re-granted only on `amount`, `description`, `date`, so `paid_by`, `trip_id` and `deleted_at` are
   immutable by direct API (closes the `trip_id` gap ADR 0002 recorded)." Add: "Policy names after 0024:
   `owner or verified member can read live expense detail`, `verified member can add own expenses`,
   `verified payer can edit their own live expenses`; a QA test asserts this is the exact set."
3. In the `expenses` data-model entry: "`deleted_at timestamptz null` (pending 0024): set by `delete_expense`
   from the DB clock, cleared by Undo, row hidden by the read policy, erased after 30 s."
4. In the `shopping_list_items` entry: replace "not-yet-built expense-delete feature" with the shipped
   behaviour and add "`unlinked_from_expense_id` (FK to `expenses`, `on delete set null`, pending 0024)
   remembers the link for Undo; cleared by claim, unclaim, Undo and erase."
5. In "Known integration points": `deleteExpense`/`undoDeleteExpense` in `src/lib/data/trips.ts`,
   `ExpenseActionError` in `src/lib/errors.ts`, `src/app/trip/[id]/expense-undo-provider.tsx`, the guard
   test `src/lib/data/expenses-read-guard.test.ts`, and the rule "a new reader of `expenses` that bypasses
   RLS must filter `deleted_at`".
6. ADR index: "[0017](../../adr/0017-expense-delete-soft-mark-then-erase.md) — Expense delete as a database-clocked
   soft mark (hidden by RLS, unwritable by clients), Undo window 15 s, hard erase from 30 s by pg_cron plus
   an opportunistic in-RPC batch, over client-side re-insert Undo, retained soft delete, cron-only erase, or
   per-query filters."

## Needs the user

1. Confirm `pg_cron` is enabled on the live Supabase project (release gate G1). If not, the 90 s figure does
   not hold; choose the Vercel cron fallback or accept a weaker stated bound in writing.
2. Accept the stated limit: "erased within 2 minutes normally; a 24-hour hard cap that is an operational
   check, not a code guarantee".
3. Toast model (single replace vs list) is for the design.md owner and the user.
4. The counsel question on erase without an audit trail stays open (non-blocking).
