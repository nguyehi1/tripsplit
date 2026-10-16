# Planning: Shared shopping list with per-item claiming (shopping-list)

Date: 2026-09-19
Stage: planning (pre-requirements) — convened `pm` and `product-strategist` per the
`/feature` pipeline's planning stage. Not a requirements doc; no scope here is final
until the user picks a direction below and `pm` formalizes it next.

Historical planning record: the shared shopping list has since shipped. The
discussion and open questions below explain its original scope; use the
[roadmap](../../ROADMAP.md) and current feature requirements for status and
behavior.

## Raw feature idea

> Shopping list for a trip: any group member can add an item to a shared list. Other
> members can claim/grab an item to take responsibility for it. When a member who has
> claimed items goes to add an expense, their claimed items appear as selectable
> options that can prefill the expense (e.g. description/amount), speeding up logging
> what they paid for.

## Strategic framing already settled (not re-opened here)

This was already discussed directly with the user. It originally looked like it
conflicted with the [product principles](../../ROADMAP.md#product-principles-and-scope)' outright rejection of
itemized/subset splits, but the user chose to revise the product direction rather than drop
the idea. The 2026-09-19 revision's "What changed since the 2026-09-15 draft" section
carves this exact pattern back into scope — a shared prep-list + opt-in claim + prefill
into the existing fast-entry flow, explicitly distinguished from the still-rejected
"itemize a bill that already happened" flow — while leaving the rejections of receipt
OCR, full per-bill itemization, payment rails, and multi-currency unchanged. The vision
doc holds the feature to one hard constraint, quoted directly because everything below
is tested against it:

> claiming an item must not become a new place the final number can be wrong or
> unclear, and skipping the shopping list entirely must remain a fully valid way to log
> an expense the old way.

The historical priority snapshot in the roadmap placed this feature after
expense delete and improvements prompted by real use. That ordering was a
recommendation, not a locked decision; the shared list has since shipped.

Whether the pattern belongs in v2 at all is closed. Everything below is the normal
scoping/tradeoff debate *within* that carve-out.

## PM's initial take (summary)

Full reasoning in the transcript; key points:

- **Data shape**: an item needs `trip_id`, `description` (free text), `added_by`
  (`trip_members.id`, per ADR 0004's identity convention), `claimed_by` (nullable
  `trip_members.id`, single claimant — no co-claim use case since equal-split already
  covers "we split this together"), and a status distinguishing open/claimed/logged.
  No amount field on the item.
- **Prefill scope**: description-only, payer defaults to claimer (which the add-expense
  flow already does for the submitting user). Explicitly *not* amount — an item has no
  real price until purchased, and inventing one at add-item time creates a second
  number that can disagree with the real expense, which is exactly the ambiguity the
  optional-list guardrail in the roadmap warns against.
- **Lifecycle**: once an item's claimer actually submits the resulting expense, the
  item should be marked logged and linked (`item.expense_id`), removed from the active
  claim/prefill list — otherwise it could be reused to prefill a second expense,
  implying a false 1:1 mapping.
- **Placeholder members** (ADR 0004: no session, can never be `expenses.paid_by`): PM's
  lean is claiming should be restricted to real, session-backed members only — a
  placeholder can't meaningfully "claim" since nobody would ever log the resulting
  expense on their behalf, and adding a "claim on behalf of" concept is new scope the
  product principles would flag. Explicitly flagged as a real product call, not decided
  unilaterally.
- **Existing gating this must integrate with**: simplified-onboarding's
  hide-until-verified rule for organizer mutations (this needs to be added to that
  enumerated list), trip-locked/completed state (same "no changes after settlement"
  pattern as placeholder members), and the add-expense sheet's existing three-branch
  gating logic (ADR 0008) as a real, non-trivial insertion point, not a blank page.
- **Sizing**: medium, closer to simplified-onboarding or add-placeholder-members than
  to a small feature like expense-date — new table, new RLS policies following the
  `is_trip_member`/`is_trip_open` pattern, new list UI, and a real touch to the
  add-expense sheet.
- **Open questions raised**: can a placeholder be claimed for; who can unclaim (only
  the claimer, or also the adder/organizer); what happens to a logged item if its
  linked expense is later edited/deleted (depends on the not-yet-built expense-delete
  feature); can an item be deleted outright pre-claim and by whom; is there any
  cross-trip "common items" template (PM assumed no); where does this live in the
  nav/IA; and the sequencing question itself.

## Product-strategist's initial take and debate (summary)

Full reasoning and full exchange in the transcript; key points:

- **Sequencing**: agreed with the September 2026 priority snapshot in the roadmap, and went further — argued the
  still-open items in ROADMAP.md's "In progress" section (invite-code-rpc-hardening not
  yet re-verified against a live deployment, `get_trip_summary` leaking the invite code,
  an open redirect in `check-email`, no privacy policy/ToS/data-export/retention story
  anywhere in the app) should also sit ahead of shopping-list — they're cheaper than a
  new feature and carry real trust/legal exposure, while shopping-list is a narrow,
  intermittent-use feature by comparison.
- **Two thesis risks it wanted explicitly resolved, not left implicit**: (a) claim races
  — two members claiming the same item near-simultaneously needs a DB-level
  unique-claimer constraint, or first-come-claim becomes exactly the kind of group
  negotiation the product principles reject; (b) whether prefill was meant to include amount —
  if yes, adding an item requires entering a price up front, relocating "filling out a
  form" to a new screen, working against the thesis's own test.
- **Proposed alternative**: ship the shared list + claim with no add-expense
  integration at all in v1, proving out whether claiming gets used before building the
  riskiest part (the insertion into the add-expense sheet). Explicitly flagged this cuts
  the "speeds up logging" half of the pitch and said it was a call for pm/the user, not
  something to decide unilaterally.
- **Hard v1 exclusion list proposed**: unclaim/reassign, item edit/delete after claim,
  multi-item-per-expense prefill, cost-splitting across claimers, claim notifications.

## Where they converged

After a relayed back-and-forth (the `pm` agent instance in this session has no
`SendMessage` tool, so the orchestrator relayed both directions), the two positions
converged on:

1. **Prefill is description-only, full stop — not just for v1.** An item has no real
   price until purchased; capturing one at add-time either invents a number that can
   disagree with the real expense (the exact ambiguity the optional-list guardrail
   in the roadmap warns about) or turns "add an item" into its own mini-form, tripping the
   thesis test at a new point. Payer defaults to the claimer, trivially, same as
   add-expense already does for the submitter.
2. **Integration scope: neither "full-fat" nor "zero" — a narrowed, bounded slice.**
   product-strategist's real objection was to the *open-ended* version of the
   integration (amount capture, multi-item prefill, split integration) — all of which
   are already excluded by point 1 and the exclusion list below, not to the concept of
   integration itself. It accepted pm's middle path: v1 ships one tap-to-fill chip in
   the add-expense sheet that sets the description field, and on successful submit
   marks the item logged and linked via `expense_id`. Per ADR 0008, the expensive part
   of that sheet (routing/interception across the intercepted and hard-nav-fallback
   call sites) is already solved; what this adds is one more piece of client state plus
   a query for "my claimed-unlogged items on this trip," surfaced at both existing call
   sites — bounded, not open-ended. A claim-only v1 with no tie back to logging was
   rejected by both: it would orphan the feature from the roadmap's stated
   rationale for the carve-out ("a claimed item can prefill a new expense"), needing its
   own different thesis justification the doc doesn't currently make.
3. **Security/compliance-and-expense-delete-first sequencing argument: agreed, not
   apples-to-oranges.** Both note the historical priority snapshot placed shopping-list fourth
   on its own terms; the open ROADMAP items reinforce rather than compete with that.
4. **V1 hard exclusion list, agreed**: unclaim/reassign, item edit/delete after claim
   (clarified: no *description edit* after claim — a never-claimed, added-by-mistake
   item can still be deleted by its adder pre-claim, since there's no linkage risk yet),
   multi-item-per-expense prefill, cost-splitting across claimers, claim notifications,
   and no cross-trip "common items" template.
5. **Unclaim permission**: pm's lean (only the claimer can unclaim, mirroring ADR
   0002's payer-only-edit pattern) went unchallenged in the debate — treated here as
   the recommended default for the requirements stage rather than an open question,
   since it follows established precedent directly.
6. **Placeholder members cannot claim.** pm's lean went unchallenged in the debate too,
   but unlike unclaim-permission this one is a product-scope call (does this feature
   extend to non-account members at all), not a direct precedent match — kept as an
   explicit open question below rather than silently defaulted.

## Recommended direction

Build a narrowly-scoped v1: a per-trip shared list (description + adder + single
first-come claimer, DB-constrained against claim races) that any verified real member
can add to and claim from, gated behind the same hide-until-verified and
trip-locked-state rules as the rest of the app's mutations. The only integration with
expense entry is one tap-to-fill chip in the existing add-expense sheet that prefills
description only (never amount, never split), and marks the item logged/linked on
successful submit. No unclaim/reassign, no post-claim description edits, no
multi-item prefill, no cost-splitting across claimers, no notifications, no templates,
in v1 — all named explicitly so a "just one more small thing" creep doesn't reopen the
open-endedness both agents converged on cutting.

## Open questions for the user

These are the genuine judgment calls neither agent could or should resolve — pick a
direction on each before `pm` formalizes requirements:

1. **Priority/sequencing.** The historical priority snapshot in the roadmap puts shopping-list
   third, after expense delete (still no delete UI despite the DB already allowing it —
   a live correctness gap) and after usage-driven friction fixes. Separately, ROADMAP.md
   shows still-open items from the 2026-09-17 security/compliance audit (invite-code
   RPC throttle not yet re-verified against a live deployment, `get_trip_summary`
   leaking the invite code, an open redirect in `check-email`, no privacy
   policy/ToS/data-export/retention story anywhere in the app). Both agents agree these
   are cheaper and carry more trust/legal exposure than a new feature. **Does
   shopping-list actually get prioritized now, or does one or more of those go first?**
2. **Can a placeholder member be "claimed for"?** Placeholders have no session and can
   never be `expenses.paid_by` (ADR 0004). Both agents' working default is no —
   claiming is restricted to real, session-backed members, so buying something for a
   placeholder just means a real member adds and claims the item themselves. This is a
   product-scope call about whether placeholders participate in trip-prep coordination
   at all, not just an implementation detail — confirm before it's locked into the data
   model (`claimed_by` referencing only non-placeholder `trip_members` rows would be a
   real constraint choice made early).
3. **What happens to a logged item if its linked expense is later edited or deleted?**
   This directly depends on the not-yet-built expense-delete feature (see question 1).
   pm's lean is the item should revert to claimed-unlogged (reclaimable) rather than
   keep a stale link, but this can't be fully settled until expense-delete's own shape
   exists — worth the user confirming whether shopping-list should explicitly wait on
   expense-delete shipping first, or be built now to tolerate its current absence and
   revisit this specific interaction later.

## Explicitly not resolved here (by design)

Nav/IA placement (new tab/section vs. a secondary panel off the add-expense sheet) is a
UX call, deferred to the `ux-designer` stage once a direction is picked. The exact
DB-level claim-race constraint and RLS policy shape are architecture-stage work,
following the `is_trip_member`/`is_trip_open` pattern already established (ADR 0002,
ADR 0004).
