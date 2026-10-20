# Planning: expense-delete-and-polish

Stage: planning (pre-requirements). Date: 2026-10-19.

Status note: both the product-strategist's and the PM's views are recorded
below. They were collected separately and did not debate each other; the
differences are listed under "Agreement and disagreement". The PM did not read
ARCHITECTURE.md or the performance-scaling architecture, so its database-policy
and waterfall points were taken from the facilitator's reading.

## Raw idea

Backlog row in docs/ROADMAP.md, one bundled feature, five items:

1. Expense delete and undo, including undoing a shopping-list item already
   logged as bought.
2. Add-expense mount-time waterfall fix (pass member count, lock state and
   ownership as server props instead of client fetches).
3. Settle-up: remove the "Trip completed" button once the trip is locked.
4. Invite screen: member row vertical padding to 11px (already decided).
5. "Send feedback" on the You/settings screen below Privacy and Terms; keep it
   on trip details; remove it from Trips/home.

## What the existing docs already say

- Today any verified member can delete any expense on an open trip at the
  database level. Editing was narrowed to the payer (ADR 0002). ARCHITECTURE.md
  says a delete feature should revisit narrowing delete the same way.
- A bought shopping-list item points at its expense, and that link
  deliberately has no automatic cleanup, so delete is forced to explicitly set
  the item back to "claimed, not bought". The shopping-list requirements say
  this should need no schema change.
- Compliance baseline, Money records: a settled or locked amount is never
  silently edited; changes to what someone owes need an audit trail or an
  explicit user action.
- Roadmap: item 2 should wait for a production p50/p95 baseline, and the
  owner/lock gate it moves to the server needs a security review.
- Product principles: correctness over silent automation; keep entry quick.

## Product-strategist recommendation

- Split into two units. Ship items 1, 3, 4, 5 together; pull item 2 out.
- Item 1 is the real feature and the biggest remaining functional gap: a wrong
  expense can currently only be edited, never removed, and bought list items
  are stuck. It touches money records, so it needs care.
- Item 2 stays out: the roadmap's own gate (baseline plus security review) is
  not met, and mixing a gating change into a money-record change makes both
  harder to review. If the baseline shows add-expense is fine, drop it.
- Items 3, 4, 5 are cheap and low risk; bundle as separate commits.
- Delete: soft delete (keep the row, mark who deleted it and when, exclude it
  from balances) because a hard delete leaves no trail and undo becomes trivial.
  Undo toast of roughly 8-10 seconds, plus a Restore action available while the
  trip is open. Payer only, matching edit. No delete or restore on a locked
  trip, enforced in the database. Deleting reverts the linked list item to
  claimed-not-bought in the same step; restoring re-links it, and fails with a
  clear message if the item was re-claimed meanwhile. Check every query that
  reads expenses (settle-up, summaries, export) so deleted rows cannot leak
  into totals.

## PM position

- Three bundles: A = items 3, 4, 5 (trivial, independent); B = item 1 (the real
  feature, mandatory early compliance/security review because it touches money
  records); C = item 2, parked until the production baseline exists and security
  has reviewed the owner/lock gate (it must fail closed). PM would accept A+B in
  one pipeline run since they touch different code.
- Soft delete excluded from balances; immediate Undo plus a Restore path while
  the trip is open; no timed purge in v1.
- Delete by the payer, plus the trip owner as an override, so an expense from a
  member who left or a wrong entry is not stuck. Today's any-member policy is
  too loose; tightening it is a behavior change for security to review, and the
  migration must be tested on local Postgres.
- Blocked entirely on a locked trip. Linked list item returns to "to buy" and
  is un-linked on delete; undo re-marks and re-links it unless it was re-bought
  through another expense meanwhile. Done explicitly in the flow, not by cascade.
- Record who deleted and who restored, and when; show a "deleted by X" marker.
- Items 3-5: server must still refuse a repeat lock; feedback keeps its current
  copy and channel (risk surface none if unchanged).

## Agreement and disagreement

Agreement: split item 2 out; soft delete; blocked when locked; list item
reverts and re-links; audit of who deleted and when.

Disagreement 1 (who may delete): strategist's first take was payer only; the
strategist's later point and the PM both want the trip owner able to delete too.
Facilitator now recommends payer plus trip owner.

Disagreement 2 (visibility): PM suggests an always-visible "deleted by X"
marker; strategist suggests a small "Deleted" list. Compatible: a "Deleted" list
that shows who removed what.

New questions raised only by the PM: what to do if payments were already marked
settled (blocked vs. warning), and whether undoing a bought item should ask
first. Both folded into the decisions below. PM asked to confirm "Trip
completed" means the same state as a locked trip (to be verified in code at the
requirements stage).

## Recommendation and sequencing

1. Unit A (now): item 1 delete/undo, with items 3, 4, 5 as small separate
   commits in the same pull request. Delete needs a database change, so it goes
   through architecture, design, security and compliance review; items 3-5
   need only light design.
2. Unit B (later, own feature): item 2, after the production p50/p95 numbers
   exist and security has reviewed the owner/lock gate. Update the roadmap row
   so it no longer says the waterfall ships with this bundle.

## User decisions (2026-10-19)

- Soft delete (hidden mark) kept for Undo/restore only; no "who deleted" log
  and no "who removed what" list, since only the creator can delete.
- Undo window about 10 seconds; restore afterwards while trip is open.
  (Superseded below: no restore after the window.)
- Delete allowed only for the person who created the entry. Creator vs payer
  to be checked in code at requirements; if they can differ, follow the edit
  rule unless the user says otherwise.
- No delete or restore on a locked trip. List item reverts to "claimed, not
  bought"; restore re-links, with a clear message if re-claimed. No
  notifications. (Re-claim message superseded below.)
- Items 3, 4, 5 confirmed as written.
- Item 2 (add-expense speed) removed from this feature; added to the roadmap
  as its own row for the architect to assess.

## Follow-up decisions (2026-10-19, requirements stage; these override the above)

- D1: No "Recently deleted" row and no restore after the Undo window. The only
  way back is the roughly 10-second Undo. After the window the expense is truly
  erased (hard delete), not kept hidden.
- D2: Keep it simple. Undo just restores the expense; the linked list item is
  re-linked only if still in the state delete left it, otherwise left alone
  silently, with no special message and no re-claim handling.
- D3: Yes, 11px padding on placeholder rows too.
- D4: Feedback behaviour from You unchanged (still returns to Trips/home).
- D5: No /privacy note and no LEGAL_LAST_UPDATED bump, since nothing is
  retained after the window.
- D6: Moot (no retained hidden rows). Rows still inside the window are covered
  by existing export and erasure paths without special effort.
- Design implications: the erase must happen reliably even if the client
  closes or loses connection (server-side finalize with a backstop; the
  architect chooses the mechanism); hard-delete capability exists only inside
  the controlled delete/finalize path, never as a member-level DELETE policy;
  Undo fails once the window has passed or the row is erased; locked trip
  blocks delete and Undo; creator-only (`paid_by` = caller) still applies;
  `deleted_at` timestamp stays because it drives the window.

## Open decisions for the user (superseded by the answers above)

(Note: "locked" and "Trip completed" are assumed to be the same state; the PM
stage verifies this in code. Where decision 4 says "locked", that covers any
trip whose settle-up is finished, so the settled-payments question is the same
as the locked-trip rule unless payments can be recorded on an open trip.)

1. Should deleting keep a hidden record, or erase the expense for good?
   Default: keep a hidden record (who deleted it, when), so it can be restored
   and there is a trail.
2. How long can someone undo? Default: a short "Undo" message for about 10
   seconds, and the payer can still restore it later from the trip while the
   trip is open.
3. Who can delete an expense? Default: the person who paid it, or the trip
   owner (so an expense from someone who left, or a wrong entry, never gets
   stuck). Alternatives: payer only, same as editing; or any member, as today.
4. What if the trip is already finished (locked)? Default: no deleting or
   restoring once the trip is completed.
5. What happens to a shopping-list item that was marked bought for that
   expense? Default: it goes back to "claimed, not bought" and returns to
   bought if the delete is undone; if someone re-claimed it first, restore
   shows a clear message instead.
6. Should other members be told an expense was deleted? Default: no
   notification, but the balances change and the screen shows the expense is
   gone; a small "Deleted" list shows who removed what.
7. Should the faster add-expense work wait for real speed numbers? Default:
   yes; move it out of this bundle and build it later only if the numbers show
   it matters.
8. Confirm the three small changes as described: hide "Trip completed" on a
   locked trip, 11px member rows on Invite, and "Send feedback" moved from
   Trips/home to You (below Privacy and Terms) while staying on trip details.
   Default: yes, as written.
