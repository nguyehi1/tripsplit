# Architecture: Starter lists, version 0.8.0 (starter-list-exploration)

Status: design for engineer (revised after the 2026-10-13 design reviews: security S1-S4 and N2-N7, compliance D1-D2; **Revision 3 added 2026-10-14, see section 17**). Inputs: [requirements.md](requirements.md) (71 criteria approved for the base design, plus Revision 3 criteria 74-121), [compliance-constraints.md](compliance-constraints.md), [security-constraints.md](security-constraints.md), [planning.md](planning.md), [brief.md](brief.md), [docs/ARCHITECTURE.md](../../ARCHITECTURE.md), migrations 0001-0021 plus this feature's 0022, and the code paths named below. Decisions that record a real tradeoff are in [ADR 0014 (trip types)](../../adr/0014-trip-types-column-checks-and-create-trip-overload.md) and [ADR 0015](../../adr/0015-in-memory-single-item-replay-after-inline-verification.md). Two files in `docs/adr/` are numbered 0014; the older email-invites one is superseded, and every reference in this document means the trip-types file by its full filename.

User decisions honored: no editing of types or the Other text in 0.8.0 (0.8.1 note at the end); a guest organizer's first "+" goes through the existing OTP flow and then adds exactly that one item; deleted suggestions reappear (derived, nothing stored); the type-tile sentence adapts to the ticked catalog types; the catalog is one easy-to-edit file with the Comp C9 header note; light mode only.

## 0. Read this first

### Breaking changes and consumer impact (headline)

- **No breaking API, RPC or route contract change.** The old 5-argument `create_trip` is untouched. Everything new is additive: two new `trips` columns, one new `create_trip` overload, new client modules.
- **Revision 3 (section 17) adds no data, auth, schema, RPC, endpoint or policy.** It changes four things with existing consumers, all additive or internal: `/trip/new` becomes a server wrapper plus a client form (the route becomes request-time dynamic; one existing test file imports the page default export and must change), `/trips` page markup and copy (one existing test asserts removed strings), the welcome content (additive), and `src/components/ui.tsx` (one new variant, one new component, no change to existing ones). Details and the consumer list are in section 17.9.
- **Deploy ordering is load-bearing in one direction.** New app code selects `trips.types`. If the new build serves traffic before migration 0022 is applied, `getTripView` fails on an unknown column and the organizer sees the summary-only fallback instead of their trip. Old app code with the new schema is fine. So: migration first, app second. Section 11 gives the release steps, including a two-step merge, and rollback. Revision 3 does not change this.
- **Four existing `select("*")` readers of `trips` change** (they would otherwise start returning `other_type` to every member's browser). Listed in section 10 with every call site and test mock affected.
- **One existing test mock needs a small update**: `src/app/trip/[id]/shopping-list-tab.qa.test.tsx` mocks `useTripVerification` with only `{ verified, markVerified }`. The new context members (section 2) are all read defensively, so the test still passes, but the mock should add them so the new tests can assert on them.
- **A mock trap to avoid**: `src/app/trips/page.qa.test.ts` mocks `@/lib/data/trips` with a factory. Any new constant that `src/app/trips/page.tsx` imports from that module would be `undefined` under the mock. The shared column list therefore lives in its own module, `src/lib/data/trip-columns.ts` (section 7). The same trap applies to Revision 3: the shelf must not import anything from `@/lib/data/trips`.

### Decisions that need the user (defaults applied; say if you disagree)

| # | Decision | Default applied |
|---|---|---|
| U1 | **Migration number 0022.** `0021_revoke_public_trip_summary_grant.sql` (revoke of the public `get_trip_summary` grant, applied live) is now present in the checkout and is not touched by this feature; this feature's migration is the next free number, **0022**. If another migration claims 0022 before this one merges, renumber to the next free number and update file names, test names and references. This migration never touches `get_trip_summary`. (An earlier version of this row was garbled by a bulk renumber; the facts are as stated here, and the file `supabase/migrations/0022_trip_types_and_other_type.sql` is already named 0022.) | 0022 |
| U2 | **Where to run the live-Postgres verification.** Criteria 30, 33, 48, 60, 61, 65, 71 and 25 ask for proof against real Supabase Postgres, not CI. No local Postgres 13+/Docker exists in this environment (migration 0015's test file says so). Design: a vitest suite gated on env vars, run by hand before merge, using real PostgREST, real anonymous sessions and a service-role key. It needs a **non-production Supabase project or branch**. If you only have production, say so; the suite can run there with namespaced fixtures and cleanup, non-routable addresses (`@example.invalid`) and no real person's data, but it creates real auth users and trips for a few minutes. | Separate project or branch |
| U3 | **Release shape.** Recommended: two merges. PR A = migration 0022 + its tests only; wait until it is applied and live-verified; PR B = app code. Alternative: one PR, with Vercel production auto-promotion held until the migration is confirmed. | Two merges |
| U4 | **Land on the List tab after create** when at least one catalog type was picked (`/trip/<id>?tab=list`). Requirements are silent; the brief says "Create opens List tab with Suggested card". The default tab otherwise stays Expenses. | Yes |
| U5 | **Hide the Suggested card on a completed (locked) trip.** The list is frozen (insert policy requires `is_trip_open`), so "+" would always fail. Criterion 6 reads as for open trips. | Hide |
| U6 | **Charset scope for the Other text.** BMP only (no characters above U+FFFF). This blocks all emoji, flags, skin tones and tag sequences by construction and makes 4-byte worries moot. It drops rare scripts that live outside the BMP (for example Adlam, Osmanya, CJK Extension B+ ideographs), so "letters of any script" in criterion 64 is narrowed to "any script in the BMP". Also: the client maps typographic quotes and dashes (U+2018/2019 to `'`, U+2013/2014 to `-`) before validation, otherwise an iPhone's smart apostrophe in "Sam's trip" would be rejected. | Accept both |
| U7 | **Table-level `revoke update on public.trips from anon, authenticated`** in the migration, so criterion 33 fails with "permission denied" rather than depending only on the absence of an UPDATE policy. No code updates `trips` through the API today (verified by grep; `complete_trip` is `security definer`). Precedent: 0015 does the same on `shopping_list_items`. | Include |
| U8 | Existing open items: catalog sign-off and who edits it afterwards (default: the owner edits `src/lib/starter-catalog.ts` directly, nothing else needed); legal sign-off of the `/privacy` wording (flagged in requirements, not decided here). | Open |
| U9-U13 | **Revision 3 decisions** (QA data source for `/trips` screenshots, Playwright as a dependency, canvas board files, catalog counts, sticky pill risk). See section 17.12. | See 17.12 |

Small copy items for the ux-designer, not architecture: Other tile and input labels, helper text, counter and error copy, the 0/1/3-type sentence wording, the card's waiting-for-verification caption, the widget headline for a pending item and the Cancel label. All must follow criteria 40, 42, 57 (facts and instructions only, no privacy or security claims). The pending item name shown in the widget headline is catalog text only, never the Other text.

## 1. Orientation: what exists, what overlaps

Searched for existing functionality overlapping this feature.

| Need | Existing thing | Verdict |
|---|---|---|
| Add an item to the shared list | `addShoppingListItems` in `src/lib/data/shopping-list.ts` (plain RLS insert, multi-row) | **Reuse as is** with a one-element array. No new RPC. |
| Verification gate | `requireVerifiedSession` (`src/lib/auth-gate.ts`) and, for the organizer on their own trip, the inline hide-and-reveal widget `InlineVerifyWidget` / `TripVerificationProvider` (`src/app/trip/[id]/verify-inline.tsx`) | **Reuse.** Additive context members (section 2); the pending slot lives in the provider. |
| Resume an action after OTP | `src/lib/pending-action.ts` (sessionStorage, expense draft only). ARCHITECTURE.md records that shopping-list one-tap mutations deliberately do not use it. | **Not reused.** An organizer on their own trip never leaves the page to verify, so an in-memory slot is enough and stricter (ADR 0015). |
| Trip create | `createTrip` in `src/lib/data/trips.ts`, `create_trip` RPC (0001) | **Extend** with an overload, do not replace. |
| Analytics | `trackEvent(name)` in `src/lib/tracking.ts` | **Reuse unchanged.** |
| Input validation helpers | `src/lib/validation/expense.ts` (the convention) | New sibling `src/lib/validation/trip-type.ts`. |
| Single-source constants module | `src/lib/legal.ts`, `src/lib/locked-trip-copy.ts` | Convention for where the catalog goes. |
| Similar feature already built? | None. There is no template, catalog or trip-type concept anywhere (grepped `catalog`, `template`, `types`, `other_type`, `starter`). | Nothing to duplicate. |

Verified facts the design rests on:

- `src/app/trip/new/page.tsx` has no invite row today, calls `createTrip` once, fires `trip_create_start` on mount and `trip_create_complete` after success, then `router.push("/trip/<id>")`. `createTrip` has exactly one non-test caller.
- `trips` policies: SELECT `is_trip_member(id) or created_by = auth.uid()`, INSERT `created_by = auth.uid()`. No UPDATE or DELETE policy exists in any migration.
- `shopping_list_items.description` has only `char_length(btrim(description)) > 0` (0015). There is no upper bound in the database.
- No existing SQL references an identifier named `types` or `other_type` (grepped all migrations present in the checkout), and no function returns `trips` rows or selects `t.*`. The new columns cannot shadow or collide with anything in an existing function (the 0013 failure mode). Repeat this grep if another migration lands first.
- `get_trip_by_invite_code`, `get_trip_summary`, `join_trip`, `join_trip_by_id` all use explicit column lists and are not touched.

## 2. Pre-verification behavior: verified findings and the exact design

### Findings (from the code)

1. **The List tab is reachable by an unverified (anonymous) organizer.** `renderTripDashboard` (`src/app/trip/[id]/page.tsx`) calls `getTripView` and `getShoppingListView` whenever a session exists. Both are gated by `is_owner_or_verified_member`, which is true for the owner on any session. `TripTabs` always renders the Expenses, Details and List tabs. So the card **can** be shown read-only to a guest organizer, and no new read policy is needed.
2. Today, for an unverified owner, the claim, unclaim and delete controls are hidden (`verified` false in `ShoppingListTab`) and the bottom-bar "Add an item" button is hidden (`VerifiedBottomBarContent`). The inline email and OTP card (`InlineVerifyWidget`) sits above the tabs. There is currently **no** way to add an item before verifying, which is why the first "+" must route into verification.
3. A non-owner who is not verified never reaches the List tab: `getTripView` returns nothing for them and they get `TripSummaryOnly`. So "unverified and sees the card" means "the organizer of this trip", always. (design.md section 4.2's `gateOrRedirect`/sessionStorage path for an unverified invitee is therefore unreachable; design.md must say so, review items B1/D1/D2.)
4. The existing shopping-list gate (`gateOrRedirect` in `shopping-list-tab.tsx`) redirects to the full-page `/check-email`. Using it for "+" would navigate away, lose any in-memory state and make replay need sessionStorage. The organizer's own flow is the inline widget, which verifies in place.
5. `markVerified` in `TripVerificationProvider` does `setVerified(true)` then `router.refresh()`. In this Next version `router.refresh()` keeps client component state (docs: `bfcacheId` "stays the same for ... `router.refresh()`"), which the existing flow already depends on. `verified` flips only after the display-name step too (migration 0020 name prompt), so replay waits for the name.
6. The inline widget headline must name the pending item and offer a Cancel (design.md 4.1). The widget is a sibling of the tabs, not a child of `ShoppingListTab`, so the slot must be readable by the widget. That is why it lives in the provider (S1 resolution).

### Design

**Visibility.** The Suggested card renders for the organizer before verification, with "+" visible and enabled, and is hidden on completed trips (U5). It also renders when the list is empty: the existing `allEmpty` early return in `ShoppingListTab` must be restructured so the card is above both the empty state and the populated state (the empty-list case is the main target of the feature). It does not render if `shoppingList` failed to load (dedupe against existing items is impossible).

**Where the pending slot lives (S1).** In `TripVerificationProvider` (`verify-inline.tsx`), which does not unmount on a tab switch and is already the owner of the `verified` flag. It is not in `ShoppingListTab`. Shape: `{ name: string, tappedAt: number, userId: string }`, nothing else. Never the trip id, a member id, an invite code or the Other text. Memory only (React state/ref in the provider); never URL, storage or log. The context gains these members, all optional-safe (call as `x?.()`/read as possibly undefined so existing mocks keep working):

- `pendingItem: string | undefined` (the name only, for the widget headline and the waiting row; returns undefined once expired);
- `setPendingItem(name: string): void` (records `tappedAt = Date.now()` and `userId` from the current session user; replaces any existing slot);
- `cancelPendingItem(): void`;
- `takePendingItem(): { name, tappedAt, userId } | undefined` (reads and clears in one step; returns undefined if expired);
- `requestVerification(): void` (the widget registers an anchor element; this scrolls it into view and focuses its first input).

**Bounds enforced by the provider (criterion 26):** one slot; a second tap replaces it; cleared on (a) use (`takePendingItem`), (b) Cancel (`cancelPendingItem`, wired to the widget's Cancel button), (c) leaving the List tab (`ShoppingListTab` calls `cancelPendingItem` from its unmount cleanup, and the tab-change handler in `TripTabs` does the same; navigation, reload and unmount also clear it by construction), (d) `SIGNED_OUT` from `supabase.auth.onAuthStateChange` (subscription owned by the provider, unsubscribed on unmount), and (e) the 10-minute TTL. **The TTL is enforced on read**: `pendingItem` and `takePendingItem` compare `Date.now() - tappedAt` to 10 minutes and treat an older slot as absent. A timeout set at tap time (cleared with the slot) also clears the state at expiry, so the waiting row and the widget headline stop saying the item will be added ("Adds after you confirm your email" must not show forever after the slot expired). The waiting row itself expires with the slot: the row's waiting state is derived from `pendingItem`, not from local state. Nothing is added without a tap. If the person never verifies, nothing happens.

**Tap while unverified (`requireVerifiedSession` false):**
1. Do not call the database, do not redirect.
2. `setPendingItem(name)`; the tapped row shows the waiting state (derived from `pendingItem`) and the widget headline shows the name (copy by ux-designer).
3. Call `requestVerification()`.

**Replay when `verified` becomes true** (an effect in `ShoppingListTab` keyed on `verified` from `useTripVerification()`):
1. `takePendingItem()` first, so it runs once, including under React StrictMode double effects. If it returns nothing (cleared, cancelled, signed out, expired) stop.
2. Drop silently if `isCompleted`.
3. `const fresh = await onRefresh()`; require `fresh?.yourMemberId`. If absent (for example the person verified with an email that already belongs to a different account, so the session is a different user and `router.refresh()` has already swapped the page to the summary view), drop it and show nothing misleading.
4. `getUser()`, then **bind to the tapper (S2):** require `user.id === slot.userId`, otherwise drop. Sign-in to an existing account (the `useOtpFlow` fallback) replaces the session without emitting `SIGNED_OUT`, and the other account may itself be a member of the trip, so this check is what stops the item being added under a different account. Anonymous to verified through `updateUser` keeps the same uid, so the happy path passes. Then `requireVerifiedSession`; if false, drop.
5. **Re-derive (S3):** compute `deriveSuggestions(tripTypes, fresh shopping-list items)` and replay only if `slot.name` is still in the result (compare with the same lowercase/trim key). Another member or another tab may have added the item between tap and verification; this prevents a duplicate and guarantees the inserted text is a current catalog name, so the in-memory value is never an arbitrary string. If absent, drop silently.
6. `addShoppingListItems(supabase, { tripId, addedBy: fresh.yourMemberId, descriptions: [name] })`. The database insert policy independently re-checks verified membership, `added_by` ownership and open trip. A failure shows the generic copy.
7. On success: `trackEvent("suggestion_add_complete")`, `onRefresh()` and then `router.refresh()`. The second refresh matters: `markVerified` started a server refresh slightly earlier; its result replaces the client list state when it lands (`TripTabs` re-syncs from the new prop), and without a later refresh it could overwrite the post-insert state and make the added item look missing.

**Fallback if replay misbehaves in testing:** keep steps 1-3 of the tap flow and drop the replay effect. The user lands where they are, verifies, and taps "+" again. Criterion 15 allows this ("either it completes or the user clearly lands back on the List tab"). Not needed unless QA finds a real defect.

## 3. Data model and migration 0022

File: `supabase/migrations/0022_trip_types_and_other_type.sql`, plus `0022_trip_types_and_other_type.qa.test.ts` (text-shape assertions, runs in CI, same style as 0010-0020), the live suite and the verify script (section 12). No past migration is edited. The number is subject to U1.

### Shape

| Item | Decision | Why |
|---|---|---|
| Transaction | The whole file is wrapped in explicit `begin;` ... `commit;` (N3) | A failure in the regex, the overload or the grants leaves no half-applied state (columns present but CHECK or grants missing). The text-shape test asserts both keywords. Nothing in the file is non-transactional (no `create index concurrently`). |
| `trips.types` | `text[] not null default '{}'::text[]` | Constant default: no table rewrite concern, existing rows become `'{}'`, old `create_trip` and old direct inserts keep working through the default. Not null removes the null branch from the CHECK and from client typing. |
| `trips.other_type` | `text`, nullable, no default | "Other" is represented only by this column being non-null (criteria 47, 49, 59). Nullable add needs no backfill. Name chosen to avoid colliding with any identifier; the RPC parameter is `_other_type`. |
| Constraint names | `trips_types_check`, `trips_other_type_check` | Explicit, greppable by the tests; never shown to users. |
| Added in the same migration | Both CHECKs inline (no `not valid`) | Existing rows (`'{}'`, null) satisfy both, so the validation scan on add is safe and fast on this table size. |
| Columns of other tables | None | No `source`, `note`, `batch_id`. |
| Policies | None added or changed. `revoke update on public.trips from anon, authenticated` added (U7). | Criterion 33, 70. |
| Last statement | `notify pgrst, 'reload schema';` (inside the transaction, before `commit`) | Makes the new overload visible to PostgREST immediately; harmless if already reloaded by Supabase's DDL watcher. |
| Header comment | A **SQL comment header** (not `COMMENT ON COLUMN`; PostgREST publishes column comments in its OpenAPI document, N5) states the narrow purpose of `other_type` ("to decide which trip types to add next; read in aggregate by manual query, not joined to identity"), that it is member-readable via the API (criterion 67), and that it must never be added to a public RPC return. The text-shape test asserts the file contains no `comment on column`. | Criteria 54, 67. |

### `trips_types_check` (closed set, no subqueries, no helper function)

Using an inline expression instead of a validator function avoids exposing a new callable function through PostgREST (criterion 37: no new anonymous-callable RPC; every function in `public` is an `/rpc` endpoint by default) and avoids a grant dependency (the role inserting a row needs EXECUTE on any function a CHECK calls). Predicates, all ANDed under `cardinality(types) = 0 or (...)`. **The `cardinality(types) = 0 or` guard must be kept**: `array_ndims('{}')` is NULL, and a CHECK that evaluates to NULL passes, so without the guard the empty array would rely on NULL propagation for the other predicates.

- `array_ndims(types) = 1` and `array_lower(types, 1) = 1` (rejects multi-dimensional and offset-bounds arrays);
- `cardinality(types) <= 3`;
- `cardinality(array_remove(types, null)) = cardinality(types)` (no NULL elements; chosen over `array_position(... null)` to stay obviously immutable);
- `types <@ array['camping','airbnb','international']::text[]` (closed, case-sensitive);
- pairwise distinctness written as `(cardinality(types) < 2 or types[1] <> types[2]) and (cardinality(types) < 3 or (types[1] <> types[3] and types[2] <> types[3]))`: compare only slots that exist (no subquery; NULL elements are already excluded by the atom above, so `<>` cannot yield NULL). **Correction:** an earlier draft used `is distinct from` and claimed absent elements "compare as distinct". That is false: a missing slot reads as NULL, and `NULL IS DISTINCT FROM NULL` is false, so `types[2] is distinct from types[3]` rejected every one- and two-element array (including `{airbnb}`). Found on the first live run; the migration test now fails if `is distinct from types[` reappears.

Every atom must be null-free for any non-null input, because a CHECK that evaluates to NULL **passes**. The live tests prove this with `{NULL}`, `{camping,NULL}`, `{{camping},{airbnb}}`, `{Camping}`, `{bogus}`, `{camping,camping}`, four elements, and explicit `null` (rejected by NOT NULL, `23502`).

**What adding a fourth catalog type takes** (the answer requirements asked for): one new entry in `src/lib/starter-catalog.ts` (TS union, tiles, card, sentence and event name follow automatically), **plus** one new numbered migration that drops and re-adds `trips_types_check` with the extra code (and a higher cardinality bound), **plus** new rows in `docs/ANALYTICS.md` (the `trip_type_selected_<code>` row and, from Revision 3, the `home_template_tapped_<code>` row). Unit tests keep these from drifting: the catalog codes must equal the codes in the newest migration that defines `trips_types_check`, and every catalog code must have both events documented. A fourth type also changes the shelf layout (section 17.2, "Fourth type").

### `trips_other_type_check`

`other_type is null or ( all of: )`

1. `char_length(other_type) between 1 and 30`
2. `octet_length(other_type) <= 120`
3. `other_type = btrim(other_type)` (btrim with no argument trims ASCII space only)
4. `other_type !~ '  '` (no two consecutive spaces)
5. `other_type ~ '^[FIRST]'` (first character letter or digit)
6. `other_type ~ '^[ALLOWED]+$'` (every character allowed)

`$` is end-of-string only in both the Postgres regex engine (default, not newline-sensitive) and JavaScript **without the `m` flag**; keep it that way, so a trailing newline cannot slip through. The client builds the regex without `m`, and does not add the JS `u` flag without re-running the drift test.

**Locale independence.** Postgres has no `\p{L}` and `[[:alpha:]]` follows the collation's ctype (it can reject combining marks). So the rule is an explicit **code-point allowlist** using `\uXXXX` escapes in the regex bracket expression (the Postgres regex engine compares code points, and `standard_conforming_strings` passes the backslash through). Nothing depends on the database collation. The single quote inside the class is doubled in the SQL literal; the hyphen goes last.

Proposed starting `ALLOWED` class (BMP only; written here in code-point notation, the engineer converts each range to `\uXXXX-\uXXXX` and tunes it until the tests in section 12 pass):

- ASCII: `A-Za-z0-9`, space, `-`, `'`, `&`, `,`, `.`, `/`
- Latin-1 letters: U+00AA, U+00B5, U+00BA, U+00C0-U+00D6, U+00D8-U+00F6.
- Script blocks (letters, combining marks, digits, a little in-script punctuation), with invisible/format code points carved out: U+00F8-U+034E, **U+0350-U+05FF** (the split around U+034F is deliberate, see below), U+0606-U+061B, U+061D-U+06DC, U+06DE-U+070E, U+0710-U+088F, U+0892-U+08E1, U+08E3-U+115E, U+1161-U+167F, U+1681-U+17B3, U+17B6-U+180A, U+1810-U+1FFF. This includes the combining diacriticals U+0300-U+036F except U+034F (Vietnamese NFD), Thai, Devanagari and Arabic letters and marks. Excluded gaps: U+0600-U+0605, U+061C, U+06DD, U+070F, U+0890-U+0891, U+08E2 (Arabic and Syriac format characters), U+115F-U+1160 (Hangul fillers), U+1680 (Ogham space), U+17B4-U+17B5, U+180B-U+180F (Mongolian and Khmer invisibles).
- **U+034F COMBINING GRAPHEME JOINER is carved out explicitly (S4).** It sits inside the Latin/Greek/Cyrillic/Hebrew run and is a Default_Ignorable_Code_Point (invisible). The engineer carves it out of the range, as in the split above, and must not relax the property test to let it through. The same applies to any other point the property test reports; carve it out, do not weaken the test.
- Skips U+2000-U+2BFF entirely (general punctuation including all spaces, ZWSP/ZWJ, bidi controls and invisible operators; symbols; arrows; dingbats; emoji-era symbols). Then: U+2C00-U+2DFF, U+3005-U+3007, U+3041-U+3096, U+3099-U+309F, U+30A1-U+30FF, U+3105-U+312F, U+3131-U+3163, U+3165-U+318E, U+31A0-U+31BF, U+31F0-U+31FF, U+3400-U+4DBF, U+4E00-U+D7FF (excludes U+3164 Hangul filler).
- Skips U+D800-U+F8FF (surrogates, private use). Then U+F900-U+FD3D, U+FD40-U+FDCF, U+FDF0-U+FDFB, U+FE20-U+FE2F, U+FE70-U+FEFC, U+FF10-U+FF19, U+FF21-U+FF3A, U+FF41-U+FF5A, U+FF66-U+FF9F, U+FFA1-U+FFDC (compatibility ideographs, presentation forms, fullwidth letters and digits, halfwidth kana and Hangul; excludes U+FE00-U+FE0F variation selectors, U+FEFF BOM, U+FFA0, fullwidth punctuation).

These ranges are a starting point transcribed from the first draft; the property test, not this list, is the authority. If a range here disagrees with the test, fix the range.

`FIRST` is the same set minus the ASCII punctuation and space and minus the combining blocks (U+0300-U+036F, U+1AB0-U+1AFF, U+1DC0-U+1DFF, U+FE20-U+FE2F), so a leading `= + - @ ' & , . /`, space, or a bare combining mark is rejected.

**Why this meets the rule list in criterion 64.** Rejected by construction because they are outside the allowlist: all control characters, NBSP and every Unicode space, line and paragraph separators, ZWSP/ZWJ/ZWNJ/LRM/RLM, bidi embeddings and isolates (U+202A-202E, U+2066-2069), word joiner and invisible operators, BOM, soft hyphen, U+034F, U+061C, every markup and formula character (`< > " \` \ { } [ ] | ; = + @ # % $ ^ * ~ ( ) :` plus `? !`), and all emoji (the BMP symbol blocks, variation selectors, keycap combiner U+20E3, and everything above U+FFFF). NFC is not required by the CHECK; NFD input is accepted because combining marks are in the allowlist.

**Known limit: unassigned code points.** Code points inside an accepted range that are currently unassigned (category Cn) pass the CHECK, and the property test's category checks only see assigned characters. A later Unicode version could assign an invisible character there. This is accepted. To keep it visible, the property test **reports the number of accepted Cn code points** (as a logged/asserted count in a snapshot), so a Node or Unicode upgrade that changes it shows up in review. The test also reports, for the engineer, any accepted code points that are Default_Ignorable (it must be zero).

**One class, two engines.** The same class string is exported from `src/lib/validation/trip-type.ts` and used by the client (`new RegExp`, no `m` flag, no `u` flag) so the form never accepts something the database rejects. The client runs the class check **before** the length check, so a lone surrogate or astral emoji gets the charset message; with BMP-only input `String.length` equals `char_length`, so there is no length drift. The drift test extracts the class from the **newest migration under `supabase/migrations/` that defines `trips_other_type_check`** (found by scanning file names in order and taking the last one containing that constraint name, not literally 0022), un-doubles the quote, and asserts equality with the exported class, so a later tuning migration neither silently fails nor silently passes. A property test walks every BMP code point and asserts that nothing the class accepts is in Unicode categories Cc, Cf, Zs, Zl, Zp, Co, Cs, nor `Extended_Pictographic`, `Bidi_Control` or `Default_Ignorable_Code_Point`. That test is the arbiter for tuning the ranges and does not need a database.

## 4. `create_trip` overload and the client contract

### Database

New function, in migration 0022 (inside the same `begin`/`commit`):

`public.create_trip(_name text, _display_name text, _location text, _starts_on date, _ends_on date, _types text[], _other_type text) returns table (trip_id uuid, invite_code text)`

- **No parameter defaults at all.** A PostgREST call with the five old named arguments can then match only the old overload (no PGRST203), and a seven-argument call matches only the new one.
- `language plpgsql security definer set search_path = public`.
- Body is a self-contained copy of the 0001 body with the two new columns in the single `insert into public.trips (...)`, so the row is valid from birth and the CHECKs apply to that one statement. Qualifies `public.trips.invite_code` in `returning`, exactly as 0001 does. The new parameters are `_`-prefixed, so they cannot collide with the `types` and `other_type` columns. No unqualified `trip_id` or `invite_code` appears (the output parameters share those names with columns of `trip_members` and `trips`).
- Normalization inside the function: if `_other_type` is not null, `btrim(regexp_replace(normalize(_other_type, NFC), ' {2,}', ' ', 'g'))`. It does **not** coerce blank to null and does not drop invalid input: a bad value goes into the insert and the CHECK rejects it (`23514`), so a rejected value never silently turns into a trip without it. `normalize()` needs Postgres 13+ and a UTF8 database (Supabase satisfies both; the live suite proves it).
- `_types` is stored as given (pick order preserved); the CHECK validates it.
- Grants, in this order: `revoke execute ... from public;` `revoke execute ... from anon;` `grant execute ... to authenticated;` on the **seven-argument** signature. The five-argument signature's existing grants (0002, 0003) are not touched. The migration contains no `create or replace` or `drop` of the five-argument function (test asserts this).
- The migration does not redefine `get_trip_by_invite_code`, `get_trip_summary`, `join_trip`, `join_trip_by_id` or any function returning trip data (criterion 68; test asserts the file never mentions `types` or `other_type` outside the two CHECKs, the alter statements and the new function).

Rejected: calling the old function from the new one and then `update public.trips set types = ...` inside it. It would work (security definer bypasses the missing UPDATE policy) but it splits creation into two statements, makes the new overload depend on the old body staying unchanged, and puts an UPDATE of the guarded columns inside a privileged function, which is the kind of write path criterion 33 wants absent. About ten duplicated lines is the cheaper trade ([ADR 0014, trip types](../../adr/0014-trip-types-column-checks-and-create-trip-overload.md)).

### Client (`src/lib/data/trips.ts`)

`createTrip(supabase, input)` input gains optional `types?: TripType[]` and `otherType?: string` (already normalized by the caller). Returns `{ tripId, inviteCode, typesStored: boolean }`; the one existing caller reads `tripId` and keeps working unchanged.

1. **No types and no Other text:** call the five-argument RPC exactly as today. This path is identical to current behavior (criterion 2) and works with or without the migration.
2. **Otherwise** call the seven-argument form with all seven named keys (`_types` as an array, `_other_type` as string or `null`). Success returns `typesStored: true`.
3. **Fallback:** only when `error.code` is `PGRST202` or `42883` (function not found: migration not applied, or PostgREST schema cache not yet reloaded) call the five-argument form and return `typesStored: false`. Any other error, including `23514`, is **not** retried. (`42883` can also be raised from inside the new function body; the fallback then silently drops the types but the trip is still created, which is acceptable, and the live test of `normalize()` covers that body.)
4. **Error hygiene (criterion 62).** `createTrip` catches the Postgrest error and rethrows a fresh `CreateTripError` carrying only the SQLSTATE or PostgREST code string. `message`, `details` and `hint` of the original (which contain the whole failing row, including name, location and the Other text) are never copied, logged, passed to `timeAsync` or perf-log, or attached to analytics. The page's `catch` already shows fixed copy; a test pins that the rendered string contains none of the typed text, "violates", "constraint" or the column name. Nothing calls `console.*` on this path.
5. Analytics fire only if `typesStored` is true (section 8). When `typesStored` is false the Other text is discarded and not retained client-side.

Typing: `src/lib/supabase/types.ts` (hand-authored) gets `trips.Row.types: string[]` and `trips.Row.other_type: string | null`, and the `create_trip` `Args` becomes a union of the five-argument and seven-argument shapes (what `supabase gen types` emits for overloads). `Insert`/`Update` stay `Partial<Row>`-based.

## 5. Catalog config

**Location and format:** `src/lib/starter-catalog.ts`, plain TypeScript. There is no `src/config`, and single-source constants already live in `src/lib` (`legal.ts`, `locked-trip-copy.ts`). TS rather than JSON because the file must carry a header comment (Comp C9) and the code union is derived from it.

Contents (data only; no logic):

- A header comment: "Catalog items are generic category names only. Do not add suggestions that imply a person's health, religion or other special-category status (for example specific medications or religious items). 'Prescriptions' and 'First-aid kit' are generic and fine." Plus short editing instructions: to add, remove, rename or reorder an item or change a label, edit only this file; adding a new type also needs a migration (point at section 3 of this doc) and an ANALYTICS.md row.
- `STARTER_TYPES`: an ordered readonly array of `{ code, label, phrase, items }` (for example `{ code: "airbnb", label: "Airbnb stay", phrase: "an Airbnb stay", items: [...] }`). Array order is the tile order. `phrase` feeds the adaptive sentence ("an Airbnb stay", "international travel", "camping").
- `OTHER_TILE_LABEL` ("Other"). Not a catalog type: no entry, no items, no code.
- The type `TripType` is `(typeof STARTER_TYPES)[number]["code"]`. There is no `"other"` anywhere (a test asserts no code equals `other` and the migration's allowed list has no `other`).
- Item content is owned by the user and has since been edited to shared-expense items (the header now says to keep items to things a group would plausibly pay for and split). **Item counts are always derived from `items.length`; no document, component or test may hardcode them.** (Draft content in requirements.md was 18 / 15 / 12; the file today reads 18 / 16 / 13, see 17.12 U12.) Sign-off is U8.

Pure logic lives next to it in `src/lib/starter-suggestions.ts` (so the config file stays edit-only): `isTripType`, `deriveSuggestions(types, existingDescriptions)`, `sentencePhrases(types)`, `tripTypeSelectedEvent(code)`, and from Revision 3 `homeTemplateTappedEvent(code)` and `parseTypeParam(raw)` (section 17).

`deriveSuggestions`: iterate the trip's types in stored (pick) order, each type's items in catalog order, key = `name.trim().toLowerCase()`, skip keys already seen or present among the list's existing item descriptions (any status), first type wins the source label. Returns `{ name, sourceCode, sourceLabel }[]`. Nothing stored; a deleted item reappears on the next derive (criterion 11). It is also what the replay step uses to re-check a pending name (section 2, step 5).

## 6. Module boundaries and file plan

New:

| File | Purpose | Depends on |
|---|---|---|
| `src/lib/starter-catalog.ts` | Config (section 5) | nothing |
| `src/lib/starter-suggestions.ts` | Pure derive, sentence, event-name helpers | catalog |
| `src/lib/validation/trip-type.ts` | Other-text normalize and validate, exports the character class and limits (`OTHER_TYPE_MAX_LENGTH = 30`) | nothing |
| `src/lib/data/trip-columns.ts` | Explicit column lists for `trips` reads (section 7) | nothing |
| `src/app/trip/new/trip-type-picker.tsx` | Client leaf: fieldset and legend, four checkboxes, Other input, counter, hint, error | catalog, suggestions, validation |
| `src/app/trip/[id]/suggested-card.tsx` | Presentational card: rows, "+" buttons with `aria-label` containing the item name, waiting state (driven by a `pendingName` prop) | `ui.tsx` |
| `supabase/migrations/0022_trip_types_and_other_type.sql` and `.qa.test.ts` | Section 3 | |
| `supabase/migrations/0022_trip_types_and_other_type.live.qa.test.ts` | Live suite (section 12), skipped unless env vars set | `@supabase/supabase-js` (already a dependency) |
| `supabase/verify/0022_trip_types_and_other_type.verify.sql` | Manual SQL verification script (section 12) | |

Changed:

| File | Change |
|---|---|
| `src/lib/data/trips.ts` | `createTrip` per section 4; `getMyTrips`/`getTripView` use explicit column lists; `TripRow` becomes a `Pick`; `getTripView` returns `trip.types` (validated with `isTripType`, defaulting to `[]` if absent, which also keeps old test fixtures working) |
| `src/app/trips/page.tsx` | explicit column list from `trip-columns.ts` (Revision 3 also restructures the markup, section 17.3) |
| `src/lib/supabase/types.ts` | section 4 |
| `src/app/trip/new/page.tsx` | uses the picker; builds `types` in pick order and `otherType`; fires events; navigates to `?tab=list` when a catalog type was stored (U4). **Revision 3: this body moves to `new-trip-form.tsx` and `page.tsx` becomes a thin server wrapper (section 17.5).** |
| `src/app/trip/[id]/page.tsx` | passes `trip.types` to `TripTabs` |
| `src/app/trip/[id]/trip-tabs.tsx` | new optional prop `tripTypes` (default `[]`), forwarded to `ShoppingListTab`; calls `cancelPendingItem` when the active tab leaves List |
| `src/app/trip/[id]/shopping-list-tab.tsx` | derives suggestions, renders the card above "To get" in both empty and populated states, the "+" handler, the replay effect (section 2); calls `cancelPendingItem` on unmount. It holds **no** pending state of its own |
| `src/app/trip/[id]/verify-inline.tsx` | **owns the pending slot** (section 2): `pendingItem`, `setPendingItem`, `cancelPendingItem`, `takePendingItem`, `requestVerification` on the context; TTL on read; `SIGNED_OUT` subscription; `InlineVerifyWidget` registers its anchor, shows the pending item name in its headline and a Cancel button |
| `src/app/privacy/page.tsx`, `src/lib/legal.ts`, `docs/runbooks/account-deletion-and-export.md`, `docs/ANALYTICS.md` | section 9 |
| `package.json` / `CHANGELOG.md` | 0.7.0 to 0.8.0 at release |

Unchanged on purpose (base design): `add-item-sheet-content.tsx` and its routes (suggestions never appear there, criterion 12), `pending-action.ts`, `auth-gate.ts`, every route handler under `src/app/api/`, `trip-email`, `join`, `trip-invite`, the invite, check-email, join and welcome pages, `proxy.ts`, `tracking.ts`. **Revision 3 amends this list:** `home-screen.tsx` (welcome content) and `ui.tsx` gain additive changes, `src/app/page.tsx`, `proxy.ts` and `tracking.ts` remain unchanged, see section 17.

New Trip page behavior notes: pick order is an array appended on check and removed on uncheck (it is what is stored). Unchecking Other discards its text from state (never submitted, never persisted; criteria 41, 44, 63). The Other input has `autoComplete="off"`, no draft storage, no value in the URL. The adaptive sentence uses `sentencePhrases` over catalog types only; Other is never mentioned. The page's existing Next.js conventions are unchanged (client component, `router.push`); no new Next.js APIs are introduced, so no new framework-specific pattern needs checking beyond what the engineer reads in `node_modules/next/dist/docs/` per AGENTS.md (client components, `useRouter` refresh semantics). (Revision 3 does introduce the async `searchParams` prop on a server page; section 17.5.)

## 7. Replacing `select("*")` on `trips` (criterion 69)

New module `src/lib/data/trip-columns.ts` (not under a mocked path) exports `as const` string literals so supabase-js still infers row types:

- `TRIP_LIST_COLUMNS`: `id, name, location, starts_on, ends_on, created_by, completed_at, created_at` (exactly what `getMyTrips` reads today).
- `TRIP_VIEW_COLUMNS`: the list set plus `invite_code, types`.

| Call site | Change |
|---|---|
| `src/lib/data/trips.ts:227` (`getMyTrips` own fetch) | `select(TRIP_LIST_COLUMNS)` |
| `src/lib/data/trips.ts:307` (`getTripView`) | `select(TRIP_VIEW_COLUMNS)` |
| `src/app/trips/page.tsx:100` | `select(TRIP_LIST_COLUMNS)`; the rows are passed into `getMyTrips`, so its `prefetchedTripRows` parameter type becomes `Pick<TripsRow, ...>[]` (same fields) |

`other_type` is in no select list. A grep test fails the build if any `from("trips")` is followed by `.select("*")` or `.select()` (multi-line aware, over `src/**/*.ts(x)`), if `other_type` appears inside any `.select(` argument, and if the identifier appears in `src/` outside the allowed set (`validation/trip-type.ts`, `trips.ts` RPC payload key `_other_type`, `types.ts`, tests). Other `select("*")` calls on other tables (`trip_members`, `expenses`, `shopping_list_items`) are out of scope and unchanged.

## 8. Analytics

Name-only through `trackEvent(name)`; no signature change; no properties; `trackEvent` is never given a second argument.

| Event | Fires | Where |
|---|---|---|
| `trip_type_selected_camping`, `trip_type_selected_airbnb`, `trip_type_selected_international` | once per stored catalog type, in pick order, only when `createTrip` returned `typesStored: true`, right after `trip_create_complete` | `src/app/trip/new/page.tsx` (Revision 3: `new-trip-form.tsx`) |
| `trip_type_selected_other` | once, only when `typesStored` is true and an Other text was sent; no property, not the text, not its length | same |
| `suggestion_add_complete` | after a successful insert from a "+" tap, including the replayed one; not on error | `shopping-list-tab.tsx` |

Per-type names come from `tripTypeSelectedEvent(code)` in `starter-suggestions.ts`, which only accepts a code that exists in `STARTER_TYPES` (otherwise it returns nothing and no event fires); the input comes from the catalog-driven UI, never from free text. A test asserts every catalog code has its row in `docs/ANALYTICS.md`. `docs/ANALYTICS.md` gets a new "Starter lists" table with these five rows (Trigger, Route/Component, Why Track, Payload Example `{ event: "..." }`), and the "What is NOT collected" list gains "Trip type text". Events do not fire on validation or network errors (criterion 20). The success measure stays a manual DB query, not delivered here (criterion 21). Revision 3 adds four tap events through the same pattern (section 17.6).

## 9. `/privacy`, `LEGAL_LAST_UPDATED`, runbook

**`src/app/privacy/page.tsx`** (exact edits; wording mirrors Comp O6 and criterion 56, no more than is true):
1. "What we collect", Trip details item: extend to "name, location (...), dates, members, the kinds of trip you pick, and, if you choose Other, a short trip type you type (up to 30 characters)".
2. Sensitive-data paragraph: add "trip type" to "trip names, expense descriptions or comments".
3. "Why we use your data", legitimate-interests item: add "deciding which trip types to add to Splitiful's suggestions (from the short trip type some people type, read by us in aggregate)".
4. Do not say only the organizer can see the text (criterion 67). The analytics sentence is unchanged. Retention and Your rights need no new text. `/terms` was skimmed: "You keep ownership of what you enter (names, trip details, ...)" already covers this and makes no promise about trip text, so no change.

**`src/lib/legal.ts`**: bump `LEGAL_LAST_UPDATED` to the merge date (the file's own comment requires it). A test fails if it still equals "October 12, 2026". Revision 3 needs no second bump (criterion 118).

**`docs/runbooks/account-deletion-and-export.md`** (criteria 38, 55):
- Export section: name `trips.types` and `trips.other_type`; state the export uses `to_jsonb(t) - 'invite_code'` so both are included automatically and a future column exclusion must not drop `other_type`; a non-organizer member who typed nothing has nothing to export for this column.
- Deletion case B: add step "clear the Other text": `update public.trips set other_type = null where created_by = '<uid>';` (service role or SQL editor; not an app path, so criterion 33 stands).
- Case A and the 90-day purge: note the text is deleted with the trip through the `created_by` cascade (0018 needs no change; the final review re-confirms the purge really cascades to `trips`).
- Notes paragraph: one line naming `other_type`, saying it may contain personal information by user choice and is **not** presumed non-personal (the "non-personal" statement applies to `types` only), and that any trip member can read it through the API.
- Record the compliance review outcome in the same PR.

## 10. Impact analysis

### Consumers of what changes

| Changed thing | Consumers found (search) | Compatible with what is deployed now? |
|---|---|---|
| `public.trips` gains two columns | Every `from("trips")` in `src/`: `trips.ts:227`, `trips.ts:307`, `trips/page.tsx:100` (`select("*")`); `api/trip-email/route.ts:33` and `api/join/route.ts:68` (`select("name")`); `add-expense-sheet-content.tsx:107`, `add-item-sheet-content.tsx:41` (`select("completed_at, created_by")`); `edit-expense-sheet-content.tsx:76` (`select("completed_at")`). SQL: functions reading `public.trips` in 0005, 0008, 0009, 0010, 0013, 0014, 0016, 0018 (explicit columns, none names `types` or `other_type`). Direct INSERT policy (0001). | Yes, additive. Old code with new schema works: old `select("*")` returns two extra fields that old code ignores; old `create_trip` and old direct inserts rely on the defaults. |
| `create_trip` (new overload) | `createTrip` in `trips.ts` (single non-test caller `trip/new/page.tsx`), `src/lib/supabase/types.ts`, grants in 0002/0003 (five-argument only) | Yes. The five-argument signature and its grants are untouched. The new overload is callable only by `authenticated`. |
| `createTrip` return shape | `src/app/trip/new/page.tsx` only | Additive field `typesStored`. |
| `getTripView` return (`trip.types`) | `trip/[id]/page.tsx`, `trip/[id]/settle-up/page.tsx`, `join/[code]/welcome/page.tsx`, `src/lib/perf/trips.bench.ts`, tests in `src/lib/data/*.test.ts` | Additive field. The `?? []` default keeps fixtures lacking `types` valid. |
| `getMyTrips` / `TripRow` type | `trips/page.tsx`, `trips.bench.ts`, `trips.test.ts` | Same fields used; type becomes a `Pick`. |
| `TripTabs` props (`tripTypes`) | `page.tsx`, `trip-tabs.qa.test.tsx`, `trip-tabs.details-show-all.qa.test.tsx` | Optional prop, default `[]`. |
| `ShoppingListTab` props (`tripTypes`) and structure | `trip-tabs.tsx`, `shopping-list-tab.qa.test.tsx` | Optional prop. The restructured empty state must keep the existing "Nothing on the list yet." behavior when there are no suggestions. |
| `TripVerificationContext` (five new optional members: `pendingItem`, `setPendingItem`, `cancelPendingItem`, `takePendingItem`, `requestVerification`) and new provider state/subscription | `verify-inline.tsx` consumers: `page.tsx`, `trip-tabs.tsx`, `shopping-list-tab.tsx`; `InlineVerifyWidget` (headline, Cancel, anchor); test `shopping-list-tab.qa.test.tsx` mocks the hook; any other test that renders `TripVerificationProvider` and mocks `supabase.auth.onAuthStateChange` (the provider now subscribes; a mock lacking it must be made tolerant) | Additive; read with optional calls. The new `onAuthStateChange` subscription must not break existing provider tests: search for tests that render the provider and add the mock where missing. |
| `src/app/trips/page.qa.test.ts` | Mocks `@/lib/data/trips` with a factory | Safe only because the column constants live in `trip-columns.ts`. |

Revision 3 consumers are in section 17.9.

### Compatibility matrix (migrations and deploys are not atomic)

| Schema | App | Result |
|---|---|---|
| Old | Old | Today. |
| **New** | **Old** | Works. Old `create_trip` unchanged; extra columns ignored. Brief window where old `select("*")` returns `other_type` to members' browsers; no row can hold a value until the new client ships (only direct inserts could), so exposure is nil in practice. |
| **Old** | **New** | Trip creation works (no types: five-argument path; with types: fallback on `PGRST202`/`42883`). **Trip dashboard breaks**: `getTripView` selects `types`, which does not exist yet. Prevented by ordering (section 11). Blast radius if violated: organizer sees the summary-only view (`getTripView` failure is caught), no data loss. |
| New | New | Intended. |

### Contract policy

No breaking contract change, so no `/api/v2` and no versioned route. The only contract addition is the new RPC overload, which coexists with the old one by name-set (no defaults). The Vercel build and the migration ship in a defined order rather than atomically (section 11). Revision 3's one URL-contract addition (`/trip/new?type=<code>`) is optional, ignored when invalid, and an old client or old bookmark of `/trip/new` is unaffected.

## 11. Deploy ordering, verification gates and rollback

Release steps (U3 recommends two merges):

0. **Before the migration merges:** re-confirm the number is still the next free one (U1): the checkout's `supabase/migrations/` listing versus the live `schema_migrations` rows.
1. **PR A: migration 0022 + `0022_*.qa.test.ts` (+ live suite and verify script).** CI green. Run the live suite (section 12) against the non-production project first, then confirm the migration applied to production (Supabase dashboard migrations list, or `select column_name from information_schema.columns where table_name = 'trips' and column_name in ('types','other_type')`). Run the SQL verification script (section 12) in the SQL editor for privileges and function bodies. **Record the output of the production column query (and the script run) in the QA report before PR B is merged.** The deploy ordering is a human rule, not enforced by CI, so this recorded check is the gate. Production now has the schema with old app code live: safe per the matrix.
2. **PR B: app code, docs, privacy, runbook, ANALYTICS, version bump (including Revision 3).** Merge only after step 1's recorded confirmation. CI green (includes all unit tests). Merge; Vercel deploys.
3. Post-deploy smoke: create a trip with no type (five-argument path), one with Airbnb + Other (seven-argument path), confirm the card, tap "+" as a verified user, and as a guest organizer confirm the verify-then-add flow, including Cancel and that a second tab or tab switch drops the pending add. Check Vercel Analytics for the new event names (including the four `home_*` names after tapping a tile on `/` and `/trips`).

If a single PR is chosen instead, hold Vercel's production promotion until step 1's confirmation is done and recorded. CI cannot enforce this; the repo's `.github/workflows/ci.yml` runs lint, typecheck, test and build only and does not apply migrations, and the "Re-trigger Supabase migration deploy" commit suggests migrations apply via Supabase's own integration on push to `main`, with no ordering guarantee relative to Vercel.

**Rollback.** Forward-only migrations. To roll back the app: redeploy the previous Vercel build; it works with the new schema (matrix row 2). Do **not** drop the columns while the new build is live (it selects `types`). Preferred end state after a rollback is to leave the columns, CHECKs and overload in place (harmless, unreferenced). If removal is ever wanted, write a new migration that drops the seven-argument function, then the two constraints, then the two columns, and only after the previous build is live. Dropping loses stored types and Other text, which is acceptable pre-adoption.

## 12. Test plan

Unit and component tests (vitest, run in CI) and live tests (run by hand before PR A merges). File names follow the repo's `*.qa.test.ts` / `*.test.ts` conventions. Revision 3 tests are in section 17.10.

### CI tests

| Test (file) | Proves | Criteria |
|---|---|---|
| `starter-catalog.test.ts` | codes unique, lowercase, not `other`; names non-empty after trim; no duplicates within a type (case-insensitive, trimmed); every name satisfies the 0015 rule (`char_length(btrim(x)) > 0`) and a house maximum of 80 characters (0015 has no upper bound; this keeps the card layout safe); header contains the special-category note; catalog codes equal the codes in the newest migration defining `trips_types_check`; every code has an ANALYTICS.md event row | 17, 18, 27, 28, 59, 29 |
| `starter-suggestions.test.ts` | merge, dedupe on lowercase trim, pick-order label, existing items of every status excluded, deleted item reappears, empty result, sentence phrases for 0 to 3 types and with Other excluded, event helper rejects unknown codes | 7, 8, 10, 11, 17 |
| UI-reads-config test | render the picker and card with `vi.mock("@/lib/starter-catalog")` supplying a different catalog and assert labels and items follow it; plus a source scan that no catalog item string appears as a literal in `src/app/**/*.tsx` | 17, 12 |
| `validation/trip-type.test.ts` | normalize (NFC, collapse, trim, smart quotes) and validate; accept and reject matrix mirroring criterion 65 (Ski weekend; ASCII Vietnamese; Cắm trại in NFC and NFD; キャンプ; Arabic; Thai and Devanagari with combining vowel signs; a valid 30-character value; reject empty, spaces only, 31 characters, newline (including a trailing newline, which proves `$` has no `m` semantics), tab, NBSP, double space, leading and trailing space, `<script>`, `=1+1`, U+202E, U+200B, **U+034F**, emoji, ZWJ sequences, variation selector, lone surrogate); the class check runs before the length check; all-BMP property test (nothing accepted in Cc/Cf/Zs/Zl/Zp/Co/Cs, Extended_Pictographic, Bidi_Control, Default_Ignorable) that also **reports the count of accepted unassigned (Cn) code points**; drift test against the class in the **newest** migration defining `trips_other_type_check`, plus an assertion that the client regex is built without `m` and `u` flags (changing either requires re-running the drift test) | 43, 46, 64, 65 |
| `0022_*.qa.test.ts` (text shape) | file wrapped in `begin;` ... `commit;`; two columns with exact definitions; both CHECK names present; the `cardinality(types) = 0 or` guard present; no `not valid`; no `other` in the allowed list; new function has 7 params with no `default`; qualified `public.trips.invite_code`; `revoke ... from public`, `from anon`, `grant ... to authenticated` on the 7-arg signature; no `create or replace`/`drop` of the 5-arg function; no redefinition of `get_trip_by_invite_code`, `get_trip_summary`, `join_trip`, `join_trip_by_id`; no `t.*`/`setof public.trips`; no UPDATE policy or grant added; `revoke update on public.trips`; no `comment on column`; `notify pgrst` present | 29, 30, 32, 33, 48, 59, 60, 68, 71 |
| `trips.create-trip.test.ts` | no types: five-arg call only; types or Other: seven-arg call with all seven keys; fallback happens on `PGRST202` and on `42883` and on nothing else (`23514`, network, `42501` all throw `CreateTripError`); thrown error exposes no `message`/`details`/`hint` from the original; `typesStored` flags; pick order preserved | 2, 3, 31, 50, 61, 62 |
| `trips.select-columns.test.ts` | grep test: no `from("trips")` with `.select("*")` or empty `.select()` anywhere in `src`; `other_type` appears in no `.select(` argument and nowhere outside the allowed files; `getTripView` select includes `types` | 34, 51, 68, 69 |
| `new-trip` page tests | four checkboxes with fieldset legend; selected state not color-only; Other input appears and hides, text discarded on uncheck, `autoComplete="off"`, label and `aria-describedby`, counter announces only near the limit, error tied to the input with focus returned; empty or whitespace Other blocks submit; fixed event calls (`toHaveBeenCalledWith(name)` and every call has exactly one argument; no call contains the typed text; also with Other combined with catalog types); no events on error; no events when `typesStored` is false; forced rejection carrying a CHECK-style error with the typed text in `details` renders only the fixed generic string; typed text never in `router.push`, `localStorage`, `sessionStorage` or `document.title` | 1, 2, 4, 19, 20, 35, 39, 40, 41-46, 53, 58, 62, 63 |
| `shopping-list-tab` card tests | card above "To get" in empty and populated states; absent for no catalog type, Other only, no remaining suggestions, completed trip, null list; "+" adds exactly one name via `addShoppingListItems`; item removed after refresh; "+" `aria-label` includes the name and the target is at least 40px; unverified tap makes zero database calls, calls `setPendingItem` and `requestVerification`; replay fires exactly once after `verified` flips and never without a tap; **replay is dropped** on missing member id, on `isCompleted`, on `getUser().id` differing from the slot's `userId` (S2), and when the name is no longer in `deriveSuggestions(types, fresh items)` because another member added it meanwhile (S3, zero inserts); second `router.refresh()` after replay; failure path shows generic copy; no "Add all", Undo, template tile, copy-trip or Share control; add-item sheet module does not import the catalog | 6-16, 23, 25, 26 |
| `verify-inline` provider tests (slot) | `pendingItem` exposes the name only; the slot holds exactly `{name, tappedAt, userId}` and is never written to `localStorage`/`sessionStorage`/URL; second tap replaces it; `takePendingItem` clears in one step (second call returns nothing, StrictMode-safe); **Cancel** clears it and the headline and waiting row revert; leaving the List tab and unmount clear it; `SIGNED_OUT` clears it; **TTL**: with fake timers, `takePendingItem` and `pendingItem` return nothing after 10 minutes, and the waiting row and widget headline stop showing the pending text at expiry (no stale "Adds after you confirm your email"); a sign-in as a different uid is dropped at replay; the `onAuthStateChange` subscription is unsubscribed on unmount | 15, 26 |
| Docs and legal tests | privacy page contains the three new phrases and not "only the organizer"; `LEGAL_LAST_UPDATED` changed; runbook names `other_type` and contains the clear statement; ANALYTICS.md has the five event names; header note present in catalog | 24, 38, 55, 56, 57, 67 |

### Live tests (not CI; run manually, U2)

`0022_trip_types_and_other_type.live.qa.test.ts`, `describe.skipIf` unless `LIVE_SUPABASE_URL`, `LIVE_SUPABASE_ANON_KEY` and `LIVE_SUPABASE_SERVICE_ROLE_KEY` are set. Uses only `@supabase/supabase-js` (no new dependency): real PostgREST, real RLS, real anonymous sessions (`signInAnonymously`), one verified user created with the admin API (`auth.admin.createUser` with `email_confirm: true` and a password, then `signInWithPassword`), a second anonymous user as the non-member. Fixture addresses use a non-routable domain (`@example.invalid`), carry no real personal data, and no email is sent. At most three sign-ins (stays under Supabase's anonymous sign-in rate limit). All created trips and users are removed in `afterAll` through the service role.

| Group | Cases | Criteria |
|---|---|---|
| Existing rows and defaults | pre-existing trip rows read `types = []`, `other_type = null`; old five-named-argument call resolves to the old overload with no PGRST203 and creates a trip with defaults; the seven-argument call stores pick order and normalized text | 30, 31, 50, 60 |
| `types` CHECK by direct INSERT (authenticated anonymous user, the real attack path) | reject: `{bogus}`, `{camping,camping}`, four elements, `{NULL}`, `{camping,NULL}`, multi-dimensional, `{Camping}`, explicit null; accept: `{}`, `{camping}`, `{international,camping}` (order preserved), all three | 29, 71 |
| `other_type` CHECK by direct INSERT | every accept and reject case of criterion 65 on the real Supabase collation, with `23514` asserted for charset and length cases (NUL fails earlier with a different code and must still fail); U+034F rejected; trailing newline rejected; NFC and NFD Vietnamese round-trip unchanged; 30 accepted, 31 rejected; octet bound | 48, 64, 65 |
| RPC rejection | seven-argument call with a bad Other text returns `23514` and creates no trip row (checked by service role); seven-argument call with `_other_type` of two spaces inside is collapsed and accepted | 60, 61, 62 |
| Fallback signal | a deliberately mismatched call (for example six keys) returns `PGRST202` from the real PostgREST, confirming the exact code the client keys on | 61 |
| Privileges | anon-key client without a session cannot call either `create_trip` signature (permission denied); `authenticated` can call both | 32, 60 |
| No write path | member and organizer `update trips set types = ...` and `set other_type = ...` fail (permission denied, or zero rows with the row unchanged) | 33, 70 |
| "+" gate at the database | anonymous organizer inserting a catalog item name into `shopping_list_items` with their own member id: rejected; non-member (second user) inserting with the organizer's member id: rejected; verified organizer: accepted; verified organizer on a completed trip: rejected | 15, 16, 25 |
| Public RPCs do not return the new columns | `get_trip_by_invite_code` and `get_trip_summary` called as the service role return rows with no `types`/`other_type` keys | 51, 68 |

**SQL verification script** (committed as `supabase/verify/0022_trip_types_and_other_type.verify.sql`, deliberately outside `supabase/migrations/` because the Supabase CLI would apply any `0022_*.sql` there as a second migration with the same version, run once in the Supabase SQL editor against each database). It asserts, each as a row with an expected and an actual value:

- `has_function_privilege('anon', ..., 'execute')` is false for both `create_trip` overloads and true for `authenticated`;
- **`information_schema.routine_privileges` for `create_trip` (both overloads, matched by `specific_name`) contains no row with `grantee` in (`anon`, `PUBLIC`)** (N7), and does contain `authenticated`;
- **`has_table_privilege('authenticated', 'public.trips', 'update')` and the same for `anon` are false** (C6/U7), and **`has_column_privilege(role, 'public.trips', column, 'update')` is false for every column of `public.trips` and each of the two roles** (a column-level grant would survive the table-level revoke);
- `pg_get_functiondef` of `get_trip_by_invite_code`, `get_trip_summary`, `join_trip`, `join_trip_by_id` does not contain `types` or `other_type`;
- no function has `prorettype` of `public.trips`;
- `pg_get_constraintdef` dump of both CHECKs for the reviewer to read;
- `select count(*)` of rows violating each CHECK is zero.

A script instead of a test because PostgREST does not expose catalog functions and the repo has no direct-Postgres client (and no new dependency should be added for it).

Gate: PR A may merge only after the live suite and the script pass against the non-production database; the QA report records the run, and records the production column check before PR B merges (section 11).

## 13. Constraints satisfied

### Compliance constraints

| Constraint | Where met |
|---|---|
| C1 data minimization | Two columns only, closed-set `types`, 30-character `other_type`; no per-suggestion state (section 5); purpose in migration header, privacy page, runbook |
| C2 server-side validation | `trips_types_check`, `trips_other_type_check` on the columns (section 3), not only the RPC |
| C3 export and deletion | Runbook edits (section 9); `to_jsonb(t) - 'invite_code'` already includes both columns; cascade and 0018 purge need no change |
| C4 and O7 analytics | Closed-set names, no properties, only after success (section 8); `trackEvent` guard tests |
| C5 and O6 privacy page | Section 9 edits and date bump; terms skimmed |
| C6 and O5 copy | Helper text limited to facts and instructions; no privacy claims; the card is not described as private; the Add flow copy already says everyone sees the list; the widget headline names catalog text only |
| C7 pending action | Section 2: single item name in a provider-held in-memory slot `{name, tappedAt, userId}`, cleared on use, Cancel, tab leave, `SIGNED_OUT` and TTL (on read), re-authorized by RLS |
| C8 deploy safety | Sections 3, 4, 10, 11 |
| C9 catalog content | Header note in `starter-catalog.ts`; test asserts it |
| C10 minors | Nothing new |
| O1 purpose | Migration header, privacy line, runbook; no use beyond manual aggregate query |
| O2 minimization | One nullable column, no copy elsewhere, no log or analytics |
| O3 retention | Cascade, 0018 purge, runbook case B clear statement |
| O4 export | Runbook names the column |
| O8 non-display | Section 7 and 10; no public RPC touched; grep and function-definition checks |
| O9 abuse | Column CHECK; no new rate limit |
| O10 third parties | No new vendor; text not sent to Vercel Analytics, Resend, Upstash |

### Security constraints

| Constraint | Where met |
|---|---|
| C1 and O1-O3 column CHECKs | Section 3, including the null-propagation rule, the `cardinality = 0 or` guard and the list of `types` edge cases |
| C2 and O11 migration safety | Nullable or constant-default columns, CHECKs inline, no `not valid`, existing rows satisfy them, whole file in `begin`/`commit` (N3); live-verified (U2) |
| C3, D1, O4, O9 compatibility and overload | Section 4: no defaults, old signature untouched, fallback only on `PGRST202`/`42883` |
| C4 grants and search_path | Section 4: `security definer`, `set search_path = public`, revoke public and anon, grant authenticated, qualified references, `_`-prefixed parameters; verified by the privileges script including `routine_privileges` (N7) |
| C5 read access | No policy change; explicit column list with `types` only where the trip view needs it |
| C6 and O10 no UPDATE path | No policy added; table-level update revoked (U7); verify script checks `has_table_privilege` and `has_column_privilege` for update; live tests for member and organizer |
| C7 gate unchanged | "+" uses the existing insert; no RPC, no grant change; live tests prove the database rejects unverified and non-member inserts |
| C8 pending replay (S1-S3) | Section 2: provider-held slot with TTL on read, clear on tab leave/Cancel/`SIGNED_OUT`/use; uid binding (`getUser().id` must equal the slot's `userId`); replay only if the name is still in `deriveSuggestions(types, fresh items)`; tests in section 12 |
| C9 catalog names | Name-rule test (plus house maximum) |
| C10 analytics | Section 8 |
| C11 no new logging, no invite code anywhere new | No `console.*`; error wrapper strips details; the picker and card never touch the invite code |
| C12 error handling | Generic copy; `CreateTripError`; tests force a CHECK error |
| C13 and O8 rate limiting | None added; no new anonymous-callable endpoint; backlog note recorded (criterion 66) |
| D2 direct INSERT | Not revoked; CHECKs protect the direct path |
| O2 charset (S4) | Locale-independent allowlist; U+034F carved out explicitly; unassigned code points inside ranges acknowledged and counted by the property test; `$` without `m`, no JS `u` flag; class check before length check; drift test against the newest defining migration |
| O5 and O6 access description and data paths | Accurate wording in privacy and runbook; public RPCs untouched; `select("*")` removed; `other_type` documented in a SQL comment header, not `COMMENT ON COLUMN` (N5) |
| O7 rendering | The Other text is never rendered after create; no new reader exists in 0.8.0 |

Cannot be met exactly as written: **none**, with one narrowing flagged for the user: criterion 64 "letters of any script" becomes "any script in the Basic Multilingual Plane" (U6).

Review items outside this document that this design depends on (owned by the ux-designer / design.md, not the architecture): B1/D1/D2/N6 (design.md must drop the sessionStorage invitee path, state the shared-allowlist client rule, and include the smart-quote mapping). Baseline additions listed in the two design reviews go into `docs/security-baseline.md` and `docs/compliance-baseline.md` in the same PR. Revision 3 constraints (R1-R9, C-R3-1..7) are mapped in section 17.11.

## 14. Criterion traceability (every number)

| # | Satisfied by |
|---|---|
| 1 | `trip-type-picker.tsx`: fieldset and legend, four checkboxes from `STARTER_TYPES` plus Other tile, check icon and text for state (not color alone); new-trip page test |
| 2 | `createTrip` five-argument fast path; new-trip test |
| 3 | Seven-argument RPC stores `_types` in pick order; `getTripView` reads `types` back; live test |
| 4 | New trip page unchanged apart from the picker; no invite row; no invite code in any new URL, event or log; page test |
| 5 | `types` defaults to `'{}'`; `deriveSuggestions` returns nothing; card test |
| 6 | `shopping-list-tab.tsx` card above "To get" in both states; absent for Other-only (U5 for locked trips) |
| 7 | `deriveSuggestions` (union, pick-order label) |
| 8 | `deriveSuggestions` normalization against catalog and existing items |
| 9 | "+" handler via `addShoppingListItems` with one description |
| 10 | Card derived; renders nothing when empty |
| 11 | Derived, nothing stored |
| 12 | Card only in `ShoppingListTab`; add-item sheet unchanged; test |
| 13 | Bundled catalog, no fetch |
| 14 | Nothing added; absence test |
| 15 | Section 2 (inline widget plus provider slot and replay) |
| 16 | Database RLS unchanged; live tests |
| 17 | `starter-catalog.ts` is the only source; mock-catalog test and literal scan |
| 18 | `starter-catalog.test.ts` |
| 19 | Section 8 and ANALYTICS.md |
| 20 | Events only after success |
| 21 | Out of scope (manual query), unchanged |
| 22 | Design tokens only; Other tile and input follow the picker pattern; light mode |
| 23 | 44px hit area following the existing `size-11` pattern; `aria-label` with item name |
| 24 | Section 9 |
| 25 | Existing insert policy; live tests |
| 26 | Section 2 bounds |
| 27 | Catalog name-rule test |
| 28 | Header note and test |
| 29 | `trips_types_check`; live tests |
| 30 | Section 3 safety; live run; `.qa.test.ts` |
| 31 | Section 4 fallback; compatibility matrix |
| 32 | New overload grants; script; section 4 |
| 33 | No policy; table update revoked; privilege checks in script; live tests |
| 34 | Section 7: explicit lists; `other_type` never selected |
| 35 | Generic copy in page and tab |
| 36 | No logging; `CreateTripError` |
| 37 | No new RPC besides the authenticated overload; no rate limit |
| 38 | Runbook edits |
| 39 | Name-only tracking test |
| 40 | Copy review by ux-designer and reviewer; text assertions in tests |
| 41 | Picker behavior |
| 42 | Picker label and helper text |
| 43 | `maxLength`, counter, `trip-type.ts` normalization; RPC collapses spaces |
| 44 | Inline error, no bare Other marker (RPC never receives blank as a marker) |
| 45 | Picker accessibility requirements and tests |
| 46 | Plain text only; class shared with DB |
| 47 | `trips.other_type` |
| 48 | `trips_other_type_check`; live tests |
| 49 | No `other` code; test |
| 50 | Overload plus fallback |
| 51 | Section 7 and 10; script; grep test |
| 52 | Never rendered after create; no new reader |
| 53 | Section 8; tests |
| 54 | Migration header, privacy line, runbook; no reader delivered |
| 55 | Runbook; cascade; 0018 |
| 56 | Section 9 |
| 57 | Helper copy rules; tests |
| 58 | `trip_type_selected_other` no properties |
| 59 | Representation test |
| 60 | Overload without defaults; script; live tests |
| 61 | Fallback only on `PGRST202`/`42883`; unit and live tests |
| 62 | `CreateTripError`; forced-failure UI test |
| 63 | No persistence, URL, title, perf-log; tests |
| 64 | Allowlist CHECK (section 3) |
| 65 | Unit matrix plus live matrix |
| 66 | No rate limit; backlog note carried in the ADR |
| 67 | Accurate wording in privacy and runbook; migration header |
| 68 | Public RPCs untouched; script; grep |
| 69 | Section 7 |
| 70 | Same as 33 for the organizer case |
| 71 | Live `types` cases |
| 74-121 | Section 17.10 (Revision 3 traceability) |

Note: requirements.md's revision-2 summary refers to "criteria 54-73"; the numbered list for the base design ends at 71, which is what this table follows. Revision 3 continues at 74.

## 15. Risks and open technical points

- **Migration numbering (U1).** 0022 is the next free number today (0021 is the upstream revoke). Re-confirm before merge; renumber if another migration lands first.
- **CHECK regex written by hand against Postgres's regex engine.** The `\uXXXX` escapes inside bracket expressions and code-point range comparison are documented behavior but are the most likely place for a surprise. The live accept/reject matrix is the gate; do not merge PR A without it.
- **A CHECK that evaluates to NULL passes.** The most dangerous bug class in `trips_types_check`; covered by the NULL-element cases and the `cardinality = 0 or` guard.
- **Unassigned code points inside accepted ranges** pass both the CHECK and the property test's category checks; the Cn count is reported so a Unicode upgrade is visible (section 3). Accepted risk.
- **NFD paste versus `maxLength`.** The browser counts UTF-16 units before the client normalizes to NFC, so a 30-character decomposed paste can be truncated by `maxLength`. Edge case for ux-designer awareness; the database accepts up to 30 code points either way.
- **Replay edge: signing into an existing account.** `useOtpFlow` falls back to a plain sign-in when the email already belongs to another account; the session user changes and no `SIGNED_OUT` is emitted. Replay is dropped by the uid-binding check (section 2 step 4) and, when the page falls to the summary view, by the missing member id. Covered by tests.
- **Provider now subscribes to auth state.** Existing tests that render `TripVerificationProvider` with a supabase mock lacking `auth.onAuthStateChange` would break; search and add the mock (section 10).
- **Dev ergonomics.** The repo's React Compiler lint rules forbid setting state synchronously inside effects; keep the slot in a ref plus a tick state in the provider, or use the existing "adjust state during render" pattern seen in `trip-tabs.tsx`. The TTL timer is set from the tap handler (an event), not from an effect body that sets state synchronously.
- **Version and docs at release:** bump `package.json` to 0.8.0, add the CHANGELOG entry, remove the Planned-next stub if the user wants.
- **Revision 3 risks** (sticky pill inside an `overflow-hidden` Screen, `/trip/new` becoming dynamic, `/trips` screenshot data) are in section 17.12.

## 16. Note for 0.8.1: editing types after create (not in 0.8.0)

Not designed here, but the shape to keep open: an organizer-only edit needs a write path, and 0.8.0 deliberately has none. Preferred: a `security definer` RPC `set_trip_types(_trip_id, _types, _other_type)` that checks `created_by = auth.uid()` and the verified gate, is revoked from public and anon, joins the `rpc_rate_limits` design, and writes through the same CHECKs (so no new validation); not a column-level UPDATE grant, because the CHECK-only protection of direct writes would then also apply to every member. It would reuse `normalize` and the shared character class, and `trips_types_check` already covers it. It needs its own compliance and security review (Sec C6/O10 stop applying), and decisions on the six questions in requirements.md "Planned next". The "revoke update on trips" from U7 stays valid since the RPC bypasses table privileges.

## 17. Revision 3 (approved 2026-10-14): template shelf, `?type=` pre-check, fidelity fixes

Inputs: requirements.md criteria 74-121 and Canvas coverage, design.md sections 9-15 (9.2a pill, 10 `?type=`, 11 fixes, 13 checklist), design-audit.md, security-constraints.md "Revision 3 review" (R1-R9), compliance-constraints.md "Revision 3 review" (C-R3-1..7). Checked against the real code: `src/app/trips/page.tsx`, `src/app/page.tsx`, `src/app/home-screen.tsx`, `src/app/trip/new/page.tsx`, `trip-type-picker.tsx`, `src/components/ui.tsx`, `src/lib/starter-catalog.ts`, `src/lib/starter-suggestions.ts`, `src/lib/tracking.ts`, `src/proxy.ts`, `src/app/globals.css`, `docs/ANALYTICS.md`. Next.js: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` confirms `searchParams` is a `Promise<{ [key: string]: string | string[] | undefined }>`, must be awaited in a server page (or `use()`d in a client page), and "will opt the page into dynamic rendering at request time".

### 17.1 What this revision does and does not touch

**No database, auth or API work.** No migration (so no local-Postgres check applies; see 17.13), no RPC, no RLS or grant change, no route handler, no server action, no `fetch` and no Supabase call added for the shelf (criteria 94, 107; Sec R8). The shelf is `Link` elements rendered from the bundled catalog.

| File | Change |
|---|---|
| `src/components/template-shelf.tsx` (new) | `TemplateShelf`: section, header row, tile grid. No `"use client"`, no hooks, no data imports. |
| `src/components/template-tile.tsx` (new, `"use client"`) | `TemplateTile` and `BlankTripLink`: the only client leaves, they exist only for the `onClick` analytics call. |
| `src/components/trip-type-icons.ts` (new) | The one shared icon map (code to icon component, generic plus fallback), used by the picker and the shelf (criterion 95). The picker's local `TILE_ICONS` is deleted. |
| `src/lib/starter-suggestions.ts` | Add `homeTemplateTappedEvent`, `HOME_BLANK_TRIP_EVENT`, `parseTypeParam` (17.5, 17.6). |
| `src/app/trips/page.tsx` | Markup per 17.3. Data code unchanged. |
| `src/app/home-screen.tsx` | `WelcomeContent` gains the shelf (17.4). `SignInForm` and `HomeScreen` untouched. |
| `src/app/page.tsx` | **No change.** Still reads only `signin`. |
| `src/app/trip/new/page.tsx` | Becomes the thin server wrapper (17.5). |
| `src/app/trip/new/new-trip-form.tsx` (new, via rename of the old `page.tsx`) | The client form, plus `initialType` prop and fidelity fixes B12/B15 (17.5). |
| `src/app/trip/new/trip-type-picker.tsx` | Fidelity fixes B3-B10 (design 11.1), imports the shared icon map. |
| `src/app/trip/[id]/suggested-card.tsx` and its host | Fidelity fixes C4-C12 and name wrapping (design 11.2). |
| `src/components/ui.tsx`, `src/app/globals.css` | `fab` variant, `FabBar`, `--color-accent-ink` (17.7). |
| `docs/ANALYTICS.md`, `docs/security-baseline.md`, `docs/compliance-baseline.md` | Rows and rules (17.6, 17.10). Engineer edits these. |
| `src/proxy.ts`, `src/lib/tracking.ts`, `src/lib/data/*`, `supabase/**` | **No change.** |

### 17.2 `TemplateShelf`

- **Signature.** `TemplateShelf({ types = STARTER_TYPES })`. The optional `types` prop (a readonly array of catalog entries) exists so tests can supply a different catalog without `vi.mock`; no page passes it. No other props. No state, no effects, no `useId` (hooks are not available in a server component): the section label id is the constant `template-shelf-label` (one shelf per page, asserted by a test).
- **Empty catalog:** `types.length === 0` returns `null` (no header, criterion 119).
- **Structure** (values from design 9.2 and 9.4, not repeated here): `<section aria-labelledby="template-shelf-label">`; header row with `Kicker` "Start from a template" (carrying the id) and `BlankTripLink`; 10px spacer; `grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2`; one `TemplateTile` per catalog entry in array order.
- **Tile props:** `code` (typed `TripType`), `label`, `itemCount`. Count is `type.items.length`, never a literal (criterion 75). A small exported pure helper `formatItemCount(n)` returns "1 item" for 1 and "`n` items" otherwise (also handles 0 without crashing). `TemplateTile` looks up its icon itself through `trip-type-icons.ts` (a component reference cannot be passed from a server component to a client component as a prop).
- **Link:** `<Link href={`/trip/new?type=${code}`}>`. The `code` is the tile's own prop that came from the catalog iteration; nothing derives from `searchParams`, `window.location` or the DOM (R5, R6). Accessible name = label, a visually hidden ", " (`sr-only`), then the count, icon `aria-hidden`. Wrap rule on the label per design 9.4 (`min-w-0 [overflow-wrap:anywhere] [hyphens:auto] leading-tight`, never `truncate` or `whitespace-nowrap`).
- **`BlankTripLink`:** `Link href="/trip/new"` (literal), 12px/600, `var(--color-accent-ink)`, hit-area padding per design 9.2, `onClick` fires `HOME_BLANK_TRIP_EVENT`.
- **Click handler (both leaves):** synchronous, never `async`, never `preventDefault`, never `router.push`; the body is `try { const name = homeTemplateTappedEvent(code); if (name) trackEvent(name); } catch {}` (the blank link calls `trackEvent(HOME_BLANK_TRIP_EVENT)` inside the same try/catch). `trackEvent` already swallows errors; the extra `try` is belt and braces so navigation can never be blocked. Normal link behavior (modified click, middle click, open in new tab) is preserved because they are real anchors.
- **Where it is rendered:** from the `/trips` server page (server renders the shelf, the two client leaves hydrate), and from `WelcomeContent` in `home-screen.tsx` (a client module, so the shelf is simply bundled client-side there; it works unchanged because it has no server-only imports). This is the "one shared component" of criterion 76/95.
- **Fourth type:** the shelf is designed for 1 to 3 types in one row (design 15, item 5). If a fourth catalog type is added, the grid must switch to 2 columns. To keep that from being silent, a unit test asserts `STARTER_TYPES.length <= 3` with a failure message pointing at this section.
- **Not on the List tab:** `shopping-list-tab.tsx`, `suggested-card.tsx` and the add-item sheet must not import `template-shelf` (criteria 90, 98); a source-scan test asserts it.

### 17.3 `/trips` page changes, every state

Data code (`createClient`, parallel `getUser` and `trips` select, `getMyTrips`, error capture) is untouched. Only the returned JSX changes.

Common to all states:
- `<Screen glow texture>` (adds paw print, A6). `TopBar` with `title={<h1 className="text-display text-[36px] leading-none">Trips</h1>}` and `titleClassName=""`; `trailing` keeps only the Feedback `IconLinkButton`; the top-bar plus is removed (so the `PlusIcon` import is still needed, but only by the pill). The `h1` sits inside `TopBar`'s `span` wrapper (inline element containing a block heading); this is the design's choice, renders correctly, and React does not warn for it. If the reviewer objects, the alternative is an optional `titleAs` on `TopBar`, which is out of scope here.
- The `left` banner block stays directly under the TopBar with its `h-3`. The current `h-2` spacer is replaced by `h-6`. (With the banner showing, the gap above the shelf is therefore 12 + 24px, a literal reading of the design; QA records it, no action.)
- `<TemplateShelf />`, then a `h-[26px]` spacer, then the state-specific block below, then `<LegalLinks />` as today (inside `ScreenContent`).
- After `ScreenContent`, as a sibling inside `Screen`: `<FabBar><LinkButton href="/trip/new" variant="fab" className="text-[16px]"><PlusIcon size={19} strokeWidth={2.6} aria-hidden /> New trip</LinkButton></FabBar>`. The pill fires no analytics event (design 9.5). It replaces both the top-bar plus and the "Start a trip" button.

| State | Block under the shelf |
|---|---|
| Trips present (error null, `trips.length > 0`) | The existing Ongoing and Completed `Kicker` plus `Card` blocks, byte-for-byte unchanged (`TripRow`, `BalanceLabel`, dividers). No extra "Your trips" kicker. |
| Zero trips, no error | `Kicker className="px-1"` "Your trips", `h-2.5`, then `Card className="px-5 py-7 text-center"` with "No trips yet" (`block text-[15px] font-semibold`) and the body sentence from design 9.3 (`mt-1.5 block text-[13px] leading-[1.45] text-ink/[0.74]`). No button in the card. Replaces "You're not on any trips yet." and the "Start a trip" button. |
| Load error (`error` set; `trips` null) | The existing `<p className="px-1 text-[13px] text-terracotta">{error}</p>`, no first-run card. Shelf and pill still render. |
| Loading | None; the page is server-rendered with `force-dynamic`, so the shelf is in the first paint. |
| No session | Unchanged: the proxy redirects `/trips` to `/?next=%2Ftrips`; the page's defensive `redirect("/")` stays. The shelf is never rendered without a session on this route. |

Existing consumers: `src/app/trips/page.qa.test.ts` asserts the removed strings at lines 105-106 ("You&#x27;re not on any trips yet." and "Start a trip"); update those assertions to the new copy. Its module mocks stay valid because the shelf imports neither `@/lib/data/trips` nor the Supabase client.

### 17.4 Welcome page placement (no change to sign-in or redirect logic)

- Only `WelcomeContent` in `src/app/home-screen.tsx` changes. In its JSX, between the existing intro paragraph's `<div className="h-7" />` and the "Create your first trip" `Button`, insert `<TemplateShelf />` followed by `<div className="h-[26px]" />`. The existing `h-7` stays above the shelf; everything after (the primary button, "I have an invite link", "Already have a trip? Sign in", the stat chips, `LegalLinks`) is untouched.
- `SignInForm` is untouched, and `HomeScreen` still renders `SignInForm` when `showSignIn` and `WelcomeContent` otherwise, so `/?signin=1` shows no shelf and no pill. The pill (`FabBar`) is not used on `/`.
- `src/app/page.tsx` has zero diff: it still `await`s `searchParams` for `signin` only, and keeps `getUser()`, the membership query and all `redirect()` calls, and `texture={!showSignIn}`. A test and a git-diff check in QA confirm it (criteria 97, 106). The tile hrefs are built from the catalog inside the shelf, so nothing on `/` passes query text anywhere.
- Rendering mode is unchanged (already request-time dynamic because `searchParams` is awaited), so no per-user content or redirect can be statically cached (R5).
- Existing tests to keep green: `home-screen.auth-branching.qa.test.tsx` and `page.texture-scope.qa.test.tsx`. The shelf adds `<a>` elements only (no new buttons), so button-count assertions should not move; if one does, adjust the assertion, not the component.

### 17.5 `/trip/new`: server wrapper plus client form

**Wrapper (`src/app/trip/new/page.tsx`)**, a server component, no `"use client"`, in the shape:

```
export default async function NewTripPage({ searchParams }: { searchParams: Promise<{ type?: string | string[] }> }) {
  const { type } = await searchParams;
  return <NewTripForm initialType={parseTypeParam(type)} />;
}
```

- `parseTypeParam(raw: unknown): TripType | undefined` lives in `starter-suggestions.ts` so it is unit-testable: returns `raw` only when `typeof raw === "string" && isTripType(raw)`, else `undefined`. No trim, no lowercase, no decode, no array "first element" (R1, criterion 101). It reuses `isTripType`, which stays an array comparison (`__proto__`, `constructor`, `toString` cannot pass).
- The wrapper reads only `type`; every other query key, including any `utm_*`, is ignored and never read (Comp X4). It never reads or forwards any other key, never passes the `searchParams` object or the raw value down (R1, R9, criterion 102), uses no `useSearchParams` (docs warn it needs a Suspense boundary; not needed with the server prop), no `redirect()`/`notFound()`, no `generateMetadata`, no `console.*`, no `try/catch` needed (criteria 103, 104; R2, R3). Next's decoding of `?type=%E0%A4%A` yields a plain string that fails `isTripType`, so it cannot throw here; a test pins it.
- The wrapper imports only `NewTripForm` and `parseTypeParam`. It must not import `@/lib/data/trips`, `@/lib/supabase/*` or `@/lib/tracking` (criterion 115; R9). A source-scan test asserts the import list.
- Behavior change to know about: because the page now awaits `searchParams`, `/trip/new` becomes request-time dynamic (per the Next docs) instead of a statically prerendered shell. It does no data fetching, `proxy.ts` returns `next()` immediately for it, so the cost is one cheap server render per request. No caching headers or `dynamic` export is needed.

**Client form (`src/app/trip/new/new-trip-form.tsx`)**: `git mv` the current `page.tsx` here, keep `"use client"`, rename the default export to a named export `NewTripForm({ initialType }: { initialType?: TripType })`. Behavior is identical to today apart from:
- **Initial state, no flash (criterion 83):** `const [types, setTypes] = useState<TripType[]>(() => (isTripType(initialType) ? [initialType] : []))`. The lazy initializer runs once; the server render and the hydrating client render both start with the tile checked, so the first paint already shows it and the one-type sentence (derived from `types`) with no effect, no layout shift and no focus move. The defensive `isTripType` re-check is cheap and means a bad prop in a test cannot pre-check anything. The rest of the state (`otherChecked`, `otherText`, etc.) is initialised exactly as today. Pick order: the pre-checked type is first, later ticks append, unticking removes (the existing `toggleType`).
- `trip_create_start` still fires from the mount effect (unchanged). No `home_*` event fires from this component (criterion 114).
- Create is unchanged: no auto-submit, the pre-check cannot cause a write (criterion 108); `router.push` target is still `/trip/<id>?tab=list` or `/trip/<id>`, never containing the type (criterion 109); the close button still `router.back()`.
- Fidelity fixes in this file: B12 spacer before `<TripTypePicker>` changes from `h-4` to `h-[22px]` (the `<div className="h-4" />` currently at line 229). B15 is the pre-check above.
- Nothing is written to storage, `history`, `timeAsync` labels or the URL (criterion 110).

**Existing consumers of `trip/new/page.tsx` found by search:** `src/app/trip/new/page.trip-types.qa.test.tsx` (`import NewTripPage from "./page"`, renders `<NewTripPage />`) must import `{ NewTripForm }` from `./new-trip-form` and render it; no other code imports the page. Comments in `src/app/join/page.tsx` and `api/trip-email/route.ts` mention the file path only.

### 17.6 Closed-set analytics helper and ANALYTICS.md rows

In `src/lib/starter-suggestions.ts`, next to `tripTypeSelectedEvent` (same pattern):
- `homeTemplateTappedEvent(code: string): string | undefined` returns `` `home_template_tapped_${code}` `` only when `isTripType(code)`, else `undefined`. There is no `home_template_tapped_other`.
- `export const HOME_BLANK_TRIP_EVENT = "home_blank_trip_tapped"`.
- No other event name is composed from input anywhere (criterion 111). `trackEvent` is called with exactly one argument (the name), from `template-tile.tsx` only, on click (criteria 112-114). No `track` import from `@vercel/analytics` outside `src/lib/tracking.ts` (a scan test; tracking.ts today is the only importer).
- A scan test asserts that the two leaves are the only Revision 3 files calling `trackEvent`, and that none of the shelf files import from `@/lib/supabase/*`, `@/lib/data/*`, `next/headers`, or call `fetch`, `localStorage`, `sessionStorage` or `document.cookie`.

ANALYTICS.md rows (engineer edits the file; add a "Home and templates" subsection under the existing "Starter lists" section, same five-column table; the intro sentence states the events fire **on the tap, before navigation, with no account**, the `home_template_tapped_*` names are a closed set and carry no properties, and they are distinct from `trip_type_selected_*`, which means "stored on a created trip"):

| Event | Trigger | Route/Component | Why Track | Payload Example |
|---|---|---|---|---|
| `home_template_tapped_camping` | Camping tile tapped on the home shelf | `src/components/template-tile.tsx`, on `/trips` and `/` | See which templates attract taps before a trip exists | `{ event: "home_template_tapped_camping" }` |
| `home_template_tapped_airbnb` | Airbnb stay tile tapped | same | same | `{ event: "home_template_tapped_airbnb" }` |
| `home_template_tapped_international` | International tile tapped | same | same | `{ event: "home_template_tapped_international" }` |
| `home_blank_trip_tapped` | "Blank trip" link tapped on the shelf | `src/components/template-tile.tsx` (`BlankTripLink`), on `/trips` and `/` | Compare templated and blank starts | `{ event: "home_blank_trip_tapped" }` |

The bottom pill and the welcome page's "Create your first trip" fire nothing. The existing docs test that every catalog code has a `trip_type_selected_<code>` row is extended to require a `home_template_tapped_<code>` row and the blank row too, so adding a fourth type without ANALYTICS rows fails CI. `LEGAL_LAST_UPDATED` is not bumped again (criterion 118).

### 17.7 `ui.tsx` and token additions

All additive. `BottomBar`, `capsule`, `capsuleMuted`, `Button`, `LinkButton`'s existing variants and every call site are untouched.
- `ButtonVariant` gains `"fab"`. Its class string in `buttonVariantClasses`: `text-white [background:color-mix(in_srgb,var(--color-ink)_90%,transparent)] [box-shadow:0_10px_30px_rgba(35,28,18,.28)]`. No `backdrop-blur-xl`, no `animate-capsule-in`. (`Button` shares the map, so `Button variant="fab"` also type-checks; nothing uses it.)
- `FabBar({ children })`: `<div className="sticky bottom-0 z-10 flex-none px-3.5 pb-[max(18px,env(safe-area-inset-bottom))]">`, no background or gradient. Used only by `/trips` in this revision.
- **Sticky caveat (risk, see 17.12 U13):** `Screen` with `glow`/`texture` is `overflow-hidden`. A `position: sticky` child of an `overflow: hidden` container sticks relative to that container, not the viewport, and the container is not itself scrolling, so the pill may sit at the end of the content instead of floating. The existing `BottomBar` has the same arrangement on New trip, so the engineer must check in a real browser (not jsdom) that the pill floats over scrolling content on `/trips` with enough trips to scroll. If it does not, fallback: render the bar `fixed bottom-0 left-1/2 w-full max-w-md -translate-x-1/2` with the same padding and add a bottom spacer of 92px (56 + 18 + safe margin) inside `ScreenContent` on `/trips` so the last row and `LegalLinks` still clear it. Do not change `Screen`'s overflow (it clips the glow blobs).
- Token: `--color-accent-ink: oklch(0.42 0.08 80);` in `globals.css` after `--color-accent-deep` (line 12), and the alias `--color-accent-ink: var(--color-accent-ink);` in the theme block after the `accent-deep` alias (line 67). `globals.css` has no dark-mode override block, so there is nothing to mirror. Used only by "Blank trip", the checked tile icon (B6) and the "+" glyph (C9).

### 17.8 Proxy invariants

`src/proxy.ts` is not edited. Invariants that must stay true (verified in the current file):
- `SESSION_REQUIRED_PATTERNS = [/^\/trips/, /^\/feedback/]` does not match `/trip/new` (`/trip/new` does not start with `/trips`), so a signed-out `GET /trip/new?type=camping` returns 200 with no redirect and no Supabase call (R4, criterion 105). `/` is not matched either.
- The only redirect, `/trips` without a session, sets `next` to `request.nextUrl.pathname` and drops the query, so `GET /trips?type=x` without a session redirects to `/?next=%2Ftrips` with no `type` carried. Nothing on `/` reads `next`.
- Do not add `/trip/new` to the patterns and do not copy `search` into `next`.
- Locked by a new `src/proxy.test.ts` (none exists today): call `proxy(new NextRequest(...))` with `@/lib/supabase/env` and `@supabase/ssr` mocked; assert `/trip/new?type=camping` and `/` return a non-redirect response and `createServerClient` is never called; assert `/trips?type=camping` with `getUser` returning no user redirects to a `Location` whose search is exactly `?next=%2Ftrips`.

### 17.9 Impact analysis (Revision 3)

| Changed thing | Consumers found | Compatible with what is deployed? |
|---|---|---|
| `src/app/trip/new/page.tsx` default export changes from client page to async server wrapper; body moves to `new-trip-form.tsx` | Imported by one test (`page.trip-types.qa.test.tsx`); the Next router. Route URL unchanged; `/trip/new` without a query behaves as today. | Yes for users and bookmarks. The route becomes request-time dynamic. One test import must change in the same PR. |
| `trips/page.tsx` markup and copy | `trips/page.qa.test.ts` (asserts removed strings). Users: the "Start a trip" button, the top-bar plus and "Your trips" title disappear in favor of the pill and the `h1` "Trips". | Intended UI change, no data contract. Update the test in the same PR. |
| `home-screen.tsx` `WelcomeContent` | `page.tsx`, `home-screen.auth-branching.qa.test.tsx`, `page.texture-scope.qa.test.tsx`. | Additive. Sign-in and redirects untouched. |
| `ui.tsx`: `fab` variant, `FabBar` | No existing consumer uses either; every existing `ButtonVariant` consumer (`Button`, `LinkButton`, `BottomBar` pages) is unaffected because the map only gains a key. | Backward-compatible. |
| `globals.css`: new token | Nothing reads it yet. | Backward-compatible. |
| `trip-type-picker.tsx` (tile padding, border, icon colour, check glyph, insets) and `suggested-card.tsx` (padding, row height, divider, glyph, wrapping) | Their pages and tests (`page.trip-types.qa.test.tsx`, `shopping-list-tab.suggestions.qa.test.tsx`, `shopping-list-tab.replay-bounds.qa.test.tsx`). Tests that assert class names or the 70px row may need small updates; jsdom has no layout so pixel claims are checked in QA. | Yes; visual only. |
| `starter-suggestions.ts` gains exports | Additive; existing exports unchanged. | Yes. |
| New URL parameter `/trip/new?type=` | Old builds ignore it; new build ignores invalid values. | Yes. No versioning needed. |

No breaking API, RPC or data contract. Migration and deploy order unaffected (nothing here depends on schema beyond what 0022 already requires).

### 17.10 Tests to write, mapped to criteria 74-121

Test files (all vitest; jsdom for interaction, `renderToStaticMarkup` for server output). "QA" means a manual step recorded in `qa-report.md`.

| File | Covers |
|---|---|
| `src/components/template-shelf.test.tsx` | Tile count, order, labels and `N items`/`1 item` follow the catalog, proven by passing a different `types` prop and by `vi.mock("@/lib/starter-catalog")` (no hardcoded 18/16/13 anywhere); hrefs are exactly `/trip/new?type=<code>` and `/trip/new`; section `aria-labelledby` resolves; accessible name "Label, N items"; empty catalog renders nothing at all; `STARTER_TYPES.length <= 3` guard; wrap-rule classes present and no `truncate`/`whitespace-nowrap` on the label; copy scan for the banned lines ("nothing is saved", "no sign-up", "don't track"); picker and shelf both import `trip-type-icons` |
| `src/components/template-tile.qa.test.tsx` | With `trackEvent` mocked: tapping a tile calls it once with exactly one argument equal to the expected name; "Blank trip" calls it with `home_blank_trip_tapped`; no `preventDefault`; a throwing `trackEvent` does not stop the click propagating; no call on render; `fetch`, `createClient` (browser Supabase), `localStorage.setItem`, `sessionStorage.setItem` and `document.cookie` setter spies are all untouched by render and tap |
| `src/lib/starter-suggestions.test.ts` (extend) | `homeTemplateTappedEvent` returns the three names for catalog codes and `undefined` for `other`, `""`, `"Camping"`, `"__proto__"`, `"constructor"`, `"camping "`; `parseTypeParam` accepts only an exact string code and returns `undefined` for undefined, `""`, wrong case, padded, `other`, prototype keys, arrays (`["camping"]`, `["camping","junk"]`), numbers and objects |
| `src/app/trip/new/page.search-params.qa.test.tsx` | Call the async wrapper with `Promise.resolve({...})` and inspect the returned element: valid code reaches `NewTripForm` as `initialType`; every junk case yields `undefined`, including `type=%E0%A4%A`; extra keys ignored; the element's props contain only `initialType`; `redirect`/`notFound` mocks never called; payload tests render the wrapper output with `renderToStaticMarkup` for `<script>alert(1)</script>` and `"><img src=x>` (and their percent-encoded forms) and assert the HTML contains neither string and no checked tile; `console.*` spied and silent; source scan: wrapper imports only the form and helper, no `useSearchParams`, no `@/lib/data/trips`, no `@/lib/supabase`, no `generateMetadata`, no `"use client"` |
| `src/app/trip/new/new-trip-form.initial-type.qa.test.tsx` (the renamed `page.trip-types.qa.test.tsx` plus new cases) | `initialType="camping"` renders the Camping checkbox checked on the first render (check `renderToStaticMarkup` output for `checked`, and the first client render before any effect) with the one-type sentence; absent prop is blank; untick works and Create then sends no types (`createTrip` mock); pick order is initial first then ticks; Create with the pre-check calls `createTrip` with the types and `router.push` to `?tab=list` without the code in any URL; nothing is created on render (no auto-submit); `trackEvent` calls on mount are only `trip_create_start`; storage/cookie spies untouched; B-fixes by class assertion (`p-3`, `border-[1.5px]` in both states, `h-[22px]` spacer) |
| `src/app/trips/page.qa.test.ts` (update and extend) | Shelf present with trips, with zero trips and with a load error; `h1` "Trips" present, "Your trips" title and top-bar plus gone, Feedback link present; first-run card copy exact and "Start a trip" and "You're not on any trips yet." absent; one "Your trips" kicker only when empty; Ongoing/Completed blocks unchanged; pill is a link to `/trip/new` named "New trip" with the `fab` classes; `TripRow` untouched (A5); shelf appears before the trip blocks in document order; tab order of links (Feedback, Blank trip, tiles, trips, pill) |
| `src/app/page.shelf.qa.test.tsx` (new; or extend the existing home-screen tests) | Welcome content renders the shelf between the intro and "Create your first trip"; `?signin=1` renders no shelf; the page still reads only `signin` and redirect behavior is unchanged (reuse existing tests); hrefs on `/` carry only catalog codes even when the test passes a hostile `searchParams` (`{ type: "x", next: "//evil" }`); source scan that `page.tsx` has no `type` read |
| `src/proxy.test.ts` (new) | As in 17.8 |
| `src/components/ui.fab.test.tsx` (new) | `fab` class string contains the exact colour-mix and shadow and no `backdrop-blur`/`animate-capsule-in`; `FabBar` classes; existing `capsule` and `BottomBar` class strings unchanged (snapshot of those two strings) |
| `src/lib/revision3-docs.test.ts` (new) | `docs/ANALYTICS.md` has the four `home_*` rows and a `home_template_tapped_<code>` row for every catalog code, with the "no account" and "closed-set" wording; `security-baseline.md` contains the three R-rules and `compliance-baseline.md` the two C-rules (criterion 121; **both baseline files currently lack them**); `globals.css` defines `--color-accent-ink`; `LEGAL_LAST_UPDATED` unchanged from the 0.8.0 value; no file in the docs set or migrations references the wrong upstream number (see 17.12) |
| `src/lib/revision3-scan.test.ts` (new) | Shelf files import no Supabase, data layer or `next/headers`; no `fetch`/storage/cookie use in them; `@vercel/analytics` imported only in `tracking.ts`; `shopping-list-tab.tsx`, `suggested-card.tsx` and the add-item sheet do not import `template-shelf` |

Criterion-by-criterion:

| # | Test or QA step |
|---|---|
| 74 | `trips/page.qa.test.ts` (order, `h1`, shelf in three states, Feedback); QA board A |
| 75 | `template-shelf.test.tsx` (derived counts, "1 item"); QA board A sizes |
| 76 | `page.shelf.qa.test.tsx`; existing redirect tests; QA signed-out `/` |
| 77 | `trips/page.qa.test.ts` (pill replaces plus and button), `ui.fab.test.tsx`; QA pill computed styles and "last row never hidden" at 390 and 320 |
| 78 | `trips/page.qa.test.ts` (TripRow, grouping, texture) |
| 79 | `trips/page.qa.test.ts` (first-run copy exact; error variant) |
| 80 | `template-shelf.test.tsx` (names, section label, link elements); QA hit-area measurement and focus ring |
| 81 | `template-shelf.test.tsx` (hrefs) |
| 82 | `page.search-params.qa.test.tsx`, `starter-suggestions.test.ts` |
| 83 | `new-trip-form.initial-type.qa.test.tsx` (first render, SSR markup); QA "checked on first paint" by throttled reload |
| 84 | `new-trip-form.initial-type.qa.test.tsx`, `template-tile.qa.test.tsx` (no storage, no sensitive URL); QA back/close returns to launcher |
| 85 | `starter-suggestions.test.ts`, `template-tile.qa.test.tsx` (once per tap, no properties) |
| 86 | `revision3-docs.test.ts` |
| 87 | Class assertions in picker, card, `/trips` tests where checkable; **QA board checklists A, B, C, L (design 13)** for measured values, because jsdom cannot lay out |
| 88 | QA: each remaining difference is recorded against a documented deviation |
| 89 | `trips/page.qa.test.ts` (`TripRow` unchanged) and diff review (no avatar, top half of New trip, Create button not restyled) |
| 90 | `revision3-scan.test.ts` (List tab does not import the shelf); `shopping-list-tab` suggestions tests (no tiles in empty state) |
| 91 | `template-shelf.test.tsx` (wrap classes) and card tests (no `truncate`); **QA at 390px and 320px** on `/trips`, `/`, `/trip/new` and the List tab |
| 92 | QA screenshot-versus-board step (17.14) for A, B, C, L, recorded in `qa-report.md` |
| 93 | QA reviews the Canvas coverage table against the build |
| 94 | `revision3-scan.test.ts`, `template-tile.qa.test.tsx`, `git diff --stat` shows no `supabase/`, `api/` or `data/` change from Revision 3 |
| 95 | `template-shelf.test.tsx` (shared icon module), `revision3-scan.test.ts` (picker's local map removed) |
| 96 | `template-shelf.test.tsx` copy scan; no Revision 3 change to `src/app/privacy/page.tsx` or `LEGAL_LAST_UPDATED` (the file already carries the 0.8.0 "Other" edits, so a plain `git diff` is not the check; `revision3-docs.test.ts` compares the date to the 0.8.0 value, Comp X5) |
| 97 | Whole existing suite plus `page.shelf.qa.test.tsx`; `page.tsx` has no diff |
| 98 | `revision3-scan.test.ts` |
| 99 | Release step: `package.json` 0.8.0, CHANGELOG, ROADMAP (docs review) |
| 100 | Docs review: design.md already contains boards A and L and the deviation list; breakdown.md and ROADMAP.md reflect the move |
| 101 | `starter-suggestions.test.ts` (`parseTypeParam`), `page.search-params.qa.test.tsx` |
| 102 | `page.search-params.qa.test.tsx` (props are only `initialType`) |
| 103 | `page.search-params.qa.test.tsx` (payloads, malformed encoding, no echo); QA `curl` of `/trip/new?type=<script>alert(1)</script>` shows neither string in the response body. **QA curl checks (Sec A1):** also `curl -i '/trip/new?type=%E0%A4%A'`, `?type=%00` and `?type=camping&type=junk`: each returns 200, no `Location`, a blank form, and the value is absent from the whole body including the `self.__next_f` RSC payload at the end of the HTML |
| 104 | `page.search-params.qa.test.tsx` (no redirect call); QA `curl -i` shows 200 and no `Location` |
| 105 | `proxy.test.ts`; QA signed-out `curl -i` of `/trip/new?type=camping` (200) and `/trips?type=camping` (redirect to `/?next=%2Ftrips`) |
| 106 | `page.shelf.qa.test.tsx`, `revision3-scan.test.ts`; `page.tsx` diff empty |
| 107 | `template-tile.qa.test.tsx`, `revision3-scan.test.ts` (no application-initiated `fetch`, Supabase call, sign-in or storage write from the handler; framework link prefetch and the navigation itself are not counted, Comp X3) |
| 108 | `new-trip-form.initial-type.qa.test.tsx` (no create on render) |
| 109 | `new-trip-form.initial-type.qa.test.tsx` (`router.push` argument), `template-tile.qa.test.tsx` (name carries no query) |
| 110 | `template-tile.qa.test.tsx` and `new-trip-form.initial-type.qa.test.tsx` (storage, cookie and `history.replaceState` spies; `timeAsync` not used) |
| 111 | `starter-suggestions.test.ts` |
| 112 | `template-tile.qa.test.tsx` (code comes from the prop; a hostile `window.location` does not change the name) |
| 113 | `starter-suggestions.test.ts` and `template-tile.qa.test.tsx` (exactly one argument), `revision3-scan.test.ts` (`@vercel/analytics` importer) |
| 114 | `template-tile.qa.test.tsx` (fires on click, not on render, not from `/trip/new`; failure does not block) |
| 115 | `page.search-params.qa.test.tsx` (wrapper source scan), the renamed form tests (behavior identical, Other text still state-only: all of criteria 36, 53, 62, 63 tests keep passing) |
| 116 | `template-shelf.test.tsx`, `trips/page.qa.test.ts` (banned phrases absent) |
| 117 | `revision3-docs.test.ts` (wording) |
| 118 | `revision3-docs.test.ts` (date not bumped again) |
| 119 | `template-shelf.test.tsx` (empty catalog renders nothing), `revision3-scan.test.ts` (shelf imports no data) |
| 120 | `revision3-docs.test.ts` and the existing three 0022 migration tests; see the 17.12 note on the garbled wording in criterion 120 |
| 121 | `revision3-docs.test.ts`; engineer adds the missing rules to both baselines |

**Local Postgres check.** Revision 3 changes no SQL, CHECK or function, so there is nothing to exercise on a local Postgres. (Separately: I looked for the Postgres 10.5 install mentioned in the brief at `/usr/local/bin` and found only `rackup` and `xcodegen` there, no `postgres`, `psql` or `initdb`, and nothing under `/usr/local/Cellar` or `/usr/local/opt`. Postgres 10 also lacks `normalize()` and would not be a valid target for migration 0022 anyway, which needs 13+; the live Supabase suite in section 12 remains the gate for 0022.)

### 17.11 Constraints satisfied (Revision 3)

| Constraint | Where met |
|---|---|
| Sec R1 parsing | `parseTypeParam` (17.5): string only, exact `isTripType`, arrays ignored, no trim or case change, only the validated `TripType \| undefined` passed down |
| Sec R2 no echo | No metadata, no error text, no logging; only effect is a pre-checked tile and that type's own catalog phrase; payload tests (17.10) |
| Sec R3 no redirect | Wrapper has no `redirect`/`notFound`; test asserts none called; QA shows 200, no `Location` |
| Sec R4 proxy | Proxy unchanged; `/trip/new` not in patterns; `next` is pathname only; `proxy.test.ts` (17.8) |
| Sec R5 welcome page | `page.tsx` zero diff; tile hrefs from the catalog literal; no Supabase call from the shelf; rendering mode unchanged (17.4) |
| Sec R6 analytics helper | `homeTemplateTappedEvent` closed set, code from the tile prop, undefined means no event, name-only single-argument calls, click-only, never from a server component or `/trip/new` load (17.2, 17.6) |
| Sec R7 nothing persisted | Read once into initial `useState`; no storage, cookie, `history.replaceState`, perf-log label or later-URL carry; tests (17.10) |
| Sec R8 no new endpoint | No route, action, fetch, Supabase call or migration; scan test; no auto-submit |
| Sec R9 page split | Form remains a client component with Other text in state only; wrapper imports neither the data layer nor the browser Supabase client; no raw `searchParams` prop |
| Comp C-R3-1 | Closed-set helper excludes `other`; one-argument guard test; ANALYTICS row test |
| Comp C-R3-2 | No identity joined; no network call or anonymous sign-in on tap (`template-tile.qa.test.tsx`) |
| Comp C-R3-3 | No device storage on tap or pre-check (tests) |
| Comp C-R3-4 | Only a single valid `type` honored; nothing forwarded to later URLs, logs or events; no `utm_*` or referrer capture |
| Comp C-R3-5 | Factual copy only; banned-phrase tests |
| Comp C-R3-6 | ANALYTICS.md rows with "on the tap, before navigation, no account" and "distinct from `trip_type_selected_*`"; no second `LEGAL_LAST_UPDATED` bump |
| Comp C-R3-7 | Welcome page renders bundled catalog strings and counts only; empty catalog renders nothing; scan test forbids data imports in the shelf |

Cannot be met: none.

### 17.12 Decisions and risks needing the user (defaults applied)

| # | Item | Default |
|---|---|---|
| U9 | **Data source for `/trips` and List-tab screenshots.** `/trips` and the trip dashboard need a Supabase session and data; the checkout has no local Supabase. Preferred: reuse the non-production Supabase project from U2 with a seeded verified user (2 trips: one ongoing, one completed), a verified user with 0 trips, and a trip with Airbnb + International on the List tab. If none exists, a throwaway stub HTTP server kept outside `src/` (not committed to the app) can fake `/auth/v1/user` and the `/rest/v1/*` calls for boards A and L only; faking the trip dashboard for board C is much heavier. A dev-only harness route inside `src/app` is **rejected**: it adds an unauthenticated, data-shaped route to the production bundle, against the spirit of Sec R8. | Use the non-production project; fall back to the stub for A and L |
| U10 | **Playwright as a dependency.** `playwright`/`@playwright/test` is not in `package.json` (only listed as an optional peer of `next` and `@vitest/browser` in `package-lock.json`). Default: do not add it to the app's dependencies; QA runs it ad hoc (`npx` or a scratch install) against the already cached browsers (17.14). Adding it as a devDependency with a committed screenshot test is optional and would be a separate decision (CI would need browser install). | Ad hoc, not a repo dependency |
| U11 | **Canvas board files are not in the repo.** `Main.dc.html`, `HomeFirst.dc.html`, `NewTrip.dc.html` and `ListSuggest.dc.html` are referenced by design.md and design-audit.md but only `docs/features/ux-revamp/design-import/Splitiful Mobile.dc.html` exists in the checkout. QA needs those four files (or screenshots of them) from the user. Fallback: compare against the numeric values in design.md sections 9 and 11, which were copied from the canvas inline styles; that checks the build but not the canvas itself. | User supplies the files; otherwise numeric fallback |
| U12 | **Catalog counts and content.** The brief says the catalog is now 17 / 16 / 13; the file at `src/lib/starter-catalog.ts` currently has 18 (camping), 16 (airbnb), 13 (international) items, and one camping item reads "sunscreen" in lowercase (it will show lowercase in the card). Nothing in the design hardcodes counts, so this changes no code, but confirm the file is final and fix the lowercase item if unintended. | Confirm with the owner |
| U13 | **Sticky pill risk** (17.7). If `position: sticky` does not float inside the `overflow-hidden` Screen, the fallback is a fixed bar plus a bottom spacer. Engineer verifies in a browser; no user decision unless the fallback changes visuals. | Engineer verifies |
| Note | **Criterion 120 and the U1 text were garbled by a bulk renumber.** They say the upstream migration is `0022_revoke_public_trip_summary_grant`; on disk it is `0021_revoke_public_trip_summary_grant.sql` and this feature's migration is `0022_...` (already correct on disk and in tests). U1 is fixed in this document; requirements.md criterion 120 and any similar sentence in the ADRs or ROADMAP should say "upstream 0021". No code impact. | PM to correct |
| Note | **Baseline docs.** `docs/security-baseline.md` and `docs/compliance-baseline.md` do not yet contain the Revision 3 rules (criterion 121; security gaps 9-11, compliance 9-10). The engineer adds them; `revision3-docs.test.ts` fails until they exist. | Engineer |
| Note | **Living doc.** `docs/ARCHITECTURE.md` still needs one short amendment for Revision 3 (shelf component, server wrapper plus client form for `/trip/new`, `fab` variant, the closed-set `home_*` event helper). Not done in this pass because the available tools could not edit that large file in place; it is a small append for the engineer or architect to make with an edit tool. | Follow-up |

### 17.13 Release notes for Revision 3

Ships with PR B (section 11). No migration step, no deploy-order constraint of its own. Post-deploy smoke additions: tap a tile on `/` signed out and confirm the form opens with that tile checked and the correct sentence; load `/trip/new?type=bogus` and `/trip/new?type=camping&type=airbnb` and confirm a blank form; confirm `/trips` shows the shelf, the pill and (for a new verified user) the first-run card; confirm the four `home_*` event names appear in Vercel Analytics after a tap.

### 17.14 Screenshot-versus-board QA: feasibility (what is actually installed)

Findings from the machine, stated plainly:
- **Browsers available.** `/Applications/Google Chrome.app` is installed, and Playwright's own browser cache exists at `~/Library/Caches/ms-playwright/` with `chromium-1223` (Chrome for Testing 148, macOS x64), `chromium_headless_shell-1223` and `ffmpeg-1011`, each marked `INSTALLATION_COMPLETE`.
- **Playwright library: not installed in the project.** Neither `playwright` nor `@playwright/test` is in `package.json` or `node_modules`; there is no `playwright.config`, and vitest browser mode is not configured. I could not run shell commands in this pass, so I could not confirm whether a global `playwright` CLI or `npx` works offline. QA needs a Playwright release whose bundled Chromium revision is 1223 (check with `npx playwright install --dry-run`), or `channel: "chrome"` to drive the installed Google Chrome, or plain headless Chrome with `--screenshot --window-size=390,844`.
- **jsdom cannot do this.** It has no layout engine, so heights, gaps, wrapping at 320px and sticky behavior cannot be measured there; those are exactly the checks in design 13.

How QA can render each screen at 390 and 320 (set the viewport to 390x844 and 320x568, `deviceScaleFactor` 2 for crisp comparison):

| Screen | Needs a database? | How |
|---|---|---|
| `/` (welcome, shelf) | No | `npm run dev` with dummy `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set (so `createClient()` does not throw) and no cookies. With no session, the Supabase server client should answer `getUser()` without any network call; if it does try the network, point the URL at a closed local port and expect a null user. Verify on first run. |
| `/trip/new`, `/trip/new?type=camping`, `?type=airbnb` then tick International (board B) | No | Same dummy env. The page is a client form; nothing loads from the database until Create. |
| `/trips` (boards A and L, error variant) | Yes (session plus rows) | U9: non-production Supabase project with the seeded users, or the stub server for A and L. The error variant is produced by making the `trips` select fail (stub returns 500, or revoke access to the seeded user's rows). |
| List tab with the Suggested card (board C), unverified and verified | Yes | U9: non-production project (create the trip through the UI with Airbnb + International picked, then open `?tab=list`). The stub is not recommended for this screen. |

Measurement approach for the comparison: use Playwright `locator.boundingBox()` and `getComputedStyle` to compare tile sizes, gaps, padding, radius and the pill's left/right/bottom offsets against the values in design 9.2, 9.2a and 11 (this is deterministic and does not depend on eyeballing), then capture a side-by-side screenshot per board for the record. The canvas board files themselves (U11) are needed for the visual side; the numeric checklist works without them. Also toggle a picker tile and assert its bounding box and its neighbours do not move, and scroll `/trips` with enough trips to confirm the pill floats (U13).

Not recommended: any dev-only route or fixture page inside `src/app` (U9), and any change to production code to make screenshots easier.
