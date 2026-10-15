# Compliance final review: starter-list-exploration (0.8.0)

Mode: final. Date 2026-10-13. Reviewed the working tree against compliance-constraints.md (C1-C10, O1-O10, design review) and docs/compliance-baseline.md. Not legal advice.

## Verdict

No blocking findings. No new blocking issue that an earlier mode missed. Two advisories and one baseline-maintenance item remain.

## Verified

| Constraint | Evidence | Result |
|---|---|---|
| O6 privacy: Trip details line | src/app/privacy/page.tsx:41-43 "...the kinds of trip you pick, and, if you choose Other, a short trip type you type (up to 30 characters)" | Met |
| O6 sensitive-data sentence | page.tsx:60-62 lists "trip types" | Met |
| O6 legitimate interest | page.tsx:83-86 "deciding which trip types to add to Splitiful's suggestions (from the short trip type some people type, read by us in aggregate)". Matches O1; claims nothing beyond it | Met |
| O6 date bump | src/lib/legal.ts:5 "October 13, 2026" | Met |
| Analytics sentence | page.tsx:56 unchanged and still true (see events below) | Met |
| O3 / O4 runbook | docs/runbooks/account-deletion-and-export.md:38-45 (export naming, both columns, `to_jsonb(t) - 'invite_code'`, not described as organizer-only), :66-68 case A cascade, :79-82 case B `update public.trips set other_type = null where created_by = '<uid>'`, :110-113 purge | Met |
| 90-day purge cascades to trips | 0001_init.sql:13 `trips.created_by ... on delete cascade`; 0018 deletes from auth.users (0018:49) and its header and `doomed` filter (0018:38-46) confirm trips go with the user, skipping trips with other members or expenses | Verified. Purged rows take `types` and `other_type` with them |
| O7 / C4 analytics | docs/ANALYTICS.md:20-30 five name-only events, "no properties"; :128 lists "Trip type text ... or the number of types picked" under not collected. Code: new/page.tsx:125-133 calls `trackEvent(name)` only, inside `if (typesStored)`; src/lib/tracking.ts:11 signature takes only a name | Met |
| O8 non-display | trips.ts:287 and :367 use TRIP_LIST_COLUMNS / TRIP_VIEW_COLUMNS; other `.from("trips")` selects read name or completed_at/created_by only; no `select("*")` on trips; 0022 does not redefine any non-member RPC | Met |
| O9 server validation | 0022 `trips_types_check`, `trips_other_type_check`, update privilege revoked | Met |
| O10 / logging | trips.ts:14-26 `CreateTripError` carries only a code; new/page.tsx:146-147 catch is bare with fixed copy; no console.* in any new file. Pre-existing `console.error(error)` in src/app/error.tsx:15 receives only thrown render errors, and CreateTripError has no text | Met |
| Typed text not retained | new/page.tsx:44-48 component state only; no storage, URL, event or log; unticking Other clears it (:65-70); on success the page unmounts via router.push. When `typesStored` is false the text is just dropped (createTrip fallback, trips.ts:76) | Met (A5) |
| C7 pending action | verify-inline.tsx:42 "In memory only"; no sessionStorage or localStorage in any new file (the only hit is the pre-existing expense draft restore) | Met |
| C9 catalog | starter-catalog.ts:10-13 content-rule header present. Contents are generic goods. "Prescriptions" and "First-aid kit" are the two the note itself calls fine. Nothing implies religion, health condition, etc. | Met |
| C6 / O5 copy | Helper trip-type-picker.tsx:167-169 "Saved with this trip. Please don't include names or personal details." Shopping list shows "everyone on the trip can see it" (shopping-list-tab.tsx:470). Searched new trip files for private, secure, encrypt, "only you", "never shared": none in new copy (the one hit, settle-up "only you can lock the trip", is an unrelated pre-existing permission message) | Met |
| Vendors / transfers | No new vendor. Text goes to Supabase only | Met |
| /terms | No match for the feature; promises nothing about trip text | Met |

## Blocking

None.

## Advisory

A1. docs/compliance-baseline.md has not been updated. The constraints file lists baseline additions 1-8 and none are present (no matches). The maintenance rule says add them in the same PR. See below. **Superseded by the Revision 3 section: items 1-13 are now all present.**

A2. architecture s9 promises a test that fails if `LEGAL_LAST_UPDATED` still equals "October 12, 2026". I found no test file referencing `LEGAL_LAST_UPDATED`. The date is correctly bumped, so no exposure today. Add the test, or drop the claim from architecture.md. **Superseded: src/lib/legal.test.ts now exists (untracked); see Revision 3 section.**

A3. (carried from design review) No ready aggregate query for the operator and no explicit non-goal line in requirements for the O1 limits. requirements.md:238 does contain the purpose-limit line, so the non-goal part is closed. The query is still absent. Suggested, to keep the operator from improvising a join: `select other_type, count(*) from public.trips where other_type is not null group by 1 order by 2 desc;` in the runbook. **Superseded: now in runbook lines 48-56.**

A4. Live tests create real auth users (design A4). Use non-production, `@example.invalid` addresses, and clean up. I did not run them.

A5. Silent drop of the Other text when the database lacks migration 0022 is compliant (nothing stored, nothing claimed). Apply the migration before the app deploys, as the migration header says.

A6. Design D1 and D2 (design.md describing sessionStorage and a denylist): the code follows architecture (in-memory slot). Confirm design.md was corrected; documentation consistency only.

## Needs legal sign-off (not decided here)

- Whether the legitimate-interest wording on /privacy is sufficient for EU/UK users, given anonymous users may type personal details into Other and that the app offers no edit after create (erasure is by email via the runbook).
- Existing open items on the runbook case B (soft-deleted organizer, trip retained) meeting erasure obligations are unchanged.

## Baseline additions (docs/compliance-baseline.md, same PR)

Personal data:
1. Any new column that accepts user-controlled values needs database-side validation (allowed set, length, charset), since anonymous accounts can write to it directly.
2. User-typed free text is treated as potentially personal data. It needs a stated narrow purpose, a retention rule, an export and erasure entry in the runbook (including the retained-trip case, where it is cleared), and a privacy-page line, in the same PR.
3. Fields collected for a future use, with no reader in the current release, need a concrete stated purpose before they are stored.
4. Trip or entity previews served to non-members (invite and join pages) must not return user-typed free text beyond fields already disclosed there.

Processors and analytics:
5. Events that encode a user choice in the event name are allowed only for a closed, code-defined set; never user-entered text, its length or its presence as a property.
6. Live or manual test suites that create accounts in a real environment use non-routable addresses and no real personal data, delete their fixtures, and prefer a non-production project.

Consumer-facing claims:
7. Helper text may state facts and instructions (do not enter personal details), not privacy or security claims or purposes the privacy page does not state.
8. Data members can read through the API but the UI never shows is still visible to members. Describe it as visible to trip members, or say nothing, never as private to its author.

---

# Revision 3 final review (home template shelf, `?type=` pre-check)

Mode: final. Date 2026-10-14. Read-only review of the working tree (nothing committed) against compliance-constraints.md ("Revision 3 review" C-R3-1..7, "Revision 3 design review" X1-X7) and docs/compliance-baseline.md. Nothing was run, no database or port 3000 touched. Not legal advice.

## Verdict

No blocking findings. No new blocking issue that an earlier mode missed. The baseline now contains Revision 3 rules 9-13 and the earlier 1-8, so no baseline additions are outstanding. Four advisories and one product-owner item (X1).

## Verified against the actual code and docs

| Check | Evidence | Result |
|---|---|---|
| Closed-set helper (C-R3-1) | src/lib/starter-suggestions.ts:59-61 `homeTemplateTappedEvent(code)` returns a name only when `isTripType(code)`, else `undefined`; `:63` constant `HOME_BLANK_TRIP_EVENT = "home_blank_trip_tapped"`. `other` is not in the catalog set, so no `home_template_tapped_other`. Guard test starter-suggestions.test.ts:67-73 | Met |
| Name only, one argument | src/lib/tracking.ts:11 `trackEvent(eventName: string)` calls `track(eventName)` with no second argument. template-tile.tsx:33 and :59 pass the name only. template-tile.qa.test.tsx:63, 75, 84 assert `calls[0]` equals `[name]` (exactly one argument). revision3-scan.test.ts:46-51,65-69 limits `trackEvent` use among Revision 3 files to the tile and `@vercel/analytics` imports to tracking.ts (plus layout) | Met |
| Code source is the bundled catalog, not URL/DOM | template-tile.tsx:23,32 uses the `code` prop, which template-shelf.tsx:33 takes from `STARTER_TYPES`. Test template-tile.qa.test.tsx:71-77 shows a hostile page URL (`?type=international&utm_source=x`) does not change the name | Met |
| Fired on tap, before navigation, no account | `onClick` on a `Link` (template-tile.tsx:30-37, 57-63): synchronous, no `async`, no `preventDefault` (asserted at qa test :64), no `router.push`. Nothing fires on render (qa test :44-52). No account or session is involved | Met |
| No storage/cookie write or app-initiated network call from tap handlers (baseline rule 12 sense) | Handlers contain only the guarded `trackEvent`. The tile files import no Supabase, data layer or fetch (count of matches for localStorage/sessionStorage/cookie/fetch/createClient/supabase across template-tile.tsx, template-shelf.tsx, trip-type-icons.ts: 0). qa tests spy on `fetch`, browser `createClient` and `Storage.prototype.setItem` on render and tap (:44-69) | Met. See advisory R3-A1 (cookie not spied) |
| `?type=` handling (C-R3-4, baseline rule 10) | src/app/trip/new/page.tsx:10-17 reads only `type`, passes `parseTypeParam(type)` (starter-suggestions.ts:71-73: string only, exact catalog code, arrays ignored) as `initialType`. No `redirect`, no `console.*`, no echo, no `generateMetadata`; the doc comment states `utm_*` and all other keys are never read. page.search-params.qa.test.tsx:27 covers extra keys and :75 locks the thin-wrapper shape | Met |
| `type` not forwarded into URLs/events/logs | new-trip-form.tsx: `initialType` used once, to seed `useState` (:51). `router.push` targets are `/trip/${tripId}?tab=list` or `/trip/${tripId}` (:150), never carrying the type. `trackEvent` calls: `trip_create_start` on mount (:58), `trip_create_complete`, `trip_type_selected_*`, `trip_type_selected_other` on success only (:130-138). No tap-time event reuses these names | Met. Note: the `?tab=list` landing is a fixed literal, not derived from the query |
| `/` renders bundled catalog strings only (C-R3-7) | template-shelf.tsx:1-3 imports only `Kicker`, the tile leaves and `STARTER_TYPES`; labels and counts come from the catalog (`type.items.length`). src/app/page.tsx passes no search param except `signin` to `HomeScreen`. page.shelf.qa.test.tsx:54-57,72 feeds hostile params and asserts nothing is echoed and `/` does not reference the shelf, `type` or `trackEvent`. Note: page.tsx performs the pre-existing server-side session check and redirect for returning users; that is existing behavior and puts no database value on the page | Met |
| ANALYTICS.md rows and wording (C-R3-6, X6) | docs/ANALYTICS.md:32-41: subsection "Home and templates"; intro says fired "on the tap, before navigation, with no account", nothing "created, stored or sent to the database", closed set from bundled catalog codes, no `home_template_tapped_other`, no properties, distinct from `trip_type_selected_*`. Four rows (camping, airbnb, international, blank). Payload examples are exactly `{ event: "<name>" }` with no properties, referrer or path. "Why Track" text is narrow and unextended. revision3-docs.test.ts:14-19 ties each catalog code to a row and forbids an `other` row | Met |
| Copy factual (C-R3-5) | Shelf: "Start from a template", per-tile "Camping, 18 items" style labels, "Blank trip" (template-shelf.tsx:26; template-tile.tsx:29,67). First-run card: "No trips yet" / "Pick a template above and your list starts with the basics. Your trips will show up here." (trips/page.tsx:156-158). No "nothing is saved", "no sign-up", "we don't track". Banned-phrase scans: trips/page.qa.test.ts:155, template-shelf.test.tsx:81 | Met |
| Privacy page limited to earlier edits (X5) | src/app/privacy/page.tsx: the only trip-type text is the earlier "Other"/trip-types edits (lines 41-43, 60-62, 83-86). No mention of the home shelf, templates or tap events. The analytics sentence at :55-56 is unchanged. I cannot diff against a commit in read-only mode, so "no Revision 3 edit" rests on there being no Revision 3 text and on LEGAL_LAST_UPDATED below | Met |
| `LEGAL_LAST_UPDATED` | src/lib/legal.ts:5 "October 13, 2026" (the 0.8.0 value, not bumped again). src/lib/legal.test.ts exists; revision3-docs.test.ts compares to the 0.8.0 value per arch | Met. Closes earlier A2 |
| Runbook: case B nulls `other_type` | docs/runbooks/account-deletion-and-export.md:89-92 `update public.trips set other_type = null where created_by = '<uid>';` with operator-only note | Met |
| Runbook: aggregate query | :48-56 aggregate-only rule, no join to identity, query given. Closes earlier A3 | Met |
| Runbook: release checks | :127-145 section 5: apply 0022 before the app deploy; live suite with `@example.invalid` addresses on a non-production project; verify SQL run before merge; `create_trip` overload checks. Marked "none has been executed against a real database yet" | Met on documentation. Not executed (see R3-A4) |
| Catalog header note (C9) and X7 | src/lib/starter-catalog.ts:10-18: generic-category content rule, plus "A new type with a sensitive subject (health, religion, sexuality, finances of a named person) also needs its own compliance review before it ships." | Met. X7's added sentence is present |
| Baseline contains Revision 3 rules | docs/compliance-baseline.md: rule 9 at lines 55-59 (verbatim, under Processors and analytics); rule 10 at lines 38-40 (verbatim, under Personal data); rule 11 at lines 104-107; rule 12 at lines 60-63; rule 13 at lines 108-109. Earlier rules 1-8 at lines 29-37, 41-42, 50-54, 64-66, 96-98 and 110-112 are also present | Met. Maintenance rule satisfied |

## Blocking

None.

## Advisory

R3-A1. The tile test names "storage or cookie" (template-tile.qa.test.tsx:44) but spies only on `Storage.prototype.setItem`, not on the `document.cookie` setter. The handlers contain no cookie code and the scan test covers imports, so there is no exposure today. Add a `document.cookie` setter spy for the claim in the test name to be literally guarded (baseline rule 9).

R3-A2. Baseline rule 12 wording (no application-initiated request from the handler; framework prefetch and navigation not counted) is what the tests check. The ANALYTICS.md intro says "nothing ... sent to the database", which is true. Do not describe the tap in any copy or doc as making "no request" without that qualification.

R3-A3. Vercel Analytics tap counts are covered by the existing page-view disclosure (privacy page lines 55-56, 99, 136-138); no wording change is required. Optional only: mention "which template you tapped on the home page" in the usage-event description. If added, bump `LEGAL_LAST_UPDATED` and update `legal.test.ts` (rule: any data-handling text change).

R3-A4. Release checks in the runbook section 5 have not been executed against a real database (the runbook says so). Not a code defect. Before merging, the owner runs them as written (non-production first, `@example.invalid` addresses, fixture cleanup) and saves the output with qa-report.md.

## Product owner item (X1), not blocking and pre-existing

The welcome page `/` shows a stat chip "0 / accounts to join" (src/app/home-screen.tsx:213-216), within a screen of the new shelf. Related pre-existing line: "no account needed to start" (home-screen.tsx:177). The app creates an anonymous Supabase account when a visitor creates or joins a trip (the `/trip/new` flow starts the anonymous session on submit, per the comment at home-screen.tsx:136-138), and email verification is later offered. In the sense a visitor will read it ("I do not have to create an account"), the chip is arguably accurate for a sign-up form, but it is not literally true that no account exists. Neither line is introduced by Revision 3 and they do not block it. Action for the product owner: confirm the claim is acceptable (no email, no password, no sign-up form to start) or soften it (for example "no sign-up to join" or drop the chip), and include both lines if counsel is asked about the welcome page.

## Needs legal sign-off (unchanged, not decided here)

- The no-opt-out Vercel Analytics position for EU/UK visitors now also covers tap events on the public welcome page. These events are name-only, closed-set, cookieless, and have no identity attached. Counsel confirms the position holds.
- Sufficiency of the legitimate-interest wording for the "Other" trip type text (0.8.0, unchanged).
- Runbook case B (soft-deleted organizer, trip retained) meeting erasure obligations (existing open item).

## Baseline additions still missing

None. Rules 1-13 from compliance-constraints.md are all present in docs/compliance-baseline.md. No new rule arises from this review. Optional: add to rule 9's wording that the guard test should cover `document.cookie` (R3-A1), only if the owner wants the rule to name the cookie spy explicitly.

## Revision 4 delta review (user-test feedback, UI only)

Read-only review of the working tree. Nothing was run against a database or port 3000. Verdict: **no blocking findings**, nothing new that an earlier mode missed.

**Verified**
- `/trips` rows show name, type icon, "date · N people · total", balance or "Settled up", and a Locked pill. The "Trip" pill and avatar stack are gone, which only reduces what is displayed. Total and balance still reach only members (RLS scopes the query to the caller's trips).
- Suggested card captions and the floating notice ("Added '<name>' — everyone on the trip can see it.") are factual; no privacy or security claims. The "visible to trip members" wording is true.
- New trip: field order only. Helper text unchanged ("Saved with this trip. Please don't include names or personal details."). Analytics still name-only (`trip_create_start`, `trip_create_complete`, `trip_type_selected_*`, `trip_type_selected_other`); no new event or property.
- `overflow-hidden` -> `overflow-clip` is layout only.
- `TRIP_LIST_COLUMNS` now includes `types` (closed-set code, not personal). `other_type` is still absent from both column lists; a grep test enforces it.
- CHANGELOG entries are factual. Runbook section 5 requires the FIXED 0022 `trips_types_check` and the post-apply 1/2/3-type, Other-only and Other+types checks. `LEGAL_LAST_UPDATED` is unchanged ("October 13, 2026"); ANALYTICS.md has no Revision 4 rows.

**Advisory**
- R4-A1: `getMyTrips` still does `trip_members select("*")` per trip although `/trips` now uses only the count. Nothing newly exposed (caller's own trips); selecting just `trip_id` would better minimize data. Optional, pre-existing.
- R4-A2: the "N people" count on the row is a member count, not personal data.
- R4-A3: runbook section 5 checks are still unexecuted against a real database; the owner runs them before merge and saves the output with qa-report.md.
- R4-A4: CHANGELOG says "Proposed version 0.8.0" while package.json is unbumped (documentation only).

**Legal sign-off still open (unchanged):** (1) legitimate-interest wording for the typed "Other" text and no edit-after-create; (2) the Vercel Analytics no-opt-out position for EU/UK visitors, now including the home tap events; (3) runbook case B (soft-deleted organizer, trip retained); (4) product-owner item X1, the "0 accounts to join" chip and "no account needed to start" line on the welcome page (pre-existing, not blocking).

**Baseline additions still missing:** none (rules 1-13 present in docs/compliance-baseline.md).
