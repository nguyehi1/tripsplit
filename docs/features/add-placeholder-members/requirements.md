# Placeholder members

## Problem statement

Trip costs often need to be split among people who aren't going to use
TripSplit — someone without a smartphone, a kid, a friend who hasn't
gotten around to accepting the invite yet, or someone who will just never
sign up. Today the only way to represent a person in a trip's split is a
full `trip_members` row tied to an authenticated Supabase user, created
via the invite/join flow. That forces the organizer to either leave that
person out of the split entirely (wrong total, wrong per-person share) or
manually adjust numbers outside the app. This feature lets the organizer
add a "placeholder" — a name-only stand-in with no account — so the trip's
equal split accounts for everyone actually on the trip, without requiring
everyone to sign up.

This is organizer-side roster management. It does not touch the invite
link, the join flow, or the settlement math itself.

## Acceptance criteria

**Adding a placeholder**
1. Only the trip's organizer (the user who is `trips.created_by`) sees and
   can use an "add placeholder" affordance. Non-organizer members do not
   see this affordance at all (not shown, not shown-disabled).
2. Adding a placeholder requires only a name — no email, no invite code,
   no account creation of any kind.
3. A trip may have at most 20 placeholders. Attempting to add a 21st is
   rejected with a clear message. (Rationale: guards against accidental
   runaway entry — e.g. a stuck button or a mis-click loop — while
   comfortably covering any realistic real-world trip size for this app.)
4. The organizer may add a placeholder whose name duplicates an existing
   member's name (real or placeholder). No uniqueness check is enforced.
   (Rationale: name collisions are already possible today between two real
   members who join with the same display name; this feature doesn't need
   to solve a pre-existing problem, and payer-picker safety doesn't depend
   on names being unique.)

**Display**
5. Wherever a member's name is shown to any trip member — the add-expense
   payer picker, the trip Details table, Summary/settle-up, and the
   member roster — a placeholder's name is rendered as "<name>
   (placeholder)" so it's never confused with a real member.
6. Any trip member (not just the organizer) can see placeholders in these
   views. Visibility of the placeholder itself is not restricted to the
   organizer — only the *add* and *remove* actions are.

**Payer restriction (hard rule)**
7. A placeholder can never be selected as the payer (`paid_by`) of an
   expense. Note: as of this feature, the app has no "payer picker" UI at
   all — `paid_by` is always the signed-in user submitting the expense, so
   there is no picker to exclude placeholders from yet. This AC is
   forward-looking: if/when a payer-picker UI is built, it must exclude
   placeholders. Building that picker is explicitly not part of this pass
   (see Non-goals).
8. This is enforced as more than a UI default: an attempt to record an
   expense with a placeholder as payer (e.g. a direct API/RPC call) must
   be rejected by the backend, not merely hidden by the UI. In practice
   this requires no new enforcement — a placeholder has no `auth.users`
   row, so no value could ever satisfy `expenses.paid_by`'s existing
   foreign key and insert-policy checks for a placeholder in the first
   place.

**Split math**
9. A placeholder counts as one member in the equal whole-trip split,
   contributes $0 paid, and therefore always shows a net balance of
   "owes their full share." No changes to the existing balance/settlement
   calculation logic are required for this — it falls out of a placeholder
   being an ordinary member row with zero expenses attached.

**Renaming**
10. The organizer can rename a placeholder after adding it (e.g. to fix a
    typo) without deleting and re-adding it. The renamed name immediately
    reflects everywhere it's displayed (per #5).

**Removing**
11. Only the organizer can remove a placeholder, and only placeholders can
    be removed this way — this feature does not add any capability to
    remove a real, already-joined member. That remains explicitly out of
    scope.
12. Removing a placeholder is a plain, immediate delete of its roster row.
    Because no expense can ever reference a placeholder as payer (#7–8),
    this delete is always safe/lossless — no orphaned data, no cleanup
    step.
13. Because settlement is computed live from the current member list (not
    stored per-expense), removing a placeholder immediately and
    retroactively corrects every expense's split for the remaining
    members — no migration or recompute step is needed.

**No auto-claim / merge (explicitly known, non-bug behavior)**
14. There is no automatic matching, claiming, or merging between a
    placeholder and a real member row. If the person a placeholder
    represents later joins for real via the invite link, the app does
    nothing to detect or reconcile this — the organizer must manually
    delete the placeholder once that happens.
15. Until the organizer deletes the stale placeholder, that person is
    double-counted in the split (once as the placeholder, once as their
    real membership). This is accepted, documented behavior for this
    pass, not a defect to be caught in QA as a bug.

**Invite/join flow**
16. The invite link, the `/join/[code]` page, and the `join_trip` flow are
    unchanged by this feature. Placeholders are invisible to and have no
    effect on how a real person joins a trip.

**Completed trips (locked, no modification)**
17. Once a trip is completed (`trips.completed_at is not null`), the
    organizer can no longer add, rename, or remove a placeholder — all
    three actions are rejected, mirroring the existing rule that expenses
    can't be modified on a completed trip
    (`0005_lock_expenses_when_trip_completed.sql`). Rationale: removing a
    placeholder retroactively changes the split via live computation
    (#13); allowing that after a trip is marked complete and settled would
    silently change numbers everyone already saw and acted on.
18. The "add placeholder" affordance itself should reflect this lock in
    the UI on a completed trip (matching how the app already communicates
    the expense lock), not just fail silently server-side.

## Non-goals (explicitly out of scope for this pass)

- Removing a real, already-joined member from a trip.
- Any automatic detection, matching, or merging of a placeholder with a
  real member who later joins.
- Any change to the invite link or join flow.
- Any change to how the equal-split/settlement calculation itself works
  (`src/lib/settlement.ts`) — placeholders ride the existing logic as a
  normal zero-expense member.
- Uneven/custom splits, or excluding specific members (including
  placeholders) from specific expenses — the trip-wide split remains
  equal-among-all-members, same as today.
- Letting a non-organizer member add, rename, or remove a placeholder.
- Any placeholder-specific notification, reminder, or "convert to real
  member" prompt.
- Building a "payer picker" UI. None exists today (`paid_by` is always the
  signed-in submitter); this feature doesn't introduce one.

## Schema note for the architect (not specified here)

Per the locked decisions this doc formalizes: `trip_members.user_id` will
need to become nullable, plus some way to flag a row as a placeholder
(e.g. a boolean or a `null` `user_id` as the flag itself — architect's
call). `expenses.paid_by` does not need to change and keeps referencing a
real authenticated user, since placeholders can never be a payer (AC
#7–8).

## Semver classification

**Feature** (backward-compatible, additive). It adds new organizer
capability and a schema loosening (`user_id` becomes nullable) but changes
no existing API contract, endpoint behavior, or UI for anyone who doesn't
use the new "add placeholder" affordance. No existing data or flows are
altered.
