# Requirements: Starter lists, version 0.8.0 (starter-list-exploration)

Scope: this doc covers **0.8.0 only**. Sources: [brief.md](brief.md), [planning.md](planning.md), [breakdown.md](breakdown.md) items #1, #2, #5, #6 and the 0.8.0 part of #7. Light mode only. Review constraints folded in: [compliance-constraints.md](../../reviews/security-compliance/features/starter-list-exploration/compliance-constraints.md) (cited as Comp C# for the first pass, Comp O# for the "Other" re-review and Comp C-R3-# for Revision 3) and [security-constraints.md](../../reviews/security-compliance/features/starter-list-exploration/security-constraints.md) (cited as Sec C#, Sec D# for the first pass, Sec O# for the "Other" re-review and Sec R# for Revision 3).

**Revision 1 (Checkpoint 2, 2026-10-13):** the user added an "Other" trip type with typed-in text, stored on the trip.

**Revision 2 (re-review of "Other", 2026-10-13):** the compliance and security re-review ran on "Other" with **no stops**. Its constraints are folded in as criteria 54-73 (existing numbers unchanged; amended criteria say so). Notable changes: the stored text now has a narrow stated purpose; `/privacy` must be updated (non-negotiable); the text is readable by every trip member through the API, not "shown to nobody" (accepted, described accurately below); three existing `select("*")` reads on `trips` must be replaced; no new rate limit; no emoji in 0.8.0.

**Revision 3 (user feedback on the built app, 2026-10-14):** the user found that (a) Home lacked "Start from a template", (b) the New trip entry on Home was a small + instead of the canvas's bottom "New trip" pill, and (c) the UI did not follow the canvas. Source: [design-audit.md](design-audit.md). Breakdown #5 (template tiles) and #6 (first-run card) are **pulled forward from 0.8.1 into 0.8.0**, and the canvas fidelity fixes are added. New criteria are 74-100 (existing numbers unchanged). Where Revision 3 contradicts an older line (criterion 14, the "Not in 0.8.0" strings line, the non-goals), **Revision 3 wins** and the older line is marked as amended.

**Revision 3 risk-review fold-in (2026-10-14):** the Revision 3 compliance and security reviews ran with **no stops**. Their constraints (Sec R1-R9 and baseline gaps 9-11; Comp C-R3-1..7 and two new baseline rules) are folded in as criteria 101-121. Existing numbers 1-100 are unchanged and nothing is weakened. **Amended in place: criterion 30 only** (migration number, below). Criteria 81-86 and 94-97 were checked and do not contradict the new constraints; the new criteria only tighten them (each says which it extends). **Infrastructure fact:** `main` now contains an upstream migration `0021_revoke_public_trip_summary_grant` (applied live). This feature's migration is therefore **0022**, not 0021 (criterion 120). Wherever an older feature doc says "0021" for this feature's migration, read 0022.

**Revision 4 (user test feedback, 2026-10-14):** the user tested the built app and made five explicit decisions, which **override earlier decisions**: (1) Home trip rows follow canvas A's compact spacing, with a clearly visible divider and no "Trip" pill; (2) 1-type trips must create successfully on New trip (this is the already-fixed `trips_types_check` bug, which the user must apply live); (3) the Suggested card moves below the list content; (4) the bottom "Add an expense" / "Add an item" button must be sticky; (5) "What kind of trip?" moves right below Trip name. New criteria are 122-131 (existing numbers unchanged). **Amended in place and marked "Revision 4":** criteria 6, 78, 87, 88, 89, the Canvas coverage table, the non-goals and open questions 5 and 7. No schema, RPC, data or privacy-claim change; no new risk (see Risk surface).

## Problem

A new trip's shopping list starts blank, so the organizer has to remember and type every item. Most trips of the same kind need mostly the same things (camping, an Airbnb stay, international travel). We want a new trip to open with a useful, optional set of suggestions the organizer taps to add, without adding anything on their behalf. Some trips are none of those, so the organizer can also say what kind of trip it is in their own words ("Other"); that gets no suggestions, and the text is kept **to decide which trip types to add next** (criterion 54). Revision 3: the most-seen screen (Home) must also offer the three templates as a way in, since a template tile is the fastest path to a useful list.

## Decision recorded: non-goal reversed

The shopping-list requirements listed "a cross-trip 'common items' template" as a non-goal. For this feature the user **consciously reverses that non-goal** (Checkpoint 1, 2026-10-13). Template-style suggestions are now in scope. Copy-a-past-trip, sharing and saved templates are still not.

## Scope (0.8.0)

1. **Trip types on New trip.** A "What kind of trip?" multi-select of Camping, Airbnb stay, International, **Other**. Pick any, or none. The choice is stored on the trip.
2. **Suggested card on the List tab.** Merged, de-duplicated suggestions from a bundled catalog, with a "+" per item to add one.
3. **Event-name-only analytics** for the above.
4. **(Revision 3) Home template shelf** on `/trips` and the welcome page `/`, the canvas "New trip" pill on `/trips`, the first-run "No trips yet" card, `?type=` pre-check on New trip, and canvas fidelity fixes (criteria 74-100), hardened by the fold-in criteria 101-121.
5. **(Revision 4) User-test fixes** (criteria 122-131): compact canvas-A trip rows on Home, single-type create, Suggested card below the list, sticky bottom bar, picker right below Trip name.

## Scope addition: Other (typed-in trip type)

- A fourth tile, "Other", on New trip. Selecting it reveals a single-line text input where the organizer types their own trip type (for example "Ski weekend").
- The typed text is stored on the trip as short plain text (max 30 characters). **Purpose (narrow):** to decide which trip types to add next. In 0.8.0 nothing reads it back except to make the form work; later it is read only in aggregate by a manual query (criterion 54).
- "Other" has **no catalog and no suggestions**. Picking only "Other" gives a normal empty list with no Suggested card.
- "Other" can be combined with any of the three catalog types or picked alone. Combined, only the catalog types produce suggestions; the source-label pick order applies only to catalog types.
- "Other" is represented **only** by the text column being non-null. There is no `other` code in `types` (criteria 49, 59).
- The typed text is **never** sent in analytics, never put in an event name or property, a URL, a log, or an email.
- Types (including the Other text) are fixed after create in 0.8.0. Editing is proposed for 0.8.1 (see "Planned next").
- **Who can read the text (correction).** The text is not UI-visible beyond New trip, but it is **not** "shown to nobody": any trip member, including an anonymous joiner who holds the invite link, can read the column through the API (PostgREST) under the existing trips SELECT policy, because RLS is row-level. The user accepts this (members already see trip name and location, which are also free text). All copy, the privacy page and the runbook must describe it accurately and never say only the organizer can see it (criterion 67).
- **Where trip metadata is shown today (flag):** the trip location is already shown on `src/app/trip/[id]/invite/page.tsx`, `src/app/check-email/page.tsx`, `src/app/join/[code]/page.tsx` and `src/app/join/[code]/welcome/page.tsx`. The join pages are reached by someone holding an invite code, who may not yet be a member. The Other text is **not** added to these screens or to any data they fetch (criteria 51, 68).

## Behavior

- Types: `camping`, `airbnb`, `international` (catalog types), plus "Other" with typed text. A trip has zero or more. None is valid and gives a normal empty list with no card.
- Suggestions are computed **client-side** from the trip's catalog types and the catalog. Nothing is stored per suggestion.
- Merge: union of the selected catalog types' catalogs. Duplicates are matched on lowercase, trimmed name. The first catalog type in **pick order** wins for the source label.
- An item whose normalized name is already on the list (any status: open, claimed, bought) is not suggested.
- Tapping "+" adds that item through the existing add-item path (name only) and removes it from the card.
- When no suggestions remain the card disappears and nothing replaces it.
- Source line under each suggestion comes from the catalog, e.g. "Suggested · Airbnb stay". It is not a DB column.
- Suggestions never appear in the Add an item flow.
- Visible to all trip members who can see the List tab. No private suggestions. Items added from suggestions are ordinary list items, visible to all members; the UI must not imply a suggestion tap is private (Comp C6).
- Items are names only. No notes.
- **(Revision 3) Home:** a template tile or "Blank trip" on Home opens New trip; a tile opens it with that type pre-checked. Nothing is created or stored by tapping a tile (an anonymous name-only analytics event is recorded, criteria 111-114).
- **(Revision 4) Position:** on the List tab the Suggested card is the last block of the list content (criterion 124).

### Strings (from brief.md, exact)

- New trip: "What kind of trip?", "Pick any, or none", "Your list will open with suggestions for an Airbnb stay and international travel, combined with no repeats." (the sentence adapts to the selected types; wording for 0, 1 and 3 types is for the ux-designer, following canvas B; see Open question 3).
- List tab: "Suggested for this trip", "To get", "tap a circle to grab it".
- Not in 0.8.0: "Add all N", "Nothing on the list yet ... Or copy a past trip", the Undo toast. **Amended by Revision 3:** "Start from a template", "Blank trip" and "No trips yet" ARE in 0.8.0 (criteria 74-100). Home strings: "Trips", "Start from a template", "Blank trip", "Your trips", "New trip", "No trips yet", "Pick a template above and your list starts with the basics. Your trips will show up here."
- The Other tile label, input label, helper text, counter and error copy are for the ux-designer; they must follow criteria 40, 42 and 57: factual notices and instructions are allowed, privacy/security claims are banned.

## Starter catalog (single editable config)

The template item lists **must live in one easy-to-edit config file** (plain TS or JSON, for example under `src/config/` or `src/lib/`, whichever matches repo conventions; there is no `src/config` today and static helpers live in `src/lib`, so the architect picks the location). The user must be able to add, remove or rename items, and change a type's display label, by editing only that file. No item text, type label or ordering may be hard-coded in components. Adding a fourth catalog type later should need only a catalog entry plus the type being allowed by the database check (architect to say what that takes). "Other" is not a catalog type and has no catalog entry (its tile label may live in the same config).

The config file header must carry a short editing note: catalog items are generic category names only; do not add suggestions that imply a person's health, religion or other special-category status (for example specific medications or religious items). "Prescriptions" and "First-aid kit" are generic and acceptable (Comp C9).

### DRAFT content, for the user to review (not final)

Revised: items are things the group would plausibly pay for and split (shared purchases, fees, services), not personal packing gear. Counts are 17 / 16 / 13 and are derived from the catalog.

**Camping (17):** Campsite fee, Firewood, Fuel canisters, Ice, Groceries, Coffee, Snacks, Drinks, Water jugs, Propane, Lighter and matches, Trash bags, Paper towels, Toilet paper, Bug spray and sunscreen, Parking and park entry, Gas for the drive.

**Airbnb stay (16):** Toilet paper, Paper towels, Dish soap, Trash bags, Coffee and filters, Cooking oil, Salt and pepper, Snacks, Breakfast basics, Groceries, Drinks, Drinking water, Laundry pods, Cleaning fee, Parking, Group dinner.

**International (13):** Travel insurance, SIM or eSIM, Airport transfers, Local transport, Rental car, Fuel and tolls, Group dinners, Tours and activities, Entry tickets, Groceries, Drinks, Tips, Parking.

Overlap is deliberate so the dedupe rule is exercised ("Trash bags" is in Camping and Airbnb stay; if both are picked it shows once, labeled with whichever type was picked first).

## Acceptance criteria

New trip
1. The New trip form shows a labelled checkbox group with Camping, Airbnb stay, International and Other. Zero to four can be selected. Selection state is not conveyed by color alone.
2. Creating a trip with no type selected works exactly as today.
3. After create, the chosen catalog types are stored on the trip (in pick order, since pick order decides the label) and survive a reload.
4. The New trip form has no invite row (already true; must stay true). No invite code appears in any new URL, event or log (Sec C11).
5. Trips created before this release (no types) show no Suggested card and work unchanged.

Suggested card
6. A trip with at least one catalog type and at least one un-added suggestion shows a "Suggested for this trip" card at the top of the List tab, above "To get". **AMENDED by Revision 4 (criterion 124): the card now sits BELOW the list content, not above "To get".** A trip with only "Other" (or nothing) shows no card.
7. The card shows the union of the selected catalog types' items, each name once. When an item is in several selected types, its source line shows the first type in pick order.
8. Dedupe is case-insensitive and trimmed, against both other catalog items and items already on the list.
9. Tapping "+" on a verified member's device adds that one item (name only) to the shared list and removes it from the card. The item is visible to all trip members like any other item.
10. Adding the last remaining suggestion removes the whole card; nothing replaces it.
11. A suggestion deleted from the list later reappears as a suggestion (it is derived, not remembered). **Decided by the user: yes, accepted** (former Open question 4). No stored per-suggestion state.
12. Suggestions do not appear in the Add an item sheet or on any other screen.
13. The card works from the bundled catalog with no extra network request for suggestions (the page itself still needs a network).
14. No "Add all", Undo, copy-trip, or Share control is added. **Amended by Revision 3:** template tiles are now added, but only on Home (`/trips`) and the welcome page (criteria 74-84); none on the List tab or an existing trip's empty list (criteria 90, 98).

Verification gate (exact behavior: Open question 1)
15. An unverified (anonymous) organizer tapping "+" is routed through the **existing** email-verification (OTP) gate. No RLS policy, grant, or server check is loosened. After verifying, the add is not lost silently: either it completes or the user clearly lands back on the List tab.
16. Non-members and unverified non-organizers cannot add via suggestions any more than they can add items today.
25. The "+" add uses the existing `shopping_list_items` insert and its policy. No new RPC, no loosened grant, no client-only gate; hiding "+" in the UI is UX only (Sec C7). QA proves, against the database and not only the UI, that an unverified user and a non-member are rejected when inserting a catalog item name.
26. If the architect builds automatic completion of the add after OTP (pending-action replay), then (Comp C7, Sec C8): the replay adds only the single item the user tapped and never adds anything without that tap; the pending action holds only the catalog item key or name plus trip id, in client state only (memory or sessionStorage), never in a URL query param, never logged, and never stored server-side; it is cleared after use and on sign-out and cannot outlive sign-out; the replay is re-authorized by the same server-side insert policy, and the trip id must be one the user is a member of. The replay mechanism itself (or landing back on the List tab instead) is the architect's choice. The Other text is never part of a pending action.

Catalog and config
17. All type labels and item names come from one config file. Editing that file alone (no component edits) changes what the card and form show. A test proves the UI reads from the file rather than from literals.
18. Catalog entries are names only, with no empty names, and no duplicate names within one type (a test enforces this).
27. A test proves every catalog name satisfies the shopping-list item name constraint (length and trim) from migration 0015, so a catalog edit cannot produce a name the database rejects and leave "+" silently failing (Sec C9).
28. The config file header carries the special-category editing note described above (Comp C9).

Server-side validation and schema
29. `trips.types` has a **CHECK constraint on the column** (or a validated immutable function used in a CHECK), not only validation inside `create_trip`, because a direct-INSERT RLS policy exists on `trips` and anonymous sessions use the `authenticated` role (Sec C1, Sec D2; Comp C2). It enforces: every element is in the allowed closed set of catalog types (`camping`, `airbnb`, `international`); no duplicate elements; `cardinality(types) <= 3`. **This stays a closed set of fixed codes: free text never goes into the `types` array**, and there is no `other` code (criteria 49, 59). Null versus `'{}'` default is the architect's choice, but existing rows must satisfy the constraint. A QA test proves a direct insert into `trips` with `{bogus}`, `{camping,camping}`, or 4+ elements is rejected by Postgres (more cases: criterion 71).
30. The migration applies safely on populated tables: new columns nullable or `not null default` a constant, CHECKs added in the same migration, next free number (**amended by the Revision 3 fold-in: 0022**, because upstream `0022_revoke_public_trip_summary_grant` is on `main` and applied live; re-check the next free number just before merge), no past migration (including 0001, 0020 and the upstream 0022) edited. It is verified live against Postgres, not only CI (migration 0013 lesson), and ships with a `.qa.test.ts` covering the constraints and the old-signature call (Sec C2). For the Other column: add it nullable with no default, then add the CHECK as `col is null or (...)` in the same migration; no `not valid` unless needed (Sec O11).
31. Old/new compatibility (Sec C3, Sec D1; Comp C8): an old client calling the old 5-argument `create_trip` keeps working after the migration; a new client must not hard-fail trip creation when the migration has not been applied (a fallback that loses only the types and Other text is acceptable, but see criterion 61 for when the fallback may fire). Apply-migration-before-deploy ordering is documented. Old code with new schema (old `create_trip`, old `select("*")`) keeps working.
32. Any new or replaced function (Sec C4, Comp C8): `security definer`, `set search_path = public`, `revoke ... from public` then `grant execute ... to authenticated` only, with an explicit `revoke ... from anon` (revoking from `public` does not remove the anon grant; see 0002/0003). Grants are never widened to anon or public. Column references are qualified (for example `public.trips.invite_code`) and new parameters must not collide with column names (0013 shadowing lesson). Because `create or replace` with a new argument creates a second overload, the new overload gets its own revokes and grant and the old overload stays untouched. The new-parameter rules are in criterion 60.
33. No UPDATE policy or column grant is added on `trips.types` or on the Other text column (editing is a non-goal in 0.8.0). A QA check proves an authenticated member **and the organizer** cannot `update trips set types = ...` or set the Other text, against the database (RLS zero rows or permission denied) (Sec C6, Sec O10).
34. The data layer reads the trip's `types` through the existing trips SELECT policy with no policy change, selecting only the needed columns (no `select *`; criterion 69 makes this concrete). The organizer can read `types` before verification (Sec C5). The Other text is **not** added to any select list in 0.8.0 (it is write-only from the app).
35. Failure paths for "+" and create-trip show generic copy. Raw Postgres or constraint messages (a CHECK violation names the constraint and column) are never shown to the user (Sec C12). This includes a rejected Other text (criterion 62).
36. No new logging of item names, trip ids or the Other text (Sec C11).
37. Rate limiting: none required in 0.8.0. No new anonymous-callable endpoint or RPC is added for catalog types, and **Open question 7 is resolved: no new rate limit for the Other text either** (criterion 66). If the architect adds a separate RPC (for example `set_trip_types`), it falls under the `rpc_rate_limits` design and must check `created_by = auth.uid()` server-side; the preferred design avoids this (Sec C13).

Other: UI
41. **Tile and input.** "Other" is a fourth checkbox in the same group. When checked, a single-line text input appears directly under the group; when unchecked it is hidden and its text is discarded (not submitted, not kept on re-check unless the architect/ux-designer decides to preserve it in-session; either is fine, but it is never submitted while unchecked). The input has `autoComplete="off"` (Sec O9).
42. **Label and help.** The input has a visible label (not placeholder-only) and short helper text saying what to type (for example an example like "Ski weekend"). **Amended by criterion 57:** helper text may include a factual notice ("Saved with this trip") and an instruction ("Please don't include names or personal details"); it must not make privacy/security claims or state purposes the privacy page does not state.
43. **Limit and counter.** Maximum 30 characters, enforced in the input (`maxLength`) and re-validated server-side. A character counter ("12/30") is shown while the input is open. Whitespace is trimmed before submit; internal runs of whitespace are collapsed by the client and RPC before insert (the DB rejects double spaces, criterion 64). The client/RPC normalize to Unicode NFC before insert (Sec O2).
44. **Empty-text behavior.** If "Other" is checked and the trimmed text is empty, the form does not submit and shows an inline error tied to the input (for example, asking to type a trip type or untick Other). "Other" never gets stored as a bare marker without text, and a whitespace-only value counts as empty. Unticking Other clears the error.
45. **Accessibility.** The input is programmatically labelled and the helper text, counter and error are associated with it (`aria-describedby`); the error is announced (live region or equivalent) and focus returns to the input on a failed submit; the counter does not announce on every keystroke (announce only near or at the limit); the input is at least 40px tall; checked state of "Other" is not by color alone; revealing the input does not move focus away from the checkbox. Light mode only per criterion 22.
46. **Plain text only.** The input accepts and the DB stores plain text. **No emoji in 0.8.0**; other characters are allowed only if they pass the DB charset rule (criterion 64); no formatting, markup or links are interpreted. Characters the DB would reject should be prevented or reported inline in the form so the user is not shown a raw failure.

Other: data and validation
47. **Storage.** The Other text is stored on the `trips` row (not in a separate table, not inside the `types` array) in one nullable text column, with no default (or default null) (Sec O1). The architect names the column; this doc uses `other_type` as a placeholder.
48. **DB-side validation, not only the RPC.** A CHECK on the new column (direct INSERT on `trips` exists and anonymous sessions use `authenticated`) enforces the rules in criterion 64. A QA test proves the reject and accept cases in criterion 65 against Postgres.
49. **Relationship to the closed-set `types` CHECK.** The `types` CHECK (criterion 29) is unchanged in meaning: only fixed codes, max 3 catalog types, no duplicates. **Resolved by the re-review: "Other" is represented solely by the text column being non-null; there is no `other` code in `types`** (criterion 59). This removes any marker/text mismatch case. Existing rows must satisfy all constraints.
50. **Compatibility.** The old 5-argument `create_trip` is untouched and keeps working (no Other text stored). The new overload accepts `_types` and the Other text as additional arguments; the new client falls back to the older call only under the conditions in criterion 61. Grants as in criteria 32 and 60.
51. **Not displayed or returned elsewhere.** The Other text is not rendered on any screen other than the New trip form. It is not added to the select lists or return types of the trip header, trip list, invite page, check-email page, join pages (including any RPC that returns trip preview data to a non-member holding an invite code), emails, notifications or exports shown in the app. QA greps/inspects those data paths and proves none returns it (specifics in criterion 68).
52. **Safe rendering.** Wherever the text is ever read into the UI in this release (none expected beyond input state), it is rendered as escaped text only: no `dangerouslySetInnerHTML`, no markdown or link interpretation, never interpolated into a URL, HTML attribute, `<title>`/metadata, email, or SQL string outside parameterized calls, and never used in `innerHTML` of any admin script. The charset rule is defense in depth, not a substitute for escaping. If a later release displays the text to anyone, it needs its own compliance and security review first (Sec O7).

Other: analytics
53. The Other text is never sent in any analytics event, name or property, or to any third party, and never appears in logs or error reports. A name-only event for the Other choice is a fixed name from a closed set (criterion 58). A named test proves `trackEvent` is never called with the typed text or with any property, including when Other is combined with the other types (extends criterion 39).

Export and deletion
38. **Reworded.** `docs/runbooks/account-deletion-and-export.md` is updated in the same PR and states that `trips.types` **and the Other text column (named)** are covered by the existing trips row export and deletion (cascade via `created_by`). Because the Other text is user-typed free text (it may, by user choice, contain personal information), it is **not** presumed non-personal. The runbook states that it is **CLEARED** (set to null via a service-role or SQL-editor UPDATE) when an organizer is erased but the trip is kept (runbook case B). Full detail in criterion 55.

Analytics
19. Events are name-only through `trackEvent(name)` and are listed in [ANALYTICS.md](../../reference/analytics-events.md). Proposed names, final choice for the architect: `trip_type_selected_camping`, `trip_type_selected_airbnb`, `trip_type_selected_international` fired once per selected catalog type at successful create; `suggestion_add_complete` after a successful "+" add; plus `trip_type_selected_other` (criterion 58). No type text, count, trip id, invite code or item text is sent as a property. No event name may encode free text or a trip or user id; per-type names come only from the closed code-defined set and are never built from unvalidated input (Comp C4, Sec C10).
20. Events do not fire on validation or network errors.
21. The "5+ items within a day of creation" success measure is a manual/admin DB query, not an event, and is not part of 0.8.0 delivery.
39. A named test guards that these events are called with the name only and no properties (Comp C4).

Quality
22. Light mode matches canvas B and C (including the paw-print background). The Other tile and input follow the same style; there is no canvas for them, so the ux-designer extends the pattern. Existing dark styling is not broken; no new dark styling is built or verified. **Amended by Revision 3:** light mode matches canvas A, B, C and L, with the documented deviations only (criteria 87-89). **Amended by Revision 4:** the "documented deviations" list no longer includes unrestyled trip rows or the card above "To get" (criteria 122-124).
23. Tap targets are at least 40px; the "+" has an accessible name that includes the item name.
24. **Amended by criterion 56:** `/privacy` must be updated for trip types and the typed trip type and `LEGAL_LAST_UPDATED` bumped in the same PR. This is no longer conditional. `/terms` is skimmed at design: it should not promise anything about user-entered trip text. The compliance reviewer confirms at design and final (Comp C5, Comp O6).
40. No new copy claims anything about privacy or security (for example "we don't track your trip type", "private to you", "only you can see this"), including the Other helper text. Neutral factual notices and instructions are allowed (criterion 57).

Other: re-review additions (new, after 53)

Purpose, retention, privacy
54. **Purpose (Comp O1, O2; resolves Open question 6).** The one stated purpose of the Other text is "to decide which trip types to add next". It is read only in aggregate, by the operator, by manual query, and the result is not joined to user identity (no `created_by`, email, trip name or location in the same result). Reading it is not delivered in 0.8.0. Data minimization: one nullable column, no copy elsewhere, no log, no cache, no analytics. Advisory: after review for a catalog decision the rows may be nulled in bulk (the CHECK allows null); no automatic job.
55. **Retention, export and erasure (Comp O3, O4).** The text is deleted with the trip (cascade on organizer hard delete, runbook case A) and by the existing 90-day anonymous purge (0018, cascades via `created_by`). No new job. The runbook (`docs/runbooks/account-deletion-and-export.md`) must: (a) state that in case B (organizer soft-deleted, trip kept) the text is cleared, with the statement `update public.trips set <column> = null where created_by = '<uid>';` run as service role or in the SQL editor (this is not an app UPDATE path, so criterion 33 stands); (b) name the column in the export section, noting the export uses `to_jsonb(t) - 'invite_code'` so the column is exported automatically and must not be dropped by a future column exclusion; (c) add a line to the Notes paragraph naming the column; (d) say that a non-organizer member who typed nothing has nothing to export for this column; (e) never describe the text as non-personal (the "types is non-personal" line applies to `types` only). The review outcome is recorded in the same PR.
56. **Privacy page (Comp O6; non-negotiable for this feature).** `src/app/privacy/page.tsx` is updated and `LEGAL_LAST_UPDATED` is bumped in the same PR: (a) "What we collect", Trip details extended to include the kinds of trip you pick and, if you choose Other, a short trip type you type (up to 30 characters); (b) the sensitive-data sentence adds "trip type" to the places not to put sensitive data or other people's personal details; (c) under legitimate interests, a line matching criterion 54 and no more than is true, for example "deciding which trip types to add to Splitiful's suggestions (from the short trip type some people type, read by us in aggregate)"; (d) the page must not say only the organizer can see the text (criterion 67). Retention and Your rights need no new text. The existing analytics sentence ("We do not put names, emails or amounts into analytics events") is unchanged and the Other text is not added to it; criterion 53's test is what keeps it true. Legal sign-off on whether the wording suffices for EU/UK users is flagged for the user, not decided here.
57. **Helper copy (Comp O5; amends criteria 40 and 42).** Allowed: a factual notice such as "Saved with this trip" and an instruction such as "Please don't include names or personal details". Banned: any privacy or security claim ("private", "only you can see this", "we don't track") and any statement of use not true or not on the privacy page. No consent checkbox is needed (legitimate interest, minimal low-risk field).

Analytics
58. **Fixed-name event (Comp O7, Sec O9; resolves Open question 9: keep).** `trip_type_selected_other` is a closed, code-defined name, fired once, only after a successful create that stored text. It carries **no properties**: not the text, not its length, not whether it was empty. It is listed in [ANALYTICS.md](../../reference/analytics-events.md). A named test guards that it is called with the name only, including when Other is combined with catalog types.

Security: representation, function, errors
59. **Representation (Sec O1).** "Other" is represented only by the Other text column being non-null; there is no `other` code anywhere in `types` or in any shared type definition (TypeScript union, enum, catalog).
60. **New overload parameters (Sec O4).** The new `create_trip` overload declares `_types` and the Other parameter with **no default values**, so a 5-named-argument PostgREST call matches only the old overload and cannot return PGRST203 (ambiguous). The Other parameter name does not collide with the column (for example `_other_type`, with the column referenced as `public.trips.other_type`). The new overload has its own `revoke ... from public`, `revoke ... from anon`, `grant ... to authenticated`. QA asserts via `has_function_privilege` or `information_schema.routine_privileges` that `anon` cannot execute either overload, and that an old-style 5-named-argument call still resolves to the old overload.
61. **Fallback condition (Sec O9).** The new client falls back to the 5-arg call **only** on function-not-found signals (PostgREST `PGRST202`, Postgres `42883`), **never** on a check violation (`23514`) or any other error; otherwise a rejected Other text would silently create a trip without it. QA tests both: absent overload leads to a trip created without types/text; a rejected Other text leads to a generic error and no trip.
62. **Error leakage (Sec O9).** A CHECK violation's `error.details` contains the whole failing row (trip name, location, Other text). The create-trip catch path maps every error to fixed generic copy and never `console.*`s, forwards, displays, or attaches the error object to perf-log (`src/app/api/perf-log`), analytics or any error reporter. QA forces a CHECK failure and asserts the UI string contains neither the typed text nor "violates", "constraint", or the column name.
63. **No persistence or side channels (Sec O9).** The Other text does not appear in the URL or query string, router state, `localStorage`/`sessionStorage` (no draft persistence), `timeAsync` labels in `src/lib/perf/timing.ts`, the perf-log payload, `document.title`, analytics, or a pending action. No GET path carries it (RPC calls are POST bodies).
64. **Charset and length CHECK (Sec O2; refines 48).** On the column itself, enforcing all of: `char_length` between 1 and 30 and `octet_length <= 120`; the value equals its own trim; only ASCII space U+0020 as whitespace (no tab, newline, NBSP U+00A0, U+2000-U+200A, U+2028/2029, U+3000); no two consecutive spaces; first character is a letter or digit; permitted characters are letters of any script, combining marks, digits, ASCII space, and `- ' & , .  /`; rejected: control characters (U+0000-001F, U+007F-009F), invisible and bidi characters (U+200B-200F, U+202A-202E, U+2060-2064, U+2066-2069, U+FEFF, U+00AD, U+061C), markup/formula-significant characters (`< > " \` \ { } [ ] | ; = + @ # % $ ^ * ~ ( ) :`), and **emoji (not allowed in 0.8.0)**. NFC is not required by the CHECK. Because Postgres regex has no `\p{L}` and `[[:alpha:]]` is collation-dependent, the architect chooses a denylist plus a no-emoji/symbol range rule, or an allowlist that includes combining-mark ranges.
65. **Live charset tests (Sec O2).** Tested live on the real Supabase Postgres collation (not only CI). Accept: "Ski weekend", "Chuyen di Da Lat", Vietnamese with diacritics in **both NFC and NFD** ("Cắm trại"), Japanese "キャンプ", Arabic, Thai and Devanagari (including combining vowel signs), and a valid 30-character value. Reject: empty, spaces only, 31 characters, newline, tab, NUL, `<script>`, `=1+1`, leading space, trailing space, double space, U+202E, U+200B, NBSP, and an emoji. All by direct INSERT into `trips`.
66. **Rate limiting (Sec O8; resolves Open question 7).** No new rate limit in this feature. Reasons: the added cost is at most about 120 bytes per row on a path that already accepts unbounded `name` and `location` text; a throttle in `create_trip` would be bypassed by the direct-INSERT policy and by the second overload; the 0018 purge bounds retention. The requirements and PR copy do not claim that CHECKs make bulk creation safe (they bound row size only). **Backlog note only, not blocking:** trip creation is unthrottled and `name`/`location` have no length CHECK; the real fix is a separate piece of work that revokes direct INSERT on `trips` (Sec D2) and throttles both overloads.
67. **Accurate description of access (Sec O5; correction).** Risk table, `/privacy`, the runbook and any copy describe the text accurately: any trip member, including an anonymous joiner with the invite link, can read the column through the API. Accepted by the user. No copy says only the organizer can see it. (Rejected alternative, recorded: a separate `trip_custom_types` table with owner-only RLS, which conflicts with criterion 47 and is not recommended; so is a column-level `revoke select`, which breaks `select("*")` readers and old clients.)
68. **Data paths that must not return the column (Sec O6, Comp O8).** `get_trip_by_invite_code`, `get_trip_summary`, `join_trip`, `join_trip_by_id` (and `get_trip_view` if present) must not return `types` or the Other column. The new migration must not redefine, drop or recreate any of them. No function may return `setof public.trips` or select `t.*`. QA greps the new migration and the live function definitions (`pg_get_functiondef`) for the column name. `src/app/api/join/route.ts`, `src/app/api/trip-email/route.ts` (select only `name`; must never interpolate the text) and `src/app/api/trip-invite/[code]/route.ts` stay as they are. The invite, check-email, `join/[code]` and welcome pages are unaffected and get no new field. (Note: upstream 0022 redefined the `get_trip_summary` grant only; re-check its live definition when running this grep.)
69. **Required code change: no `select("*")` on trips (Sec O6, Comp O8).** The existing `select("*")` on `trips` at `src/lib/data/trips.ts:227`, `src/lib/data/trips.ts:307` and `src/app/trips/page.tsx:100` becomes an explicit column list, including `types` only where the trip view needs it. `src/lib/supabase/types.ts` is regenerated or edited so the typed row does not leak the Other field into view models. A grep test proves no `from("trips").select("*")` remains.
70. **Organizer cannot update either (Sec O10).** Covered by the extended criterion 33; listed here so QA does not miss the organizer case.
71. **More `types` CHECK tests (Sec O3).** In addition to criterion 29: `{NULL}`, `{camping,NULL}`, a multi-dimensional array, and mixed case `{Camping}` are rejected. If duplicate detection needs a subquery, use an immutable SQL function in the CHECK (subqueries are not allowed directly in a CHECK).

Revision 3: Home template shelf, New trip entry, first run (canvas A, L)

74. **Shelf on `/trips`.** `/trips` shows, in light mode, in this order: title "Trips" (display size, canvas A); a "Start from a template" section; the "Your trips" content; and a fixed bottom "New trip" pill. The shelf shows in **every state**: zero trips, load error, and trips present. The existing Feedback entry stays.
75. **Shelf content.** Section header "Start from a template" (left) and a "Blank trip" link (right, accent color). Under it, 3 tiles in 3 columns, 8px gap, each 128px tall, 20px radius, 22px icon, label and "N items". Tile order and labels come from the starter catalog config. **Counts are derived from the catalog** (each type's own item count, currently 17 / 16 / 13), never hardcoded; "1 item" for one. A test proves the tile count and counts follow the catalog (criterion 17 extended).
76. **Same shelf on the welcome page `/`.** New organizers are anonymous with no trips and never reach `/trips`, so the same shelf (one shared component) appears on `/` between the intro copy and "Create your first trip", which stays as the blank path. Users who are redirected from `/` today (one trip to that trip; verified or 2+ trips to `/trips`) are unchanged.
77. **Bottom "New trip" pill (canvas A).** `/trips` has a full-width bottom 56px "New trip" pill button linking to `/trip/new`, using the existing capsule material (as the New trip Create button). It **replaces** the small + in the top bar and the empty-state "Start a trip" button, so there is one entry point. The last trip row is never hidden behind the pill (bottom padding).
78. **"Your trips" list unchanged.** Existing trip rows and their grouping (Ongoing / Completed) are kept and ~~not restyled~~ (design-audit A5: canvas rows would drop the money summary). **AMENDED by Revision 4 (criteria 122-123): trip rows ARE now restyled to canvas A's row anatomy and spacing, keeping all existing data; grouping and links are unchanged.** The page gets the paw-print texture (audit A6).
79. **First-run card (canvas L).** With zero trips and no error: kicker "Your trips" over one white card, centered, with "No trips yet" and "Pick a template above and your list starts with the basics. Your trips will show up here." Replaces "You're not on any trips yet." With a load error the existing "Couldn't load your trips." stays under the shelf and the shelf still shows.
80. **Tap targets and semantics.** Tiles and "Blank trip" are links (navigation), at least 44px tall hit area (the "Blank trip" text link gets padding, not a bigger font), with an accessible name equal to the visible text ("Camping, 17 items"), the shelf a labelled section, and a visible focus ring. Tab order: Blank trip, tiles, then trips.

Revision 3: tile tap and pre-check

81. **Links.** A tile links to `/trip/new?type=<code>` where `<code>` is one closed-set catalog code (`camping`, `airbnb`, `international`). "Blank trip" links to `/trip/new` with no parameter.
82. **Server-side validation of the parameter.** The New trip route reads `type` on the server and validates with `isTripType`. Exactly one value is accepted. Unknown codes, empty, wrong case, `other`, repeated or array values, and any other parameter are **ignored** and the form opens blank. It never throws and never renders or echoes the value. (Hardened by criteria 101-104.)
83. **Pre-check with no flash.** A valid code opens New trip with that tile already checked on the first render (no effect-based update, no flash of an unchecked tile). The user can untick it, add others, or add Other; Create behaves exactly as today (types stored, `?tab=list` landing, `trip_type_selected_*`).
84. **Nothing sensitive in any URL.** No Other text, trip id, invite code, item name or email in any new URL (extends criteria 4 and 63). The pick is not stored in `localStorage`/`sessionStorage` (no draft persistence). Back/close returns to the page that launched New trip. (Test: criterion 110.)

Revision 3: analytics

85. **New name-only events.** `home_template_tapped_camping`, `home_template_tapped_airbnb`, `home_template_tapped_international` and `home_blank_trip_tapped`, built through a closed-set helper that returns nothing for unknown codes (never from raw input). They fire on the tap, once per tap, with **no properties**, and never block navigation. `trip_type_selected_*` is **not** reused (it means "stored on a created trip"). A named test guards name-only calls (extends criterion 39). (Helper and test detail: criteria 111-114.)
86. **ANALYTICS.md.** The four names are added as rows to [ANALYTICS.md](../../reference/analytics-events.md) in the same change. (Wording: criterion 117.)

Revision 3: canvas fidelity (every audit row marked "fix")

87. **Values come from the canvas unless listed as a documented deviation.** Every deviation in design-audit.md marked "fix" is fixed: B3 tile padding 12px; B4 tile border 1.5px in both states so tiles do not move on toggle; B6 icon color muted when unchecked and accent when checked; B7 check glyph 11px, stroke 3.4; B9 4px side insets on the group header and 10px gap to the grid; B10 4px inset on the helper sentence; B12 22px gap between Dates and the picker (**superseded by Revision 4, criterion 129: the picker now sits directly below Trip name, so the gap values around the picker are re-specified by design.md for the new position**); B15 pre-check from Home (criteria 81-83); C4 card vertical padding 2px; C5 Suggested card rows about 52px tall (44px "+" button inside 4px vertical padding, using the `-m-2.5` hit-area approach), not about 70px; C6 row divider at 8% ink; C9 "+" glyph stroke 2.8 and accent color; C12 18px gap after the card (**Revision 4: the card is now the last block, so this becomes the spacing between the card and the bottom of the list content / bottom bar, per design.md**); A3 title "Trips" at display size; A4 bottom pill; A6 paw-print texture; L1 and L2.
88. **Documented, accepted deviations stay** (reasons in design.md section 7 and the audit): 2x2 grid with Other as the 4th tile (B1); 88px New trip tiles (B2); unchecked ring at 50% ink for contrast (B5); "Pick any, or none" capitalised (B9); ~~Suggested card ABOVE "To get" (C1)~~ **(removed by Revision 4: the card is now below the list content, criterion 124, so C1 is no longer a deviation)**; the card header hint instead of "Add all N" (C2, until 0.8.1); source line shows the first-picked type only, with "Suggested · " prefix (C7); caption contrast (C8); the richer "+" aria-label (C10); first 6 rows then "Show N more" (C11); real catalog names (C13).
89. **Not restyled in this pass.** ~~The `/trips` trip rows (A5)~~ **(trip rows are now restyled, Revision 4 criteria 122-123)**, the top half of New trip: shell, h1, Location field, Dates card, planner note, and the Create button material (B13, B14) are recorded as known deviations and unchanged (**Revision 4: only the field order on New trip changes, criterion 129**). The Home profile avatar is not built (no profile screen; A3).
90. **Board D empty-list tiles are NOT built** (C15): types are fixed after create, so a tile on an existing trip's list has nothing to set. Revisit with type editing.
91. **Narrow screens.** Home, welcome, New trip and the List tab Suggested card are verified at 390px and 320px: no horizontal scroll, no clipped or truncated text, "International" wraps or fits, tap targets stay at least 44px, the bottom pill does not cover content.

Revision 3: QA acceptance

92. **Screenshot-versus-board comparison.** In addition to unit tests, QA captures the built screen next to the matching canvas board at 390px and 320px for boards **A, B, C and L**, and records the comparison (screenshots or file links and any remaining differences, each tied to a documented deviation) in [qa-report.md](qa-report.md). An unexplained difference fails QA.
93. **Canvas coverage table** (below) is the sign-off record; QA checks that every board has a row and the built behavior matches it.

Revision 3: carry-over constraints

94. **No change to data or auth.** No new table, column, RPC, RLS policy or grant; no new endpoint. The shelf is static, rendered from the bundled catalog, with no extra network request. The shelf and its links are the same for anonymous and verified users. (Test: criterion 107.)
95. **Shared source.** The tile icon map is one shared module used by the picker and the shelf, so they cannot drift. Editing the catalog config alone updates Home, welcome, New trip and the List tab.
96. **Privacy and security claims.** The shelf copy makes no privacy or security claim (criterion 40). `/privacy` needs no change because a tile tap stores nothing and sends only the page load; the compliance reviewer confirms at final. (Confirmed at requirements stage by Comp C-R3 review: no change; copy rules in criterion 116.)
97. **Existing behaviors unbroken.** The redirect rules on `/`, trip-row links, balances, and all earlier criteria (1-73) still pass.
98. **No shelf on the List tab.** Tiles are not added to an existing trip's List tab or its empty state (criterion 90).
99. **Version.** 0.8.0 remains the target. Tiles and first-run are removed from the 0.8.1 plan; 0.8.1 keeps Add all and editing trip types.
100. **Docs updated in the same change.** `design.md` gains boards A and L, the deviation list including B13, B14, A5 and the rule "values from the canvas unless listed"; breakdown.md and ROADMAP.md reflect the move.

Revision 3 fold-in: `?type=` parameter handling (Sec R1-R3, R5, R7; Comp C-R3-4)

101. **Server-side parse, exact match (Sec R1).** The New trip server wrapper receives `searchParams` as a promise (`Promise<{ type?: string | string[] }>`), awaits it, and accepts `type` only when `typeof type === "string"` **and** `isTripType(type)` (exact, case-sensitive comparison against the catalog codes; `isTripType` stays an array comparison, not an object-key lookup, so `__proto__`, `constructor` and `toString` cannot pass). Everything else yields `initialType = undefined`: undefined, empty, wrong case, whitespace-padded (`"camping "`), encoded variants that do not decode to an exact code, `other`, prototype keys, and **any array** (repeated `?type=a&type=b`, ignored entirely). The wrapper never takes the "first element" of an array (so `?type=camping&type=junk` pre-checks nothing). No trim, lowercase or other normalization before validating. Refines criterion 82.
102. **Only the validated value crosses to the client (Sec R1, R9).** The client form prop is typed `TripType | undefined` and receives only the validated catalog code, never the raw param and never the raw `searchParams` object (it would be serialized into the RSC payload). All other query parameters (`?foo=bar`, `?next=https://evil`) are ignored: not read, forwarded or acted on.
103. **Never throws, never echoes (Sec R1, R2).** Malformed percent-encoding (for example `?type=%E0%A4%A`) does not throw and opens the blank form. The raw value does not appear in rendered HTML, `<title>`/`generateMetadata`, an error message, `console.*`, a redirect target, a link `href` or an analytics name. The only visible effect of a valid code is the pre-checked tile and that catalog type's own adaptive sentence. Named tests: `?type=<script>alert(1)</script>` and `?type="><img src=x>` produce markup containing neither string and an unchecked form; the malformed-encoding case passes.
104. **No redirect or canonicalization (Sec R3).** The wrapper does not `redirect()` or `router.push` based on `type`, not even to turn an invalid value into `/trip/new`. Test: invalid input returns 200 with the blank form and no `Location` header.
105. **Proxy and signed-out visitors (Sec R4).** `/trip/new` stays **out of** the proxy's `SESSION_REQUIRED_PATTERNS` (gating it would redirect to `/?next=/trip/new`, drop the query and break the shelf for new anonymous organizers). The proxy is not changed to carry the query string into `next` (it sets `next` to the pathname only; copying query text into a redirect target is banned). QA confirms with a signed-out request that `GET /trip/new?type=camping` returns 200 (no redirect) and `GET /trips` without a session still redirects to `/?next=%2Ftrips` with no `type`.
106. **Welcome page `/` (Sec R5; Comp C-R3-4).** `src/app/page.tsx` keeps reading **only** `signin`: no `type` handling, no forwarding of the incoming query string to tiles. Every tile `href` is built from the catalog code literal (`/trip/new?type=${code}` with `code` from the catalog, never from `searchParams`). The existing session, redirect and membership logic on `/` is unchanged (criterion 97) and `/` is not made statically cacheable in a way that could serve a redirect or per-user content to others (leave rendering as is).
107. **Shelf makes no network or sign-in call (Sec R8; Comp C-R3-2).** The shelf is a server-rendered or static component of `Link` elements. No `route.ts`, server action, `fetch`, Supabase call or migration is added for it. A test proves that rendering the shelf and tapping a tile make no Supabase or `fetch` call and trigger no anonymous sign-in on `/` beyond navigation. Counts come from the bundled catalog at render time. Extends criterion 94.
108. **The URL cannot cause a write (Sec R8).** `initialType` only pre-checks a tile; there is no auto-submit. Create still runs through `create_trip` plus the column CHECK regardless of what the URL said.
109. **Nothing forwarded (Comp C-R3-4; Sec R7).** The `type` value (and any other query value) is not appended to later URLs (the `?tab=list` landing stays code-free, invite links, redirects), not passed to `trackEvent`, and the raw query is not logged server-side. **Non-goal: no `utm_*`, attribution or referrer capture is read or stored.**

Revision 3 fold-in: persistence (Sec R7; Comp C-R3-3)

110. **No device storage (Comp C-R3-3; Sec R7).** A named test proves no `localStorage`, `sessionStorage` or cookie write happens on a tile tap or on the pre-check. The pick is read **once** from the server prop into the initial `useState` (criterion 83). It is not written to `history.replaceState` or to perf-log / `timeAsync` labels. Keeps the cookieless position true. Extends criterion 84.

Revision 3 fold-in: analytics helper (Sec R6; Comp C-R3-1, C-R3-2)

111. **Closed-set helper (Sec R6; Comp C-R3-1).** One helper next to `tripTypeSelectedEvent`, for example `homeTemplateTappedEvent(code: string): string | undefined`, returns `` `home_template_tapped_${code}` `` only when `isTripType(code)`, else `undefined`. `home_blank_trip_tapped` is a constant. No other event name is composed from input. It returns nothing for `other` (there is no `home_template_tapped_other`).
112. **Code source (Sec R6).** The click handler takes `code` from the catalog iteration (the tile's own prop), never from `searchParams`, `window.location` or DOM text. If the helper returns `undefined`, nothing fires (no generic fallback name, no `String(code)`).
113. **Name-only calls (Sec R6; Comp C-R3-1, C-R3-2).** Calls go through `trackEvent(name)` only: **exactly one argument**, no properties object, no user id, email, session id, trip id or Other text, and no `track(...)` import from `@vercel/analytics` outside `src/lib/tracking.ts`. The unit test (extends criteria 39 and 85) asserts the exact set of four names, `undefined` for `other`, `""`, `"Camping"`, `"__proto__"` and `"camping "`, and that `trackEvent` was called with exactly one argument.
114. **Fires on click only (Sec R6).** Events fire on the click, before navigation, wrapped so a failure never blocks navigation. They are not called from a server component and are not fired from `/trip/new` on load. A deep link with `?type=camping` therefore pre-checks without a `home_template_tapped_*` event (intended).

Revision 3 fold-in: page split (Sec R9)

115. **Server wrapper plus client form (Sec R9).** `src/app/trip/new/page.tsx` becomes a thin server wrapper (reads the `searchParams` promise, never `useSearchParams`) plus a client form component. Form behavior is identical to today. The wrapper imports neither `@/lib/data/trips` nor the Supabase browser client. The Other text stays in client component state only (criteria 36, 53, 62, 63 still hold). The client form receives only validated typed props (criterion 102).

Revision 3 fold-in: copy, docs, public page (Comp C-R3-5..7)

116. **Factual copy only (Comp C-R3-5).** Shelf, tile and first-run copy stay factual ("N items", "Blank trip", the criterion 79 sentence). No lines like "nothing is saved", "no sign-up needed" or "we don't track what you tap" near the shelf or first-run card. "Nothing is stored by tapping a tile" is an internal requirement statement only, because an analytics event is recorded. Extends criteria 40 and 96.
117. **ANALYTICS.md wording (Comp C-R3-6; Sec R6).** The four `home_*` rows in [ANALYTICS.md](../../reference/analytics-events.md) say they fire **on the tap, before navigation, with no account**, that the `home_template_tapped_*` names are closed-set and carry no properties, and that they are distinct from `trip_type_selected_*` (stored on a created trip). Extends criterion 86.
118. **No second privacy bump (Comp C-R3-6).** `LEGAL_LAST_UPDATED` is already bumped for 0.8.0 (criterion 56); no second bump is needed for Revision 3 while the privacy text is unchanged (criterion 96). Optional, not required: the usage-event description may mention "which template you tapped on the home page".
119. **Public page is bundled-only (Comp C-R3-7).** The welcome page renders only bundled catalog strings and counts (criterion 76). Showing trips, a user name or any database value on `/` later needs its own review. If the catalog is empty, the shelf renders nothing (no empty header).
120. **Migration renumbered (infrastructure fact).** This feature's migration is 0022 (criterion 30). References to this feature's migration (the migration file `0022_trip_types_and_other_type.sql`, its three `.qa.test.ts` files, `supabase/verify/`, ADR 0014, ROADMAP, ANALYTICS, ARCHITECTURE and runbook text) were renamed from 0021 to 0022 in the same change. The upstream `0021_revoke_public_trip_summary_grant` (already applied live) is not touched. The architect/engineer re-confirm the free number just before merge.
121. **Baseline docs (Sec gaps 9-11; Comp rules 9-10).** `docs/security-baseline.md` gains the three rules (server-validated closed-set query params; closed-set analytics-name helpers; server-wrapper plus client-form passes only validated typed props), and `docs/compliance-baseline.md` gains the two rules (public/pre-sign-in page events follow in-app rules with no device storage or network call; query parameters only as closed-set server-validated codes never forwarded). Verify they are present and add any that are missing.

Revision 4: user test feedback (explicit user decisions, 2026-10-14; they override earlier decisions)

Home trip rows (`/trips`)
122. **Trip rows follow canvas A's row anatomy and spacing (user: "quite a bit of spaces in between... review the UX design again and make sure you follow it").** Each trip row matches canvas A's "Your trips" row anatomy and spacing per design.md: compact rows and a tighter vertical rhythm. The values (icon square, name and subtitle sizes, row padding, gaps) are taken from canvas A (reference: canvas `Main.dc.html`, "Your trips" card) and written down by the ux-designer in design.md; the PM does not set them here. The rows **keep all data the app shows today**: trip name, dates, people count, money/balance, and the Locked state. **Only the "Trip" pill is dropped, on every row** (it is redundant). Row grouping (Ongoing / Completed), links and ordering are unchanged. Amends criteria 78 and 89.
123. **Divider and page rhythm (user: "the separator line between trips are also not clear").** The divider between trips is clearly visible: it matches canvas A's divider per design.md, and its contrast is **stronger than the current ink at 7%** (the ux-designer specifies the value; QA proves it is visibly stronger, see 130). In addition, the vertical spacing between page sections and kickers on the whole of `/trips` (title, "Start from a template", "Your trips", bottom pill clearance) is re-checked against board A and brought to its values; any remaining difference needs a documented deviation. No data, copy claim or behavior changes.

List tab
124. **Suggested card moves below the list content (user: "should be below the To Get items or in the bag items").** The "Suggested for this trip" card renders after the "To get" section and, if present, after the "In the bag" section, i.e. as the **last block of the list content**. On an **empty list** it still shows, alone, under the empty state. Everything else about the card is unchanged (criteria 7-13, 15, 16, 25, 26, and the 6-row cap with "Show N more"). **Supersedes the "above To get" position in criterion 6, the removed deviation C1 in criterion 88 and the former Open question 5 default.** The card still disappears when no suggestions remain (criterion 10), and it must not be hidden behind the bottom bar (criterion 127).

New trip
125. **Single-type (and every) combination creates successfully (user: "when 1 trip type is selected it's not working").** Root cause is the already-fixed `trips_types_check` handling of single-element arrays in migration 0022; the user's live database must have the fixed migration applied. This pass **does not change the migration**. Acceptance: a trip created with exactly **1 type**, with **2 types**, with **3 types**, with **Other only**, and with **Other plus 1-3 types** each create successfully end to end (create, land on the trip, `types` and Other text stored as chosen), proven on a **real Postgres** (the live suite, not only mocks or CI). QA reports the result per combination in [qa-report.md](qa-report.md). A failure on any single combination fails QA.
126. **Release note: apply 0022 with the fixed CHECK.** The release notes and the deploy checklist state that the **0022 migration containing the fixed `trips_types_check`** is what must be applied to the live database before this release is used, and that until it is applied, selecting exactly one type on New trip fails. The new-client fallback (criterion 61) is not a workaround for this failure and must not be extended to cover it (a check violation never falls back). The user applies it; QA re-runs criterion 125 after the user confirms it is applied.

Sticky bars
127. **The bottom bar button and the top bar stay stuck (user: "'Add an expense' and 'Add an item' is not sticky at the bottom").** On the trip page, the tab-aware bottom bar button ("Add an expense" on the Expenses tab, "Add an item" on the List tab, and the equivalent on every other tab that has one) **stays stuck to the bottom of the viewport on all tabs while the page scrolls**, and the **sticky top bar stays stuck at the top**. The bottom bar never covers content: the last item, the Suggested card and any other last block remain fully reachable by scrolling (bottom clearance). The fix must not regress other screens (`/trips` bottom pill, New trip, Home, welcome, settle-up, invite and join screens) and must not add a new scroll container that breaks the browser's native scroll. Likely cause, for engineering to confirm and fix (not a prescribed solution): the Screen glow/texture wrapper uses `overflow-hidden`, which defeats `position: sticky`.
128. **Sticky QA in a real browser.** QA verifies criterion 127 in a **real browser at 390px and 320px** (not jsdom), on every tab of the trip page, with enough content to scroll: scroll to the middle and to the end and confirm the bottom button and top bar remain in place and no content is hidden. Also check `/trips`, New trip, Home and the welcome page for regressions. Results (with screenshots or measurements of the button's bottom offset) go into [qa-report.md](qa-report.md).

New trip field order
129. **"What kind of trip?" sits directly below Trip name (user: "move 'What kind of trip?' right below trip name").** On New trip the field order is: **Trip name, then the "What kind of trip?" picker (including the Other input when ticked), then the remaining fields** (Location, Dates and the rest, in their existing order). **Supersedes** every earlier statement that placed the picker after the Dates card (including the B12 "22px gap between Dates and the picker" value in criterion 87). The picker's behavior, criteria 1-3, 41-46 and the pre-check (criteria 81-83) are unchanged. The ux-designer re-specifies the spacing around the picker for its new position in design.md. The server-wrapper/client-form split (criterion 115) is unchanged.

Revision 4: QA and regression
130. **Home spacing and divider are measured, not eyeballed.** QA captures `/trips` at 390px and 320px, with at least 3 trips (one with a balance, one Locked), next to canvas A, and **measures** row height, row padding, icon square, name and subtitle sizes, section/kicker gaps and the divider's visible contrast, comparing each to the values in design.md. The divider must be visibly stronger than the previous 7% ink. Each remaining difference is tied to a documented deviation; an unexplained one fails QA (extends criterion 92). QA also confirms the "Trip" pill is gone from every row and the name, dates, people count, balance and Locked state are all still shown, and that long trip names and 320px width do not clip or force horizontal scroll (criterion 91).
131. **Regression and test updates.** Existing tests that assert the old behavior are updated in the same change and say why: card above "To get" (criterion 6), the "Trip" pill and old row styling (criteria 78, 89), and the picker position after the Dates card. Criteria 1-121 otherwise still pass. Version stays 0.8.0 (additive UI refinements and one bug-fix confirmation; see Semver).

## Canvas coverage

Every board from the canvas, so none is silently skipped. "Built" means built in 0.8.0; boards A, B, C and L are also compared to the screenshot in QA (criteria 92, 130).

**Scope note (2026-10-16):** this feature is templates-only. Ownership of the copy-a-past-trip boards (E, F, G) and the share/receive boards (H, I, J, K) moves to [`copy-list-from-past-trip`](../copy-list-from-past-trip/requirements.md) and [`share-list-with-other`](../share-list-with-other/requirements.md) respectively; the "Deferred to 0.1x.0" statuses below are superseded by those docs' own scoping. This row is left in place as a dated record, not current ownership.

| Board | Screen | Status | Notes |
|---|---|---|---|
| A (Main) | Home with template shelf, Your trips, New trip pill | **Built in 0.8.0** | `/trips` plus the shelf on `/`. Documented deviations: no avatar (A3), Feedback icon kept. **Revision 4: trip rows (A5) are now restyled to the board's row anatomy and spacing, keeping name, dates, people, balance and Locked state, minus the "Trip" pill (criteria 122-123); whole-page section/kicker spacing re-checked against board A (criterion 123); measured in QA (criterion 130).** |
| B (NewTrip) | New trip with "What kind of trip?" | **Built in 0.8.0** (picker) | Documented deviations: 2x2 grid with Other, 88px tiles, 50% ink ring. Top half (B13) and Create button (B14) are existing UI, not restyled. **Revision 4: the picker moves directly below Trip name, above the remaining fields (criterion 129); single-type create covered by criteria 125-126.** |
| C (ListSuggest) | Suggested card on the List tab | **Built in 0.8.0** | Deviations: ~~card above "To get"~~ (**Revision 4: card now below "To get" and "In the bag", matching the board's below-the-list intent, criterion 124; sticky bottom bar, criterion 127**), "Add all N" pill replaced by a hint until 0.8.1, first-pick source line, "Show N more". |
| D (EmptyNone) | Empty list, no past trips: heading + template tiles | **Deferred** (with type editing, 0.8.1 or later) | Only the plain "Nothing on the list yet." text exists. Tiles not built (criterion 90). On an empty list the Suggested card shows alone under that text (criterion 124). |
| E (EmptyOne) | Empty list with one past trip, Copy | **Deferred to 0.10.0** | Copy a past trip (breakdown #8). |
| F (EmptyMany) | Empty list with many past trips | **Deferred to 0.10.0** | Same. |
| G (AfterCopy) | After copy, toast with Undo | **Deferred to 0.10.0** | Copy plus its Undo (breakdown #9). |
| H (ShareList) | Share a list by link | **Deferred to 0.11.0+** | Phase 2, out of scope in the brief. |
| I (AfterAddAll) | After Add all, toast with Undo | **Deferred**: Add all in 0.8.1, Undo in 0.9.0 | Needs `batch_id` (breakdown #3, #4). |
| J (ReceiveList) | Open a shared link | **Deferred to 0.11.0+** | Phase 2. |
| K (ReceivePick) | Pick new or existing trip for a received list | **Deferred to 0.11.0+** | Phase 2. |
| L (HomeFirst) | First run, "No trips yet" | **Built in 0.8.0** | Reachable by a verified user with no trips; the shelf on `/` serves brand-new anonymous organizers. |

## Risk surface

The early review ran on the base version (2026-10-13), then re-ran on "Other" (2026-10-13), then on Revision 3 (2026-10-14). None found a stop. Because several items are non-none, the early review stays mandatory for this feature and the final review re-checks. The Revision 3 review is folded in (criteria 101-121). **Revision 4 adds no new risk item:** it is layout and ordering only, with no schema, RPC, grant, data, copy claim, message, vendor or endpoint change (criteria 122-131). The existing rows below are unchanged; the Revision 4 delta per item is "none".

| Item | Status |
|---|---|
| New personal data collected/stored | **Catalog types:** a closed three-value array, not about a person (Comp C1). **Other text:** up to 30 characters of free text typed by (possibly anonymous) users, stored on the `trips` row. It is not meant to be personal, but nothing stops a user typing a name or other personal detail, so it is treated as potentially personal data (pseudonymous: linked to an account uuid). **Purpose:** "to decide which trip types to add next" (criterion 54). **Who can read it:** not shown in any UI beyond New trip, but readable through the API by every trip member, including an anonymous joiner with the invite link (accepted; criterion 67); the service role/admin can read it. **Retention:** deleted with the trip (cascade), by the 90-day anonymous purge, and cleared when an organizer is erased but the trip is kept (criteria 38, 55). **Export:** part of the trips row export, named in the runbook. Item names users add are free text already stored today. Revision 3 adds none (a tile tap stores nothing). Revision 4 adds none. |
| Message sent to a person | None. The Other text is not put in emails, invites or notifications (criteria 51, 68). Revision 4: none. |
| New third-party vendor | None. No new dependency expected. Revision 3 events use the existing Vercel Analytics, same disclosure (Comp C-R3 finding 1). Revision 4: none. |
| New unauthenticated/public endpoint, or anything an anonymous account can abuse | No new endpoint or RPC intended (a new `create_trip` overload is authenticated-only, criterion 60). Abuse cases: an anonymous account can create trips with arbitrary `types` and Other text, including by direct INSERT past the RPC, so validation is column CHECKs (criteria 29, 48, 64). Bulk creation is unthrottled today and stays so (criterion 66, backlog note). The "+" add reuses the existing verified-member insert, so the gate is unchanged (criterion 25). **Revision 3:** the public `/` shelf adds no endpoint (criterion 107); anyone can script tile clicks and skew anonymous tap counts, accepted (analytics is not a security boundary). See the URL parameter and welcome page rows below. Revision 4: none (no endpoint added; the migration is not changed, criterion 125). |
| Changes to money records | None. Revision 4 only restyles how the existing balance is laid out on Home rows; it does not change or recompute any amount (criterion 122). |
| User-generated free text | New free-text field (Other, 30 chars) on `trips`, in addition to existing trip name, location and item names. Controls: length, charset and no-emoji CHECK at the DB (criteria 64, 65), escaped plain-text rendering (criterion 52), never in analytics, URLs, logs, errors or emails (criteria 36, 53, 62, 63). No moderation tooling is built; a later release that displays the text needs its own review (criterion 52). Suggestion names remain catalog text. Revision 3: the new `?type=` URL parameter is closed-set, not free text, and is never echoed (criteria 82, 101-104). Revision 4: none new; trip names are shown in rows as today, rendered as escaped text. |
| New copy that makes a claim about privacy/security | None. Helper copy may carry factual notices and instructions only (criteria 40, 57). The `/privacy` update states facts about what is stored and why (criterion 56). Revision 3 shelf and first-run copy make no claim, and "nothing is saved" / "we don't track" lines are banned (criteria 96, 116). Revision 4: none (a pill is removed, no copy added). |
| Auth / OTP gate | Touched, not loosened (criteria 15, 16, 25, 26, Open question 1). |
| Schema / migrations | Yes, see below; this feature's migration is **0022** (upstream 0022 is on `main`, criteria 30, 120). Revision 3 adds none (criterion 94). Revision 4 adds none and does not edit 0022 (criterion 125). |
| Analytics | New name-only events including `trip_type_selected_other` (criteria 19-21, 39, 53, 58). The Other text is excluded. **Revision 3:** four more fixed names, `home_template_tapped_{camping\|airbnb\|international}` and `home_blank_trip_tapped`, fired on the tap before navigation, no account, no properties, closed-set helper that returns nothing for anything else, exactly one argument (criteria 85, 86, 111-114, 117). Fired on public and pre-sign-in pages with no device storage written (criterion 110); the no-opt-out position for EU/UK visitors now also covers these events (legal sign-off item, not decided here). Revision 4: no new events. |
| **Revision 3: new URL parameter** | `/trip/new?type=<code>` carries a closed-set catalog code only (no PII, no Other text, no ids). It is visible in server logs and Referer; a bare catalog type is not personal data. Server-validated with an exact string match, anything else (including arrays) ignored entirely, never echoed, never redirected on, never forwarded, `/trip/new` stays out of the proxy's session-required patterns and the proxy never copies the query into `next` (criteria 82, 84, 101-105, 109). Anyone can send any query string; the only effect is a blank or pre-checked tile on their own form. No `utm_*` capture. |
| **Revision 3: welcome page change** | `/` gains the template shelf. It is a public page, static bundled content, no data read, no new endpoint, no Supabase or fetch call from the shelf, still reads only `signin`, tile hrefs from catalog literals (criteria 76, 94, 106, 107, 119). Existing redirects unchanged. |
| **Revision 3: page split** | `trip/new/page.tsx` becomes a server wrapper plus client form. Only a validated typed prop crosses; the wrapper imports no data layer; Other text stays in component state (criteria 102, 115). Revision 4 reorders fields inside the client form only; the split and props are unchanged. |

### Existing early-review constraints, status after the re-review

| Constraint | Status |
|---|---|
| Comp C1 (data minimization) | Amended: new stored data is `trips.types` plus the Other text column, with a concrete purpose (criterion 54). No-per-suggestion-state non-goal holds. |
| Comp C2 / Sec C1 | Holds for `types`; Other has its own CHECK (criteria 48, 64). Closed set never loosened (criteria 29, 59). |
| Comp C3 (export/deletion) | Extended: criteria 38, 55. "Non-personal" applies to `types` only. |
| Comp C4 / Sec C10 (analytics) | Holds and is strengthened (criteria 53, 58, 85, 111-114). |
| Comp C5 (privacy/terms) | Superseded: update is required (criterion 56). `/terms` skim only. |
| Comp C6 (copy) | Holds, refined by criteria 57 and 116. |
| Comp C7 / Sec C8 | Holds; Other text never in a pending action. |
| Comp C8 / Sec C3, C4, D1 | Extended and tightened (criteria 30-32, 50, 60, 61). |
| Comp C9, C10 | Unchanged. Other text is not scanned or filtered (non-goal); `/privacy` asks users not to put sensitive data there. |
| Sec C5 (read access) | Tightened: criterion 69 replaces `select("*")`; criterion 67 states real access accurately. |
| Sec C6 (no UPDATE path) | Extended to the new column and the organizer (criteria 33, 70). |
| Sec C8 / C11 (no ids or pending actions in URLs) | Revision 3 `?type=` carries only a closed-set catalog code, which those rules allow (criteria 82, 84, 101-109). |
| Sec C11, C12 | Extended (criteria 36, 62, 63). |
| Sec C13 / Sec O8 | Resolved: no new rate limit, backlog note (criterion 66). |
| Sec R1-R9 (Revision 3) | Folded in: R1 criteria 101-103; R2 103; R3 104; R4 105; R5 106; R6 111-114, 117; R7 110; R8 107, 108; R9 102, 115. Baseline gaps 9-11: criterion 121. |
| Comp C-R3-1..7 (Revision 3) | Folded in: C-R3-1 criteria 111, 113; C-R3-2 107, 113; C-R3-3 110; C-R3-4 105, 106, 109; C-R3-5 116; C-R3-6 117, 118; C-R3-7 119. Two baseline rules: criterion 121. |
| Revision 4 | No new constraints; nothing in 1-121 is weakened. The `?type=` handling, error-leak, fallback (61) and data-path rules are untouched. |

## Schema and deploy-safety (for the architect to resolve, not designed here)

Binding constraints are criteria 29-34, 47-50 and 59-71. Revision 3 and Revision 4 add no schema. In short:

- Keep it minimal: `types` on `trips` plus one nullable column for the Other text, and nothing else. No `source`, `note` or `batch_id` in 0.8.0.
- **Migration number: 0022.** Upstream `0021_revoke_public_trip_summary_grant` is on `main` and applied live; this feature's migration, tests and verify scripts are renamed from 0021 to 0022 (criterion 120). The upstream 0021 is not edited. Re-confirm the next free number at merge.
- **Deploy hazard:** `create_trip` takes name, display name, location and dates (`src/lib/data/trips.ts`). Changing its signature is not atomic with the Vercel deploy. Security's preferred and now effectively bounded shape (Sec D1, O4): keep the old 5-arg function untouched and add a new overload with no parameter defaults and explicit grants; the new client calls the new form when types or Other text are chosen and falls back to the 5-arg call only on function-not-found (criterion 61). The rejected alternative is a second step after create, which needs an UPDATE path (criterion 33) or a new RPC (criterion 37). The architect confirms and justifies.
- Apply the migration before the Vercel deploy; document it. **Revision 4: the applied version must be the one with the fixed `trips_types_check` (single-element arrays), criteria 125-126.**
- Live-verified against Postgres, not only CI.
- Do not revoke the direct INSERT policy on `trips` in this feature (Sec D2); the column CHECKs are sufficient for row shape and validation must not rely on the RPC alone.

## Non-goals (not in 0.8.0)

Add all N (0.8.1), Undo and batch ids (0.9.0), template tiles on an existing trip's empty list (board D), restyling the top half of New trip (the `/trips` trip rows ARE now restyled, Revision 4), a Home profile avatar (Home tiles, "Blank trip" and the first-run card were moved INTO 0.8.0 by Revision 3), copy a past trip with Undo (now owned by [`copy-list-from-past-trip`](../copy-list-from-past-trip/requirements.md), not this feature), sharing and receiving lists (now owned by [`share-list-with-other`](../share-list-with-other/requirements.md), not this feature), item notes, editing a trip's types after creation in 0.8.0 (and therefore no UPDATE policy or grant on `trips.types` or the Other text; proposed for 0.8.1, see "Planned next"), a `source` or `batch_id` column, saved custom templates, private suggestions, a Share icon in the trip header, dark-mode styling, localization, analytics properties, in-app catalog editing.

Added from the early review:

- No per-suggestion state: no record of dismissed or declined suggestions, and no suggestion text stored except as ordinary list items the user taps to add (Comp C1).
- No new RPC, unless it carries the existing rate-limit design (Comp C2, Sec C13).
- No privacy or security claim copy (Comp C6).
- No revoking of the direct INSERT policy on `trips` (Sec D2).
- No catalog suggestions that imply a person's health, religion or other special-category status (Comp C9).
- No age-related processing (Comp C10, nothing new).

Added with "Other" (updated by the re-review):

- No suggestions, catalog, or template for Other; no matching of the typed text to a catalog type, no autocomplete, no "did you mean".
- The typed text is not displayed anywhere beyond the New trip form (not in the trip header, trip list, invite/join pages, check-email, emails, share, or export UI), and no screen, query or RPC that serves non-members returns it.
- **Purpose limit (Comp O1):** the typed text is not used for profiling, ads, recommendations, per-user or per-trip analysis, or contacting the organizer; its only use is deciding which trip types to add next, read in aggregate by manual query, not joined to identity. It is not used for analytics events or aggregation in the app. The manual query is not delivered in 0.8.0.
- No admin/moderation tooling, profanity filter, reporting flow, or content scanning. Exposure is limited by the charset rule and the length cap; revisit if the text is ever displayed.
- No editing, deleting or clearing the Other text after create in the app (0.8.0); the operator-run clearing in criterion 55 is not an app feature. No per-user or saved list of custom types; no multiple Other entries; no rich text, links, markup, newlines or emoji.
- No free text inside the `types` array and no loosening of the `types` CHECK to accept arbitrary values; no `other` code in `types`.
- No new rate limit and no revoking of direct INSERT (backlog note, criterion 66).
- No draft persistence of the Other text (criterion 63).

Added with Revision 3:

- No `other` value for the `?type=` parameter, and no parameter other than one closed-set `type`.
- No new data, endpoint or schema for Home; no persistence of a tile pick.
- ~~No restyle of `/trips` rows~~ (**reversed by Revision 4**: rows are restyled, criteria 122-123), no Home avatar, no board D tiles.

Added with the Revision 3 risk-review fold-in:

- No `utm_*`, attribution or referrer capture is read or stored (Comp C-R3-4; criterion 109).
- No redirect, canonicalization or "first element of an array" handling for `?type=` (Sec R1, R3; criteria 101, 104).
- No gating of `/trip/new` in the proxy and no carrying of the query string into the proxy's `next` (Sec R4; criterion 105).
- No `home_template_tapped_other` event and no event name composed from raw input (criteria 111-113).
- No Supabase call, `fetch`, server action or route handler for the shelf; no database value on `/` (criteria 107, 119).
- No `useSearchParams` for the pre-check, and no raw `searchParams` passed to a client component (Sec R9; criteria 102, 115).
- No shelf or first-run copy that claims anything about saving or tracking (criterion 116).

Added with Revision 4:

- No new data in trip rows: the "Trip" pill is only removed. No new row fields, avatar, swipe actions, or change to row grouping, ordering or links.
- No schema, RPC, grant or migration change, and migration 0022 is not edited (criterion 125). No widening of the create-trip fallback to cover a check violation (criterion 126).
- No invented visuals: every spacing, size and contrast value comes from canvas A via design.md (criteria 122, 123).
- No change to the Suggested card beyond its position (criterion 124); no "Add all".
- No new scroll container or fixed-position rewrite of the whole layout to achieve stickiness; the fix is engineering's choice but must not regress other screens (criterion 127).
- No restyle of the rest of New trip; only the picker's position changes (criterion 129).

## Edge cases

- Other checked, text empty or whitespace only: blocked with an inline error (criterion 44).
- Exactly 30 characters: accepted. 31: prevented in the input and rejected by the DB if bypassed.
- Pasted text longer than 30 characters: truncated or blocked consistently by `maxLength`; the counter never shows over the limit.
- Pasted text with newlines/tabs: not accepted (newlines removed or rejected), consistent with the DB charset rule.
- Leading/trailing spaces: trimmed before submit. Double spaces: collapsed by the client/RPC; the DB rejects them if bypassed.
- Text with `<`, `>`, quotes, emoji, or a leading `=`/`+`/`-`/`@`: rejected by the charset rule with a form-level message that does not echo raw database errors. Non-Latin letters, including NFD-composed input, are accepted. Whatever is accepted is only ever rendered as escaped text.
- Text identical to a catalog label (for example "Camping"): allowed, no special handling and no suggestions are generated from it.
- Other checked then unchecked after typing: text is not submitted.
- Other combined with 0 catalog types: no Suggested card. Other combined with 1-3 catalog types: card shows only the catalog types' items.
- Create fails (network or DB reject): form keeps what the user typed; generic error copy; no fallback creation on a check violation (criterion 61).
- Migration not applied (new client, old schema): trip creation still succeeds via the function-not-found fallback; types and Other text are dropped (criteria 31, 50, 61).
- Pre-existing trips and trips created by old clients: no Other text, no behavior change.
- Duplicate submit (double-tap Create): one trip, as today.
- Revision 3: `/trip/new?type=camping&type=airbnb`, `?type=Camping`, `?type=camping `, `?type=other`, `?type=__proto__`, `?type=` or `?type=<script>`: form opens blank, nothing echoed, 200 with no redirect (criteria 82, 101-104).
- Revision 3: `?type=camping&type=junk` pre-checks nothing (arrays ignored entirely, criterion 101). `?type=%E0%A4%A` does not throw (criterion 103).
- Revision 3: `/trip/new?type=camping&foo=bar` or `?next=https://evil`: only the valid `type` is used; the rest is ignored (criterion 102).
- Revision 3: user lands on New trip via a tile, then unticks it and creates: a trip with no type, as today.
- Revision 3: signed-out visitor opens `/trip/new?type=camping`: 200, pre-checked, no redirect (criterion 105).
- Revision 3: catalog edited to have 4 or 2 types: the shelf follows the catalog (3 columns is the canvas value; the layout for other counts is for the ux-designer, flag to user if a fourth type is added). An empty catalog renders no shelf (criterion 119).
- Revision 3: trips load error on `/trips`: shelf and bottom pill still show, with the existing error line (criterion 79).
- Revision 3: 320px width: "International" wraps inside its tile, no clipping (criterion 91).
- Revision 3: analytics call throws on a tile tap: navigation still happens (criterion 114).
- Revision 4: a trip row with a long name, many people, a large balance and the Locked state at 320px: stays compact, no horizontal scroll, nothing clipped silently (criteria 122, 130).
- Revision 4: a single trip on `/trips`: the divider is not drawn after the last row of a group (design.md decides), and the row spacing still matches canvas A.
- Revision 4: List tab with "To get" empty and items only "In the bag": the Suggested card follows "In the bag". List tab with both: the card is after "In the bag". Empty list: the card shows alone under the empty state (criterion 124).
- Revision 4: a long List tab with the Suggested card at the end: the card's last row is fully reachable above the sticky bottom button (criteria 124, 127).
- Revision 4: tapping Create with exactly one type ticked on a database that has the old CHECK: fails with generic copy and no trip (criterion 126); it works after the fixed 0022 is applied (criterion 125).
- Revision 4: arriving from a Home tile (`?type=camping`) now shows the pre-checked tile directly under Trip name (criteria 83, 129).

## Semver

**feature** (backward-compatible minor bump, 0.7.0 to 0.8.0). Revision 3, the fold-in and Revision 4 do not change this: Home gains a shelf, a different New trip button and tighter trip rows, the Suggested card sits below the list, the picker moves under Trip name, and the sticky bar is fixed, but no route, data or behavior is removed, and `?type=` is optional. Existing trips, routes and data are unchanged; the new fields, "Other" tile and card are additive. The `select("*")` replacement and the migration renumbering are internal and invisible to users. The sticky-bar fix and the 1-type create fix are bug fixes inside an unreleased feature, so they do not need a separate version line. Flag: if 0.8.0 had already shipped to users, the single-type create fix would be a patch (`fix`); here it is part of the same unreleased 0.8.0.

## Planned next (proposed for 0.8.1, pending the user's decision; not in 0.8.0)

Types and the Other text are fixed after create in 0.8.0 (Open question 5, accepted for this release). This means older trips (created before 0.8.0) and trips where the organizer skipped the picker cannot get suggestions. **Proposed for 0.8.1:** let the organizer edit a trip's types and Other text after creation, organizer-only, via a column-level UPDATE grant or an RPC with rate limiting (the architect chooses; an RPC falls under the `rpc_rate_limits` design with a server-side `created_by = auth.uid()` check). This adds a write path, so it needs its own compliance and security review (Sec C6 and O10 no longer apply as written). It is not scoped here and the 0.8.0 criteria do not change. (Template tiles and the first-run card are no longer part of 0.8.1; Revision 3 moved them into 0.8.0.)

Questions for the user (pm):

1. Do you want editing in 0.8.1 at all, or only a one-time prompt on older trips ("add trip type to get suggestions")?
2. Gated on email verification? (Today only verified organizers write to the shared list; an unverified organizer would otherwise be able to rewrite types.)
3. Blocked after a trip is completed or settled, or editable any time?
4. Does it also cover the Other text, or only the three catalog types? (The text has the personal-data and error-leak concerns in criteria 55 and 62.)
5. Should changing types ever remove existing items? (Default proposed: never; types only change what the card suggests.)
6. Should the edit fire an analytics event (name only, e.g. `trip_types_edited`), or none?

## Open questions (need the user's decision)

Resolved by the user or the re-review:

- **Q4 (re-suggesting a deleted item): yes, accepted** (criterion 11).
- **Q5 (no editing after create): accepted for 0.8.0.** Editing is proposed for 0.8.1 (see "Planned next").
- **Q6 (purpose): resolved.** Narrow purpose "to decide which trip types to add next" (criterion 54).
- **Q7 (abuse by anonymous accounts): resolved.** No new rate limit; backlog note only (criterion 66).
- **Q8 (emoji and non-English text): resolved.** Letters of any script, combining marks, digits, ASCII space and `- ' & , . /`; no emoji in 0.8.0 (criteria 64, 65).
- **Q9 (event for Other): resolved, keep** the fixed-name `trip_type_selected_other` (criterion 58).
- The `create_trip` signature approach is an architect decision bounded by criteria 31, 32, 50, 60 and 61.
- **Revision 3, decided by the user's feedback:** Home must have the template tiles; the bottom "New trip" pill replaces the small +; the UI must follow the canvas (criteria 74-100).
- **Revision 3 risk review: no open questions.** Both reviewers returned no stops and no items needing the user; the constraints are criteria 101-121.
- **Migration number: resolved by the repo state.** Upstream 0022 is on `main`, so this feature's migration is 0022 (criteria 30, 120). Not a product decision.
- **Revision 4, decided by the user's test feedback (these override earlier defaults):** trip rows follow canvas A spacing with a clear divider and no "Trip" pill (criteria 122-123); the Suggested card is below the list content (criterion 124); the bottom bar is sticky (criterion 127); the picker sits under Trip name (criterion 129). The single-type create failure is the known `trips_types_check` bug, fixed in 0022, which the user applies (criteria 125-126).

Still needing the user:

1. **Exact pre-verification behavior.** Default applied: the Suggested card is **visible read-only** to an unverified organizer, and tapping "+" triggers the existing verification flow. Security confirmed read-only visibility is safe. Still open: today the trip page hides mutating controls for an unverified organizer and shows an inline email+OTP block; whether the List tab and its card are reachable before verification is not confirmed, and the architect must verify. If the List tab is hidden until verification, the card appears only after the organizer verifies. Do you accept either outcome? After a gated tap, should the original "+" add complete automatically on return (preferred, needs the pending-action mechanism, bounded by criterion 26) or just land the user back on the card?
2. **Catalog sign-off.** Is the draft content acceptable as launch content, and who edits it afterward?
3. **Type-tile sentence.** Dynamic by selection (default) or static as on the canvas? With Other selected, default: the sentence mentions only catalog types and says nothing about Other.
4. **Edit-types timing.** Confirm whether editing types after create is wanted in 0.8.1, and the questions under "Planned next".

Revision 3 (defaults applied; tell me if you disagree):

5. **Card position.** ~~Default: keep the Suggested card ABOVE "To get".~~ **Decided by the user in Revision 4: below the list content (criterion 124).** No longer open.
6. **Home avatar.** Default: not built (no profile screen to link to).
7. **Trip rows and New trip top half.** **Trip rows: decided by the user in Revision 4, restyled to canvas A spacing while keeping all current data (criteria 122-123).** New trip top half (shell, h1, Location, Dates, planner note, Create button): still not restyled (criterion 89); only the field order changes (criterion 129). Re-skinning the top half still needs your call.
8. **Welcome page shelf.** Default: yes, on `/` as well as `/trips` (criterion 76).

Revision 4 (one decision still open, a confirmation only):

9. **Has the live database already been given the fixed 0022?** The single-type failure persists until you apply the 0022 migration containing the fixed `trips_types_check` (criteria 125-126). Please confirm when applied so QA can re-run the 1-, 2-, 3-type and Other combinations on the live database.

Not a product decision but flagged: legal sign-off on whether the `/privacy` legitimate-interest wording suffices for EU/UK users, and now also on the no-opt-out analytics position covering the four Home tap events on the public welcome page (Comp "Open items"; Comp C-R3 finding 1).
