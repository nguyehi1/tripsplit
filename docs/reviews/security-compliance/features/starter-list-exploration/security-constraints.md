# Security constraints: starter-list-exploration (0.8.0)

Mode: requirements. Reviewed against requirements.md, docs/security-baseline.md, migrations 0001, 0002/0003, 0015, 0020 and src/lib/data/trips.ts.

## Verdict

No **stop**. The design (a closed-set array on `trips`, client-side suggestions, "+" reusing the verified-member insert) can be made safe. Two decisions are flagged below (D1, D2) because the obvious shapes have traps.

## Attacker view (free anonymous account)

1. Create trips with garbage `types` (huge array, huge strings, duplicates, unknown values) to bloat rows or break the Suggested card renderer.
2. Bypass `create_trip` and insert into `public.trips` directly. Migration 0001 has an `authenticated users can create trips` INSERT policy (`created_by = auth.uid()`), and anonymous sessions use the `authenticated` role. So any validation placed only in the RPC is bypassable. The DB constraint must be on the column.
3. Tamper with `types` after creation (UPDATE). No UPDATE policy on `trips` exists today, so this is blocked by RLS. It must stay that way (see C6).
4. Call "+" while unverified, or as a non-member, to write list items. Blocked by the existing policy `verified member can add shopping list items` (0015); nothing here changes it.
5. Spam "+" to flood a list. Same exposure as manual add today; the catalog is at most about 45 names, and items are ordinary rows. No new capability.

## Constraints (pm can add as acceptance criteria)

**C1. Server-side validation as a column CHECK, not only in the RPC.** `trips.types` must have a CHECK constraint (or a validated immutable function used in a CHECK) enforcing all of: not null or null-tolerant per migration choice; every element is in the allowed set (`camping`, `airbnb`, `international`); no duplicate elements; `cardinality(types) <= 3`. This covers both `create_trip` and the direct-INSERT path. Add acceptance criterion: "a direct insert into trips with `{bogus}`, `{camping,camping}`, or 4+ elements is rejected by Postgres."

**C2. Migration safe on populated tables.** Add the column as nullable or `not null default '{}'` (constant default, no table rewrite concern on current PG). Add the CHECK in the same migration; existing rows (null or empty) must satisfy it. Next free number (0022 at implementation time); never edit 0001/0020. Verify live against Postgres, not only CI (0013 lesson). Include a `.qa.test.ts` for the constraint and for the old-signature call.

**C3. Old/new compatibility (see D1).** Old client + new schema: the old 5-argument `create_trip` call keeps working. New client + old schema: trip creation must not hard-fail.

**C4. Grants and search_path on any new or replaced function.** `security definer`, `set search_path = public`, `revoke ... from public` then `grant execute ... to authenticated` only; explicitly `revoke ... from anon` (0002 then 0003 were both needed in the past: revoking from `public` does not remove the anon grant). Qualify column references (`public.trips.invite_code`, as 0001 does) to avoid the 0013 shadowing bug, particularly since a new parameter such as `_types` must not collide with the `types` column.

**C5. Read access.** `types` is read through the existing trips SELECT policy (`is_trip_member(id) or created_by = auth.uid()`), which already lets the organizer read their own trip before verification. No policy change. Select only the needed column set in the data layer (no `select *`).

**C6. No UPDATE path.** Do not add an UPDATE policy or column grant on `trips.types` (editing types is a non-goal). Add a QA check that an authenticated member cannot `update trips set types = ...`.

**C7. "+" gate unchanged (criteria 15, 16).** The add must use the existing `shopping_list_items` insert and its policy; no new RPC, no loosened grant, no client-only gate. The UI hiding of "+" is UX only. QA must prove an unverified user and a non-member are rejected by the database (not just the UI) when inserting a catalog item name.

**C8. Pending-action replay (Open question 1).** If the "complete the add automatically after OTP" mechanism is built, the pending action may store only the catalog item key or name and trip id in client state (memory or sessionStorage), must be re-validated server-side on replay (the same insert policy applies), must be cleared after use or on sign-out, and must not be passed via URL query params or logged. The trip id must be one the user is a member of; the insert policy enforces that.

**C9. Catalog item names are inserted as ordinary item text.** They must pass the same name length/trim validation as manual add. Add a test that every catalog name satisfies the shopping-list name constraint from 0015 (so a catalog edit cannot produce a name the DB rejects, which would leave the "+" silently failing).

**C10. Analytics.** Events remain name-only via `trackEvent(name)`. Per-type events (`trip_type_selected_camping` etc.) are acceptable because the name is from a closed set; no trip id, invite code, item text or count as a property. Do not fire on error (criterion 20). Per-type event names are fine; do not build the event name from unvalidated input.

**C11. No new logging of item names or trip ids; no invite code in any new URL, event or log.** The New trip form must keep having no invite row (criterion 4).

**C12. Error handling.** The "+" and create-trip failure paths show generic copy; do not surface raw Postgres/constraint messages (a CHECK violation message names the constraint and column).

**C13. Rate limiting.** Not required: no new anonymous-callable endpoint or RPC. If the architect adds a separate RPC (for example `set_trip_types`), it becomes in scope for the `rpc_rate_limits` design and must check `created_by = auth.uid()` server-side. Avoid it (see D1).

## Decisions flagged

**D1. How to add `types` to `create_trip` without breaking deploy ordering.** Not a stop, but the straightforward `create or replace function create_trip(..., _types text[] default '{}')` is a trap: it creates a second overload (6 args) next to the old 5-arg one rather than replacing it. Calls with named arguments that omit `_types` can become ambiguous, and the old grants/revokes (0002/0003) apply to the old signature only, so the new overload would need its own revoke-from-public and revoke-from-anon. Safe options:
- Preferred: keep the old 5-arg function untouched (old client keeps working), add the new overload with the new argument and explicit grants (C4). The new client calls the 6-arg form only when types are chosen; if the RPC fails because the overload does not exist (migration not applied), fall back to the 5-arg call so creation never hard-fails (loses types only). Ordering rule: apply the migration before the Vercel deploy.
- Alternative: a second step after create that updates types. Rejected because it needs an UPDATE path on `trips` (violates C6) or a new RPC (C13).
Architect to pick and justify; the fallback in the new client is required either way.

**D2. Direct-INSERT bypass.** Because trips has a direct INSERT policy, consider whether to leave it (accepted today; C1 makes it safe for `types`) or revoke direct insert as 0001 did for `trip_members`. Revoking is out of scope here and could break old clients; C1 is sufficient. Recorded so the architect does not rely on RPC-only validation.

## Notes (non-blocking)

- Open question 1: showing the Suggested card read-only to an unverified organizer is fine from a security view because the card is derived from public bundled data and `types` the organizer already owns. No data leaks either way.
- Open question 4 (deleted items reappear) and 5 (no editing) have no security impact; no editing keeps C6 simple.
- Privacy/export/deletion: `types` is non-personal and lives on the `trips` row already covered by cascade deletion (`created_by ... on delete cascade`). Agreed with the risk table.
- No new dependency is expected.

## Baseline gaps (rules to add to docs/security-baseline.md)

1. "Validate new columns with a table CHECK constraint, not only inside an RPC, when a direct-write RLS policy exists on the table (check `pg_policies` for INSERT/UPDATE policies; anonymous sessions use the `authenticated` role)."
2. "Changing an RPC's signature with `create or replace` creates a new overload; the old overload keeps its grants and the new one needs its own `revoke ... from public, anon` and `grant ... to authenticated`. Keep the old signature working and give the new client a fallback."
3. "Pending-action replay after an auth gate (OTP): store only closed-set identifiers client-side, never in URLs or logs, and re-authorize server-side on replay."

---

# Re-review: "Other" typed trip type (requirements mode, 2026-10-13)

Reviewed: requirements.md (Risk surface, criteria 41-53, Open questions 6-9), migrations 0001, 0009/0012/0013/0016/0017 (public RPCs), 0015, 0018, and every trips read in `src/` (`src/lib/data/trips.ts`, `src/app/trips/page.tsx`, `src/app/api/join`, `src/app/api/trip-email`, `src/app/api/trip-invite/[code]`, `check-email`, `join/[code]`, `join/[code]/welcome`, `trip/[id]/invite`).

## Verdict

**No stop.** The Other text can be made safe as a nullable, CHECK-constrained column on `trips`, written only at create, read by no one in 0.8.0. C1-C13 and D1/D2 above still stand. New constraints are O1-O12. Two statements in requirements.md are inaccurate and should be corrected (O5, O9).

## Attacker view (anonymous account, Other text)

1. Direct INSERT into `trips` (policy `authenticated users can create trips`, 0001:72) with arbitrary `other` text, bypassing the RPC: huge string, newlines, markup, bidi/zero-width characters, formula-leading text (`=cmd|...`). Only a column CHECK stops this.
2. Store text that later bites the admin/roadmap reader: CSV/spreadsheet formula injection when the owner exports "Other" values, terminal or bidi spoofing in the admin SQL console, or stored XSS if a later release renders it unescaped.
3. Bulk-create trips to bloat the table or fill the roadmap data with junk. Same capability as today with trip `name`/`location`, plus about 120 bytes per row.
4. Read other people's Other text. Any trip member (including an anonymous joiner via invite) can `select` it through PostgREST, because RLS is row-level (see O5).
5. Make creation fail in a way that echoes the text: a CHECK violation's `details` field contains the whole failing row (see O9).

## New constraints (pm can add as acceptance criteria)

**O1. Storage shape.** Recommend "Other" is represented solely by the text column being non-null, with no `other` code in `types`. This keeps the `types` closed set at 3 and removes the marker/text mismatch class. Column nullable, no default (or default null), CHECK in the same migration, next free number (0022 at implementation time). Existing rows (null) must satisfy it. Add a separate `octet_length(col) <= 120` bound in the same CHECK (30 characters of 4-byte code points).

**O2. Charset/length CHECK (answers Q8).** On the column itself, not only the RPC (criterion 48 stays). The CHECK must enforce all of:
- `char_length(col) between 1 and 30`, `col = btrim(col)` (so no leading/trailing space), and only the ASCII space U+0020 as whitespace (no tab, newline, NBSP U+00A0, U+2000-U+200A, U+2028/2029, U+3000). No two consecutive spaces (reject, do not collapse in the DB; the client and RPC collapse before insert).
- First character is a letter or digit. This blocks formula-injection starts (`= + - @`) for the later admin export, and leading punctuation tricks.
- Reject all control characters (U+0000-001F, U+007F-009F).
- Reject invisible and direction-control characters: U+200B-200F, U+202A-202E, U+2060-2064, U+2066-2069, U+FEFF, U+00AD, U+061C. These enable spoofing and make "30 characters" misleading.
- Reject markup/escape-significant characters: `< > " \` \ { } [ ] | ; = + @ # % $ ^ * ~ ( ) :`. Permitted punctuation: `- ' & , . /` (as the requirement says) plus the ASCII space. Keep `&` only because it is requested; it is harmless once escaped.
- **Letters and marks.** Allow letters (any script), combining marks and digits. Postgres regex has no `\p{L}`; `[[:alpha:]]` is collation-dependent and can reject combining marks (Vietnamese NFD, Thai, Devanagari vowel signs). The architect must either use an explicit denylist as above plus a "no emoji/symbol" range rule, or an allowlist that includes the combining-mark ranges, and must prove it **live on the Supabase Postgres collation**. Required QA accept cases: "Ski weekend", "Chuyen di Da Lat" with and without diacritics in both NFC and NFD forms, "Cắm trại", Japanese "キャンプ", Arabic, Thai, a valid 30-character value. Required reject cases: empty, spaces only, 31 characters, newline, tab, NUL, `<script>`, `=1+1`, leading space, trailing space, double space, U+202E, U+200B, NBSP, and an emoji.
- **Emoji decision: not allowed in 0.8.0.** Emoji need ZWJ (U+200D), variation selectors and skin-tone modifiers, which collide with the invisible-character rule and make the char count differ across clients. The text is never displayed, so allowing emoji has no product value. If the user wants them later, that is a separate decision with its own review.
- Unicode normalization: the RPC and client normalize to NFC before insert. The CHECK need not require NFC (it would reject legitimate NFD pastes the client failed to normalize), but the QA must show both forms are accepted.

**O3. `types` CHECK reminders (apply criterion 29 with these tests).** Also test `{NULL}`, `{camping,NULL}`, a multi-dimensional array, and mixed case `{Camping}`. If duplicate detection needs a subquery, use an immutable SQL function in the CHECK (subqueries are not allowed directly).

**O4. Overload ambiguity (strengthens D1/criterion 32).** The new `create_trip` overload must declare `_types` and the Other parameter **without defaults**, so a 5-named-argument PostgREST call matches only the old overload. With defaults, the old 5-arg call matches both signatures and PostgREST returns PGRST203 (ambiguous), which would break old clients and the new client's own fallback. Name the Other parameter so it does not collide with the column (for example `_other_type`, with the column qualified as `public.trips.other_type`, the 0013 shadowing lesson). The new overload needs its own `revoke ... from public`, `revoke ... from anon`, `grant ... to authenticated`. QA asserts via `has_function_privilege`/`information_schema.routine_privileges` that `anon` cannot execute either overload.

**O5. Who can read the text (corrects Risk surface row 1 and 7).** The statements "shown to nobody" and "not shown to anyone" are true only for the UI. At the API level every trip member, including an anonymous joiner holding an invite link, can read `trips.<col>` through the existing SELECT policy, and this cannot be fixed by omitting it from select lists. Decision for the pm, not a stop: **accept** (members already see the trip name and location, which are also free text and can carry personal data), and state it accurately in the risk table and in `/privacy`/the runbook; do not write copy that says only the organizer can see it. The safe alternative if the user wants organizer-only is a separate `trip_custom_types` table with owner-only RLS and its own CHECK, written in the same create RPC; that conflicts with criterion 47 ("stored on the trips row") and is not recommended for a 30-character field nobody reads. A column-level `revoke select` on `trips` is not recommended: it breaks `select("*")` readers and old clients.

**O6. Data paths that must NOT return the column (criterion 51, verified).**
- Public/anonymous RPCs: `get_trip_by_invite_code` (0013:84, explicit column list, anon-callable), `get_trip_summary` (0016:33, explicit list, anon-callable), `join_trip`, `join_trip_by_id`, `get_trip_view` if present. All use explicit column lists today. Constraint: the new migration must not redefine or `drop`/recreate any of these, must not add `types` or the Other column to any `returns table`, and no function may be written as `returns setof public.trips` or `select t.*`. QA greps the new migration and the live function definitions (`pg_get_functiondef`) for the column name.
- Server routes: `src/app/api/join/route.ts:68` and `src/app/api/trip-email/route.ts:33` select only `name`; `src/app/api/trip-invite/[code]/route.ts` wraps the RPC. Keep as is. `trip-email` must never interpolate the Other text.
- **Existing `select("*")` on `trips`** at `src/lib/data/trips.ts:227`, `src/lib/data/trips.ts:307` and `src/app/trips/page.tsx:100` will start returning the new column to every member's browser the moment it exists (these are not "pages that don't need it"). Criterion 34 requires replacing them with explicit column lists in this feature, listing `types` only where needed (trip view). `src/lib/supabase/types.ts` must be regenerated or edited so the typed row does not leak the field into view models. Add a test/grep that no `from("trips").select("*")` remains.
- Invite, check-email, join and welcome pages get trip data only via the RPCs above and `getTripView`; none may add the field.

**O7. Rendering/XSS (criterion 52, plus).** React text rendering only; no `dangerouslySetInnerHTML`, no markdown, no `href`/URL building, no use in `<title>`/metadata, no email template, no `innerHTML` in any admin script. The O2 charset is defense in depth, not a substitute for escaping. Add a rule: if a later release displays it, a new security review is mandatory (output escaping, moderation path, who sees it).

**O8. Anonymous abuse and rate limit (answers Q7): no new rate limit in this feature.** Reasons: (a) the incremental cost is at most about 120 bytes per row on a path that already accepts unbounded `name` and `location` text (neither has a length CHECK in 0001); (b) the direct-INSERT policy lets an attacker skip the RPC, so a throttle inside `create_trip` would not bound anything, and with two overloads a throttle on one would be bypassed through the other (exactly the 0017 lesson: a throttle on one entry point is bypassable via another); (c) abandoned anonymous accounts and their trips are purged by 0018 after 90 days, which bounds retention. Record as a **note/backlog, not blocking**: trip creation is unthrottled and `name`/`location` have no length CHECK. If the owner wants this closed, the real fix is a separate piece of work: revoke the direct INSERT policy (D2) plus throttle the RPC across both overloads. Do not claim in the requirements that CHECKs make bulk creation safe; they bound row size only.

**O9. Error and log leakage (criteria 35, 36, 53).**
- A Postgres CHECK/not-null violation's `error.details` contains the **entire failing row** (trip name, location, Other text, `invite_code` if set by default is not in the values but name and text are) and `message` names the constraint and column. The create-trip catch path must map any error to fixed generic copy and must not `console.*`, forward, or attach the error object to perf-log (`src/app/api/perf-log`), analytics or error reporters. QA test: force a CHECK failure and assert the UI string contains neither the typed text nor "violates", "constraint" or the column name.
- Fallback to the 5-arg call fires only on the "function not found" signals (PostgREST `PGRST202`, Postgres `42883`), never on `23514` (check violation) or other errors, otherwise a rejected Other text would silently create a trip without it and hide validation failures.
- The Other text must not appear in: the URL or query string, router state, `localStorage`/`sessionStorage` (no draft persistence), `timeAsync` labels in `src/lib/perf/timing.ts`, the perf-log payload, `document.title`, analytics (fixed event name only, criterion 53), or the pending-action replay (criterion 26). Use `autoComplete="off"` on the input. RPC calls are POST bodies, so the text does not enter URL-based server logs; do not add a GET path that carries it.
- Event `trip_type_selected_other` (Q9): acceptable as a fixed name with no properties, fired only after a successful create that stored text. No security objection.

**O10. No write path after create (criterion 33, extended).** No UPDATE policy or column-level update grant on `trips` for the new column or `types`. QA: an authenticated member and the organizer both fail `update trips set <col> = ...` (RLS zero rows or permission denied), proven against the database.

**O11. Migration safety.** Adding a nullable column with a CHECK that existing rows satisfy (null passes). Use `add column ... null` then `add constraint ... check (col is null or (...))`, or the inline form, in one migration; do not add `not valid` unless needed. Live-verified against Postgres, plus the 0013 lesson (CI-green but prod-broken). Old code + new schema: old `create_trip` and old `select("*")` keep working. New code + old schema: fallback per O9. Document apply-migration-before-deploy.

**O12. Export/deletion/privacy (criterion 38, 24).** Security agrees the text must be treated as potentially personal. Retention is bounded by the existing cascade and 0018 purge. Security has no objection to leaving it on a retained trip, but the runbook must say which; this is the compliance reviewer's decision (Q6). Q6 from a security standpoint: a narrower stated purpose is better ("to decide which trip types to add next"); vague purposes tend to expand into unreviewed uses. Not blocking.

## Open-question answers (security view)

- Q6: narrower purpose preferred; no security impact either way.
- Q7: no new rate limit (O8).
- Q8: letters in any script, combining marks, digits, ASCII space, `- ' & , . /`; no emoji; no invisible/bidi characters; first character letter or digit (O2).
- Q9: fixed-name event is fine (O9).

## Baseline gaps (add to docs/security-baseline.md)

Items 1-3 from the earlier review still apply. New:
4. "Free text typed by users into a stored column: put a charset/length CHECK on the column (reject control, bidi, zero-width and invisible characters, markup-significant characters, and formula-leading first characters) and test it live on the real Postgres collation, including non-Latin and NFD input. Decide emoji explicitly."
5. "A Postgres constraint-violation error's `details` includes the whole failing row. Never log, forward or display raw database errors from writes that carry user text; map to fixed copy."
6. "New function overloads: new parameters get no default values, so old-signature named calls cannot become ambiguous (PGRST203). Fall back to the old signature only on function-not-found errors, never on constraint errors."
7. "When adding a column that must not reach other users, audit every `select('*')` and `returns setof <table>`/`t.*` on that table; RLS is row-level, so any member who can read the row can read the new column through the API. State this accurately in the risk table."
8. "A throttle on one RPC overload or entry point is not a limit if a direct-write policy or a second overload exists; list all write paths before claiming rate limiting is or is not needed."

---

# Design review (design mode, 2026-10-13)

Reviewed: architecture.md, design.md, docs/adr/0014-trip-types-column-checks-and-create-trip-overload.md, docs/adr/0015-in-memory-single-item-replay-after-inline-verification.md, against C1-C13, D1, D2, O1-O12. Also read migration 0001 (create_trip, complete_trip), src/lib/pending-action.ts.

## Verdict

No stop. Every constraint is carried into architecture.md and the ADRs. **One blocking documentation gap** (design.md contradicts the reviewed replay design and would have the engineer build an unreviewed sessionStorage path). Four should-fix items and several notes.

## Coverage check (all carried)

| Constraint | Where | Result |
|---|---|---|
| C1/O3 CHECK on column, NULL-safe | arch 3: `cardinality=0 or (array_ndims=1, array_lower=1, <=3, array_remove null count, <@ closed set, pairwise IS DISTINCT FROM)`; NULL/multi-dim/case tests in live suite | OK. Verified by reasoning: `array_ndims('{}')` is NULL, which is why the `cardinality=0 or` guard is needed and present; `{NULL} <@ set` is false; `IS DISTINCT FROM` against absent 2nd/3rd elements is true, so shorter arrays pass. Engineer must keep the guard. |
| C2/O11 migration safety | arch 3, 11; nullable/constant default, no `not valid` | OK. See N3 (explicit transaction). |
| C3/D1/O4 overload | arch 4, ADR 0014 #3: 7-arg, no defaults, `_types`/`_other_type`, old function untouched | OK |
| C4 grants | arch 4: revoke public, revoke anon, grant authenticated on 7-arg signature; `set search_path = public`; qualified `public.trips.invite_code` | OK |
| Fallback only PGRST202/42883 | arch 4.3, ADR #4, unit + live tests | OK (see N1) |
| C5/O6 select("*") replacement | arch 7: `trip-columns.ts`, 3 call sites, grep test, `other_type` in no select list | OK; the mock-factory trap is handled |
| C6/O10/U7 no UPDATE path | no policy, table-level `revoke update ... from anon, authenticated`, live test | OK. Confirmed the only `update public.trips` in migrations are inside `security definer` `complete_trip` (0001:187, 0011:24), so the revoke breaks nothing. Add to the verify script: `has_table_privilege('authenticated','public.trips','update')` false and no column-level UPDATE grant (`has_column_privilege`), since a column grant would survive a table revoke. |
| C7/C9 gate and names | RLS-only; live tests for anon organizer, non-member, completed trip; catalog name rule test | OK |
| C8/O9 replay | arch 2, ADR 0015 | OK in substance; see S1-S3 |
| C10/C11/C12/O9 analytics, logs, error hygiene | arch 4.4, 8; `CreateTripError` carries only a code; UI test with typed text in `details` | OK |
| C13/O8 | no new throttle, backlog recorded (ADR consequences, criterion 66) | OK |
| D2 | direct INSERT retained, CHECKs protect it | OK |
| O1/O2 charset | allowlist of BMP `\uXXXX` ranges, FIRST class, 1-30 chars, octet<=120, btrim, no double space, no emoji; property test; NFC/NFD cases | OK; see S4 |
| O5/O6/O12 | accurate member-readable wording in privacy and runbook; public RPCs untouched, definition-grep script | OK |
| O7 | never rendered after create | OK |

## Blocking (fix before the engineer starts)

**B1. design.md section 4.2 (and 0 defect 1, and the section 6 row for criteria 15/16/25/26) contradicts architecture.md section 2 and ADR 0015.** design.md describes an unverified *invitee* using `gateOrRedirect` to `/check-email`, holding the pending item in `sessionStorage`, and auto-adding on return, and it tells engineering to make "+" call `gateOrRedirect`. architecture.md established (finding 3) that an unverified non-owner never reaches the List tab (they get `TripSummaryOnly`), so that path is unreachable, and ADR 0015 rejects sessionStorage and `pending-action.ts`. An engineer following design.md would build a storage-backed replay that no review has covered (sign-out clearing, trip-id match, cross-tab behaviour, the existing `pending-action.ts` prefix scheme). Note for accuracy: criterion 26 itself permits "memory or sessionStorage"; the architecture's memory-only choice is stricter and is the one reviewed. **Fix in design.md:** delete 4.2 (or replace with "unreachable; List tab is not shown to unverified non-owners"), change the section 6 row to "memory only", remove the instruction in Defect 1 that "+" should call `gateOrRedirect`, and make 4.3/the Open-question-1 paragraph in section 4 state the resolution. If a future change makes the List tab visible to unverified non-owners, a new review is required (already noted in ADR 0015).

## Should-fix

**S1. Where the pending slot lives (architecture.md section 2 vs design.md 4.1).** architecture says the slot is a ref/state inside `ShoppingListTab`, cleared on unmount (tab switch). design.md 4.1 step 2 needs the widget headline to show the pending item name and offers a Cancel button, which means the name must be readable by `InlineVerifyWidget`, i.e. lifted into `TripVerificationProvider`, which does not unmount on tab switch. Pick one in architecture.md and carry the bounds with it: if lifted, the provider must clear on tab leave, on Cancel, on `SIGNED_OUT`, after use, and enforce the 10-minute TTL on read; store only `{name, tappedAt, userId}`. Also add the Cancel path and the TTL-expiry UI (the waiting row must not show "Adds after you confirm your email" forever after the slot expired) to the architecture test list.

**S2. Bind the slot to the tapping user.** Sign-out clearing relies on `SIGNED_OUT`, but the "email already belongs to another account" fallback replaces the session via sign-in with no `SIGNED_OUT`. Today the replay is safe only because `yourMemberId` is re-derived and the new user is normally a non-member; if that other account is also a member of the trip, the item is added under that account. Low impact (catalog name, same human) but cheap to close: record `session.user.id` at tap time and drop the slot if `getUser().id` differs at replay. Anonymous to verified via `updateUser` keeps the same uid, so the happy path is unaffected. Add to architecture.md step 4 and tests.

**S3. Re-check dedupe and catalog membership on replay.** Step 3 re-reads the list but does not say the name is re-checked against it. Between tap and verification another member (or the user in another tab) may have added the item; the replay would insert a duplicate. After `onRefresh()`, replay only if the name is still in `deriveSuggestions(types, fresh items)`. This also ensures the inserted text is always a current catalog name, so the in-memory value is never an arbitrary string.

**S4. Charset class details and client/server drift (architecture.md section 3, design.md 2.4).**
- design.md 2.4 says the client may use "a denylist plus a symbol range check". architecture says the client uses the *same allowlist string* via `new RegExp`. Make design.md say the shared allowlist export; a client denylist will accept strings the DB rejects, producing an unrecoverable generic failure.
- The proposed Latin/Greek/Cyrillic/Hebrew range (U+00F8-U+05FF) includes U+034F COMBINING GRAPHEME JOINER, a Default_Ignorable_Code_Point (invisible). The architecture's carve-out list does not mention it; the property test will catch it, but write it down so the engineer carves it out rather than relaxing the test. Check also U+0345-adjacent and U+2065-like unassigned points the property test reports.
- Unassigned (Cn) code points inside accepted ranges pass the CHECK and the property test (which only inspects assigned categories); a later Unicode version could assign invisible characters there. Accept as a note, or make the property test list the accepted Cn count so a Unicode upgrade shows up.
- Run the class check before the length check on the client so a lone surrogate or astral emoji gets the charset message; with BMP-only `String.length` equals `char_length`, so there is no length drift. `$` is end-of-string only in both engines (no `m` flag); keep it so (a trailing newline must not slip through). Do not add the JS `u` flag without re-running the drift test.
- The drift test must read the class from the **newest** migration that defines `trips_other_type_check`, not literally 0022, so a later tuning migration does not silently fail or pass it.

## Notes (advisory)

- N1. `42883` can also be raised from *inside* the 7-arg body (for example a missing function). The client would then fall back and drop the types silently. Acceptable (no leakage, creation still succeeds); the live test of `normalize()` on the real database covers it.
- N2. Duplicate ADR number: two files named `0014-*` exist (`0014-email-invites-...` is superseded). Either renumber the new ones to 0016/0017 and update the links in architecture.md, or note the supersession in the new ADR so references are unambiguous.
- N3. Wrap migration 0022 in explicit `begin; ... commit;` so a failure in the regex or the overload leaves no half-applied state (columns present but CHECK or grants missing).
- N4. Deploy ordering is a human rule, not enforced. Repo history ("Re-trigger Supabase migration deploy") suggests migrations apply from `main` via Supabase's integration with no ordering against Vercel. The two-merge plan (U3) is the right default; record the production confirmation query output in the QA report before merging PR B. Rollback and the matrix are correct (new schema + old app is safe; old schema + new app breaks only the trip dashboard to the summary view, no data exposure).
- N5. The migration must not use `COMMENT ON COLUMN` for `other_type` (PostgREST publishes comments in OpenAPI); architecture already specifies a SQL comment header instead. Keep.
- N6. design.md section 2.3 normalization omits the smart-quote mapping that architecture U6 adds; align so the form accepts "Sam's trip" typed on iOS.
- N7. The verify script is manual. Add the privilege checks from the C6 row above and a check that no grant of `create_trip` (either overload) exists for `anon` or `public` (`information_schema.routine_privileges`).

## Baseline gaps (add to docs/security-baseline.md in the same PR)

None of the earlier-listed baseline gaps (1-8 above) are in the baseline file yet. Add:
1. Column CHECK, not only RPC validation, when a direct-write RLS policy exists (anonymous sessions use `authenticated`).
2. Function overloads: no defaults on new parameters; own revoke public/anon and grant authenticated; keep old signature; fall back only on function-not-found codes, never on constraint errors.
3. Pending-action replay after an auth gate: closed-set identifier only, in memory by default, bound to the tapping user id and a short TTL, cleared on use/unmount/sign-out, re-authorized server-side, re-validated against current data; never in URLs or logs. If storage is used, it needs its own review.
4. User free text in a stored column: charset/length CHECK with an allowlist (not collation-dependent classes), reject control/bidi/zero-width/format characters including U+034F, decide emoji explicitly, test live on the real collation including NFD; client uses the same class string with a drift test.
5. A Postgres constraint-violation `details` contains the whole failing row; never log, forward or display raw write errors; wrap in a code-only error.
6. Adding a column that must not reach other members: audit every `select("*")`, `t.*`, `returns setof <table>`; RLS is row-level, so state read access accurately.
7. A throttle on one RPC entry point is not a limit when a direct-write policy or second overload exists.
8. Design documents (ux/design.md) must not specify behaviour that the architecture or an ADR rejected for security reasons; the pipeline should cross-check them before the engineer starts.

---

# Revision 3 review (requirements mode re-confirm, 2026-10-14)

Reviewed: requirements.md Revision 3 (criteria 74-100, Risk surface rows), design-audit.md section 2, this file, `src/app/page.tsx`, `src/app/trip/new/page.tsx` (currently a `"use client"` page), `src/proxy.ts`, `src/lib/starter-suggestions.ts` (`isTripType`, `tripTypeSelectedEvent`), `src/lib/tracking.ts`, and every reader of a `next` query parameter.

## Verdict

**No stop.** Revision 3 adds a static shelf, one closed-set URL parameter and four fixed-name events. No schema, RPC, grant, endpoint or data read is added (criterion 94). The earlier constraints C1-C13, D1/D2, O1-O12 and the design-review items are unchanged. New constraints R1-R9 below can be added as acceptance criteria; none changes the design.

## Verified facts

- `isTripType` (`src/lib/starter-suggestions.ts:10`) is `typeof value === "string" && STARTER_TYPES.some(t => t.code === value)`. It is an exact, case-sensitive array comparison, not an object-key lookup, so `__proto__`, `constructor`, `toString` and the like cannot pass. Keep it that way (R1).
- `src/proxy.ts` protects only `/^\/trips/` and `/^\/feedback/`. `/trip/new` and `/` are not session-gated, so an unauthenticated visitor following `/trip/new?type=camping` is **not** redirected and the param survives. The only proxy redirect is `/trips` without a session to `/?next=/trips`, which sets `next` to the **pathname only** (the query string is dropped). Nothing on `/` reads `next` (`src/app/page.tsx` reads only `signin`), so no reflected or open-redirect path exists there. The shelf on `/trips` is only reachable with a session, and the shelf on `/` is public; both link to the public `/trip/new`.
- The only `next` consumers are `check-email` (via `sanitizeInternalPath`) and `join/[code]/welcome`; neither is touched by Revision 3.
- `trackEvent(name)` already takes a name only and swallows errors, so no property can be attached through it.

## Constraints

**R1. Parameter parsing (criteria 82, 83).**
- The server wrapper receives `searchParams` as `Promise<{ type?: string | string[] }>`, awaits it, and accepts the value only when `typeof type === "string"` **and** `isTripType(type)`. An array (repeated `?type=a&type=b`), `undefined`, empty string, wrong case, whitespace-padded value, URL-encoded variants that do not decode to an exact code, `other`, and any prototype key all produce `initialType = undefined`. Do not "take the first element" of an array: criterion 82 says exactly one value, and picking the first makes `?type=camping&type=junk` pre-check camping.
- Do not trim, lowercase or normalize before validating (that would widen the accepted set).
- Only the validated catalog code, a member of the compile-time `STARTER_TYPES`, is passed to the client component, never the raw param. The client prop type is `TripType | undefined`, so a raw string cannot be forwarded by mistake.
- No try/catch is needed because nothing throws, but the wrapper must not throw on malformed percent-encoding (Next decodes before it reaches the page; verify with `?type=%E0%A4%A` in the test).
- Other parameters on the URL (`?type=camping&foo=bar`, `?next=https://evil`) are ignored. The wrapper must not forward, read or redirect on any other parameter.

**R2. No echo, no reflection (criterion 82, 84).** The raw param value must not appear in rendered HTML, the page `<title>`/metadata, `generateMetadata`, an error message, `console.*`, a redirect target, a link `href`, or an analytics name. Because only the catalog code reaches the client, the only visible effect is a pre-checked tile and the existing adaptive sentence for that catalog type's own `phrase`. Add a test: a payload such as `?type=<script>alert(1)</script>` and `?type="><img src=x>` yields markup that contains neither string and an unchecked form.

**R3. No redirect on the param.** The wrapper must not `redirect()`/`router.push` based on `type` (not even to canonicalize an invalid value to `/trip/new`). A redirect would turn the param into a navigation sink and would make a log line for each junk value. Ignoring is the whole behavior. Test: invalid input returns 200 with the blank form, no `Location` header.

**R4. Proxy and unauthenticated users.** Keep `/trip/new` out of `SESSION_REQUIRED_PATTERNS`; do not add `/trip/new` there in this change, because gating it would redirect to `/?next=/trip/new` and drop the query, breaking the shelf for the very audience it targets (new anonymous organizers). Do not "improve" the proxy to carry the query string into `next`: that would copy attacker-controlled query text into a redirect target. Anonymous-session creation remains client-side as today (`createTrip` path unchanged). QA should confirm with a signed-out request that `GET /trip/new?type=camping` returns 200 (not a redirect) and `GET /trips` without a session still redirects to `/?next=%2Ftrips` with no `type`. Note for the architect: the regex `/^\/trips/` is unanchored on the right, so `/trips-anything` is also gated; harmless, no action.

**R5. Welcome page `/` (criterion 76).** The server component keeps reading only `signin`. Do not add `type` handling, do not forward the incoming query string to tile links, and build every tile `href` from the catalog code literal (`/trip/new?type=${code}` where `code` comes from `STARTER_TYPES`, never from `searchParams`). The shelf must not trigger any Supabase call and must not change the existing session/redirect logic (the per-visitor `getUser` and membership query on `/` are unchanged, criterion 97). Do not make `/` cacheable as a static page in a way that would serve a redirect or per-user content to others; leave rendering as it is.

**R6. Analytics helper closed set (criteria 85, 86).**
- Add one helper next to `tripTypeSelectedEvent`, for example `homeTemplateTappedEvent(code: string): string | undefined`, built exactly like it: `isTripType(code) ? \`home_template_tapped_${code}\` : undefined`. The blank-trip event is a constant (`home_blank_trip_tapped`). No other event name may be composed from input.
- The click handler gets `code` from the catalog iteration (the tile's own prop), never from `searchParams`, `window.location` or DOM text. If the helper returns `undefined`, fire nothing (do not fall back to a generic name or to `String(code)`).
- Calls go through `trackEvent(name)` only: no second argument, no properties object, no `track(...)` import from `@vercel/analytics` outside `tracking.ts`. The unit test (criterion 85) asserts the exact set of four names, `undefined` for `other`, `""`, `"Camping"`, `"__proto__"`, `"camping "`, and that `trackEvent` was called with exactly one argument.
- Fire on click, wrapped so a failure never blocks navigation; do not call it from the server component, and do not fire from `/trip/new` on load (the audit already prefers click).
- `ANALYTICS.md` rows: state that the `home_template_tapped_*` names are closed-set and carry no properties.

**R7. Nothing persisted or leaked via the param (criterion 84).** The pick is read once from the server prop into initial `useState`. Do not write it to `localStorage`/`sessionStorage`, cookies, `history.replaceState`, or perf-log labels (`timeAsync` names). Do not append it to any later URL (the post-create `?tab=list` landing stays code-free). No `Referer` hardening is required: a bare catalog code is not personal data and the target pages are same-origin; the existing referrer policy is sufficient.

**R8. No new endpoint, RPC, handler or policy (criterion 94).** The shelf is a server-rendered or static component with `Link` elements. Reject at review: any `route.ts`, server action, `fetch`, Supabase call, or migration added for the shelf. Counts come from the bundled catalog at render time. The "Create" path is unchanged, so `types` still goes through `create_trip` plus the column CHECK (C1) regardless of what the URL said; the URL cannot cause a write by itself (no auto-submit: `initialType` only pre-checks a tile and the user still presses Create).

**R9. Page split must not weaken the existing form.** Turning `trip/new/page.tsx` into a thin server wrapper plus a client form (design-audit 2.4) must keep behavior identical: the form stays a client component, the Other text state stays in component state only (comment at `page.tsx:44-45` and criteria 36, 53, 62, 63 still hold), and the server wrapper must not import `@/lib/data/trips` or the Supabase browser client. Do not pass the raw `searchParams` object as a prop to the client component (it would be serialized into the RSC payload). The `useSearchParams`-without-Suspense warning in the audit is correct: use the server `searchParams` promise only.

## Open-redirect / reflected-input conclusion

No open-redirect or reflected-input risk remains if R1-R3 and R5 hold: the param is validated against a fixed three-element set and never echoed, forwarded or used as a navigation target; the tile hrefs are literals from the catalog; the proxy's `next` value is a pathname with the query dropped and is not read by `/`.

## Residual / notes (non-blocking)

- Any visitor can craft `/trip/new?type=camping`; the only effect is a pre-checked tile on their own form. No cross-user impact, nothing stored until Create.
- Tile taps inflate or skew `home_template_tapped_*` counts if someone scripts clicks; anonymous analytics are not a security boundary. No action.
- A direct deep link (`?type=camping` shared in chat) pre-checks without a `home_template_tapped_*` event, which is intended (click measures the tile).
- A missing catalog entry (empty `STARTER_TYPES`) must render no shelf rather than an empty header; not a security issue.
- Compliance: the shelf makes no claim (criterion 96); security agrees `/privacy` needs no change for a code-only query parameter.

## Baseline gaps (add to docs/security-baseline.md)

9. "A query parameter that selects UI state must be validated server-side against a fixed set (exact, case-sensitive, single string; arrays and unknown values ignored, never 'first element'), passed to client components only as the validated typed value, never echoed, never used as a redirect target, and never copied into the proxy's `next` redirect (the proxy sets `next` to the pathname only)."
10. "Analytics event names built from a code must go through a helper that returns `undefined` for anything outside the closed set, and the code must come from the bundled config, never from the URL or DOM. `trackEvent` stays name-only."
11. "Splitting a client page into server wrapper plus client form: do not pass raw `searchParams` or request data to the client; pass only validated typed props."

---

# Revision 3 design review (design mode, 2026-10-14)

Reviewed: architecture.md section 17 (17.1-17.14), design.md sections 9-15, requirements.md criteria 74-121, and the real `src/proxy.ts`, `src/app/home-screen.tsx` (a `"use client"` module) and `src/lib/tracking.ts`.

## Verdict

**No blocking gap.** Every one of R1-R9 and criteria 101-115 is carried into architecture 17.5-17.11 and design 9.5, 9.6 and 10, each with a named test. No stop. Advisory items below.

## R1-R9 carry-through (verified against the text)

| Constraint | Where it lands | Result |
|---|---|---|
| R1 parse | 17.5: `parseTypeParam(raw: unknown)` returns raw only if `typeof raw === "string" && isTripType(raw)`; no trim, lowercase, decode or first-element; reuses array-comparison `isTripType`. Tests 17.10 (`starter-suggestions.test.ts`, `page.search-params.qa.test.tsx`) cover arrays, empty, case, padding, `other`, prototype keys, numbers, objects, `<script>`, `"><img>` (plain and percent-encoded) and `%E0%A4%A` | Met |
| R1 wrapper shape | Async, `await searchParams`, reads only `type`, imports only `NewTripForm` and `parseTypeParam`; source-scan test bans `@/lib/data/trips`, `@/lib/supabase/*`, `@/lib/tracking`, `useSearchParams`, `generateMetadata`, `"use client"` | Met |
| R1/R9 only typed value crosses | Element props asserted to be only `initialType`; prop typed `TripType \| undefined`; form re-checks with `isTripType` | Met |
| R2 no echo | No metadata, console, error text; payload tests assert neither string in markup and no checked tile; QA curl for `<script>` | Met |
| R3 no redirect | No `redirect`/`notFound`; mocks asserted uncalled; QA `curl -i` 200 and no `Location` | Met |
| R4 proxy | 17.8: patterns verified unchanged and `/trip/new` unmatched; `next` is pathname only; new `src/proxy.test.ts` asserts `createServerClient` never called for `/trip/new?type=camping` and `/`, and exact `?next=%2Ftrips` for `/trips?type=camping`. I confirmed in `src/proxy.ts` the early `NextResponse.next()` for non-matching paths and `searchParams.set("next", pathname)` only. No `src/proxy.test.ts` exists yet, so the test is still to be written | Met (test pending) |
| R5 welcome page | `page.tsx` zero diff, hrefs from catalog, hostile `searchParams` test on `/`, scan test for no `type` read | Met |
| R6 analytics | `homeTemplateTappedEvent` returns `undefined` outside the closed set; `HOME_BLANK_TRIP_EVENT` constant; one-argument `trackEvent` assertion; `@vercel/analytics` importer scan; only the two leaves in `template-tile.tsx` call it; click-only, try/catch, no `preventDefault` | Met |
| R7 no persistence | Lazy `useState` initializer; spies on storage, cookie, `history.replaceState`; `timeAsync` not used; `router.push` argument asserted code-free | Met |
| R8 no endpoint | 17.1 lists no route/action/fetch/Supabase/migration; scan test; no auto-submit test | Met |
| R9 split | Other text stays in client state (criteria 36, 53, 62, 63 tests keep passing); wrapper has no data-layer import; no raw `searchParams` prop | Met |

Criteria 74-121: each has a row in the 17.10 traceability table. 105 (proxy), 106 (`/`), 107 (no network), 110 (no storage), 111-114 (analytics) map to concrete tests. Criterion 121 (baseline rules) maps to `revision3-docs.test.ts`; `docs/security-baseline.md` still lacks the three rules today (checked), so that test will fail until the engineer adds them, which is the intended gate.

## Dynamic rendering of `/trip/new` (sanity check)

Awaiting `searchParams` makes the route request-time dynamic. Security view: acceptable. The page does no data fetch and renders nothing user-specific, `proxy.ts` returns `next()` before any Supabase call, so there is no cross-user cache risk and no auth cost. Residual: every request to this public, unauthenticated URL is now a serverless render instead of a static file, so request floods cost compute. That is the same exposure as `/` (already dynamic) and falls under Vercel platform limits; no app-level throttle is warranted. Next sends dynamic responses as non-shared-cacheable by default.

## Shelf on the public `/` (data exposure check)

No new exposure. The shelf renders catalog labels and item counts only. `home-screen.tsx` is a client module, so `STARTER_TYPES` (including every item name) is bundled to the client for anonymous visitors. That is product content, not user data, and the same list ships to the New trip and List tab bundles already. No Supabase call, no session read, no per-user value, hrefs from literals. Clean.

## Advisory items (none blocking)

1. **A1, architecture 17.10/QA: malformed encoding is only unit-tested against a pre-decoded string.** `Promise.resolve({ type: "%E0%A4%A" })` does not exercise Next's decoding of the real URL. Add to the criterion 103/104 QA step: `curl -i '/trip/new?type=%E0%A4%A'`, `?type=%00`, and `?type=camping&type=junk` each return 200, no `Location`, blank form, and the value absent from the body (including the `self.__next_f` RSC payload at the end of the HTML). Doc: architecture.md 17.10 rows 103/104 and 17.13.
2. **A2, architecture 17.2: the `types` prop on `TemplateShelf`.** It exists for tests. Add to `revision3-scan.test.ts` that no non-test source passes `types=` to `TemplateShelf`, so a later edit cannot feed it request-derived data. Doc: architecture.md 17.2/17.10.
3. **A3, design.md 11.1 (B12 and B-fixes) still names `trip/new/page.tsx`**, while architecture 17.5 moves the form to `new-trip-form.tsx`. Not a security defect; fix the file name so the engineer does not edit the thin wrapper. Doc: design.md 11.1 header and B12 row.
4. **A4, architecture 17.8:** the proxy test should also assert `/trip/new` is not matched when `getSupabaseEnv` returns null (env-missing path passes through today). Optional.
5. **A5, shipping the whole catalog to `/` visitors:** if the catalog ever carries non-public or unreleased item text, pass only code, label and count into the shelf instead of `STARTER_TYPES`. Today no action.

## Baseline additions

Rules 9-11 from the Revision 3 review stand and are the text the engineer must add to `docs/security-baseline.md` (criterion 121). One more from this pass:

12. "A page that turns a query parameter into UI state must have a test that sends the real encoded URL (including malformed percent-encoding and repeated keys) and checks the response body, including the framework payload, for the raw value, not only a unit test of the parser."
