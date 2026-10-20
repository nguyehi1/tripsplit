# Code map

Shared modules and files with more than one consumer. Check this page before adding a parallel implementation. Each row says what the module owns and the rule for extending it.

## Data access

| Module | Owns | Rule |
|---|---|---|
| `src/lib/data/trips.ts` | Reads and writes for `trips`, `trip_members`, `expenses`: `createTrip`, `joinTrip`, `completeTrip`, `addExpense`, `updateExpense`, `deleteExpense`, `undoDeleteExpense`, `getMyTrips`, `getTripView`, `getTripSummary`, `removeTripMember`, `leaveTrip`, `wasRemovedFromTrip`, `getMyDisplayName` | New trip or expense logic goes here, not inline in a page. Functions take a generic `SupabaseClient<Database>`, so both the browser and server clients work. |
| `src/lib/data/trip-columns.ts` | Explicit column lists for `trips` | Any new read of `trips` uses an explicit list. `other_type` is never selected. It is a separate file so tests that mock `@/lib/data/trips` do not strip it. |
| `src/lib/data/shopping-list.ts` | `getShoppingListView`, `addShoppingListItems`, `deleteShoppingListItem`, and wrappers for the claim, unclaim and log-expense RPCs | A distinct entity gets its own file, like `settlement.ts`, `validation/expense.ts` and `avatar.ts`. The Suggested card's "+" reuses `addShoppingListItems` with one description. |
| `src/lib/supabase/client.ts`, `server.ts` | Browser and server Supabase clients | |

Notes on `trips.ts`:

- **Member identity.** Every shaped member object uses `trip_members.id`, never `user_id` ([ADR 0004](../adr/0004-placeholder-member-nullable-user-id-and-identity-key.md)). New functions that shape member data follow this.
- **Ghost payers.** `getTripView` synthesizes an entry for an `expenses.paid_by` id with no matching current member ([ADR 0012](../adr/0012-post-removal-detection-and-ghost-payer-rendering.md)). Any function that maps `paid_by` through a current-member lookup must handle a missing match.
- **`createTrip`** takes optional `types` and `otherType` and returns `typesStored`. With neither it calls the five-argument RPC; otherwise the seven-argument overload.
- **Readers of `expenses`.** A reader that bypasses RLS must filter `deleted_at`. `expenses-read-guard.test.ts` pins every reader.
- `renderTripDashboard` in `src/app/trip/[id]/page.tsx` fetches the shopping-list view after `getTripView`'s detail tier resolves and fails soft to an empty list. It supports `?tab=list`, which trips created with a catalog type open on.

## Validation and formatting

| Module | Owns | Rule |
|---|---|---|
| `src/lib/validation/expense.ts` | `isValidExpenseInput` (positive amount, non-empty description), `isValidExpenseDate` (real calendar date, not in the future) | Every expense form imports these. Do not reinline the rule. |
| `src/lib/validation/trip-type.ts` | Normalizes and validates the typed "Other" text. Exports the character class that must match migration 0022's `CHECK` (a test enforces this). | |
| `src/lib/validation/redirect.ts` | Safe `next` redirect targets | |
| `src/lib/dates.ts` | `formatDate`, `formatDayDate`, `formatDateRange`, `todayIso` | Date formatting and "today" go through here. `todayIso()` is the browser-local day, deliberately not the database's UTC `current_date` ([ADR 0003](../adr/0003-expense-date-column-sequencing.md)). Everything except `todayIso` formats against a fixed `"UTC"` zone, so output is identical on server and client. |
| `src/lib/currency.ts` | Dollars to and from integer cents | |
| `src/lib/settlement.ts` | `computeBalances`, `simplifyDebts` | Equal split across current members |
| `src/lib/avatar.ts` | `initialsFor`, `avatarColorFor`, `displayNameFor` | Name decoration, including the `(placeholder)` suffix, lives in `displayNameFor`. Extend its suffix pattern rather than adding a parallel string helper. |
| `src/lib/errors.ts` | `errorMessage`, `errorCode`, `ExpenseActionError`, `rosterErrorCopy` | Supabase errors are plain objects, not `Error`s. Roster failures go through `rosterErrorCopy` so raw database text is never shown. |

## Auth and gating

| Module | Owns | Rule |
|---|---|---|
| `src/lib/auth-gate.ts` | `requireVerifiedSession(supabase, prefetchedUser?)` | See [Auth](../architecture/auth.md#requesting-verification) |
| `src/lib/pending-action.ts` | Saves and restores an expense draft across the `/check-email` redirect (`sessionStorage`) | Not extended to single-tap list mutations |
| `src/lib/use-otp-flow.ts` | The OTP flow hook | |
| `src/proxy.ts` | The session-exists gate for `/trips`, `/feedback`, `/you` | Page code under `/trip/*` must not assume it ran |
| `src/lib/rate-limit.ts` | `enforceRateLimit(request, { key, limit, windowSeconds })`, `isDbRateLimitError`, `dbRateLimitResponse` | Used by `GET /api/trip-invite/[code]` and `POST /api/join`. Wraps `@upstash/ratelimit`, keyed by `x-forwarded-for`. Requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in production, or those routes fail closed with 503. A new endpoint accepting a guessable credential calls it. |

## Invites and starter lists

| Module | Owns | Rule |
|---|---|---|
| `src/lib/mailto-invite.ts` | Builds the "Invite by email" `mailto:` (subject, body, control-character stripping, `isPlausibleEmail`) | The invitee's address exists only in the browser. Sending it anywhere (log, analytics property, fetch) breaks a claim on `/privacy`. |
| `src/lib/starter-catalog.ts` | The one editable catalog: type codes, labels, phrases, item names | Tiles, card, analytics event names and the `TripType` union all read from it. Adding a type also needs a migration re-adding `trips_types_check` and rows in the [analytics reference](analytics-events.md). |
| `src/lib/starter-suggestions.ts` | Pure derive, merge and dedupe logic; `homeTemplateTappedEvent` (returns `undefined` outside the catalog) | |
| `src/components/template-shelf.tsx`, `template-tile.tsx` | The home shelf on `/trips` and `/` | The shelf is server-renderable. The two client leaves exist only to fire closed-set analytics events. |
| `src/app/trip/new/page.tsx` | A thin async server wrapper that validates `?type=` with `parseTypeParam` and passes only the typed result to `new-trip-form.tsx` | The raw query value is never echoed, redirected on or forwarded. |

## Telemetry

| Module | Owns |
|---|---|
| `src/lib/tracking.ts` | `trackEvent(eventName)`, the one analytics entry point |
| `src/lib/perf/timing.ts` | `timeAsync`, `reportClientTiming` |

See [Telemetry](../architecture/telemetry.md).

## UI

| Module | Owns | Rule |
|---|---|---|
| `src/components/ui.tsx` | Hook-free primitives: `Button`, `IconButton`, `LinkButton`, `IconLinkButton`, `Card`, `TabSwitch` (optional `badge`), `Screen`, `BottomBar`, `FabBar` | Usable from Server or Client Components as long as no function prop crosses the boundary. Use `Button` when the action runs code; use `LinkButton` for pure navigation. New visual behavior is added as off-by-default props. |
| `src/components/bottom-nav-bar.tsx` | `BottomNavBar`, `HomeNavBar`, `TripNavBar`: the unified bottom tab bar | Separate from `BottomBar`, which is a single CTA slot. The two stack on one screen. `FabBar` is unused but kept. |
| `src/app/globals.css` | The design-token source | See [Rendering](../architecture/rendering.md#design-tokens-and-theming) |
| `src/lib/locked-trip-copy.ts` | Locked-trip copy | |
| `src/lib/remembered-email.ts` | Remembered sign-in email in `localStorage` | |

## Database building blocks

Compose `is_trip_member`, `is_trip_open`, `is_verified_trip_member` and `is_owner_or_verified_member` in new policies and RPCs. They are listed in the [data model](data-model.md#functions).

`remove_trip_member`, `leave_trip` and the placeholder RPCs use `is_trip_open` plus a standalone `coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false` guard, not `is_verified_trip_member`. See migration 0010's header comment for why.

## Related

- [Data model](data-model.md)
- [Architecture overview](../architecture/overview.md)
- [Mutations](../architecture/mutations.md)

Last verified: 2026-10-20 against 9a951bb
