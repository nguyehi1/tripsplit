# Starter lists — source brief (from user's guide + canvas)

Sources: Guide (Claude Docs) "Starter Lists: Product and Engineering Guide" https://claude.ai/code/artifact/6a808e77-eca8-4e1e-a9aa-433e60235ffe ;
Canvas "Starter lists exploration" https://claude.ai/artifact/VxMqpRyz8jrkFp2W9WVDve .
Local copies of the canvas boards (read-only reference, each shows light + dark side by side; **light is the left 390px phone**):
`/private/tmp/claude-501/-Users-hiennguyen-Desktop-10--TripSplit/6cb3ad5e-51e9-4fd5-abd3-cf930c184fa1/scratchpad/artifact-files/ea7aa24c-2d4e-4760-b06e-85df7faffcc7/project/*.dc.html`
(Main=A Home, NewTrip=B, ListSuggest=C, EmptyNone=D, EmptyOne=E, EmptyMany=F, AfterCopy=G, ShareList=H, AfterAddAll=I, ReceiveList=J, ReceivePick=K, HomeFirst=L)

## User scoping decisions
- **LIGHT MODE ONLY for now.** Dark-mode variants on the canvas are deferred (do not break dark, but don't build/verify new dark styling).
- Phase 1 per guide = screens A–G, I, L. Phase 2 (share/receive H, J, K) is out of scope.

## Summary
A new trip starts with a useful shopping list, not a blank one: three trip types, merged suggestions in the List tab, one-tap copy from a past trip.

In scope:
- Trip types on Create trip: Camping, Airbnb stay, International. Pick any, or none.
- Home shows the same three types as templates.
- "Suggested for this trip" section at top of List tab, visible to everyone on the trip.
- Copy a past trip's list into the current trip in one tap, with Undo.

Design principles: one decision per screen (picking a type is the whole choice; no separate "use starter list" switch); nothing added without a tap; do first, undo after; list stays a list (no new tabs, no saved templates).

## Flows
1. Start from a type (A,B,C,I): Home tile (or Blank trip) -> New trip with that type pre-checked; check more or none -> Create opens List tab with Suggested card; + per item, "Add all N" (I).
2. Copy a past trip (D,E,F,G): only while list is empty. 0 past trips: nothing offered (D). 1: single row (E). 2+: every past trip, newest first (F). Tap Copy adds all items, toast with Undo (G). No preview/checklist.
3. Shared link (H,J,K): phase 2.

## Behavior rules
- Types: camping, airbnb, international. Trip has 0+ types. None = valid, empty list. Type chosen on Home arrives pre-checked on New trip.
- Merging: multiple types combine into one list; same name (case-insensitive, trimmed) appears once; source line shows type e.g. "Suggested · Airbnb stay"; item in several types shows the first in pick order.
- Visibility: suggestions and everything added from them visible to all trip members. No private suggestions.
- Suggestions: on List tab above To get. + adds item and removes it from card. Add all N adds remaining in one action. When none remain card disappears, nothing replaces it. Never appear in Add an item flow.
- Copy past trip: only on empty list. One tap copies every item. Items already on list skipped; toast says how many. Undo removes exactly the items that tap added. Toast stays 8s. Only trips with items offered; current trip excluded; newest first.
- What copies: item names and notes only. Never who's buying, purchased state, prices, people.

## States / edge cases
- 0 past trips: copy section not rendered, no empty message. 1: one row, no heading change. 2+: all, newest first, no See all/limit.
- Long trip name: one-line ellipsis; subtitle (month year · N items) always visible.
- Past trip with no items: not listed.
- All copied items already present: toast "Copied 0 items · all already here", Undo hidden.
- Some duplicates: skipped silently, counted in toast ("3 already here").
- Undo after others edited: removes only that tap's items.
- No type checked: Create works, List opens empty with D/E/F options.
- All suggestions added: card disappears.
- Offline: suggestions from bundled catalog work offline. Copy needs connection; shows retry state.
- First run, no trips (L): tiles stay, Your trips shows "No trips yet" card.

## Engineering notes (proposals; product rules fixed, shapes adjustable)
- Trip: existing fields + `types` array (camping|airbnb|international).
- Template: static bundled catalog: type, items[{name,note}].
- List item: existing fields + addedBy, source (manual | suggestion:type | copy:tripId | shared), batchId.
- Suggestions computed client-side from trip types: union catalogs, dedupe by lowercase trimmed name, keep first source; "already added" = normalized name exists on list. Nothing stored per suggestion.
- Bulk add (Add all, Copy) = one request with items + generated batchId; server skips existing normalized names, returns added/skipped counts; Undo = delete by batchId (only that batch).
- Permissions: any trip member can add suggestions and copy. Copy source must be a trip the user belongs to.
- Analytics: template_tile_tapped{type, from: home|empty_list}; trip_created{types[], name_length}; suggestion_added{type, mode: single|all, count}; copy_started{source_trip_id, past_trip_count}; copy_completed{added, skipped}; copy_undone{batch_id}. (list_shared, shared_link_opened, shared_list_received = phase 2.)
- Success measure (proposed): share of new trips whose first list has >=5 items within a day of creation.

## Design (light tokens)
bg #f5f0e6; text #231c12; accent oklch(0.45 0.09 80); card #fff + soft shadow; divider dark ink @8%; primary button/FAB/toast #231c12; Undo text on toast oklch(0.86 0.12 84). Background carries paw-print pattern + soft glow gradients (match existing app).
Type: Bricolage Grotesque titles (28–36px, 600); Instrument Sans body (15px item names, 12–13px meta, 10.5px uppercase labels).
Components: Card 22px radius/16px pad; template tile 20px radius, 128px tall (Home) / 88px (empty list); type tile = checkbox tile multi-select with accent tint when checked (not color alone); checklist circle 24px; primary pill 56px; secondary 52px; small pill (Copy/Add/Add all) 32–36px; toast 18px radius dark, 86px above bottom above FAB; header icons 40px (settle up, people, share).
Strings: Home "Start from a template · Blank trip · Your trips"; New trip "What kind of trip? · Pick any, or none · Your list will open with suggestions for an Airbnb stay and international travel, combined with no repeats."; List "Suggested for this trip · Add all 7 · To get · tap a circle to grab it"; Empty "Nothing on the list yet · Add items one by one, or start from a template. · Or copy a past trip"; Toast "Copied 18 items · from Big Sur Camping · 3 already here · Undo"; First run "No trips yet".
A11y: tap targets >=40px, toast actions 44px; type tiles are labelled checkbox group; icon buttons aria-labelled (Back, Close, Settle up, People, Share list); toast aria-live polite; contrast holds; not color alone for checked state.

## Open questions (from guide)
1. Who curates the catalog / how often? Launch counts 18/15/12 are placeholders (actual catalog content isn't specified).
2. Source label when item in several types: first picked.
3. Share link expiry/revoke (phase 2).
4. Should Add all be undoable? Design shows Undo toast (I).
5. Offline / invalid-link / 0-item-copy behaviors are proposals.
6. Success measure proposed, not agreed.
7. Number of past trips at which copy gets search.

## Acceptance criteria (guide)
- Home shows three template tiles; tap opens New trip with that type checked.
- New trip: check any number of types incl. none; no invite row.
- New trip opens with merged, deduped suggestions at top of List, visible to every member.
- + adds one; Add all N adds remainder; card disappears when empty.
- Empty list: copy section for 1 past trip (one row), 2+ (all, newest first), nothing for 0.
- Long names truncate to one line; subtitle stays visible.
- Copy adds all in one tap, skips duplicates, toast with counts, Undo removes only that batch.
- Copy never carries people, money or purchased state.
- List header shows settle up, people, share icons with aria-labels. (Share icon links to phase-2 screen; decide what it does in phase 1.)
- Every screen matches canvas (LIGHT for now) incl. paw-print background.
- All analytics events emitted with listed properties.
