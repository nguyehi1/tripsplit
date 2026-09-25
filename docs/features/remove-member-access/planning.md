# Planning: Organizer removes another member's access (remove-member-access)

Date: 2026-09-22
Stage: planning (pre-requirements) — convened `pm` and `product-strategist` per the
`/feature` pipeline's planning stage. Not a requirements doc; no scope here is final
until the user picks a direction below and `pm` formalizes it next.

## Raw feature idea

> Enable organizer to remove other people's access — i.e., let a trip's organizer
> revoke another member's access to a trip.

## Context that grounds this discussion

- **v2-vision.md** doesn't mention member removal at all — this is not a previously
  litigated idea (unlike OCR, itemization, payment rails, multi-currency, which are
  explicitly rejected/deferred). The vision's only named "real gap worth closing" right
  now is expense delete (still unshipped). Its test for any new feature: does it make
  logging an expense or seeing the final split faster/clearer, or does it add a new
  decision/screen/concept to hold in your head.
- **ROADMAP.md** currently sequences, in order: (1) still-open invite-code
  security/compliance follow-ups (live trust/legal exposure), (2) expense delete, (3)
  whatever friction real usage surfaces, (4) shopping-list-with-claiming (on hold).
  Member removal isn't on the roadmap.
- **Data model reality** (`supabase/migrations/0001_init.sql`): organizer is just
  `trips.created_by` — no role table. `trip_members` has no status/soft-delete column
  and no DELETE RLS policy today (SELECT only). Trips have **one shared `invite_code`**
  per trip, not per-invitee, and `join_trip` is **idempotent**
  (`on conflict (trip_id, user_id) do update`) — revisiting the same link always
  re-adds you. `expenses.paid_by` references `auth.users(id)` directly, and RLS lets
  **any** member insert/update/delete **any** expense on the trip (locked v1 decision) —
  a removed member's historical expenses aren't siloed from the rest of the ledger.
- **Precedent**: placeholder members (`docs/features/add-placeholder-members/requirements.md`)
  already give the organizer add/remove/rename for name-only stand-ins, and that doc's
  own non-goals list explicitly calls out "removing a real, already-joined member" as
  out of scope — this feature is the first to actually take that on. Placeholders never
  have `paid_by` rows, so that precedent doesn't resolve what happens to a removed real
  member's expense history.
- **ADR 0006** (anonymous auth + linking) establishes that "membership" and "session
  identity" are already somewhat decoupled concepts in this app (anonymous sessions can
  own/join trips before ever verifying an email) — relevant background for "can a
  removed member just sign back in and rejoin," since rejoining doesn't require a fresh
  identity, just the same invite code.

## PM's initial take (summary)

Full reasoning in the transcript; key points:

- **MVP scope as first proposed**: organizer deletes a real member's `trip_members` row
  (self-removal and placeholder-removal excluded — already solved / a different
  concern). Access cut off going forward via RLS. Removed member's past `expenses.paid_by`
  rows and balances stay untouched — no retroactive rewrite of the ledger. Removed
  member sees a clear "you no longer have access" state instead of an error. A
  confirmation step before removal.
- **Explicitly punted in the first pass**: reassigning/zeroing historical expenses, any
  granular role system beyond existing organizer=created_by, per-invite (vs. shared)
  codes, blocking removal when the member has an outstanding balance, removed-member
  email notification.
- **Self-flagged, unprompted, as needing a strategic gut-check**: (1) the shared
  invite-code rejoin loophole — `join_trip`'s upsert means a removed member can just
  reopen the same link and silently rejoin; (2) no "removed member" UI treatment for
  their still-visible name/history in old expenses; (3) whether this even clears the
  v2-vision bar, since it's a trust/admin feature rather than an obvious speed/clarity
  win.
- **After the strategist's pushback (reacted, conceded ground)**: agreed invite-code
  rotation is a real fork, not a detail — either ship rotation (bigger: also boots every
  other current link-holder, needs a re-share step) or ship without rotation but rename
  the feature away from "remove access" to something honest like "remove from trip,"
  with an explicit caveat that rejoining via the same link remains possible. On
  post-removal balance visibility, agreed it's a real tension with the vision's "final
  number never requires interpretation," but should be a named non-goal with a
  one-line rationale (e.g. "ask the organizer directly") rather than solved in this pass,
  since solving it properly means new access-control shape (read-only post-membership
  access), not a copy change.
- **PM's net position after the exchange**: agrees with the strategist's hold/shrink
  recommendation. If something ships now, self-service "leave trip" first; "organizer
  removes someone else" should wait on an explicit user decision on code rotation and
  post-removal balance visibility.

## Product-strategist's initial take and debate (summary)

Full reasoning and full exchange in the transcript; key points:

- **Recommendation going in**: hold/defer the full feature; if pursued now, shrink to
  self-serve "leave trip" only.
- **Reason 1 — the rejoin loophole may make the feature not do what it claims.** Same
  shared-code/idempotent-join point PM raised independently. Making removal actually
  "stick" requires rotating the invite code, which boots everyone else holding that
  link too — a materially bigger feature than deleting one row.
- **Reason 2 — collision with the locked "any member can touch any expense" model.**
  Removing access clearly shouldn't delete the removed member's expenses (would corrupt
  the ledger), but then: do their historical balances still count toward settle-up after
  removal, and if so, can they see them? Neither answer is free — one leaves a person
  unable to see money they owe/are owed (dispute-avoidance/support-burden risk), the
  other means rewriting settle-up semantics.
- **Reason 3 — opportunity cost is real and already decided.** Zero mentions in
  ROADMAP.md/v2-vision.md; the vision's own sequencing already puts security/compliance
  follow-ups and expense delete ahead of anything net-new; no cited incident or support
  ticket establishing urgency.
- **Simpler alternative proposed**: self-service "leave trip" (voluntary, no
  power-imbalance/dispute-avoidance risk, much smaller blast radius) gets most of the
  value; even cheaper, handle rare mis-joins manually/by support process for now and
  revisit only if it recurs.
- **After PM's concession on the rotation fork**: held firm that this is a genuine floor,
  not a nice-to-have — shipping "remove access" without rotation creates **false
  confidence**: the organizer believes access is cut off and it isn't. Framed as worse
  than not shipping, since it's a trust liability once someone notices they can walk
  back in. Offered two acceptable ways out: (a) rotation is in scope (bigger, honest),
  or (b) if punted, the feature and its UI copy must be renamed away from "remove
  access" to something accurate ("hide from roster," "mark as left") so the UI doesn't
  imply a security boundary that doesn't exist.
- **On balance-blocking as a guardrail (should removal be blocked if the member has an
  outstanding balance)**: treated as a nice-to-have, not a floor — fine to punt to a
  fast-follow.
- **On "reduces organizer anxiety" as the vision-fit justification**: explicitly did not
  buy it as sufficient on its own — noted almost any admin feature can be reframed as
  anxiety-reduction, and the vision's bar is about evidenced friction on the two core
  moments, not a plausible-sounding frame. Said this reads as scope-creep rationalization
  unless the user can point to an actual mis-join incident or support request; if one
  exists, the objection drops.

## Where they converged

1. **The invite-code rejoin loophole is the central fact that reshapes this feature's
   scope, not a footnote.** Both agents independently identified it before comparing
   notes. Whatever the user decides, this must be resolved explicitly, not left to fall
   out of implementation.
2. **There are exactly two honest shapes for v1, not a continuum**: (a) rotate the
   invite code as part of removal — genuinely revokes access, but is a bigger feature
   (also affects every other current link-holder, needs a re-share/communication step),
   or (b) don't rotate, and rename the feature/UI copy away from "remove access" to
   something that doesn't imply a security boundary that isn't there (e.g. "remove from
   trip roster"). Shipping (a)'s scope under (b)'s name — the literal "remove access"
   framing as originally requested, without rotation — is what both agents reject as
   producing false confidence.
3. **A removed member's historical expenses/balances are not touched or rewritten.**
   Both agree the ledger must stay correct and untouched — no reassignment, no zeroing.
4. **Whether a removed member can still see what they owed/were owed is a real gap
   worth naming, not silently dropping — but solving it is out of scope for v1.** Both
   converged on: name it as an explicit non-goal with a stated rationale, rather than
   let a user discover the gap later. Actually solving it needs new access-control shape
   (some read-only access surviving membership loss), which is real follow-on scope.
5. **Blocking removal on an outstanding balance is a nice-to-have guardrail, not a
   floor** — fine to punt to a fast-follow, unlike the rotation question.
6. **Placeholder-member and self-removal are out of scope** — placeholders are already
   solved by the existing feature; self-removal by the organizer is a different concern
   (trip deletion/ownership transfer), not this feature.
7. **Net recommendation: hold, or shrink.** Both agents land on the same place: defer
   the full "organizer removes another real member" feature pending explicit user
   decisions on the two forks above (rotation, and whether urgency is real vs.
   speculative); if the user wants something shipped now, ship self-service "leave
   trip" first, since it has no power-imbalance/dispute-avoidance risk and a much
   smaller blast radius (though the rejoin-loophole caveat still applies and should be
   disclosed there too).

## Recommended direction

Do not scope this as-requested ("remove access") without first resolving the two forks
above with the user — implementing the DB delete alone, without addressing the
invite-code rejoin loophole, would ship a feature that doesn't do what its name claims.

The convergent recommendation is: **default to the smaller, honest shape** —
organizer-removes-member without invite-code rotation, but named and copy'd honestly
(e.g. "Remove from trip" with an explicit "they can still rejoin using the same invite
link unless you also share a new one" disclosure inline, not buried) — paired with
self-service "leave trip" as a related, similarly-scoped capability worth building in
the same pass since it shares the same access-cutoff mechanics and the same rejoin
caveat. Rotation-on-removal is a legitimate, larger alternative if the user wants a
true access boundary, but should be treated as a distinct, bigger feature (or an
explicit "v1 vs. v2" split within this one) rather than assumed. Post-removal balance
visibility ships as a named non-goal in v1 ("removed members lose all access, including
to their historical balance — ask the organizer directly"), not solved now.

This recommendation is explicitly conditional on the user confirming real urgency (see
open question 1 below) — both agents' analysis leans toward this being speculative
scope competing against roadmap items with clearer urgency and lower cost
(security/compliance follow-ups, expense delete), and recommends deferring behind those
unless the user has a concrete reason this is needed now.

## Open questions for the user

These are the genuine judgment calls neither agent could or should resolve:

1. **Is there real urgency, or is this speculative?** Neither ROADMAP.md nor
   v2-vision.md mentions this; no incident or support pattern was cited. Does the user
   have an actual case driving this (an accidental invite, a no-show, an unwanted
   participant), or is this "would be nice to have the capability"? This materially
   changes whether it should jump ahead of the security/compliance follow-ups and
   expense delete already ahead of it in ROADMAP.md's sequencing.
2. **Invite-code rotation: in scope or not?** This is the central fork.
   - Rotate the code on removal → genuinely cuts off access, but boots every other
     current member holding that link too, and requires a way to re-share the new code
     with everyone who should still have it. Bigger feature.
   - Don't rotate → smaller, but the feature must be renamed/labeled honestly (not
     "remove access") and must disclose to the organizer that the removed person can
     still rejoin via the same link.
   Which does the user want, or is a "soft remove now, rotation as a fast-follow"
   two-phase approach acceptable?
3. **What happens to a removed member's past expenses?** Confirmed direction from both
   agents: keep them as-is, no reassignment or deletion, balances stay computed
   including their historical amounts. Confirm this is acceptable (the alternative —
   trying to "clean up" or anonymize their history — was not seriously proposed by
   either agent since it risks corrupting the ledger, but flagging it as a choice the
   user is implicitly making by not asking for it).
4. **Does the removed member retain any way to see their own final balance after
   losing access?** Working default from both agents: no — this is a named non-goal for
   v1, with the workaround being "ask the organizer directly." Confirm this is
   acceptable, or whether it needs to be solved now (which would add real
   access-control scope: some read-only view for a non-member).
5. **Is the removed member notified of removal?** Not resolved in the debate — the PM's
   first pass punted this as a nice-to-have; worth an explicit answer since silent
   removal could be seen as read as concealment, but a notification adds email/Resend
   scope.
6. **Should removal be blocked (or warned) if the removed member has an outstanding
   balance?** Both agents treat this as a nice-to-have guardrail, not a floor — confirm
   whether the user wants it in v1 or as a fast-follow.
7. **Can any non-organizer member remove others, ever?** Neither agent considered this
   in scope — the working assumption throughout is organizer-only, mirroring the
   placeholder-member precedent. Confirm this is correct and not, e.g., "any member can
   remove a placeholder-equivalent no-show."
8. **Should this be unified with a self-service "leave trip" flow, or built
   separately/later?** Both agents converged that "leave trip" is a simpler, lower-risk
   piece of the same underlying mechanic (cutting off a member's own access) and a
   reasonable candidate to ship first or alongside. Confirm whether the user wants both
   in this pass, "leave trip" only for now, or organizer-removal only.
9. **Any audit trail requirement?** Not raised by either agent independently — worth
   asking explicitly: does the organizer (or the removed member, if they later contact
   support) need any record of who removed whom and when, or is this fine as an
   un-logged, immediate action like the existing placeholder-removal precedent?

## Explicitly not resolved here (by design)

The exact RLS/schema shape for cutting off access (soft-delete flag vs. hard delete of
the `trip_members` row, and what that implies for `expenses.paid_by`'s foreign key and
existing RLS policies built on `is_trip_member`) is architecture-stage work once a
direction is picked. UI copy/flow for the removal confirmation, the "you no longer have
access" state, and any disclosure banner about the rejoin caveat are `ux-designer`
stage work. Whether/how "leave trip" and "organizer removes member" share
implementation is a `pm`/`architect` scoping call once the user answers question 8.
