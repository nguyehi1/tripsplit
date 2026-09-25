# v2 Vision — Simplicity Is the Feature

Date: 2026-09-19 (revises the 2026-09-15 draft — see "What changed since the 2026-09-15 draft";
that draft itself revised 2026-09-14 — see "What changed from the last draft")

Companion to [docs/market-research.md](./market-research.md) (competitive landscape, 2026-09-09)
and [docs/ROADMAP.md](./ROADMAP.md) (feature-by-feature tracking). This doc answers: "what's the
one thing v2 is *for*."

## The thesis

Splitiful's vision is to make it effortless to jot down who paid
for what — and at the end, produce one number per person that everyone trusts without having to
think about it.** That's it. Two moments, both fast, both simple:

1. **Log an expense** — a few taps, done, back to the trip.
2. **See the final split** — open the app once at the end, get a clear answer, close the app.

Every feature request should be tested against this: does it make either of those two moments
*faster or clearer*, or does it add a decision, a setting, a screen, or a concept the user now
has to hold in their head? If it's the latter, it's accounting-tool creep, not Splitiful.

## What changed from the last draft

The 2026-09-14 version of this doc proposed a "kill the form" bet: camera-first receipt OCR,
itemized/subset splits, and a real payment-rail integration so trips "settle themselves." That
was a reasonable read of the competitive landscape (see market-research.md), but it optimizes for
matching where the category is heading, not for what this product is supposed to be. OCR
pipelines, itemization UI, and payment-rail integration are exactly the kind of surface area that
turns a simple expense tracker into a small accounting system — more settings, more failure
states, more things that can be subtly wrong. That's the opposite of the goal. This draft
replaces that thesis; treat the earlier "camera is the ledger" framing as superseded.

## What changed since the 2026-09-15 draft (2026-09-19)

The 9/15 draft rejected itemized/subset splits outright: turning "who paid" into "who had which
line item" was judged pure mental-load increase for the group. Revisiting that for one specific,
narrower case: a shared shopping list, where anyone in the group can add an item, members claim
the items they're personally taking responsibility for, and a claimed item can prefill a new
expense when its claimer logs it. This isn't the rejected flow of itemizing one bill *after the
fact* across people who didn't ask to be itemized — it's closer to a lightweight prep/checklist
step that feeds the existing fast-entry expense flow, with claiming as an opt-in convenience
rather than a group negotiation over a bill that already happened. The receipt-OCR, full per-bill
itemization, payment-rail integration, and multi-currency rejections below all stand unchanged —
only the shopping-list/claim pattern is back in scope, and it's still held to the core thesis:
claiming an item must not become a new place the final number can be wrong or unclear, and
skipping the shopping list entirely must remain a fully valid way to log an expense the old way.

## What "simple" means, concretely

- **Adding an expense should never feel like filling out a form.** Amount, who paid, done —
  equal split is the default and, for most trips, the *only* split anyone needs. Every field
  beyond that is a tax on the one moment that happens most often.
- **The final answer should never require interpretation.** "Alex owes Sam $42" — not a ledger,
  not a table you have to read closely, not multiple currencies to convert in your head.
- **No feature should introduce a decision the group has to make together.** ("Should we itemize
  this bill?" "Which payment app should we link?") Every decision like that is friction that
  works against the core loop, even if the feature itself is well-built.
- **Correctness over cleverness.** A trustworthy total beats a smart one. Anything that adds a
  parsing step, an AI guess, or an external integration between "expense happened" and "total is
  right" is a new place for the number to be wrong.

## What this means for the existing backlog

Re-reading docs/ROADMAP.md and the README's deferred list against this thesis:

**Real gaps worth closing (fix the core loop, don't expand it):**
- **Expense delete.** There's still no delete UI even though the DB policy already allows any
  member to delete any expense — a mistake typed in stays in forever right now. This is squarely
  in scope: it's about keeping the final number trustworthy, which is the whole point.
- Small correctness/clarity polish on the two moments above (fast entry, clear settle-up) as real
  usage surfaces friction — not new concepts, just removing rough edges from what already exists.

**Reconsidered for v2 (2026-09-19):**
- **Shared shopping list with per-item claiming.** Anyone in the group can add an item; members
  claim the items they're taking responsibility for; a claimed item can prefill a new expense when
  its claimer logs it. Carve-out from the itemization rejection below — see "What changed since
  the 2026-09-15 draft." Still needs to pass the core thesis test during requirements/architecture:
  claiming stays optional, and it never makes the final number ambiguous.

**Explicitly not v2 — say no:**
- **Receipt photo capture + OCR parsing.** The `receipts` bucket and `receipt_photo_url` column
  exist unused in the schema; leave them unused. Parsing a receipt correctly, handling parsing
  failures, and building a confirmation UI around "did we read this right?" is real accounting-app
  scope, not a shortcut.
- **Full per-bill itemization.** Splitting one already-incurred bill's line items across payers
  after the fact still turns "who paid" into "who had which line item" for people who didn't ask
  to be itemized — a genuine mental-load increase the thesis says no to. The shopping-list carve-out
  above is different: claiming happens before the expense exists, by choice, not as a negotiation
  over a bill someone already paid.
- **Payment-rail integration (Venmo/PayPal/etc.).** Showing "who owes whom" is the job; moving
  the money is a different job with its own compliance, reliability, and support surface. A
  deep-link "open Venmo with this amount prefilled" is a fine, cheap nicety if it ever comes up,
  but it's not a v2 pillar to build toward.
- **Multi-currency.** Real gap for cross-border trips, but converting currencies correctly (rates,
  rounding, display) is exactly the kind of "now you have to think about it" complexity this
  vision avoids. Can wait indefinitely without hurting the core pitch.
- **Spending analytics/charts, AI categorization, social feed.** All of these make Splitiful more
  like Splitwise or Venmo. None of them make logging an expense faster or the final split
  clearer — they're the accounting-tool and social-app instincts this vision explicitly rejects.

## Recommended sequencing

1. **The still-open security/compliance items from the 2026-09-17 audit** (see
   `docs/ROADMAP.md`'s "In progress" section: invite-code RPC throttle not yet re-verified
   against a live deployment, `get_trip_summary` leaking the invite code, an open redirect in
   `check-email`, no privacy policy/ToS/data-export/retention story anywhere in the app). Cheaper
   than a new feature and carry real trust/legal exposure — confirmed 2026-09-19 to go ahead of
   shopping-list.
2. **Expense delete.** Small, closes a real correctness gap, no new concepts introduced.
3. **Whatever friction real usage surfaces on the two core moments** (fast entry, clear
   settle-up) — evaluated case by case against the test above, not pre-planned as a roadmap of
   big features.
4. **Shopping list with per-item claiming**, scoped per the 2026-09-19 carve-out above. On hold
   behind 1-3 (confirmed 2026-09-19) — not being built yet. Its v1 shape is already settled in
   [docs/features/shopping-list/planning.md](features/shopping-list/planning.md): real
   session-backed members only can claim (no claiming on behalf of placeholder members), prefill
   is description-only via a single tap-to-fill chip in the add-expense sheet (never amount,
   never split), and a logged item's behavior if its linked expense is later edited/deleted is
   deferred until expense-delete itself ships. When this is picked back up, start from that doc
   instead of re-scoping from scratch — only the requirements/architecture/build stages remain.

There is no "big bet" in this version of the vision on purpose. The bet is that staying simple
*is* the differentiation — every competitor is adding surface area, and the gap that opens up is
for the product that stays out of the user's way.
