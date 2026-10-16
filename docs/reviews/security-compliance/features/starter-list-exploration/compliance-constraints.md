# Compliance constraints: starter-list-exploration (0.8.0)

Mode: requirements. Reviewed against docs/compliance-baseline.md. Not legal advice.

Revision history: first pass 2026-10-13 (types only). Re-run 2026-10-13 for the "Other" typed-in trip type (criteria 41-53). Constraints C1-C10 below are the first pass, amended where "Other" changes them. New constraints are O1-O10.

## Stops

None, before or after "Other". There is one design tension (criterion 42 forbids stating the purpose in the helper text, see O5) with a compliant alternative that needs no change of shape. No message, no new vendor, no special-category data by design, no money-record change.

## What "Other" changes

The Other text is user-typed free text from possibly anonymous users, stored on `trips` and linked to `created_by`. Nothing stops a user typing a name or other personal detail (a person's name, "Sam's 40th", a health or religious reference). Treat it as potentially personal data, held as pseudonymous (linked to an account uuid, and to the trip's members). It is not special-category by design, and the 30-char cap and charset rule limit how much can be entered, but it cannot be guaranteed non-personal. That is a rule for the runbook and privacy page, not a stop.

## New constraints for the Other text (pm: add as acceptance criteria or non-goals)

O1. Stated, narrow purpose (resolves Open question 6). Record one purpose in requirements: "to decide which trip types to add to the starter catalog". Drop "future roadmap use" as the wording. The text is read only in aggregate, by the operator, by manual query, and not joined to user identity (no `created_by`, no email, no trip name or location in the same result). Add a non-goal: no use for profiling, ads, recommendations, per-user or per-trip analysis, or contacting the organizer. Reading it is not delivered in 0.8.0 (already stated); the purpose limit applies when it is.

O2. Data minimization and necessity. Storing a field nothing reads yet is acceptable only because the purpose in O1 is concrete and the field is capped (30 chars, charset CHECK, single column). Keep: one nullable column, no copy elsewhere, no log, no cache, no analytics (criteria 47, 36, 53). Advisory: once the operator has reviewed the values for a catalog decision, the rows may be nulled in bulk; the CHECK allows null. No automatic job is required.

O3. Retention. The text lives with the trip row. It is deleted by the existing paths: cascade on organizer hard delete (runbook case A), and the 90-day anonymous purge (cascades through `created_by`). No new job. Gap to close: runbook case B (soft delete of an organizer whose trip is retained) keeps the trip row, so the text would stay attached to a pseudonymous uuid forever. Constraint: in case B, clear it, `update public.trips set <other_text_column> = null where created_by = '<uid>';` (a service-role or SQL-editor update is fine; criterion 33 only forbids an app UPDATE path). Criterion 38 should be reworded from "states whether it stays or is cleared" to "states it is cleared in case B". Reason: free text may identify a person, and the trip does not need it to keep balances correct.

O4. Export and erasure coverage. The export query uses `to_jsonb(t) - 'invite_code'` over `public.trips`, so the new column is exported automatically. Constraint: the runbook states this explicitly (so a future person excluding columns does not drop it), and adds a line to case B and to the "Notes" paragraph naming the column. Also add in the runbook that a request by a non-organizer member who typed nothing has nothing to export for this column (they did not author it). Record the review outcome in the same PR (baseline rule).

O5. Transparency at collection vs. criteria 40 and 42. Criterion 42 says the helper text must not state what the text is used for, to avoid inaccurate claims. That is right for privacy and security claims, but it should not block a neutral, true notice. Allowed and recommended helper text: a factual line such as "Saved with this trip" plus an instruction such as "Please don't include names or personal details". Not allowed: "private", "only you can see this", "we don't track", or any statement of use that is not true. Amend criteria 40 and 42 to say this. The privacy page (O6) is the place for the purpose statement. No consent checkbox is needed: lawful basis is legitimate interest (product development), with a minimal, low-risk field.

O6. Privacy page (`src/app/privacy/page.tsx`). Criterion 24 left this to the reviewer. Decision: the generic page does NOT cover it. The "What we collect" list names "Trip details: name, location, dates, and members", and "Why we use your data" has no product-development purpose for content users type. Required edits, with `LEGAL_LAST_UPDATED` bumped in the same PR:
  - In "What we collect", extend Trip details to "...dates, members, the kinds of trip you pick, and, if you choose Other, a short trip type you type (up to 30 characters)".
  - In the sensitive-data paragraph, add "trip type" to the list of places not to put sensitive data or other people's personal details.
  - In "Why we use your data", under legitimate interests, add: "deciding which trip types to add to Splitiful's suggestions (from the short trip type some people type, read by us in aggregate)". Text must match O1; do not say more than is true.
  - "Retention" and "Your rights" need no new text; trip data is already "kept while the trip exists".
  - Do not add the Other text to the analytics sentence. The existing "We do not put names, emails or amounts into analytics events" stays true; the new fixed-name events carry no data. Optionally add "the kinds of trip you pick" to the usage-event description only if the fixed-name events are kept.
  - A named test or a manual final-review check that no analytics call carries the text (criterion 53) is what keeps that sentence true.

O7. Analytics (resolves Open question 9, see below). Criterion 53 is compliant. Constraint added: the fixed-name event fires only after a successful create and is a closed code-defined name; the typed text, its length, and whether it was empty are never an event property. `trackEvent` guard test extends to the Other path (criterion 53 already says so).

O8. Non-display of the text. Criterion 51 is the key control: the join pages are reachable by someone holding an invite code who may not be a member, so returning the Other text from any preview RPC would disclose a stranger's free text to a third party. Keep as a blocking criterion (QA inspects each data path). Also exclude the text from the `trips` row returned by any `select *` or `to_jsonb(trips)` path in app code; criterion 34 (no `select *`) covers this, and the final review will grep for it.

O9. Server-side validation and abuse. Criterion 48 (CHECK on the column) is required, not optional, since anonymous sessions can insert directly. Compliance view on Open question 7: the exposure is low (nobody else sees the text, 30 chars). No new rate limit is needed for compliance. Security owns the abuse call; if bulk trip creation is already unbounded, that is a pre-existing issue, not new for this feature.

O10. Third parties and transfers. No new vendor. The text is stored in Supabase (already listed, US-hosted, covered by the existing international-transfer paragraph). It is not sent to Vercel Analytics, Resend, or Upstash. Constraint: no error-reporting or logging path may capture the typed text (criteria 36, 53 cover this).

## Recommendations on the open questions

Q6 (purpose). A vague purpose is not good enough. Adopt the narrower purpose in O1: "to decide which trip types to add next". It is true, specific, supports a legitimate-interest basis, and costs nothing in the feature. Alternative that needs no stop: if the user does not want to commit to that purpose, do not store the text in 0.8.0 (ship the Other tile without the text field). Not required.

Q9 (event for Other). Acceptable under compliance: a fixed-name event with no text, no properties, no length is not personal data and needs no new disclosure. Recommend keeping `trip_type_selected_other` for consistency with the other three, fired once at successful create. Excluding it would also be compliant; the count of Other trips is available from the database. If kept, it must also be listed in docs/ANALYTICS.md.

## First-pass constraints, status after "Other"

C1. Data minimization. Amended: the new stored data is `trips.types` (closed set) and the Other text column (O1-O3). Non-goal on per-suggestion state stays.

C2. Server-side validation. Holds for `types`. The Other text needs its own CHECK (O9, criterion 48). No free text in `types` ever.

C3. Export and deletion. Extended by O3 and O4. The earlier line "types is non-personal and may remain" holds for `types` only; do not say it for the Other text.

C4. Analytics. Holds and is strengthened by O7. Event names come only from a closed, code-defined set.

C5. Privacy and terms. Superseded by O6: an update is required, not conditional. `/terms` needs no change (check at design: it should not promise anything about user-entered trip text; skim only).

C6. Copy. Holds, with the O5 refinement: neutral true notices are allowed, privacy or security claims are not.

C7. Auth gate and pending-action replay. Holds. The Other text is never in a pending action (criterion 26).

C8. Deploy safety. Holds, extended to the new column, parameter, and overload (criteria 30-32, 50).

C9. Catalog content. Unchanged. Other has no catalog. Note the Other text can contain anything, including special-category terms; we do not scan or filter it (non-goal), and the privacy page asks users not to put sensitive data there (O6).

C10. Minors. Unchanged. Free text typed by a minor in the Other field is not meaningfully different from existing free text (trip name, item names).

## Advisory

- Derived suggestions re-suggest deleted items. No compliance issue.
- Open question 5 (no editing after create) now has a small privacy side: a user who typed a personal detail by mistake cannot fix it in the app and must email the privacy address. That is acceptable (the right to rectify and erase is served by the runbook), but the helper text instruction in O5 reduces the risk. If editing is ever added, it needs its own review.
- Open question 8 (emoji, non-English): no compliance preference. A stricter charset reduces junk and markup risk and is a security call.
- If a later release displays the Other text to anyone, it needs its own compliance review (disclosure to other users, moderation or reporting path, notice and takedown).

## Open items needing the user, not legal

- Q6: confirm the narrower purpose in O1 (recommended).
- Q9: keep or drop the fixed-name event (no compliance objection either way).
- Needs legal sign-off, not decided here: whether the privacy-page wording for the legitimate-interest purpose in O6 is sufficient for EU/UK users given the field may hold personal data typed by anonymous users. Low risk, but flagged.

## Baseline gaps

Suggested additions to docs/compliance-baseline.md. The first three were optional in the first pass; the "Other" change makes them needed because a free-text field is exactly the case they cover.

1. Under Personal data: "Any new column that accepts user-controlled values needs database-side validation (allowed set, length, charset), since anonymous accounts can write to it directly."
2. Under Processors and analytics: "Analytics events that encode a user choice in the event name are allowed only for a closed, code-defined set of values; never user-entered text, its length, or its presence as a property."
3. Under Personal data: "User-typed free text is treated as potentially personal data even when the field is not meant for personal details. It needs a stated narrow purpose, a retention rule, an export and erasure entry in the runbook (including the retained-trip case, where it is cleared), and a privacy-page line, in the same PR."
4. Under Personal data: "Fields collected for a future use, with no reader in the current release, need a concrete stated purpose before they are stored (not 'future use')."
5. Under Personal data: "Trip or entity previews served to non-members (invite and join pages) must not return user-typed free text beyond fields already disclosed there."
6. Under Consumer-facing claims: "Field helper text may state facts (what is stored) and instructions (do not enter personal details), but not privacy or security claims or purposes that the privacy page does not state."

## Design review

Mode: design. Date 2026-10-13. Inputs: architecture.md, design.md, this file, current `src/app/privacy/page.tsx` (skimmed), docs/compliance-baseline.md. Not legal advice. Skimmed for what is new; the app was not re-audited.

Result: no blocking gaps. Every constraint is carried into architecture.md; design.md carries the user-facing ones. Two design.md inconsistencies and a few advisories below. No stop.

### Constraint carry-through

| Constraint | Carried in | Verdict |
|---|---|---|
| C1 / O2 minimization | arch s3 (two columns, nullable, no copy elsewhere), s13 | Met. Optional bulk null after review (O2 advisory) not carried; fine, it was optional. |
| C2 / O9 server validation | arch s3 `trips_types_check`, `trips_other_type_check`, live direct-INSERT tests | Met. |
| C3 / O3 retention | arch s9: case A and 90-day purge by cascade, case B `update public.trips set other_type = null where created_by = '<uid>'`, "non-personal" applies to `types` only | Met. Final review must confirm 0018's purge really cascades to `trips` via `created_by` (arch asserts "needs no change"; not re-verified here). Requirements criterion 38 and its rewording were not re-read in this pass; final review checks it says "cleared". |
| O4 export | arch s9: names both columns, states `to_jsonb(t) - 'invite_code'` includes them, non-authoring member has nothing to export, Notes line, review outcome recorded in PR | Met. |
| O1 purpose | arch s3 migration header (purpose, aggregate manual read, not joined to identity), s9 privacy line, s13 | Met. See advisory A3 (no ready aggregate query, no explicit non-goal text in arch). |
| O5 / C6 helper copy | design s2.3 helper is exactly "Saved with this trip. Please don't include names or personal details." | Met. Fact plus instruction only. |
| O6 privacy page | arch s9: all three wording edits match O6 verbatim, item 4 does not claim organizer-only visibility, `LEGAL_LAST_UPDATED` bump with a test that fails if it still equals "October 12, 2026", `/terms` skimmed | Met. Existing line 104 of the privacy page ("Other members of a trip can see what you enter on that trip") already makes the member-readable position accurate. |
| O7 / C4 analytics | arch s8: five name-only events, success only, `typesStored` gate, `tripTypeSelectedEvent` accepts catalog codes only, tests assert no call has a second argument or contains typed text; ANALYTICS.md gets a "Starter lists" table and "Trip type text" under not collected; test ties every catalog code to an ANALYTICS.md row | Met. Design s2.4/s6 agree (no `timeClient`/`timeAsync`, no perf label). |
| O8 non-display | arch s7 (explicit column lists, grep test forbidding `select("*")` on `trips` and `other_type` in any select), s10, s12 live test and SQL script that public RPCs do not return the columns | Met. |
| O10 third parties/logging | arch s4 `CreateTripError` carries only a code, never message/details/hint; no `console.*`; s12 forced-failure test | Met. Design s2.4 shows fixed copy only. |
| C7 pending action | arch s2: one in-memory slot, item name only, never Other text, cleared on use/unmount/SIGNED_OUT, 10-minute TTL, re-authorized by RLS | Met. See finding D1 (design.md still describes sessionStorage). |
| C8 deploy safety | arch s3, s4, s10, s11 | Met. |
| C9 catalog header note | arch s5 gives the header text, s12 test asserts it exists | Met. |
| C10 minors | nothing new | Met. |

### New-copy review (design.md): privacy and security claims

Reviewed every new string. No privacy or security claim and no unstated purpose. Specifically true:
- "Saved with this trip." True (stored on the trip row). It does not say who can see it; do not extend it.
- "Added 'X' - everyone on the trip can see it." True, and avoids implying a private tap.
- Waiting caption "Adds after you confirm your email", widget headline "Confirm your email to add 'X' to the list.", "tap + to add", "Suggested for this trip", adaptive sentences, inline Other errors, "Show N more": all functional, none asserts data handling. The item name in the widget headline is catalog text only (safe); keep it that way, never the Other text.
- Error lines never echo server or typed text (criteria 35, 62).
- Adaptive sentence names only catalog types; Other is never mentioned in copy or events.

### Findings

Blocking: none.

Should fix before the engineer starts (consistency, no legal exposure by themselves):

D1. design.md s4.2 and s6 (criterion 26 row) describe an unverified invitee holding the pending item in `sessionStorage` and auto-adding after the redirect. architecture.md s2 finding 3 says an unverified non-owner never reaches the List tab, so that path does not exist, and ADR 0015 keeps the slot in memory only. Fix in design.md: delete or mark s4.2 as unreachable, and change the s6 row to "in memory only". Compliance-wise either mechanism is acceptable if it holds only the catalog item name, but the doc should not invite the engineer to add storage.

D2. design.md s2.4 says the client mirrors the DB rule with "a denylist plus a symbol range check". architecture.md s3 says the client uses the same allowlist class exported from `validation/trip-type.ts` and a drift test. A denylist can accept what the database rejects, producing the "retry fails with only the generic message" residue design.md already admits, and criterion 46 asks the form not to accept what the database rejects. Fix in design.md: defer to architecture (shared allowlist; the three inline messages stay).

Advisory:

A1. Privacy page: the three required edits are specified but not yet made. Final review will check the exact phrases, the date bump, and that "trip type" is in the sensitive-data list. Still open: legal sign-off on the legitimate-interest wording (architecture U8).

A2. Optional privacy wording: mention "the kinds of trip you pick" in the usage-event description. Not required; the existing sentence "We do not put names, emails or amounts into analytics events" remains true because the events carry no data. Decide with the fixed-name events kept (they are in arch s8).

A3. O1 operational follow-through: put one ready-made aggregate query in the runbook or migration header (for example counting `other_type` values with no join to identity columns) so the operator does not improvise a join. Make "no profiling, ads, recommendations, per-user or per-trip analysis, contacting the organizer" an explicit non-goal line in requirements (arch relies on it implicitly). Optionally note that, once reviewed, `update public.trips set other_type = null` in bulk is allowed (O2).

A4. Live tests (arch U2, s12) create real auth users with the admin API and trips. If run against production, use non-routable addresses (for example `@example.invalid`), no real person's data, clean up in `afterAll`, and record that no email was sent. Prefer the non-production project as designed.

A5. Silent fallback (`typesStored` false): the Other text is dropped without telling the user and no event fires. Compliant (nothing stored, nothing claimed), noted only so the final review confirms the typed text is discarded and not retained client-side.

A6. Rollback note (arch s11): dropping the columns deletes stored Other text, which is also erasure-friendly. No issue.

### Baseline additions

Items 1-6 in "Baseline gaps" above are still not in docs/compliance-baseline.md; add them in the same PR as the feature. Two further suggestions from this pass:

7. Under Consumer-facing claims: "Data that members can read through the API but the UI never shows is still visible to members. Copy and the privacy page must describe it as visible to trip members (or say nothing), never as private to its author."
8. Under Processors and analytics: "Live or manual test suites that create accounts in a real environment use non-routable email addresses, no real personal data, and delete their fixtures; prefer a non-production project."

### Needs legal sign-off (unchanged)

Sufficiency of the legitimate-interest wording for EU/UK users given anonymous users may type personal details into the Other field. Low risk; flagged, not decided.

## Revision 3 review

Mode: requirements re-confirm. Date 2026-10-14. Inputs: requirements.md Revision 3 (criteria 74-100 and Risk surface rows), the baseline, this file, `src/app/layout.tsx` and `src/app/privacy/page.tsx` (skimmed). Not legal advice. The visual fidelity changes (design-audit) raise no legal question and were not audited.

### Stops

None. The shelf is static, reads no data, adds no schema, endpoint, vendor, message or stored value (criterion 94). Tapping a tile stores nothing.

### Findings on the specific questions

1. Welcome page `/` is public and pre-consent. Analytics already runs there: `<Analytics />` is mounted in the root layout, so page views on `/` are already collected and disclosed (privacy page: Vercel Analytics, no advertising or cross-site cookies, no in-app opt-out, block it with browser or extension). The four new events use the same mechanism, vendor and disclosure, with no properties. Vercel Analytics is cookieless (no device storage written by it), so the ePrivacy "consent before storing or reading device data" trigger is not engaged by these events. Position: no consent banner needed for the new events. Marked **(counsel)**: the existing no-opt-out position for EU/UK visitors is already an open question, and this adds four events to it, not a new kind of processing.
2. What the events reveal. `home_template_tapped_camping` and the like record that an anonymous, vendor-hashed visitor tapped a template, with no property, account id, trip or email. Allowed by the baseline rule on closed-set choices in event names. Not personal data in our hands. Criterion 96 (no `/privacy` change) is accepted, with C-R3-5 below.
3. `?type=<code>` in logs, referrers and analytics. A catalog code is not personal data. Hosting logs and Vercel page-view data will contain the URL with the query; the existing "hosting logs" disclosure covers that. Referer: the browser default (`strict-origin-when-cross-origin`) sends only the origin to other sites, so the query does not leave the site. Criterion 84 is sufficient. Never echoing the value (criterion 82) also removes reflection risk.
4. Event semantics. Tap events fire before any account or trip exists, so they cannot be tied to a person, and they stay separate from `trip_type_selected_*` (stored on a created trip). Criterion 85 is right; do not reuse names.

### New constraints (pm: add as acceptance criteria or non-goals)

C-R3-1. Closed-set helper. The tap-event name helper returns nothing for unknown codes, is never built from `searchParams` or other raw input, and excludes `other` (no `home_template_tapped_other`). The guard test asserts every call has exactly one argument (the name). Tie to the ANALYTICS.md row test (criterion 86).

C-R3-2. No identity joined at tap time. No user id, email, session id, trip id or Other text attached to the events. On `/` a tile tap must not trigger anonymous sign-in or any Supabase/fetch call beyond navigation (criterion 94 says no network request; make it a test).

C-R3-3. No client-side persistence of the pick. Criterion 84 already says it; keep it a test (no `localStorage`, `sessionStorage` or cookie write on tile tap or pre-check). This keeps the cookieless position in finding 1 true.

C-R3-4. Query parameter hygiene. Ignore every parameter except a single valid `type`. Do not forward `type` or any other query value into later URLs (the `?tab=list` landing, invite links, redirects) or into `trackEvent`. Do not log the raw query server-side. Non-goal: no `utm_*` or attribution/referrer capture is read or stored.

C-R3-5. Copy and claims. Shelf, first-run card and tile copy stay factual ("N items", "Blank trip"). No lines like "nothing is saved", "no sign-up needed" or "we don't track what you tap" near the shelf: "nothing is stored by tapping a tile" is true of our database but an analytics event is recorded, so keep it as an internal requirement statement only.

C-R3-6. Docs in the same PR. ANALYTICS.md gets the four rows, described as fired on the tap (before navigation, no account), distinct from `trip_type_selected_*`. `LEGAL_LAST_UPDATED` is already bumped for 0.8.0 by the O6 edits; no second bump is needed for Revision 3 if the privacy text is unchanged.

C-R3-7. Public page content is bundled-only. The welcome page renders only bundled catalog strings and counts (criterion 76). If a later change shows trips, a user name or any database value on `/`, it needs its own review.

### Advisory

- Optional privacy wording: the usage-event description could mention "which template you tapped on the home page". Not required; "We do not put names, emails or amounts into analytics events" stays true.
- Anonymous tap counts need no retention rule beyond Vercel's own.
- Catalog types (camping, Airbnb, international) are not special-category; no minors issue.

### Open items needing the user

None for Revision 3. Needs legal sign-off, unchanged: the no-opt-out analytics position for EU/UK visitors now also covers tap events on the public welcome page.

### Baseline gaps

Items 1-8 above are already in `docs/compliance-baseline.md` (verified in this pass). Suggested new rules from Revision 3:

9. Under Processors and analytics: "Events on public or pre-sign-in pages follow the same rules as in-app events: name only, closed set, no properties, no device storage written, and no network call or sign-in triggered by the tap. Adding any cookie, local/session storage or non-cookieless analytics to a public page needs a consent-basis decision first."
10. Under Personal data: "A URL query parameter is allowed only if it carries a closed-set code, is validated on the server, is ignored when invalid, is never echoed, and is not forwarded into later URLs, logs or events."

## Revision 3 design review

Mode: design. Date 2026-10-14. Inputs: requirements.md criteria 74-121 (via architecture traceability), architecture.md section 17, design.md sections 9-15, this file, `docs/compliance-baseline.md`, `src/app/privacy/page.tsx` (analytics lines only). Not legal advice. Skimmed for carry-through; code not yet written, so nothing is verified against code.

Result: no blocking gaps. Every C-R3 constraint is carried into architecture.md section 17 with a named test, and design.md sections 9-15 agree with it. No stop. Five advisories, one of which (X2) should be fixed in the docs before the engineer starts.

### Constraint carry-through

| Constraint | Carried in | Verdict |
|---|---|---|
| C-R3-1 closed-set helper | arch 17.6: `homeTemplateTappedEvent(code)` returns a name only when `isTripType(code)`, no `other` event, `HOME_BLANK_TRIP_EVENT` constant, code comes from the tile prop (17.2), single-argument `trackEvent`, `@vercel/analytics` imported only in `tracking.ts` (scan test); tests in 17.10 (`starter-suggestions.test.ts` rejects `other`, `""`, `"Camping"`, `"__proto__"`, padded; `template-tile.qa.test.tsx` asserts exactly one argument and a hostile `window.location` changes nothing). Design 9.5 agrees (code from catalog, never URL or DOM). | Met. |
| C-R3-2 no identity, no network on tap | arch 17.1 (no Supabase, fetch, route, action), 17.2 (sync handler, no `async`, no `preventDefault`, no `router.push`), 17.10 (`template-tile.qa.test.tsx` spies on `fetch`, browser `createClient`; `revision3-scan.test.ts` forbids Supabase, data layer, `next/headers`, `fetch` in the shelf files). Design 9.5 last bullet. | Met. Note X3 on link prefetch wording. |
| C-R3-3 no persistence | arch 17.5 (pick read once into `useState`, nothing written to storage, `history`, `timeAsync` labels or URL), 17.10 (storage and cookie setter spies on tile tap and on the form). Design 10 ("there is no storage"). | Met. |
| C-R3-4 query hygiene | arch 17.5 (`parseTypeParam`: string only, exact code, no trim or case change, arrays ignored; wrapper reads only `type`, passes only `initialType`, no `redirect`, no `console.*`, no `generateMetadata`, imports only the form and helper; 17.8 proxy drops the query from `next`); `router.push` never carries the type (criterion 109 test); only `trip_create_start` fires on mount. Design 10 table (all junk cases give a blank form, no echo). | Met on forwarding, echo and logging in app code. See X4 for the `utm_*` non-goal (no test, no doc line). |
| C-R3-5 copy and claims | design 9.3 and 15 (exact canvas copy, "No privacy or security claim anywhere near the shelf"), design 13 checklist item "no sentence containing 'nothing is saved' or 'we don't track'", arch 17.10 `template-shelf.test.tsx` and `trips/page.qa.test.ts` banned-phrase scans ("nothing is saved", "no sign-up", "don't track"). First-run card copy ("No trips yet" and "Pick a template above and your list starts with the basics. Your trips will show up here.") is factual. | Met. See X1 on the adjacent chip. |
| C-R3-6 docs in same PR | arch 17.6 (ANALYTICS.md "Home and templates" subsection; intro sentence states the events fire on the tap, before navigation, with no account; closed set; no properties; distinct from `trip_type_selected_*`; four rows; row-per-catalog-code docs test; `revision3-docs.test.ts` checks the "no account" and "closed-set" wording); `LEGAL_LAST_UPDATED` not bumped again (test compares to the 0.8.0 value). | Met. |
| C-R3-7 bundled-only `/` | arch 17.2 (`TemplateShelf` has no data imports, props are only the optional catalog array, empty catalog renders null), 17.4 (`page.tsx` zero diff, hrefs from the catalog), 17.10 (hostile `searchParams` test on `/`, scan test). Design 9.6. | Met. |
| Sec-only items relevant to compliance | `/trip/new` and `/` not session-gated; `/trips?type=x` redirect carries only `next=%2Ftrips`; `src/proxy.test.ts` locks it (17.8). | Met. |
| "No privacy page change needed" (criterion 96, 118) | arch 17.10 rows 96 and 118, 17.11 C-R3-6. Existing text still true: "We do not put names, emails or amounts into analytics events"; Vercel Analytics, page views and usage events are already disclosed (privacy page lines 55-56, 99, 136-138). | Agreed. See X5 on how the "unchanged" check is phrased. |

### Criteria 74-121: compliance-relevant rows

Checked the traceability table (arch 17.10) for the rows with a legal angle. 76 (welcome page), 81-85 and 101-115 (`?type=`, analytics, no persistence, no network), 94 (no schema or API), 96 and 116 (no privacy claim), 111-114 (closed-set events), 117-118 (docs wording, no second date bump), 119 (empty catalog), 121 (baselines) are each mapped to a test or QA step that would catch a regression of the matching C-R3 constraint. Rows 74, 75, 77-80, 86-93, 95, 97-100 are layout, fidelity and process; no legal question. Rows 99, 100 and 120 are process and numbering; the arch 17.12 note about the garbled "0022 vs 0021" wording in criterion 120 is a documentation fix for the pm, no compliance effect.

### Blocking gaps

None, in architecture.md or design.md.

### Advisory findings

X1. Existing stat chip "0 accounts to join" sits on the same welcome page as the new shelf (design 9.6 keeps it "unchanged"; src/app/home-screen.tsx line 211 area). This is a pre-existing consumer-facing claim and not part of this feature, but design.md 15 and criterion 116 say "no privacy or security claim near the shelf", and this chip is within a screen's height of it. The app does create anonymous Supabase accounts for invitees, so "0 accounts to join" is a claim that has to be true in the sense a visitor will read it. Not blocking and not introduced here. Action: pm or product owner confirms the claim is accurate (no email, no password, no sign-up form for invitees) or softens it later; record the outcome in the final report. If counsel is asked about the welcome page anyway, include it. Doc fix: design.md 15 could say "no new privacy or security claim" so the statement is literally true.

X2. Baseline rule wording is not specified in architecture.md. Arch 17.12 notes "compliance 9-10" are missing from `docs/compliance-baseline.md` and says the engineer adds them, and `revision3-docs.test.ts` fails until they exist, but gives no text. Fix in architecture.md 17.10/17.12: say "add items 9 and 10 from 'Revision 3 review, Baseline gaps' in compliance-constraints.md verbatim, under Processors and analytics and under Personal data". Also add the Revision 3 design review baseline suggestions below if the pm accepts them. Re-verified this pass that neither rule is in the baseline yet (a search of the repo finds them only in this file).

X3. "No network request" on tap versus framework prefetch. Criterion 94 and C-R3-2 say a tile tap makes no network request. A Next `Link` to `/trip/new?type=camping` may be prefetched by the framework when it enters the viewport, before any tap, and navigation itself fetches the target page. That is not a Supabase or data call, carries no event, no identity beyond the normal request, and discloses nothing new, so there is no compliance problem. The risk is only a test or QA wording that fails or passes for the wrong reason. Action: in arch 17.10 `template-tile.qa.test.tsx` and in QA, state that the check is "no application-initiated `fetch`, Supabase client call, sign-in or storage write from the click handler", not "no request at all". The click handler is already specified this way in 17.2; the wording of the criterion-94 row just should match.

X4. The C-R3-4 non-goal "no `utm_*` or attribution/referrer capture is read or stored" is carried only implicitly (the wrapper reads only `type`). No test or doc line states it. Action (optional): add one sentence to the arch 17.5 wrapper bullet or the design 10 table: "all other query keys, including `utm_*`, are ignored and never read". The `page.search-params.qa.test.tsx` "extra keys ignored" case already covers behavior.

X5. Criterion 96 / 118 check "privacy page unchanged by Revision 3". `src/app/privacy/page.tsx` is already modified in the working tree for the 0.8.0 "Other" edits (O6), so a plain `git diff` on that file will show changes. Action: phrase the QA check as "no Revision 3 commit touches `src/app/privacy/page.tsx` or `LEGAL_LAST_UPDATED`" or compare to the post-O6 text, so QA does not raise a false failure or wave through a real edit. The `revision3-docs.test.ts` date comparison to the 0.8.0 value is the right automated half.

X6. ANALYTICS.md "Payload Example" column. The example rows show `{ event: "home_template_tapped_camping" }`; keep them exactly that. Do not add a "properties" example or a referrer or path field. The "Why Track" text ("See which templates attract taps before a trip exists") is a true, narrow purpose; keep it that way and do not extend it to profiling or per-visitor analysis.

X7. Note for later: if a fourth catalog type is added (arch 17.2 guard test), the closed-set helper, ANALYTICS rows and the docs test all extend by one code automatically; that addition would need no new compliance review unless the type is sensitive in nature (for example a health, religious or medical trip) or has special-category suggestions. Add that line to the catalog header note required by C9.

### Open items needing the user

None. Needs legal sign-off, unchanged: the no-opt-out analytics position for EU/UK visitors, now covering tap events on the public welcome page.

### Baseline additions (Revision 3 design review)

Items 9 and 10 from "Revision 3 review, Baseline gaps" stand and must go into `docs/compliance-baseline.md` in this PR (see X2). Suggested further additions:

11. Under Consumer-facing claims: "A page edited for a new feature is checked for older claims on the same screen (stat chips, taglines, badges). The review notes any that are not true in the sense a visitor will read them; it does not need to block the feature if the claim predates it."
12. Under Processors and analytics: "A check that a click or tap 'makes no network request' means no application-initiated request (fetch, data-layer or Supabase call, sign-in, storage write) from the handler. Framework link prefetch and the navigation itself are not counted, and are not a reason to skip the check."
13. Under Catalog and suggestion content: "A new catalog type with a sensitive subject (health, religion, sexuality, finances of a named person) needs its own compliance review before it ships."
