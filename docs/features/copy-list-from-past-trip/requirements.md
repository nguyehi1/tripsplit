# Requirements: Copy list from a past trip (`copy-list-from-past-trip`)

Source: boards D (EmptyNone, copy-offer behavior only), E (EmptyOne), F (EmptyMany) and G
(AfterCopy) of [the redesign engineering handoff](../Splitiful%20UX%20redesign%20engineering%20handoff.md),
split out of that handoff's single "D, E, F Empty list" / "G" rows so this piece can be scoped and
built independently. Builds **after** `redesign-ui` (board D's base empty-state styling — tokens,
spacing — is inherited from that feature) and is listed in the roadmap as medium priority, second
of the three split-out features. Background and prior decisions: this scope was previously nominally
owned by `starter-list-exploration` (boards E, F, G, called "Copy-a-past-trip" there) and that doc's
"Canvas coverage" table and non-goals section now point forward to this doc (see its entries for
boards E, F, G, dated 2026-10-16).

No `planning.md` exists for this feature; this is the first pass.

## Problem

An organizer starting a new, similar trip (the same campsite next year, a repeat work trip) has to
retype every shopping-list item from scratch, even though a very similar list already exists on a
past trip of theirs. The starter-catalog suggestions (shipped in `starter-list-exploration`) cover
generic trip types, not "what we actually bought last time." This feature lets the organizer start
an empty list from one of their own past trips' lists instead of a blank page, with a one-tap,
reversible action so a wrong tap costs nothing.

## Scope

1. **Board D/E/F: the copy offer on an empty list.** When a trip's shopping list is empty, show (or
   don't show) a "copy from a past trip" option depending on how many eligible past trips the
   current user has:
   - 0 eligible past trips: no copy option at all (board D).
   - Exactly 1: name that trip directly as the copy source (board E).
   - 2 or more: list all of them as copy sources (board F).
2. **Board G: the copy action.** One tap on a listed source trip copies that trip's list items into
   the current (empty) trip's list and shows a toast with an Undo action.
3. **Eligibility rule for "past trip."** A past trip is one the current user is a **member of**
   (so RLS already permits them to read its items — no new read path), is **not** the current
   trip, and has at least one item eligible to be copied (see Open question 1). Ordering when 2+
   are listed (most recent first, by `starts_on`/`created_at`) is a UX decision, not specified here.

## Non-goals

- Boards H, I, J, K (sharing a list by link, receiving a shared list) — owned by
  `share-list-with-other`.
- Boards M, N (long-list "+2 more" expansion) and the "Add all" suggestions action (board I) —
  already shipped or owned elsewhere; unrelated to copying between trips.
- Copying anything other than shopping-list item names: no expenses, no claimed/logged state, no
  trip metadata (dates, location, types), no members.
- Multi-select or partial copy (picking individual items from the source trip). One tap copies the
  whole eligible list from one source trip at a time.
- Editing a copied item's name during the copy; copied items land exactly as named on the source.
- Any change to who can see or add shopping-list items today. Copy is gated by the **same**
  verified-member add path as typing an item by hand (see criterion 10).
- Any change to the existing suggested-items catalog card or its de-dup logic
  (`starter-list-exploration`); this feature does not define whether a copied item suppresses a
  catalog suggestion or vice versa (Open question 2).
- Offering copy anywhere other than an empty list (no mid-list "also copy from..." entry point).
- Any change to whether a completed (locked) trip can receive new shopping-list items. Today's
  `shopping_list_items` insert policy does not check `completed_at` (unlike expenses); this feature
  inherits whatever that existing behavior is and does not add or remove a lock.
- Board D's base empty-state visual styling (text, spacing, tokens) — that is `redesign-ui`'s
  scope; this feature only adds/removes the copy option within that state.

## Open questions (surfaced, not decided here)

1. **Which items on the source trip get copied? Resolved (user decision, 2026-10-16).** Only the
   shopping-list **item names** are copied, inserted as new "open"/unclaimed rows in the target
   trip — no bought/claimed status, no expense linkage, no trip metadata, no members. The source
   list is treated as a reusable, user-customized template, not a record of what happened on that
   trip. This confirms option (c) below as final, not just a recommended default: claimed/logged
   state is per-trip and tied to `expense_id`/`claimed_by` references that don't carry meaning in
   the new trip; copying it would misleadingly suggest an item is already bought on a trip where
   nothing has happened yet. A trip whose only items are logged and none are open has 0 eligible
   items and does not count as a source (criterion 3).
2. **Interaction with the suggested-items catalog card.** If a copied item's name matches a
   catalog-suggested item, does the suggestion still show (it's derived, not stored, so by default
   it would disappear once a same-named item exists — consistent with `starter-list-exploration`
   criterion 8). No new decision needed unless product wants different behavior; flagged so the
   architect doesn't have to guess.
3. **Undo window.** How long after the toast appears can Undo still fire (a few seconds, until
   next navigation, etc.) — a UX/architecture call, not specified here. The behavioral requirement
   (criterion 7) is that Undo removes exactly what the one tap added, nothing more and nothing
   less, for as long as the toast is visible.

## Acceptance criteria

**Offer (boards D/E/F)**
1. On a trip's shopping list with zero items, the copy option's presence and wording depend only
   on the count of eligible past trips for the current user (criteria defined in Scope item 3):
   absent at 0, names the one trip at exactly 1, lists all of them at 2+.
2. The copy option never appears on a non-empty list (an existing item present, by any status,
   suppresses it) and disappears immediately once the list stops being empty (including as a
   side-effect of the copy action itself, criterion 6).
3. "Eligible past trip" excludes the current trip and excludes any trip the current user is not a
   member of. The eligibility count and the list of named trips are computed from data the current
   user's RLS session can already read — no new query bypasses membership.
4. If the user has only completed (locked) trips as sources, those still count and still appear by
   name — a locked trip is a valid **read-only source**; this feature does not write to it.

**Copy action (board G)**
5. Tapping one listed source trip copies that trip's eligible item **names only** (decision #1:
   no bought/claimed status, no expense linkage, no metadata, no members) into the current trip's
   list as new rows, preserving each item's name text unchanged (whitespace-trim only, no further
   rewriting) and inserted as "open"/unclaimed, visible to all current-trip members like any
   hand-typed item.
6. Immediately after a successful copy, a toast appears with an "Undo" action, and the copy option
   from criteria 1-2 disappears (the list is no longer empty).
7. Tapping Undo while the toast is active removes exactly the items that one copy action added and
   nothing else — not items added by any other action in between, not items a different member
   added concurrently. After Undo, if the list is empty again, the copy option reappears per
   criterion 1 (state is not "copied once, never again").
8. Not tapping Undo (letting the toast dismiss or time out) leaves the copied items in place
   permanently; there is no second confirmation step.
9. A second, distinct tap on the same or a different source trip (after Undo, or if the list became
   empty again by deleting all items) is treated as a fresh copy action with its own toast and its
   own Undo scope — Undo is never retroactive across multiple copy actions.

**Access control**
10. Copying items goes through the same verified-member authorization as the existing hand-typed
    add-item path (the existing `shopping_list_items` insert policy): an unverified/anonymous
    organizer hits the same existing OTP verification gate as adding an item by hand before a copy
    can complete; a non-member of the *current* trip cannot trigger a copy into it regardless of
    which trips they belong to elsewhere. No new RLS policy, grant, or client-only check is the
    sole gate.
11. The copy-source list only ever contains trips belonging to the current authenticated user
    (per their own membership), never another user's trip data, proven against the database (not
    only the UI) — a non-member cannot read or copy from a trip's items via this feature's new
    query path any more than they could today.
12. Copying does not create, modify, or let the user pick a payer, split, or expense. It only
    inserts `shopping_list_items`-shaped rows with no `expense_id` and no `claimed_by`.

**Analytics and copy**
13. If an analytics event is added for the copy tap (optional), it is name-only (no source trip
    name, no item names, no counts) per the existing analytics rules, and listed in
    [ANALYTICS.md](../../ANALYTICS.md).
14. No new user-facing copy makes any privacy or security claim (e.g. "only visible to you");
    copied items are described, if at all, the same way existing shared list items are — visible to
    all current trip members.

**Quality**
15. Narrow-screen check (390px and 320px): the named-trip offer (1 source) and the listed-sources
    offer (2+) do not truncate a trip name illegibly or break the empty-state layout inherited from
    `redesign-ui`.
16. Works in both light and dark mode per the handoff's board D/E/F/G coverage (the redesign
    applies to both themes).

## Risk surface

| Item | Assessment |
|---|---|
| New personal data collected/stored | None newly *collected* — this duplicates existing user-typed item names (already stored on the source trip) into new rows on the target trip. Still a data-handling pattern worth review: free text now moves between two trips' rows via an app-driven bulk insert, not typed by hand on the target trip. |
| Message sent to a person | None. No email, SMS, or share-sheet action; the toast is local UI only. |
| New third-party vendor | None. |
| New unauthenticated/public endpoint or anonymous-account abuse | None intended — copy must ride the existing verified-member `shopping_list_items` insert path (criterion 10); flagging because a new RPC/endpoint should not be a backdoor around the existing OTP gate or membership check (criterion 11). |
| Changes to money records | None. No `expenses` row, `paid_by`, or balance is touched; copied items carry no `expense_id` (criterion 12). |
| User-generated free text | **Yes.** Item names are user-typed free text, now moved in bulk between trips by one tap rather than typed per item. This is the main reviewable surface: the source trip may belong to a different set of trip members than the target trip, so free text one group wrote becomes visible to a different group of people (criterion 5 makes this visible-to-all-target-members explicitly, not silently). |
| New copy making a privacy/security claim | None planned; explicitly banned by criterion 14. |

**Because "User-generated free text" is not "none," the early compliance/security review is
mandatory for this feature** before architecture proceeds, in particular on: (a) whether moving one
group's item text to become visible to a different group of trip members needs its own disclosure
beyond "visible to trip members" (compliance-baseline's existing rule already requires describing
such data as member-visible, never author-private — likely satisfied by criterion 5/14, but confirm);
(b) the Undo mechanism's batch-delete query, to confirm it cannot be driven by client-supplied row
ids to delete items the user didn't just add (security-baseline's "never trust client-supplied id"
rule) — the architect should design this as a server-validated batch/grouping concept, not a client
list of item ids to delete.

## Semver classification

**Feature** (backward-compatible, additive). Adds a new optional action on an existing empty-list
state; no existing API, schema contract, or behavior for a user who never uses the new copy
affordance changes. Likely needs one additive schema change (some batch/grouping marker on
`shopping_list_items`, or an equivalent architecture, to make Undo precise per criterion 7) — that
is additive, not breaking, but flagged here since it's a new column/mechanism for the architect to
design explicitly rather than infer.
