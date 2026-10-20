# Requirements: expense-delete-and-polish

Stage: requirements (stage 3), revised at stage 4 for the early review, revised for the
user's follow-up decisions (2026-10-19: **delete is Undo-only and truly erased after the
window**), and revised again to fold in the security and compliance re-check of that
version. Date: 2026-10-19.
Inputs: [planning.md](planning.md) (user decisions, including the follow-up section, are
authoritative). Baselines read: compliance and security (project level). Early review
(revision 2, re-check complete):
[security-constraints](../../reviews/security-compliance/features/expense-delete-and-polish/security-constraints.md)
and [compliance-constraints](../../reviews/security-compliance/features/expense-delete-and-polish/compliance-constraints.md).

## Problem

A wrong expense can only be edited today, never removed, and a shopping-list item marked
bought for it is stuck "bought" for good. Alongside that, three small screen fixes were
agreed: a dead button on a locked Settle-up, tight member rows on Invite, and "Send feedback"
sitting on the wrong screens.

## Scope

1. Delete an expense (creator only). For about 10 seconds it is hidden and can be brought
   back with Undo. After that it is erased for good. There is no restore after the window
   and no "recently deleted" list.
2. Settle-up: remove the "Trip completed" button on a locked trip.
3. Invite: member row vertical padding 14px to 11px, including placeholder rows.
4. "Send feedback": add to You (below Privacy and Terms), keep on trip details, remove from
   Trips/home. Feedback behaviour is otherwise unchanged.

Semver: **feature** (backward-compatible). Flag for review: it narrows who may delete at the
database from any verified member to the creator, tightens insert so the payer must be the
caller, and adds an irreversible erase of a money record. No UI ever deleted, so no
user-visible loss.

## Findings checked in code

**(a) "Trip completed" and trip lock are the same state.** `complete_trip` sets
`trips.completed_at`; `is_trip_open()` is `completed_at is null`; every lock gate uses it.
Settle-up shows the "Trip completed" status card with a "Locked" badge when `isCompleted`.
Two different things share the wording: the status card (stays) and a muted "Trip completed"
button in the locked footer (`settle-up/page.tsx`, around lines 274-277) that has no click
handler. That dead button is what item 2 removes. The action button on the open trip is
labelled "Trip complete" and is not touched. Repeat locking is already a server no-op
(`complete_trip` only updates where `completed_at is null`). There is no in-app "mark paid"
yet, so "payments already settled" cannot happen on an open trip; locked is the only case.

**(b) Creator and payer.** There is no `created_by` column on `expenses`; only `paid_by`.
Both app paths set `paid_by` to the signed-in user (`add-expense-sheet-content.tsx`; RPC
`add_expense_and_log_shopping_items` uses `auth.uid()`). Placeholders can never be payers. The
insert policy only requires `paid_by` to be some trip member, not the caller, so a direct API
call could create an expense paid by someone else; the app itself cannot. Rule for delete
and Undo: follow the edit rule, `paid_by = auth.uid()`, verified member, open trip, and
close the insert gap so creator = payer is true at the database (criterion 24).

**(c) Every place that reads expenses (all must exclude any row with the deleted mark).**
- `getTripView` in `src/lib/data/trips.ts` (expense list, totals, balances, settlements,
  per-member counts). Feeds the trip page (Expenses and Details tabs) and Settle-up.
- `getMyTrips` in `src/lib/data/trips.ts` (Home totals and "You owe / You're owed").
- RPC `get_trip_summary` (latest definition: migration 0016; total and per-member paid), used
  by the public join/invite preview and the unverified trip view. It is SECURITY DEFINER and
  bypasses RLS, so it must filter deleted rows itself.
- `edit-expense-sheet-content.tsx` (reads one expense by id) and the shopping-list "Bought"
  link to `/expense/<id>/edit`. A deleted expense must not open for editing.
- Touched by the existence of a row, not its amount: `was_removed_from_trip` (0014), the
  abandoned-anonymous purge (0018) and the runbook queries on `paid_by`. With erase shortly
  after the window these need no special handling (criterion 31).
- Not readers: `settlement.ts` (pure math on what it is handed), perf bench (mock).

**(d) "Send feedback" today.** Icon button in the top bar on Trips/home
(`src/app/trips/page.tsx`, ~line 161) and on trip details (`src/app/trip/[id]/page.tsx`,
~line 334; shown on all three tabs of that page). None on You (`src/app/you/page.tsx`), which
has only Privacy and Terms rows. Route `/feedback` already requires a session (proxy).
`/feedback` always returns to `/trips` on Back and after sending; unchanged.

**(e) Scheduling is optional in this repo.** Migrations 0018 and 0019 schedule their jobs
only if the `pg_cron` extension exists and otherwise just print a notice. A cron-only erase
could silently not exist, so criteria 19 and 20 do not let either hiding or erasing depend
on one optional extension.

## Acceptance criteria

Delete and undo (what the user sees)
1. On an open trip, the signed-in user sees a delete control on an expense they paid, and
   on no one else's.
2. Choosing delete removes the expense from the list at once and shows an Undo message for
   about 10 seconds.
3. Tapping Undo within that time brings the expense back unchanged (same amount,
   description, date, payer).
4. Undo is the only way back. After the window the expense is erased for good (the row is
   hard deleted); there is no restore action, no "Recently deleted" list and no way to
   recover it.
5. Undo fails with a plain message, and changes nothing, once the window has passed or the
   expense has been erased.
6. While an expense is deleted it is excluded from: the expense list, trip total, average
   per person, each member's paid, share and net, the settle-up transfers, the Home total
   and "You owe / You're owed", and the public trip summary. Undo puts it back in all of
   them.
7. On a locked trip no delete control is shown, with the existing locked-trip wording
   style. Undo is also refused on a locked trip.
8. Deleting an expense that shopping-list items were bought for, in the same step, returns
   each such item to "claimed, not bought" for the member who bought it and clears its link
   to the expense, so it appears under that member's "Your bag" again. If the item's claimer
   had been removed from the trip (claim already cleared), the item returns to "open"
   instead. If the delete fails, the items stay bought (all or nothing). The link must be
   restorable within the window (criterion 25 defines how it is remembered).
9. Undo restores the expense in every case. It re-links and re-marks a list item as bought
   only if that item is still in the state the delete left it in (same claimer, not linked
   elsewhere); otherwise the item is left alone, silently, with no special message and no
   extra handling. Items are never re-linked by matching description.
10. No notification of any kind is sent for delete or Undo, and no "deleted by" label, list
    or log is shown. Other members simply see the expense gone and balances change.
11. A deleted expense cannot be opened or edited (direct link to its edit page shows the
    normal not-found style state, not its contents).
12. Deleting never touches other expenses, and never changes `paid_by` or `trip_id`.
13. Delete and Undo errors show a plain message. Raw database errors are never shown or
    logged; the data layer wraps them in a code-only error.
14. Add-expense and edit-expense behaviour is otherwise unchanged (existing tests still
    pass).
15. An expense whose payer has left or been removed cannot be deleted or undone by anyone in
    v1 (fail closed; no organizer override). It stays counted in balances, as today. This
    is a recorded known limit, not a defect.

Database and security (tested on a real local Postgres, as non-payer, unverified or
anonymous, non-member, locked trip, deleted twice, undone twice, undo after the window, undo
after erase, concurrent claim between delete and Undo, and a list item whose claimer was
removed; never against the live project)
16. Delete exists only as a SECURITY DEFINER RPC. It takes only the expense id, derives the
    trip from the expense row, and inside the function requires: caller signed in, verified
    member of that trip, `paid_by` = caller, trip open. Failure raises a fixed code-only
    error. Hygiene: fixed `search_path`, execute revoked from public and anon and granted
    to authenticated only, no default parameters. Deleting an already-deleted expense is a
    no-op or a fixed error and never rewrites `deleted_at`.
17. Undo exists only as a SECURITY DEFINER RPC with the same checks as criterion 16, and
    additionally requires that the expense is currently deleted and its window has not
    passed. A locked trip, a passed window and an erased row all fail with the same fixed
    code-only error (no hint of whether the row ever existed, no row content). Undo
    re-checks that the trip is open inside the same transaction after taking the row lock.
18. The Undo window is defined by the database clock only; the 10-second UI timer is
    cosmetic. The server accepts Undo slightly longer than the UI window (so a tap at the
    last moment plus network delay is not lost), and a row becomes eligible for erase later
    still. The architect states the three numbers. Repeated delete (including
    delete, Undo, delete) never extends a window or keeps a hidden expense alive
    indefinitely. A two-session test on real Postgres covers: Undo at the boundary, erase
    at the boundary, Undo during erase, double Undo, and delete-Undo-delete.
19. Hiding does not depend on erase. Any row with the deleted mark is hidden from every
    read path whether its window has expired or its erase is delayed or never ran: the
    read policy on `expenses` excludes it (so a missed query fails closed), balances and
    totals exclude it, the edit read treats it as not found, and `get_trip_summary` filters
    it itself in the total and per-member paid and returns no descriptions. Such a row also
    cannot be undone once the window has passed. A test fails if any query on `expenses`
    outside an allowlist is added.
20. Erase is reliable without one optional extension. It is done server-side (never by the
    browser alone) by at least two layers: (1) a scheduled job registered the same guarded,
    idempotent way as migrations 0018/0019, where a missing `pg_cron` prints a notice and
    does not fail the migration; and (2) an opportunistic, bounded erase of expired rows
    inside the delete and Undo RPCs (batch cap, skip-locked). The architect states the
    maximum delay from window end to erase (recommended: minutes normally, hard cap 24
    hours). `docs/runbooks/account-deletion-and-export.md` gets a check query for overdue
    rows. Tested with no client running and on the path where `pg_cron` is absent.
21. The erase (finalize) step erases only rows whose deleted mark is set and whose window
    plus grace has passed, evaluated under the row lock, using the database clock; it takes
    no caller-supplied time or id list. It is not executable by anon or authenticated,
    except an optional wrapper that takes only a trip id, checks verified membership, only
    erases rows that are already expired, caps its batch, and is rate limited. It clears any
    list-item reference to the row in the same transaction so erase is never blocked or
    left dangling. **Must-pass test:** as every role (payer, other member, non-member,
    anonymous, unverified, service owner via the wrapper), it can never delete a live row,
    an in-window row, or a row of another trip.
22. Hard delete exists only inside the controlled delete and erase path. The existing "any
    verified member can delete" policy on `expenses` is dropped, none is added, and the
    table-level DELETE privilege is revoked from anon and authenticated (not only the
    policy). A direct DELETE as the payer, as another member and as a non-member affects 0
    rows or errors. Deleting a trip still cascades to its expenses, and the anonymous purge
    (0018) still works. Existing tests that delete expenses directly as a member are
    updated, not worked around.
23. A direct API update cannot write, change or clear the deleted mark, and cannot change
    `paid_by` or `trip_id`. The update policy also excludes rows that have the deleted
    mark. Only the delete and Undo RPCs can set or clear it, and they write it from the
    database clock. A payer still can edit amount, description and date of their own live
    expense. Tested as the `authenticated` role directly, including an anonymous session,
    including an attempt to back-date the mark to trigger an erase.
24. An expense cannot be inserted with `paid_by` other than the caller. Adding an expense
    through the app and through `add_expense_and_log_shopping_items` still works and never
    sets the deleted mark.
25. The list-item link is remembered inside the window by a nullable
    `unlinked_from_expense_id` column on `shopping_list_items`: a foreign key to
    `expenses(id)` with `on delete set null`, indexed, set by delete. Undo re-links only
    rows where it matches the expense and the item is still in the state delete left it
    (same claimer, not linked elsewhere), under lock, and clears the marker on every row
    that references the expense whether or not it was re-linked. The marker is also cleared
    by erase and by any intervening claim, unclaim or delete of that item. The
    member-removal trigger (`release_shopping_list_claims_on_member_removal`) and the
    table's shape check are retested with the new column (an item whose claimer was removed
    returns to "open").
26. Delete, Undo and erase each change the expense and its list items in one transaction.
    Undo on a live expense is a no-op or a fixed error, never applied twice and never an
    error that carries row content. If the trip locks inside the window, the expense stays
    out of balances, Undo is refused, and erase still completes (erase does not require an
    open trip, and never touches a live row of a locked trip).
27. One new numbered migration; new columns are additive and nullable (no rewrite, no NOT
    NULL); a partial index on the deleted mark keeps erase from scanning the table; DDL is
    idempotent and the policy swaps happen in one transaction (never a moment with no
    update policy or an open delete policy); it applies to tables that already have rows
    (expenses with and without linked items, open and locked trips, a removed-member
    payer). Schema ships before code. Old code with the new schema keeps working; new code
    with the old schema treats "function not found" (PGRST202, 42883) as "delete
    unavailable" and never falls back to a direct DELETE.
28. (Must-have) Delete and Undo calls are capped per user per trip per minute using the
    existing `rpc_rate_limits` mechanism, tested on the real path (not only the happy
    path). The opportunistic erase batch (criteria 20, 21) is capped too.
29. No trigger, realtime subscription or webhook on `expenses` exposes a deleted row or
    sends anything on delete, Undo or erase (verified and noted in the build).

Compliance
30. The deleted mark is a timestamp (`deleted_at`), set on delete and cleared on Undo; it is
    what defines the Undo window. No "who" column and no text is added.
31. A deleted expense is held only for the Undo window and then erased, so there is no
    long-term retention of hidden rows, no `/privacy` change and no `LEGAL_LAST_UPDATED`
    bump. `docs/runbooks/account-deletion-and-export.md` is updated: a note that a deleted
    expense is erased shortly after the Undo window; the overdue-rows check from criterion
    20; and a step that if someone requests account deletion right after deleting an
    expense, run the erase step (or wait) before the case A check. A row still inside its
    window is covered by the existing export query (by `paid_by`) and the existing
    account-erasure and anonymous-purge paths, and does not break them (tested: an account
    deletion or purge that meets such a row either waits for erase or succeeds, never
    leaves an orphan or corrupts a balance).
32. UI copy for delete and Undo states facts only ("Expense deleted", "Undo"). It never
    claims removal from backups or "erased from all systems", and never says "only you can
    see it". A "Can't be undone after this" line is allowed only if Undo really fails
    afterwards (criterion 5).
33. Any analytics event added for delete or Undo carries the event name only (no ids,
    amounts, text or counts) and is listed in `docs/ANALYTICS.md`.
34. Recorded constraint M1: if an in-app "mark paid / settled" feature is ever added, every
    delete path must be re-reviewed before it ships. This is written in the architecture
    notes (and the baseline, by the docs stage).

Settle-up
35. On a locked trip, the Settle-up footer no longer shows the muted "Trip completed"
    button. The "Trip completed"/"Locked" status card and the "Create a new trip" button
    remain.
36. On an open trip, Settle-up is unchanged, and a repeat lock request on a locked trip
    still changes nothing (server no-op, tested).

Invite
37. Each member row on the Invite screen, including placeholder rows, has 11px top and
    bottom padding (was 14px); horizontal padding and everything else unchanged.

Send feedback
38. You shows a "Send feedback" row below Privacy and Terms, in the same row style, linking
    to `/feedback` with no trip id or user data in the link.
39. Trip details still shows Send feedback.
40. Trips/home no longer shows Send feedback.
41. The feedback form, its copy, what it stores, its session requirement and where it
    returns to are unchanged.

## Non-goals

- Add-expense speed (mount-time waterfall): out; separate roadmap row.
- Notifications of any kind for delete or Undo.
- A "who deleted it" record, a "deleted by" marker, or a "who removed what" list.
- Any restore after the Undo window, a "Recently deleted" list, a retention period for
  deleted expenses, or an organizer override to delete or undo someone else's expense
  (including a departed payer's; a later, audited feature if wanted).
- Special handling of a list item that someone re-claimed during the window (it is simply
  left alone).
- Deleting or undoing on a locked trip; re-opening a locked trip.
- Bulk delete; editing the payer; undoing an edit.
- Changing feedback copy, rating options, storage or return destination.
- Any `/privacy` or Terms change for this feature.
- Any other Settle-up, Invite or You redesign.

## Risk surface

- New personal data collected or stored: **none new.** A deleted expense's description
  (free text) lingers only for the Undo window plus the erase delay (hidden from every read
  in the meantime, criterion 19), then is erased.
- Message sent to a person: none.
- New third-party vendor: none.
- New public or anonymous endpoint: none. Anonymous accounts can create expenses and could
  reach delete or Undo directly, so everything is enforced at the database (criteria
  16-24, 28). A scheduled erase job is new server-side machinery; members cannot call it
  (criterion 21).
- Changes to money records: **yes, the main risk, and it is irreversible.** Delete changes
  what everyone owes and, after the window, leaves no record of the expense. There is no
  who-deleted log and no retained row. Compliance accepts this conditionally: payer only,
  open trip only, explicit action with Undo, database enforcement, and no settled or paid
  state existing in the app (criterion 34). Accepted residual risk: a payer can
  irreversibly erase their own expense on an open trip about 10 seconds after deleting it,
  with no record; this is no weaker than today's ability to edit the amount with no trail.
  Counsel is asked (not blocking) whether erase without an audit trail is acceptable.
- User-generated free text: no new input.
- New copy making a privacy or security claim: none (criterion 32).
- Shopping-list link: **yes.** `shopping_list_items.expense_id` has no cascade by design;
  delete, Undo and erase update items explicitly and atomically (criteria 8, 9, 25, 26).
- Early compliance/security review: **re-check complete**; constraints folded in. Design and
  final-code reviews still apply.

## Early review trail

The 2026-10-19 early reviews ran twice. Round 1 covered the earlier version (hidden row
kept, restore later, retention rule). The user then decided Undo-only with hard erase. Round
2 (security "Revision 2" and the rewritten compliance constraints) **re-checked the changed
version; the re-check is complete and its constraints are folded in.** Nothing was skipped.

Round 2 to criteria: N1 (hiding independent of erase) became 19; N2 (two erase layers,
stated delay, runbook check, cron-absent test) became 20; N3 (erase predicate, table-level
DELETE revoked, must-pass test) became 21 and 22; N4 (database-clock window, Undo longer
than the UI timer, boundary races, no window extension) became 17 and 18; N5 (re-link
memory column) became 25; N6 (rate limit must-have, batch cap) became 28; N7 and compliance
M2 became the accepted residual risk in the risk surface; compliance M1 became 34; F1/F2
and the backup and "erased from all systems" copy rule became 20, 31 and 32; the
account-deletion-right-after-delete step became 31. Round 1 constraints that still apply
(B1 to B4, SECURITY DEFINER hygiene, atomicity, migration safety, no trigger leaks, the
departed-payer limit, the `deleted_at` timestamp) are criteria 15, 16, 22 to 24, 26, 27, 29
and 30. Withdrawn as moot: the retention rule and "purge at lock" position, Recently
deleted, runbook erasure of hidden rows, hidden-only-payer rules, and the /privacy line.
Counsel sign-off on erase without an audit trail remains an open, non-blocking position.

## Design board coverage (UI items)

No design board in `docs/features/` covers expense delete or Undo: the shopping list and
edit-expense designs mention deletion only as an edge case, and the redesign boards cover no
delete UI. Boards that do exist (`docs/features/redesign-ui/design.md`, board A =
Trips/home, board C = trip details, board O = You, Settle-up and Invite content frozen in
section 4.5) show the present screens only. So:
- Criteria 35 to 41 (Settle-up button removal, Invite padding, Feedback relocation): small
  edits to existing boards; no new canvas needed. Boards O (You) and A (Home) should show
  Feedback moved.
- Criteria 1 to 9 (delete control, Undo toast, locked state): **needs new design**. There is
  no Restore entry point, only the Undo toast. The ux-designer stage must produce it.
  Undo-toast precedent exists in the starter-list design (board G).

## Decisions still needed from the user

None. D1 to D6 were decided on 2026-10-19 (see planning.md). For the architect to state
and compliance to review at design: the window, Undo-accept and erase-eligibility numbers
(criterion 18) and the maximum erase delay (criterion 20).
