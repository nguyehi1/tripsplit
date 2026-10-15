# Planning: Starter lists (starter-list-exploration)

Date: 2026-10-13
Stage: planning (pre-requirements). Convened `pm` and `product-strategist`. This is not a requirements doc. No scope here is final until the user picks a direction below.

Constraints from the user: LIGHT MODE ONLY (dark deferred). Phase 1 = screens A-G, I, L. Phase 2 (share/receive H, J, K) is out of scope. Source brief: [brief.md](brief.md).

## Raw idea

A new trip starts with a useful list, not a blank one. There are three trip types (Camping, Airbnb stay, International), merged suggestions at the top of the List tab, and one-tap copy of a past trip's list with Undo. The Home screen shows the same three types as template tiles.

## Orientation: what the repo already says

- [v2-vision.md](../../v2-vision.md) does not mention templates or starter lists. Its test is whether a feature makes "log an expense" or "see the final split" faster or clearer, or adds a decision, screen or concept. Starter lists do neither of the first two. They improve the start of the side feature (the shopping list). Trip types add a decision on Create trip.
- [shopping-list/planning.md](../shopping-list/planning.md) and the ROADMAP entry list "a cross-trip 'common items' template" as an explicit non-goal. Copy-past-trip, and to a lesser degree trip-type catalogs, reverse that. The user should reverse it consciously.
- ROADMAP: the shopping list is shipped. Still open are counsel review (email-invites, self-serve delete), the performance measurement follow-up, and expense delete (unscoped). The vision's sequencing puts those ahead of list work. The dark-mode shopping-list variant is already a deferred follow-up, so light-only is consistent.
- Compliance and security baselines: no hard stop is triggered (no outbound message, no new vendor, no special-category data). Three baseline rules do bite. Analytics must be event-name only. Any new bulk write path or cross-trip read needs the abuse case designed at requirements time. Migrations must be safe with old code on the new schema and new code on the old schema. See conflicts 7 and 8 below.

## Conflicts between the brief and the current codebase

Verified against the code.

1. **List item schema.** `shopping_list_items` (migration 0015) has `description`, `added_by` (a `trip_members.id`), `claimed_by`, `status` and `expense_id`. It has no `note`, `source` or `batch_id`. The brief's "names and notes", `source` and `batchId` all need a new migration. The table has no UPDATE grant, and INSERT RLS requires a verified member, an open trip and `status='open'`.
2. **Undo vs RLS and claims.** The DELETE policy is adder-only and only for `status='open'` items. "Undo removes exactly the items that tap added" would silently leave behind any item another member claimed in the meantime. The behavior needs an explicit rule. "Skip existing normalized names, return added/skipped counts" is server logic, so it needs a new security-definer RPC, not the existing plain insert.
3. **The OTP gate (the biggest conflict).** A just-created trip's organizer is an anonymous, unverified session. Every List mutation goes through `gateOrRedirect` / `requireVerifiedSession` and redirects to email verification (ADR 0006, simplified-onboarding). The brief's flow of Create, then List opens, then tap "+" hits the gate on the very first tap for every new organizer. That undercuts "do first, undo after" and "nothing added without a tap".
4. **Trips have no `types`.** `create_trip` takes only name, display name, location and dates. A `types` array needs a migration and a changed RPC signature, which is the non-atomic-deploy case in the security baseline.
5. **There is no single "Home".** `/` is the welcome page (Create your first trip / invite link / sign in) and `/trips` is the dashboard (Ongoing/Completed, empty state "You're not on any trips yet"). Canvas A (tiles, Blank trip, Your trips) and L ("No trips yet" card) merge two screens that are separate today. Any placement of the tiles is a decision.
6. **Header icons.** The trip header has Back, Trip roster (people) and Settle up, and shows them only when verified. No Share icon exists, and the share target is phase 2. The brief's acceptance criterion lists three header icons including Share.
7. **Analytics.** `trackEvent(name)` takes an event name only. [ANALYTICS.md](../../ANALYTICS.md) and the compliance baseline forbid properties such as trip IDs or free text. The brief's events carry `source_trip_id`, `batch_id` and `name_length`. Types and counts are generic, but the IDs are not allowed. The proposed success measure ("first list has >=5 items within a day") is not computable from Vercel events at all. It needs a DB query.
8. **Fields that already match.** New trip already has no invite row (name, location, dates only), so that criterion is already met. The add-item sheet is a separate intercepted route, so keeping suggestions out of it is easy. "Bundled catalog works offline" is only partly true, because the app is not a PWA and the page itself needs a network.
9. **Other.** The working tree has uncommitted edits to `src/app/trip/[id]/page.tsx` and a new migration 0021. Any engineering work must be sequenced around them. Copy carries other members' free-text item names between trips. AGENTS.md requires reading `node_modules/next/dist/docs/` before any Next.js code, which is a note for the later stages and not done at planning.

## PM's initial take

Split phase 1 into two slices.

- **Slice 1 (suggestions from trip type; screens B, C, I and Home tiles).** Add `trips.types`, a bundled static name-only catalog, a client-side merged and deduped Suggested card above "To get", "+" and "Add all N" through a plain bulk insert, and a simple delete-the-just-inserted Undo. No `source` column. The label comes from the client catalog. Put the tiles on `/`, which also covers L. Do not build a new combined Home.
- **Slice 2 (copy past trip; screens D, E, F, G).** This needs a new migration and RPCs: `batch_id`, server-side skip-duplicates with counts, an Undo RPC that deletes only open, unclaimed items, and a membership check on the source trip. Slice 2 holds nearly all of the risk.
- Defaults the PM would apply without asking: tiles on `/` and Your trips on `/trips`; no Share icon in phase 1; Suggested card placed above "To get"; no notes or `source` column.
- Sizing: slice 1 is medium. Slice 2 is medium-large. The whole phase is about 2-3 times a typical List-tab feature.
- Top risks: the OTP gate, Undo racing with claims on a new write path, the analytics conflict, unowned catalog content (18/15/12 are placeholders), mandatory security and compliance review, and fidelity to the canvas in light mode only.

## Product-strategist's recommendation

**Ship smaller, and after the open trust items. Do not build the full phase 1.**

- Thesis test: the feature does not speed up either core moment. Trip types add a concept and a decision to Create trip.
- Value is real but narrow: once per trip, for the organizer, only if lists are used at all. There is no evidence that a blank list is why lists go unused.
- Opportunity cost: the vision puts counsel review, expense delete and the performance baseline ahead of list work. This adds a migration, a bulk write with undo, UI on three surfaces and a catalog someone must curate.
- Preferred alternatives, in order:
  1. Copy past trip only. It reuses the user's own content, so there is no catalog and no trip-type decision.
  2. One generic static "common items" card with Add all and no types.
  3. Both together, with no types and no Home tiles.
- Cut from phase 1: trip types on Create, Home tiles, "Suggested · Airbnb stay" source labels, analytics properties, the Share icon, and a separate undoable Add all.
- Risks: the success measure is untestable under the baseline, and "items per list" measures catalog size, not value. A better outcome measure would be the share of new trips with at least one claimed or logged-from-list expense. The OTP gate lands on the main target user. The catalog is an ongoing editorial job. Copy leaks content across trips. Templates set a precedent for saved templates and sharing.

## Where they agree

- Ship in two slices, with copy-past-trip separate from suggestions.
- No Share icon in phase 1.
- No item notes and no `source` column in phase 1. The label comes from the client catalog, or is dropped.
- Minimal schema: `types` (if types stay) and `batch_id` (for copy).
- Analytics stay event-name only. The brief's properties cannot ship as written. Use separate event names if a dimension is needed.
- Tiles on `/` and Your trips on `/trips`. Do not merge them into one Home.
- Nothing may loosen anonymous write access without a security sign-off.
- The OTP gate must be resolved before design. Both now accept the gate if it fires once, on the first add, with copy explaining why, and the Suggested card stays visible beforehand. This depends on verifying that the verified session persists afterward.
- The reversal of the "no templates" non-goal is a user decision.
- Copy is the risky slice and is reasonably gated behind security and compliance review and the open roadmap items.

## Where they disagree

| Point | PM | Strategist |
|---|---|---|
| Trip types on Create | Keep. Cheapest piece (one column and a static catalog), and it is the "one decision" idea. | Cut. A new decision before the first expense, plus merge rules. Prefers one generic static card. |
| Home tiles | Drop them in slice 1 (after the exchange). | Cut. A second entry point on the most-seen screen. |
| Which slice first | Slice 1 (types and suggestions). New users have no past trips, so copy misses the target audience. | Copy first. It adds no Create/Home concept and reuses the user's content. If the user wants no RPCs, ship the generic card. |
| Sequencing vs open work | Slice 1 can go ahead. Slice 2 should wait for counsel and expense delete. | Whole feature after counsel review and expense delete. |
| Add-all Undo | Drop it (plain delete of just-inserted items, or none). | Keep Undo only on Copy. |

## Recommended direction

Treat the full phase 1 as too large for the thesis. Recommend this order, subject to the user's answers below:

1. **Resolve the OTP-gate behavior first.** Default: accept the gate once, on the first add, with copy that explains why. The card is visible before verification, and verifying once covers Add all and any later adds.
2. **Slice 1, trimmed.** A bundled static catalog and a Suggested card at the top of the List tab. Trip types on Create trip are kept only if the user wants the "pick a type" decision. Otherwise, use the strategist's generic card. Tiles live on `/`. No Share icon, no notes and no `source` column. Name-only analytics. Add-all uses the existing plain multi-row insert, which is already atomic, so no new RPC is needed, with a simple Undo or none.
3. **Slice 2 (copy past trip).** Only after the user decides on sequencing and security and compliance review. It needs its own bulk RPC, `batch_id` and an explicit Undo-vs-claimed rule.

## Open questions for the user

1. **Reverse the shopping-list "no templates" non-goal?** Starter lists and copy-past-trip contradict it. Reverse it knowingly, or stop here.
2. **Sequencing.** Does this go ahead of counsel review, expense delete and the performance baseline (the vision's order puts it after)? If it goes ahead, is it all of it, or only the no-RPC part?
3. **Which first, or is it both?** Options: suggestions with trip types; a generic static suggestions card with no types; copy-past-trip only; or slice 1 then slice 2 as the PM proposes.
4. **Keep trip types on Create trip?** This is the strategist's main objection (a new decision on the critical path). It is also the brief's core idea.
5. **OTP gate.** Accept a single verification on the first add (default), or explicitly allow anonymous organizers to add suggestions to their own new trip? The second option needs a security-baseline decision on loosening RLS. Or show a read-only card until verified?
6. **Home tiles.** Put them on the welcome page `/`, on `/trips`, or drop them? Canvas A and L are one screen but the app has two.
7. **Share icon in phase 1.** Default is to omit it. Confirm that "header shows settle up, people, share" is waived for phase 1.
8. **Add all Undo.** The brief's open question 4. Keep a toast, or only on Copy?
9. **Analytics.** Approve name-only events (and give up properties), or amend the baseline. The success measure is a DB query either way. Do you want the strategist's alternative outcome measure (new trips with at least one claimed or logged-from-list expense)?
10. **Item notes.** Skip them (default, no schema change), or add a `note` column and a note field to the add-item sheet?
11. **Catalog ownership.** Who writes and maintains the camping, Airbnb and international lists? The 18/15/12 counts are placeholders. Is the launch content part of this work or a separate task?
12. **Undo vs claims.** If someone claims a just-copied item before Undo, should Undo skip it (default), or should the claim block the Undo?
13. **Uncommitted work.** The working tree has uncommitted edits to the trip page and a new migration 0021. Land or park them before engineering starts?

Not decided here: layout, copy and token details (the ux-designer follows the canvas, light only), RLS and RPC shape (architect), and requirements (pm, after approval).
