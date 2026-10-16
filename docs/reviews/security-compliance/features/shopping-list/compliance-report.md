# Compliance report: Shared shopping list with per-item claiming (shopping-list)

Reviewer: compliance stage, `/feature` pipeline. Reviewed against
`requirements.md` (including the 2026-09-29 superseding note on decision 2),
`architecture.md`, `design.md`, `supabase/migrations/0015_shopping_list.sql`,
`docs/adr/0013-shopping-list-claim-release-trigger-on-member-removal.md`,
`src/lib/data/shopping-list.ts`, `shopping-list-tab.tsx`,
`add-item-sheet-content.tsx`, the shopping-list additions to
`add-expense-sheet-content.tsx`, and the new read-only branch in
`expense/[expenseId]/edit/page.tsx`. QA has already passed; this is a
compliance-specific pass, not a re-check of functional correctness.

I am not a substitute for Splitiful's own legal counsel. Nothing below is a
legal conclusion — items marked "needs legal sign-off" are ambiguous enough
that only counsel should close them.

## Summary

No blocking findings. This feature is additive, reuses existing
authorization/retention patterns exactly, and does not introduce a new
category of personal data, a new third-party processor, or a consumer-facing
claim that isn't true. It also does not make the app's pre-existing gaps
(no privacy policy/ToS, no data-export flow) meaningfully worse — those
remain exactly as open as they were before this feature, tracked separately
on the ROADMAP.

Two non-blocking observations below are worth a quick look but are not
reasons to hold the release.

## 1. Financial recordkeeping — no new inconsistency introduced

- Item descriptions carry no amount/price at any stage (enforced by schema:
  no price column exists on `shopping_list_items`, confirmed in
  `0015_shopping_list.sql`), so this feature cannot itself cause a
  wrong-balance dispute — settlement math is untouched.
- The audit trail from a "Bought" item back to the expense it produced is
  coherent: `expense_id` is set atomically with the expense insert inside
  `add_expense_and_log_shopping_items` (single function body/transaction —
  either both the expense row and the item's `logged` status land, or
  neither does; confirmed in the RPC body). There's no code path in this
  feature that can create a "logged" item whose `expense_id` doesn't point
  at a real, contemporaneously-created expense.
- `expense_id` deliberately has no `on delete` action (blocks rather than
  cascades/nulls), which is the correct call for recordkeeping integrity:
  it forces the not-yet-built expense-delete feature to explicitly
  reconcile this table rather than silently leaving a `logged` item
  pointing at a description-composition source that no longer exists. This
  is already documented as an accepted, tracked limitation in
  `architecture.md` and `ARCHITECTURE.md`'s `expenses` RLS section — I
  re-verified it's accurately described, not just asserted. No new
  ledger-inconsistency path beyond that documented one.
- The one edge case worth naming explicitly (already flagged in ADR 0013,
  and I agree with its own risk classification): if a member who claimed
  an item is later removed from the trip *after* that item became
  `logged`, `claimed_by` nulls out but the expense and its amount are
  completely unaffected — only the shopping-list item's "who claimed this"
  attribution is lost, which mirrors the already-accepted "ghost payer"
  tolerance (ADR 0012) for the same general class of problem. This does
  not affect any user's actual balance or the dispute-relevant `expenses`
  row itself, so it's not a recordkeeping integrity issue, just a
  secondary-metadata gap the team has already chosen to accept.

**Verdict**: no new recordkeeping risk. Advisory only, matches existing
accepted limitations.

## 2. Data minimization / PII in free text — no new exposure

- Item `description` is free text, same category and same trip-scoped
  visibility as the pre-existing `expenses.description` field — no new PII
  category is introduced by allowing users to type things like "the dark
  one" or, hypothetically, something more personal into this field. This is
  an existing, accepted risk class for the app (user-generated free text),
  not a new one.
- `claimed_by`/`added_by` surface a member's display name and avatar to
  other trip members. I checked whether this exposes anything beyond what's
  already visible: it does not. `trip-tabs.tsx`'s existing Expenses tab
  already shows every expense's payer name, avatar, amount, and description
  to every verified/owner trip member (confirmed by reading the render
  code — `expense.payer.displayName`/`avatar`/`amountCents`/`description`
  are all rendered in the plain list, not gated to the payer). The new
  "claimed by," "added by," and "Bought by {name}" surfaces in the
  shopping-list feature expose the identical kind of information (a trip
  member's name/avatar tied to an item or an expense) to the identical
  audience (verified/owner trip members via `is_owner_or_verified_member`,
  the same RLS predicate `expenses`/`trip_members` already use). No new
  disclosure boundary is crossed.
- The new read-only Bought tap-through (`edit/page.tsx`'s new render
  branch) opens the linked expense's amount/description/date/payer name to
  a non-payer verified member for the first time via that specific route —
  but every one of those fields was already visible to that same member in
  the Expenses tab list (confirmed above), just not previously reachable
  via a detail-page URL. This is exposing a previously-unreachable *view*
  of already-visible data, not new data. No RLS change was needed or made
  to support it (confirmed in `architecture.md` and `ARCHITECTURE.md`).
- Placeholder members (no account, no session) are structurally excluded
  from ever being `claimed_by`/`added_by` (derived from
  `trip_members.user_id = auth.uid()`, and a placeholder's `user_id` is
  always null) — consistent with the same proof-by-construction already
  used for `expenses.paid_by`. Confirmed in both the RLS insert policy and
  both RPCs.

**Verdict**: no new personal-data category, no new disclosure audience,
no special-category data. Not blocking.

## 3. Third-party processors — none

No new vendor, service, or data flow to a third party is introduced by this
feature. Everything is Supabase (already-disclosed processor for this app)
and client-side state. No action needed here.

## 4. Data subject rights — status quo, not worsened

The app currently has **no account-deletion or data-export flow at all**
(pre-existing gap, tracked on the ROADMAP and in
`docs/reviews/security-compliance/project/security-review-2026-09-17-followup.md`; not something this feature
is required to fix, per this session's explicit scoping). This feature adds
one more place personal data lives (`shopping_list_items.description`,
`added_by`, `claimed_by`), which — like every other table in this app today
— has no export/deletion tooling pointed at it specifically, because no
such tooling exists for *any* table yet.

I checked whether this feature makes that gap meaningfully worse, and it
does not:
- `shopping_list_items.trip_id` references `trips(id) on delete cascade`,
  the identical pattern already used by `trip_members` and `expenses`
  (confirmed in `0001_init.sql` and `0015_shopping_list.sql`). If/when a
  trip-deletion or account-deletion feature is ever built, shopping-list
  data will be swept up by the same cascade that already handles
  `trip_members`/`expenses` — no separate reconciliation step will be
  needed for this table specifically, unlike, say, `expense_id` (see §1).
- Member removal (`remove_trip_member`/`leave_trip`) already correctly
  detaches a removed member's shopping-list involvement (ADR 0013's
  trigger), consistent with how removal already detaches their role
  elsewhere in the schema.

**Verdict**: this feature is exactly as covered (or uncovered) by data
subject rights tooling as the rest of the app already is — a pre-existing,
tracked gap, not a new or worsened one. **Needs legal sign-off** only in
the same sense the whole app already does (the absence of a privacy
policy/ToS/export flow is an existing open item, not something introduced
here) — no additional legal exposure is created specifically by this
feature.

## 5. Retention — follows existing precedent, no new policy needed

No retention/deletion policy exists for any table in this app today (no
scheduled deletion, no user-initiated purge). This feature doesn't
introduce a case where that matters differently than it already does for
`expenses`/`trip_members`: shopping-list data lives and dies with its trip
via the same `on delete cascade` as everything else. Not blocking; no new
retention policy is warranted specifically for this feature per the
existing house style (follow precedent, don't invent a bespoke policy for
one feature).

## 6. Consumer-facing claims — checked against design.md and the rendered copy

I compared `design.md`'s copy table (§10) against the actual strings
rendered in `shopping-list-tab.tsx` and `add-item-sheet-content.tsx`.

- No copy anywhere implies real-time push/email notifications for
  claim/unclaim/add/delete — confirmed no notification-implying language
  exists in the rendered strings (`"{Name}'s got this"`,
  `"Too slow — {name} already grabbed that."`, etc. all describe
  same-session/on-load state, not a push notification), consistent with
  design.md's explicit non-goal ("no claim/unclaim notifications").
- No copy anywhere asserts encryption, "private," "secure," or "never
  shared" language (grepped the new files — zero matches). Nothing here
  needs to be walked back.
- The "Add an item" sheet renders **`"everyone sees them"`**
  (`add-item-sheet-content.tsx` line 154) as a hint under the sheet's
  title. This exact string is **not** in `design.md`'s §10 copy reference
  table — it appears to have been added during implementation without a
  corresponding design-doc update. I checked it against actual behavior:
  it's accurate (every added item is visible to every verified/owner trip
  member via the `select` RLS policy — no per-item privacy option exists,
  matching requirements.md's explicit "no per-item privacy/visibility
  option" acceptance criterion). **Non-blocking observation**: the claim
  itself is true, but flag this as copy drift from design.md for the
  ux-designer/docs step to reconcile, since an un-reviewed string that
  happens to be accurate today is exactly the kind of thing that goes
  stale unnoticed later. Not a legal exposure as written.
- All error/locked/empty-state copy matches design.md's table verbatim
  where I checked it against the rendered JSX (locked-trip copy, delete
  confirmation, race-lost message, etc.).

**Verdict**: no false or unsubstantiated consumer-facing claim. One minor,
non-blocking documentation-drift item (the "everyone sees them" string).

## 7. Other items in standard review scope

- **Claim-race / single-claimer guarantee**: enforced at the DB layer via
  a conditional `UPDATE ... WHERE status = 'open'` row lock, not just the
  UI (confirmed by reading the RPC and its comments). This matters for
  recordkeeping-adjacent trust: the optional-list guardrail in the roadmap's product principles
  ("claiming must never become a new place the settlement number can be
  wrong or unclear") is satisfied at the layer that actually matters.
- **Unclaim permission model** (requirements.md's superseded decision 2):
  confirmed the implementation matches the corrected, claimer-only rule,
  not the original "any member can unclaim" text — the RPC's `WHERE
  claimed_by = _member_id` predicate is present and `_member_id` is
  server-derived from `auth.uid()`, never client-supplied. No compliance
  concern here; flagging only that I verified the code matches the
  *current* (post-supersession) requirement, not the stale text still
  visible higher in requirements.md's decision-2 history.
- **Stray duplicate docs**: `docs/features/shopping-list/` contains
  `*.2.md`-style duplicates of every input doc (`planning 2.md`,
  `requirements 2.md`, `design-reference 2.md`, `design 2.md`,
  `architecture 2.md`) alongside the canonical files. Not a compliance
  issue on its own, but worth a cleanup pass so a future reviewer doesn't
  cite the wrong copy of a decision (e.g. an uncorrected duplicate of
  requirements.md that still shows the original, superseded "any member
  can unclaim" text as if it were current). Advisory, not blocking.

## Blocking vs. advisory — final split

**Blocking**: none.

**Advisory (non-blocking, best-practice/hygiene)**:
1. Reconcile `add-item-sheet-content.tsx`'s `"everyone sees them"` string
   into `design.md`'s §10 copy table (it's accurate, just undocumented).
2. Clean up or clearly mark the duplicate `* 2.md` files in
   `docs/features/shopping-list/` so a future reader doesn't reference a
   stale/superseded version of a decision.

**Needs legal sign-off (pre-existing, not created or worsened by this
feature)**: the app's overall lack of a privacy policy, ToS, and data
export/account-deletion flow remains open — this feature doesn't touch or
resolve it, and per this session's explicit sequencing decision was not
expected to. Counsel should weigh in on that gap at the app level whenever
it's prioritized; nothing in shopping-list changes its urgency one way or
the other.
