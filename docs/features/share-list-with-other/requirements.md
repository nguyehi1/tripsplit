# Share list with other: requirements

Date: 2026-10-16
Status: scoping (requirements stage, pre-review). No `planning.md` precedes this doc; it was
scoped directly from [the engineering handoff](../Splitiful%20UX%20redesign%20engineering%20handoff.md)'s
boards H, I, J, K and from [`starter-list-exploration`](../starter-list-exploration/requirements.md)'s
hand-off of this scope (see its "Canvas coverage" table rows H, I, J, K and its non-goals).
Semver: **feature** (minor bump). New, additive capability; nothing existing changes for a user
who never taps Share.

**Priority note (carried from the task, not re-decided here):** this is the lowest-priority piece
of the three-way redesign split (`redesign-ui`, then `copy-list-from-past-trip`, then this one) and
build order follows that. **The user asked explicitly to keep this minimal** — this doc pushes
anything not strictly required by boards H/J/K into non-goals/open questions rather than acceptance
criteria.

## Problem

A trip's shopping list is useful outside the trip it was built for: someone planning a similar trip
("what did you bring camping last time?") wants to see and reuse a list without being added to the
original trip, seeing its expenses, or joining as a member. Today the only sharing mechanism is the
trip invite link, which hands over full trip access (balances, settle-up, roster). This feature adds
a narrower, lower-stakes link: share just the shopping list's items, read-only, so a recipient can
look at it and, if useful, copy its items into a trip of their own (new or existing).

## Scope (boards H, I, J, K)

- **Board H (Share).** A trip member can get a shareable link for the current trip's shopping list.
- **Board J (Receive).** Opening that link, with no account and no sign-in, shows the list (item
  names only) as a read-only preview.
- **Board K (Receive, pick trip).** From that preview, the viewer can choose to add the list's items
  into a trip of their own — a brand-new trip or an existing trip they belong to — gated behind the
  app's existing sign-in/verification gate.
- **Board I (Add all)** is **not new scope here** — see "Reconciliation with `starter-list-exploration`"
  below.

## Reconciliation with `starter-list-exploration`

Board I in the handoff ("tapping 'Add all' folds all remaining suggestion chips into the list at
once") is the same "Add all" the `starter-list-exploration` doc already scoped and deferred to 0.8.1
under its own "AfterAddAll" board, because it needs a `batch_id` to support the paired Undo
(`starter-list-exploration` non-goals: "Add all N (0.8.1), Undo and batch ids (0.9.0)"). It is a
catalog-suggestion-chip action on an existing trip's own List tab, unrelated to a shared link. This
feature does **not** duplicate or re-scope that work. If `starter-list-exploration`'s 0.8.1 "Add all"
has shipped by the time this feature is built, the engineer may reuse its batch-insert mechanism for
board K's "add this list's items to my trip" action; if it hasn't, a simple per-item insert loop is an
acceptable fallback here — that choice is the architect's, not fixed by this doc. Either way, this
feature introduces no separate "Add all"/Undo UI of its own on an existing trip's List tab.

## Permissions recommendation (resolves the handoff's open blocking question, for this feature's slice only)

The handoff's "Open decisions" section flags permissions — who adds items, who edits expenses, what a
non-member sees on a shared link — as unspecified and blocking. This doc does not resolve the general
question (out of scope), but recommends the simplest workable model for this feature specifically, for
the user to confirm before architecture starts:

- **Who can generate a share link:** any trip member (not organizer-only). The link is read-only and
  carries no money data, so it is lower stakes than the existing trip-invite link.
- **What a non-member sees via the link, with no auth:** the list's item names only (open and, if
  shown, bought/claimed status), plus the trip name for context. No member names, no "claimed by"
  identity, no expenses, no balances, no dates/location beyond what's needed to label the preview.
- **Adding items to one's own trip:** gated behind the existing sign-in/verification flow (the same
  OTP gate used elsewhere), same as today's "add an item" / "add an expense" gates reached from the
  existing join link. No new auth mechanism.
- **Link lifetime:** no separate revoke action in this pass (see non-goals); the link's validity
  tracks the source trip the same way the existing invite link does (stops working once that trip is
  completed/locked).

If the user wants a different model (e.g., organizer-only sharing, or a revoke button), say so before
this doc moves to architecture — the acceptance criteria below assume the model above.

## Acceptance criteria

Share (board H)
1. A signed-in trip member, from the trip's List tab, can obtain a shareable link for that trip's
   shopping list, distinct from the trip's existing invite/join link.
2. The share action does not require the organizer role; any member can do it.
3. Generating the link makes no change to money records and does not alter the shopping list itself.
4. No message is sent by Splitiful as part of this action. However the member distributes the link
   (copy, their own device's share sheet, their own mailto/chat) is their own act, not Splitiful's.

Receive, read-only preview (board J)
5. Opening the link with no session and no sign-in shows the list's current item names (open items,
   and bought/claimed status if the architect/ux-designer decide to show it) and the trip's name, with
   no sign-in prompt required just to view.
6. The preview shows no money figures, no balances, no settle-up data, no member names or "claimed by"
   identity, and no trip data beyond what's listed in criterion 5.
7. The preview is read-only: nothing on this screen lets an unauthenticated viewer add, edit, claim, or
   mark an item bought on the *source* trip's list.
8. If the link no longer resolves (source trip completed/locked, or deleted), the viewer sees a clear,
   generic message — no raw error, no indication of why beyond "this list isn't available anymore."

Receive, add to own trip (board K)
9. From the preview, an explicit action lets the viewer add the list's items to a trip of their own.
   Tapping it routes through the existing sign-in/verification gate if the viewer has no verified
   session yet (consistent with today's join-link "add an expense" / "see full details" gates).
10. Once verified, the viewer picks either: create a brand-new trip (via the existing new-trip flow) or
    an existing trip they already belong to, then the received list's items are added to that trip's
    shopping list as ordinary items (name only, no note, no reference back to the source trip).
11. The viewer can only add into a trip they are already a member of (or one they create in that
    moment) — never into an arbitrary trip id they don't belong to.
12. Adding the received items does not add the viewer, or anyone, as a member of the *source* trip,
    and does not expose the source trip's roster, expenses, or balances at any point in this flow.
13. If the destination trip's list already has an item with the same (trimmed, case-insensitive) name,
    behavior follows the same de-duplication the existing add-item path already uses; this feature adds
    no new merge logic.

Security and abuse surface
14. The read-only preview endpoint/route is reachable by anyone with the link, with no membership
    check — it must follow the same rate-limiting approach already applied to the existing invite-code
    lookup (`get_trip_by_invite_code`'s throttle), since this is another anonymous-callable lookup by
    a bearer-secret-shaped code.
15. The list-share link/token is never logged, put in analytics, or forwarded into another URL beyond
    what's needed to render the preview, matching the existing rule for the invite/join link.
16. No raw database or constraint error is ever shown to the preview viewer; only generic copy.

## Non-goals

- Revoking or rotating a share link once issued, or any "manage my shared links" UI. (Flagged as an
  open question for the user above; if wanted, it's a follow-up, not this pass.)
- A custom message, caption, or note attached to the shared link by the sharer (keeps this feature free
  of any new free-text field and the review burden that comes with one).
- Letting a non-member edit, claim, or mark bought any item on the *source* trip from the preview.
- A separate "Add all" / Undo mechanism built specifically for this feature — board K reuses whatever
  bulk-insert mechanism exists at build time (see "Reconciliation" above) rather than inventing its own.
- Showing money, balances, settle-up, roster, or any expense data on the read-only preview.
- Any change to the existing trip-invite/join link, its page, or its permissions.
- Any change to who can add items or edit expenses on a trip in general — this feature only decides
  that for its own new "add received items" action (criteria 9-13), not as a general-purpose answer to
  the handoff's open permissions question.
- Sharing anything other than the shopping list (no expense-level or settle-up sharing).
- A Share icon added to the trip header/summary card as drawn on board C's "and trip screens" row —
  that's `redesign-ui`'s concern if it ships as a nav-bar-only change there; this doc only requires that
  *some* entry point to the share action exists on the List tab, not where it's placed visually.

## Risk surface

| Item | Status |
|---|---|
| New personal data collected/stored | A new link/token identifying the trip's shopping list (shape and storage mechanism are architecture's call — may be a new column/table or may reuse the existing invite code; either way it is a bearer-secret-shaped value and must be treated like one). Not itself about a person. |
| Message sent to a person | None sent by Splitiful. Distribution of the link is the user's own act (copy/share sheet/their own mailto), same posture as `email-invites`'s mailto design — no new Splitiful-sent message. |
| New third-party vendor | None. |
| New unauthenticated/public endpoint, or anything an anonymous account can abuse | **Yes.** The read-only list preview (board J) is a new anonymous-callable lookup by a bearer-secret-shaped code. It must be rate-limited like the existing invite-code lookup and must not leak more than criteria 5-6 allow. This is the feature's main risk item and makes the early compliance/security review mandatory. |
| Changes to money records | None. No money, balance, or expense data is read, written, or exposed by this feature. |
| User-generated free text | Shopping-list item names (already-existing free text, already visible to trip members) are, for the first time, exposed to a non-member with no authentication via the share link. No new free-text field is introduced (see non-goals). The exposure must be scoped to item names only, per criterion 6, and reviewed against the compliance baseline rule that non-member previews must not return free text beyond what's already disclosed there (this is new disclosure, which is why it needs review, not an exemption). |
| New copy that makes a claim about privacy/security | None planned; any copy near the share/preview screens must stay factual per the compliance baseline (no "only you can see this," no "nothing is stored"). |

Because the "new unauthenticated endpoint" and "user-generated free text" rows are non-none, the early
compliance/security review is mandatory for this feature before architecture proceeds.

## Open questions for the user (confirm before architecture)

1. Does the permissions recommendation above (any member can share; read-only, no-auth preview;
   sign-in-gated add) match intent, or should sharing be organizer-only, or should the preview require
   sign-in too?
2. Should bought/claimed status show on the non-member preview, or only open items? (Recommendation:
   show it — it's not personal and matches what a member already sees — but flag because it's a
   judgment call, not drawn on the canvas.)
3. Is "no revoke" acceptable for this pass, given link lifetime already tracks the source trip's
   completed/locked state the same way the invite link does?
