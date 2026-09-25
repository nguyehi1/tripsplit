# Requirements: Remove member from trip roster + self-service leave trip (remove-member-access)

Status: scoped, ready for architecture. Direction confirmed by the user after the
`planning.md` debate — see that doc for full context on why the scope below (no invite-code
rotation, self-leave bundled in) is what shipped rather than the originally-requested
"revoke access."

## Problem statement

Today, once someone joins a trip there is no way to take them off the roster — not by the
organizer (e.g. someone joined by mistake, or was invited and shouldn't have been), and not by a
member themselves (e.g. they realize they joined the wrong trip, or are no longer going). The
only workaround is asking the organizer to manually intervene outside the app. This feature gives
the organizer a way to remove another member, and gives any member a way to remove themselves,
from a trip's roster going forward.

This is **not** a security/access-revocation feature. Per the planning debate, true access
revocation would require invite-code rotation (which also boots every *other* current
link-holder and needs a re-share step) — that's explicitly out of scope here. What ships is the
smaller, honest version: removing someone from the visible roster and cutting off their
*continued* participation, while being upfront that the same invite link/code still works if they
reuse it.

## Scope decisions carried in from the user (not re-litigated here)

1. No invite-code rotation in this pass.
2. UI copy must not claim removal revokes all access — the confirmation step must disclose the
   member could rejoin by reusing the same invite link/code.
3. Self-service "leave trip" ships in the same pass, sharing the same underlying mechanism.
4. A removed/left member's past expenses (`paid_by`) and the ledger stay untouched — no
   reassignment, no deletion, no rewrite of expense rows. (See "Important clarification on
   balances" below for what "untouched" precisely means given how splits are computed.)
5. The removed member is notified of their removal (mechanism decided below).
6. Organizer-only for removing *other* members. Self-removal is available to any non-organizer
   member.
7. Non-goals (deferred, not solved here): outstanding-balance blocking/warning on removal;
   post-removal read-only balance visibility for the removed member; invite-code
   rotation/per-invite links.
8. No audit trail beyond what's naturally reconstructable (no new logging table) — matches the
   existing placeholder-removal precedent.

## Data model decision (for architecture to build on)

**Hard delete the `trip_members` row**, not a soft-delete/status column.

Rationale: this matches the codebase's existing, only precedent for removing a member-ish row —
`remove_placeholder_member` in `supabase/migrations/0008_add_placeholder_members.sql` hard-deletes.
`expenses.paid_by` references `auth.users(id)` directly, not `trip_members`, so deleting the
`trip_members` row has no cascade/FK impact on expense history — the ledger is structurally
unaffected either way. There's no existing pattern in this codebase for soft-delete/status columns
on membership, and no stated need here for "was a member, now removed" to be queryable later
(no audit-trail requirement, per scope decision 8). Adding one would be new complexity with no
consumer.

## Important clarification on balances (a finding from this scoping pass, not a new decision)

Splits are **not** snapshotted per expense. `computeBalances` (`src/lib/settlement.ts`) divides
the *current* trip total evenly across *whoever is a member right now*, regardless of when each
expense happened or when each member joined — this is already true today for someone who joins
partway through a trip (their share of every prior expense is included). Removing a member is the
symmetric case: once removed, the total is divided across the remaining members, which changes
everyone else's computed share retroactively, even for expenses logged before the removal.

This is consistent with the existing equal-split engine, not a new behavior introduced by this
feature — but it does mean "balance contributions stay untouched" (scope decision 4) needs a
precise reading: the removed member's `paid_by` expense rows are never altered, reassigned, or
deleted, and the removed member's own historical `paidCents` is preserved if they're ever looked
up directly. What *does* change is the remaining members' computed *share* of the trip total, the
same way it would if a new member joined. Requirements/QA should treat this as expected, not a
bug — but the confirmation dialog copy (ux-designer's call) should make it clear removal changes
what remaining members owe, not just "this person leaves."

## Notification mechanism

**In-app state, not email.** Checked the existing patterns: every email this app sends
(`src/lib/email.ts`, `sendTripEmail`) is sent using the *caller's own* verified session email,
triggered by their own action (creating/joining a trip) — there is no existing path for one
member to trigger an email to a *different* member's address, and `trip_members`/RLS give no
member access to another member's email. Building that would mean new scope (a service-role email
lookup, or storing emails outside `auth.users`), disproportionate to "no over-build this."

Instead: the removed/left member's session already loses roster/mutation access to the trip
going forward (per existing RLS shape once the row is gone). The next time they load the trip
(from a bookmark, the invite link, or navigation), they must see an explicit, distinguishable
"You've been removed from this trip" (or "You left this trip") state — not a generic error, not a
silent redirect, and not the public read-only summary view a stranger would see. This *is* the
notification, and it applies to both organizer-removal and self-leave.

## In scope

### A. Organizer removes another member
- Only the trip's organizer (`trips.created_by`) can remove a member who isn't themselves.
- Available for any real (non-placeholder) joined member. Placeholder removal already exists
  (`remove_placeholder_member`) and is untouched by this feature.
- Requires an explicit confirm step (confirmation dialog or equivalent) before the removal takes
  effect — not a single-tap/no-confirm action.
- The confirm step must disclose, in plain language, that the removed member could still rejoin
  using the same invite link/code (this is the honesty requirement from scope decision 2 — not
  optional, not buried in a tooltip).
- On confirm: the member's `trip_members` row is deleted. They immediately lose roster visibility
  and the ability to add/edit expenses or view member-only detail going forward (per existing RLS
  shape once membership no longer exists).
- Mirrors the existing lock-gate precedent (`is_trip_open`, see `0008_add_placeholder_members.sql`
  and `0005_lock_expenses_when_trip_completed.sql`): removal is blocked once the trip is
  completed/locked, same as placeholder removal and expense edits are. A completed trip's roster
  shouldn't change after the fact.
- Their past expenses and `paid_by` history are untouched (see balances clarification above).

### B. Self-service leave trip
- Available to any joined, non-placeholder, non-organizer member of an open trip.
- Same confirm-with-disclosure requirement as organizer-removal (the member should understand
  they could rejoin via the same link, and that leaving doesn't erase their expense history).
- Same open-trip gate as organizer-removal (can't leave a completed/locked trip).
- On confirm: their own `trip_members` row is deleted, same underlying mechanism as A.
- After leaving, the member sees the same "you're no longer on this trip" state described above
  if they return via a bookmark/link (not an error).

## Acceptance criteria

**Organizer-removal**
1. As the organizer, I can see a "remove" affordance on any other real (non-placeholder) member
   in the roster.
2. Tapping it shows a confirmation step naming the member and disclosing they could rejoin via
   the same invite link/code if reused.
3. Confirming removes them from the roster immediately; canceling leaves the roster unchanged.
4. After removal, that member no longer appears in the active roster, cannot add/edit expenses,
   and cannot view member-only trip detail on their next request.
5. The removed member's past expenses remain in the expense list, attributed to them, unchanged
   in amount/description.
6. Remaining members' computed balances reflect the new (smaller) member count going forward,
   consistent with how the equal-split engine already treats membership changes.
7. The organizer cannot remove themselves via this flow — the remove affordance is not offered
   for the organizer's own row (or, if attempted directly, the action is rejected with a clear
   message).
8. Removing the last other member is allowed and succeeds (leaving a trip with just the
   organizer as its only member).
9. Attempting removal on a completed/locked trip is rejected with a clear message, same as
   placeholder removal today.
10. Only the organizer can call this — any other member attempting it is rejected (RLS/RPC-level,
    not just hidden UI).

**Self-service leave trip**
11. As a non-organizer member, I can find a "leave trip" action and it shows the same
    confirm-with-disclosure step (naming the trip, disclosing rejoin-via-link).
12. Confirming removes my own `trip_members` row; I lose roster visibility and mutation access
    on my next request, and see the "you left this trip" state (not an error) if I return via a
    bookmark/link.
13. My past expenses remain in the trip's ledger, unchanged.
14. The organizer does not see a "leave trip" option for their own row (they're not a valid
    self-removal target — see non-goal below).
15. Attempting to leave a completed/locked trip is rejected with a clear message.

**Shared**
16. Neither flow deletes, reassigns, or reattributes any `expenses` row.
17. Neither flow requires or triggers an email — the notification is the in-app state described
    above, on both sides (removed-by-organizer and self-left).

## Non-goals (explicit, deferred)

- Invite-code rotation or per-invite (vs. shared) codes — removal/leaving does not invalidate the
  existing invite link. A removed/left member (or anyone else holding that link) can still rejoin
  by reusing it; this is disclosed, not hidden, per scope decision 2.
- Blocking or warning removal/leaving when the member has an outstanding balance.
- Any read-only post-removal view of a removed member's own historical balance — the stated
  workaround is asking the organizer directly.
- Organizer self-removal / ownership transfer / trip deletion — a different feature. The
  organizer can neither "remove" nor "leave" their own trip through this feature.
- Placeholder member removal — already shipped, unchanged.
- Any audit log of who removed whom and when.
- Email or push notification of removal — in-app state only, per the notification section above.

## Semver classification

**Feature** (backward-compatible addition). No existing API/route/behavior changes for anyone not
using the new remove/leave actions; new RPCs and a new roster affordance are additive. Not a
`fix` (nothing broken before this), not `breaking` (no existing contract changes).
