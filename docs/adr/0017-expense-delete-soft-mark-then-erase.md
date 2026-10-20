# 0017. Expense delete as a database-clocked soft mark, then a server-side hard erase

Status: accepted
Date: 2026-10-19

## Context

Splitiful has never been able to remove an expense; `expenses` still carries a leftover "any
verified member can delete" policy from before payer-only editing (ADR 0002). The user decided
(planning follow-up D1 to D6): the payer can delete an expense on an open trip; for about 10 seconds
it can be brought back with Undo; after that it is truly erased, with no restore, no "Recently
deleted" list, no "deleted by" record and no notification.

That creates three hard requirements the design has to meet together:

1. Undo must restore the same row (same id, date, creation order) and re-link any shopping-list item
   that was bought for it, atomically, even though `shopping_list_items.expense_id` deliberately has
   no cascade (ADR 0013 context, migration 0015).
2. The Undo window and the erase must not depend on the browser (the tab can close) and must not
   depend on one optional extension: pg_cron is optional in this repo (migrations 0018 and 0019 only
   schedule `if exists` the extension and otherwise print a notice).
3. Anonymous sessions use the `authenticated` role and can write tables directly, so an irreversible
   erase of a money record must be reachable only through code that checks payer, verified
   membership and an open trip, and no client may be able to set the erase trigger itself.

## Decision

**Soft-mark, then erase.** Delete sets a nullable `expenses.deleted_at` (database clock) in a
SECURITY DEFINER function and reverts the linked list items in the same transaction, remembering the
link in `shopping_list_items.unlinked_from_expense_id` (FK to `expenses`, `on delete set null`).
Undo (another definer function) clears the mark and re-links only items still in the state delete
left them. A separate definer function erases rows whose mark is older than a grace period.

- Numbers, all on the database clock: toast 10 s (cosmetic), Undo accepted until 15 s, erase
  eligible from 30 s.
- Hiding is done by RLS: the `expenses` read policy adds `deleted_at is null`. No TypeScript read
  query changes, any missed query fails closed, and new code stays safe against the old schema.
  `get_trip_summary` (definer, bypasses RLS) filters itself.
- The client roles lose DELETE entirely (policy dropped, privilege revoked) and lose UPDATE on all
  columns except `amount`, `description`, `date` (column-level grant), so the mark, `paid_by` and
  `trip_id` cannot be written directly. Insert is pinned to `paid_by = auth.uid()`.
- Erase runs in two independent layers: a guarded, idempotent pg_cron job each minute, and a bounded
  (50 rows, `for update skip locked`) opportunistic erase inside the delete and Undo functions. The
  erase function takes no parameters and is executable by no client role.
- Rate limit through `rpc_rate_limits` (20 delete/Undo calls per user per trip per minute).

## Alternatives considered

- **Hard delete now, Undo by client re-insert.** Delete immediately and remember the row in browser
  memory; Undo inserts it again. It has the best retention story (no hidden row exists) and needs no
  cron, no mark and no policy narrowing for the mark. Rejected because the restored row would be a
  new row (new id and `created_at`, so list order and any deep link change); the list-item re-link
  would have to be done from client-held state or a second remembered table; the Undo window could
  not be defined or enforced by the server; and Undo would be just an ordinary insert that no
  server rule ties to a prior delete. It remains the simplest fallback if the cron-dependence below
  proves unacceptable.
- **Soft delete with a retention period and restore ("Recently deleted").** The first version
  planned. Withdrawn by the user (D1): no restore after the window and nothing retained.
- **Soft mark erased by pg_cron only.** Rejected: a missing or stopped optional extension would
  leave hidden rows and the in-app word "deleted" untrue. Hiding is independent of erase here, but
  the second (opportunistic) layer exists so a cron outage does not become silent retention on an
  active deployment.
- **Soft mark erased by an app route on a Vercel cron or by the browser.** The browser cannot be
  relied on (closed tabs). A Vercel cron route needs a service-role key held by a route and new
  infrastructure. Kept as the documented fallback if pg_cron is not available in production, not
  built.
- **Member-callable erase wrapper (trip id, rate limited).** Optional in the requirements. Not built:
  it adds a client-callable erase surface and gives nothing that cron plus the opportunistic batch
  do not.
- **Filter `deleted_at is null` in each TypeScript query instead of RLS.** Rejected: a missed query
  leaks, and referencing a column that does not exist yet makes every read fail for new code on the
  old schema.
- **BEFORE UPDATE trigger to protect the mark.** Rejected in favour of column-level grants: no
  trigger (ADR 0013 keeps triggers narrow), simpler to prove, and it also makes `trip_id` immutable.
- **Trigger to clear the list-item marker on claim/unclaim.** Rejected in favour of one extra
  assignment in the two existing RPCs.

## Consequences

- Easier: every existing expense query is correct without edits; the mark can only be written by
  three reviewed functions; a future "settled/paid" state has a short, named list of paths to
  re-review.
- Harder: the Undo and erase numbers (15 s, 30 s, 60 s cron, 90 s worst case) live in the database
  and must stay ordered (`erase after > undo accept > 10 s`); a test pins them. New `expenses`
  columns are not client-updatable unless their migration grants them. A new function or view that
  reads `expenses` and bypasses RLS must filter `deleted_at` itself; a static guard test fails on a
  new unreviewed query.
- Watch: the 24-hour erase cap is operational (runbook query), because without pg_cron an idle
  deployment has no scheduler; hiding still holds. Departed payers' expenses cannot be deleted by
  anyone (fail closed, accepted, no organizer override). An erased expense leaves no record (user
  decision; counsel question open). Adding any settled/paid state requires re-review of all delete
  paths (compliance constraint M1).
- Supersedes nothing. It closes the gap that ADR 0002 recorded (`trip_id` not pinned on update) and
  removes the permissive delete policy that ADR 0002 and ARCHITECTURE.md flagged for revisiting.
