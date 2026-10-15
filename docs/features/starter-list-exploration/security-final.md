# Security final review: starter-list-exploration (0.8.0)

Mode: final. Reviewed the working tree against security-constraints.md (C1-C13, D1, D2, O1-O12, design review S1-S4/N1-N7), architecture.md, ADRs 0014/0015 and docs/security-baseline.md. No database was contacted. Ran the offline vitest suites (src/lib, src/app/trip, the 0022 static migration tests): 51 files, 434 tests, all passing. The `.live.qa.test.ts` was not run.

## Verdict

No blocking findings. Two should-fix items and several notes. No "earlier mode missed it" findings, so no new baseline gap was created by this review (the baseline file itself still lacks the rules listed at the end; that is a documentation debt, not a missed finding).

## Verified (by reading the code)

Migration `supabase/migrations/0022_trip_types_and_other_type.sql`
- begin/commit wraps everything (line 39, 124). No `COMMENT ON COLUMN`; a SQL comment header is used.
- `types` CHECK (45-60): `cardinality=0 or case when array_ndims<>1 then false else ...`; NULL-safe for every non-null input, the column is `not null default '{}'`. Guard for `array_ndims('{}')` present; `{NULL}`, multi-dim, case, duplicates, >3 all fail.
- `other_type` CHECK (69-79): `is null or (...)`, 1-30 chars, octet_length <= 120, `= btrim`, no double space, FIRST class and ALLOWED class as `\uXXXX` allowlists (collation-independent), BMP only (no emoji), U+034F and the format/bidi/zero-width ranges are outside both classes, combining marks excluded as first char. `$` is end-of-string in Postgres ARE so a trailing newline cannot pass (and newline is not in the class anyway). Drift test reads the newest migration defining the constraint.
- `revoke update on public.trips from anon, authenticated` (83). The only UPDATEs on trips in migrations are inside security definer `complete_trip` (0001:187, 0011:24); no `.update(` on trips exists in `src/`.
- 7-arg `create_trip` (85-120): no defaults, `_types`/`_other_type` do not collide with columns, `security definer set search_path = public`, `public.trips.invite_code` qualified in RETURNING, explicit `revoke ... from public`, `revoke ... from anon`, `grant ... to authenticated`. The 5-arg function and its grants are untouched. A bad Other value is not blanked: it reaches the insert and the CHECK rejects it (23514).
- No public/anon RPC is redefined or has its return type changed (`get_trip_by_invite_code`, `get_trip_summary`, `join_trip`, `join_trip_by_id`). `other_type` appears in no `src` file other than `types.ts` (generated row/args type) and the create form/data layer.
- `supabase/verify/0022_...verify.sql`: read-only; covers overload grants (has_function_privilege and routine_privileges), no defaults, secdef+search_path, table-level and per-column UPDATE, no UPDATE/ALL policy, constraints validated, public RPC definitions free of the column names, no function returning `public.trips`. Meets N7 and the C6 row.

Client
- `src/lib/data/trips.ts` `createTrip`: 5-arg call when nothing picked; 7-arg otherwise; fallback to the 5-arg call only when `isFunctionNotFound` (`PGRST202` or `42883`), never on `23514`. It throws `CreateTripError(code)` which carries only the code (no message/details/hint). `src/app/trip/new/page.tsx:143-ish` catch shows fixed copy, no `console.*`, no error forwarding.
- No `select("*")` on `trips` remains: `src/lib/data/trip-columns.ts` lists, used at `trips.ts:287`, `trips.ts:367`, `src/app/trips/page.tsx:101`. Neither list contains `other_type`. Other trip reads select `name` or `completed_at, created_by` only. `TripRow` is narrowed with `Pick`. `getTripView` exposes only `types` filtered through `isTripType`.
- Pending slot (`src/app/trip/[id]/verify-inline.tsx`): stores `{name, tappedAt, userId}` in a ref plus a name mirror in state; no storage, URL or log; `userId` from the local session; TTL 10 minutes enforced on read in `takePendingItem` and by timer; read-and-clear is one step; cleared on Cancel, on `SIGNED_OUT`, on List tab unmount, on replace and on use; a stale async `getSession` cannot resurrect a cancelled slot (token).
- Replay (`shopping-list-tab.tsx`): requires `verified`, not completed, re-fetches the list and re-derives `yourMemberId`, compares `getUser().id` to `slot.userId`, re-runs `requireVerifiedSession`, and re-checks the name against `deriveSuggestions` with the fresh items (dedupe + catalog-only text). The insert goes through the ordinary `addShoppingListItems`, so the existing 0015 insert policy is the only authorization; no new RPC or grant.
- Analytics: fixed event names only; per-type names built through `tripTypeSelectedEvent` (closed set), fired only when `typesStored`; `trip_type_selected_other` fixed name; no Other text in events, URL (`?tab=list` is a constant), titles, storage or logs. Suggested card and widget render catalog names only.
- Privacy/runbook/ANALYTICS edits state member-readable access accurately (not "organizer only"), include `other_type` in export (`to_jsonb(t) - 'invite_code'`), the operator-only erasure statement, and the cascade/90-day purge. Consistent with O5/O12.

## Findings

### Blocking
None.

### Should-fix
S-1. `createTrip` fallback also fires when the 7-arg function exists but raises `42883` from inside its body (N1 in design review). Result: trip created without types, silently, and the user sees the normal landing page. No leakage, but it hides a server defect. Fix (optional, small): in the fallback branch, report `typesStored: false` (already done) and have the caller skip the `?tab=list` redirect (already done); additionally consider surfacing a non-blocking "Trip created, but the trip type wasn't saved" notice. Not required for ship.

S-2. Deploy ordering is not enforced (design review N4). New app code selects `trips.types` in `TRIP_VIEW_COLUMNS` (`trip-columns.ts:19`); against an unmigrated database the trip dashboard read fails (the trip list does not, it uses `TRIP_LIST_COLUMNS`). This is availability, not exposure. Keep the two-merge plan and paste the production verify-script output into the QA report before merging the app PR.

### Notes
- N-1. `verify.sql` "public RPCs do not mention types or other_type" matches `\mtypes\M` case-insensitively, so a future legitimate use of the word "types" in those function bodies would give a false failure. Harmless, fails closed.
- N-2. Unassigned code points inside the accepted ranges (for example inside `一-퟿`) pass the CHECK; a future Unicode version could assign an invisible one there. Accepted in the design review (S4); consider listing the unassigned count in the property test.
- N-3. Duplicate ADR number 0014 (design review N2) is still unresolved; documentation only.
- N-4. Trip creation remains unthrottled and `name`/`location` have no length CHECK (O8 backlog, not in scope).
- N-5. Any trip member, including an anonymous joiner, can read `trips.other_type` via PostgREST by explicitly selecting it. Accepted (O5) and documented correctly in privacy and the runbook.

## Unverified live (needs a run against a non-production Supabase, then production)

1. Migration applies on a populated `trips` table, and the Postgres regex accepts `\uXXXX` ranges exactly as the JS class does on the Supabase collation: run the `.live.qa.test.ts` (accept: "Cắm trại" NFC and NFD, Japanese, Arabic, Thai, 30 chars; reject: empty, 31 chars, newline, tab, NUL, `<script>`, `=1+1`, leading/trailing/double space, U+202E, U+200B, NBSP, emoji).
2. `supabase/verify/0022_trip_types_and_other_type.verify.sql`: every row `ok = true`, output saved with the QA report.
3. Old 5-named-argument call and new 7-argument call both resolve (no PGRST203) after PostgREST schema reload; a 7-arg call as `anon` is denied.
4. Direct `insert` into `trips` with bogus/duplicate/4+ `types` and bad `other_type` is rejected (23514); member and organizer `update trips` fails with permission denied.
5. "+" insert rejected by the database for an unverified user, a non-member and on a completed trip (0015 policy).
6. Fallback on a database without 0022 (PGRST202 path) and no fallback on a forced 23514.

## Baseline additions (docs/security-baseline.md)

None of the following are in the baseline file yet; add them in the release PR:
1. Column CHECK, not only RPC validation, when a direct-write RLS policy exists (anonymous sessions use `authenticated`).
2. Function overloads: no defaults on new parameters; own revoke public/anon and grant authenticated; keep the old signature; fall back only on function-not-found codes (PGRST202, 42883), never on constraint errors.
3. Pending-action replay after an auth gate: closed-set identifier only, memory by default, bound to the tapping user id and a short TTL, cleared on use/unmount/sign-out, re-authorized server-side and re-validated against current data; never in URLs or logs. Storage needs its own review.
4. User free text in a stored column: charset/length CHECK with a code-point allowlist (not collation-dependent classes), reject control/bidi/zero-width/format characters including U+034F, decide emoji explicitly, test live including NFD, share the class string with the client and keep a drift test.
5. A Postgres constraint-violation `details` contains the whole failing row; never log, forward or display raw write errors; wrap in a code-only error.
6. Adding a column that must not reach other members: audit every `select("*")`, `t.*` and `returns setof <table>`; state read access accurately (RLS is row-level).
7. A throttle on one RPC entry point is not a limit when a direct-write policy or a second overload exists.
8. Design documents must not specify behaviour an ADR rejected for security reasons; cross-check before the engineer starts.

---

# Revision 3 final review (v0.8.0, working tree, nothing committed)

Mode: final, re-run after Revision 3. Read-only; no database or port 3000 contacted. Offline vitest run of proxy, trip/new, components, starter-suggestions, revision3-scan and data suites: 16 files, 145 tests, all passing. Live tests (`0022...live.qa.test.ts`) not run.

## Verdict: no blocking findings. No new finding that an earlier mode missed.

## Verified in the actual code
- Migration 0022: begin/commit present. Types CHECK uses `cardinality(types) < 2 or types[1] <> types[2]` and `cardinality(types) < 3 or (types[1] <> types[3] and types[2] <> types[3])` (the fixed form; no IS DISTINCT FROM padding bug). Charset CHECK uses two `\uXXXX` allowlists, BMP only, 1-30 chars, 120 bytes, btrim, no double spaces. 7-arg `create_trip` has no defaults, explicit revoke from public and anon, grant to authenticated, security definer with search_path; 5-arg left alone; `revoke update on trips`.
- `createTrip` (`src/lib/data/trips.ts:45-83`): falls back to the 5-arg call only on PGRST202/42883; 23514 and others throw `CreateTripError` carrying only the code (no message/details/hint, which would contain the row).
- No `select("*")` on trips anywhere in `src`. Trip reads use `TRIP_LIST_COLUMNS` / `TRIP_VIEW_COLUMNS` (`trip-columns.ts`), neither containing `other_type`. Remaining `trips` selects are narrow (`completed_at`, `name`). `other_type` appears only in the form, data layer, validation module and generated types.
- `src/app/trip/new/page.tsx`: async wrapper, awaits `searchParams`, reads only `type`, `parseTypeParam` (string only, exact `isTripType`, arrays ignored), passes only `initialType`. No `useSearchParams`, redirect, metadata, or data/Supabase imports.
- `src/proxy.ts`: patterns still `/^\/trips/` and `/^\/feedback/`; `/trip/new` not gated; `next` set to pathname only. `src/proxy.test.ts` covers `/trip/new?type=camping` (no createServerClient, no redirect), `/` and `/trips?type=...&utm_source=x` redirecting to exactly `?next=%2Ftrips`.
- TemplateShelf/TemplateTile: server-renderable shelf, only `next/link`, icons, tracking and catalog imports; no Supabase, fetch or storage; hrefs are `/trip/new?type=${code}` with `code` from the catalog and `/trip/new`. Analytics goes through `homeTemplateTappedEvent` (returns undefined outside the closed set), single-argument `trackEvent`, wrapped in try/catch, no preventDefault.
- Home `/` still reads only `signin`.
- FabBar is fixed-position but used only on `/trips` (`src/app/trips/page.tsx:193`); it does not touch the legal, consent or verification UI.
- Pending-item slot (`verify-inline.tsx:88-155`): in memory only (refs and state), carries the local-session user id, TTL checked on read, cleared on SIGNED_OUT, replace/cancel tokens guard stale writes. No storage, URL or log.
- No new dependency (package.json and lockdiff unchanged).

## Advisory
- A1: `select("*")` remains on `trip_members` and `expenses`; pre-existing, out of scope.
- A2: The framework RSC payload echoing the percent-encoded query is accepted per the brief.
- A3: Test-only `window.history.replaceState` in `template-tile.qa.test.tsx` is a test fixture, not product code.

## Unverified live
- Migration 0022 CHECKs and grants on a real Postgres (the `.live.qa.test.ts` and `supabase/verify/0022_*.verify.sql`) were not executed here.
- A signed-out `curl -i` of `/trip/new?type=<script>` (200, no Location) was verified by unit tests only.
- Release order (apply 0022 before deploy) is operational.

## Baseline
Revision 3 rules are present in `docs/security-baseline.md`: query-param-selects-UI-state (exact, single string, never echoed, redirected or copied into `next`), analytics closed-set helper, server-wrapper-passes-only-typed-props, and the real-encoded-URL test rule; plus the migration rules on overloads without defaults and real-Postgres CHECK testing. The earlier documentation debt noted above is cleared.

---

# Revision 4 delta review (user-test feedback, UI only)

Mode: final, delta. Read-only; no database or port 3000 contacted. Source and diff review only (tests not re-run).

## Verdict: no blocking findings. No gap in the baseline.

## Verified
- Column lists: `TRIP_LIST_COLUMNS` now adds `types`; `other_type` is in neither list (`src/lib/data/trip-columns.ts`). `/trips` (`src/app/trips/page.tsx:128`) and `getMyTrips` (`trips.ts:289`) use the list; no `select("*")` on trips. `types` is a closed catalog code array, not personal data. `trips.select-columns.test.ts` still guards: no star/empty select on trips, `other_type` not in either list, not inside any `.select(` argument, and the file allowlist (form, trips.ts, trip-columns.ts, types.ts, validation).
- `/trips` rows: `trip.name` and subtitle values are rendered as React text children (no `dangerouslySetInnerHTML` anywhere in the touched files); icon comes from `iconForTripType(types[0])` with a MapPin fallback, never from raw text. Data shown (name, dates, member count, total, your balance) was already shown before; no new exposure.
- `ui.tsx`: `overflow-clip`, safe-area padding, `canvas` kicker, `ref` prop on Field, `FabBar`: presentation only, no security impact. `globals.css` scroll-padding and new color token: none.
- Pending-item slot (ADR 0015) unchanged in `verify-inline.tsx`: in-memory refs and state, user id from local session, TTL checked on timer and on read, cleared on SIGNED_OUT, cancel and replace tokens, read-and-clear once. The tab drops it on unmount, replays only after `verified`, and re-checks completed trip, fresh refresh with member id, same `user.id`, `requireVerifiedSession`, and re-derives the suggestion from the catalog (inserted text is always a catalog name). No storage or console use in the tab, card or form.
- Floating notice: `addedName` is only ever a catalog name (card `s.name` or the re-derived `target.name`), rendered as an escaped React text child; the Other text is never in this component. Focus code finds the "+" via `dataset` comparison, not a selector built from text.
- New trip form: change is field order and spacing only. Other text stays component state; it is validated before submit, not sent to analytics (`TRIP_TYPE_OTHER_EVENT` is name-only), URL or storage. Redirect to `?tab=list` is a fixed string with the server-returned trip id.
- `createTrip` fallback: only `isFunctionNotFound` (PGRST202/42883) retries the 5-arg call; `trips.create-trip.test.ts` asserts 23514, 42501, PGRST301 and undefined do not fall back, and a 23514 error is never widened, carrying only the code.
- Runbook edits: accurate on `other_type` being readable by any trip member, export via `to_jsonb(t) - 'invite_code'`, aggregate-only operator query, erasure step, and apply-0022-before-deploy ordering.

## Advisory
- A1: The release-order note (apply 0022 before deploy) is now load-bearing: `types` is selected by the trip list and trip view, so new code against an unmigrated database breaks `/trips`. Operational, already in the runbook.
- A2: Previous A1 to A3 and the "unverified live" items still stand.

## Baseline
Already covered: explicit column lists with `other_type` excluded and grep-tested, user text rendered as escaped children, analytics closed set, in-memory pending-slot rules, fallback only on function-not-found. No new rule needed.
