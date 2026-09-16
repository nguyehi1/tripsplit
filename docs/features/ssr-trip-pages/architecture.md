# Architecture: Server-render the trips list and trip dashboard

See `docs/features/ssr-trip-pages/requirements.md` for the approved
requirements, and [ADR 0005](../../adr/0005-ssr-page-conversion-pattern.md)
for the general client/server-component-split pattern this feature
establishes (that ADR is the "why," this doc is the "what, here").

## Existing overlap check

- `src/lib/data/trips.ts` (`getMyTrips`, `getTripView`) is the existing
  data-access module for exactly this data and is reused as-is — no parallel
  fetch logic is introduced. Both functions already take a generic
  `SupabaseClient<Database>` (aliased `Client` in that file), which
  `createServerClient<Database>(...)` (used by `src/lib/supabase/server.ts`)
  and `createBrowserClient<Database>(...)` (used by
  `src/lib/supabase/client.ts`) both satisfy — **no signature change is
  needed** to call them from a Server Component.
- `src/lib/supabase/server.ts`'s `createClient()` already exists and is
  already used by `src/app/api/trip-email/route.ts` and
  `src/app/api/join/route.ts` for server-side Supabase access — this feature
  is the first *page* (not route handler) to use it, but the client factory
  itself needs no changes.
- `src/proxy.ts` already gates `/trips` and `/trip/*` and is left untouched
  (see Impact analysis).
- `src/components/ui.tsx` is the existing shared UI-primitives module;
  extended (not duplicated) with two new components, `LinkButton` and
  `IconLinkButton` (see Module boundaries).

## Data model changes

None. No new tables/columns, no new migration. `getMyTrips`/`getTripView`'s
return shapes are unchanged (requirement 8).

## API/route contract changes

None. No new or changed route handlers under `src/app/api/`. This feature
touches only two `page.tsx` files (plus one new co-located component) and
the shared `ui.tsx`/`dates.ts` modules.

## Design

### `src/app/trips/page.tsx` — full conversion, no client subcomponent

Nothing on this page is stateful (no tabs, no toggles) — every interactive
element is pure navigation. It becomes an `async` Server Component:

1. `const supabase = await createClient()` (from `src/lib/supabase/server.ts`).
2. `const { data: { user } } = await supabase.auth.getUser()`. If `!user`,
   `redirect("/")` — a defensive fallback for the vanishingly rare case
   where the session is invalid despite passing `proxy.ts` moments earlier
   in the same request; not a re-derivation of `proxy.ts`'s `?next=`
   redirect (requirement 3 only requires `proxy.ts` itself be unchanged and
   authoritative, not that every downstream page reproduce its exact
   redirect shape).
3. `try { trips = await getMyTrips(supabase, user.id) } catch { trips = null; error = "Couldn't load your trips." }` —
   mirrors today's client-side `.catch()` message exactly.
4. Render the existing markup unchanged, with these swaps:
   - `TripRow`'s wrapping `<button onClick={onOpen}>` → `<Link href={`/trip/${trip.id}`} className="block w-full cursor-pointer p-[18px] text-left">`.
   - "New trip" `IconButton` → `IconLinkButton href="/trip/new"`.
   - "Start a trip" `Button` (empty state) → `LinkButton href="/trip/new" variant="accent" ...`.
   - `useRouter` is removed entirely; the file no longer needs `"use client"`.

### `src/app/trip/[id]/page.tsx` — split into Server Component + one client leaf

1. `async function TripDashboardPage({ params }: { params: Promise<{ id: string }> })` —
   `params` is a `Promise` in this Next.js version (confirmed against
   `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`);
   `const { id } = await params`.
2. Same `createClient()` / `getUser()` / defensive-redirect steps as above.
3. `try { view = await getTripView(supabase, id, user.id) } catch { view = null }`.
   If `view` is `null`, render the existing inline
   `"Couldn't load this trip — you may not be on it."` markup and return —
   **not** `notFound()`, **not** a redirect, and not left to throw into
   `src/app/error.tsx`'s generic boundary. See ADR 0005 point 3 for why.
4. If `view` resolves, render the header/summary `Card`/bottom bar
   server-side, with the same `Link`/`IconLinkButton`/`LinkButton` swaps as
   above for every icon button, and delegate the Expenses/Details section to
   a new client component.

New file: **`src/app/trip/[id]/trip-tabs.tsx`** (`"use client"`), colocated
with the route since it's specific to this page, not reused elsewhere
(matches this repo's existing convention of keeping route-specific UI next
to its `page.tsx` rather than in `src/components/`). Signature:

```
export function TripTabs(props: {
  tripId: string;
  members: TripView["members"];
  expenses: TripView["expenses"];
  you: TripView["you"];
  isCompleted: boolean;
}): JSX.Element
```

It owns the `useState<"expenses" | "details">` tab state and renders
`TabSwitch` plus both tab bodies — this is the only client-side JavaScript
shipped for this route. All fields it receives are the same plain
objects/primitives `getTripView` already returns (serializable, no
change needed to pass them as props across the Server → Client boundary).

Within it, the editable-expense-row navigation
(`expense.payer.id === you?.id && !trip.isCompleted`) becomes a `<Link
href={`/trip/${tripId}/expense/${expense.id}/edit`}>` wrapping the row's
children when `editable`, a plain `<div>` otherwise — replacing the
`onClick`/`onKeyDown`(Enter+Space)/`role="button"` combination. `useRouter`
is not used anywhere in this component or the page; `router.push` is
removed from both files entirely (see ADR 0005 for the one documented
behavior delta: `Space` no longer activates the row, since a real anchor
only activates on `Enter`).

The bottom-bar "Add an expense" `Button` becomes a `LinkButton` (rendered
server-side, in the page, not in `trip-tabs.tsx`, since it needs no local
state); the locked-state `Button` (no `onClick` today) is unchanged and
stays exactly where it is.

### Module boundaries — new/changed shared code

- **`src/components/ui.tsx`**: add `LinkButton` and `IconLinkButton`,
  `next/link`-based siblings of `Button`/`IconButton` reproducing their
  exact class strings, for styled navigation controls that don't need a
  client boundary. `Button`/`IconButton` are unchanged; other call sites
  (forms, out-of-scope pages) keep using them with real `onClick` handlers.
- **`src/app/trip/[id]/trip-tabs.tsx`** (new): the one client-side leaf for
  this feature, as described above.
- **`src/lib/dates.ts`**: pin all three formatting functions
  (`formatDate`, `formatDayDate`, `formatDateRange`) to explicit UTC — see
  "UTC pin for `dates.ts`" below. `todayIso()` is untouched.

### UTC pin for `src/lib/dates.ts` (in scope, decided during this pass)

**Risk, as flagged and resolved with the user during the UX-design stage**:
`formatDate`/`formatDayDate`/`formatDateRange` currently do
`new Date(`${iso}T00:00:00`)` (a date-time string with no zone suffix,
which the ECMAScript spec parses as **local time in whatever environment
runs it**) and then `.toLocaleDateString(...)` with no explicit `timeZone`
(which also defaults to the runtime's local zone). Today that's
self-consistent because this code only ever ran in the browser — parse and
format always agreed on "the visitor's own zone." Once `trips`/`trip/[id]`
render via SSR, these calls execute **server-side**, in the server's zone
(Vercel's Node runtime, effectively UTC), for the *initial, non-hydrated*
render — a Server Component's output text is fixed at server-render time
and is not re-computed client-side the way a Client Component's would be
on hydration. A visitor outside UTC would then see a date/weekday computed
in the server's zone instead of their own.

**Decision**: pin both the parse and the format side to UTC, not just the
format side. `trips.starts_on`/`ends_on` and `expenses.date` are stored as
plain calendar dates with no time-of-day component, so there is no "real"
timezone-sensitive instant to preserve — UTC is simply a fixed, arbitrary,
environment-independent anchor, and is the natural choice since it needs no
new dependency or config. Concretely, in each of the three functions:

- Parse the date-only string as UTC (either drop the injected `T00:00:00`
  local-time suffix and rely on the ECMAScript spec's rule that a bare
  `YYYY-MM-DD` string parses as UTC midnight, or keep an explicit
  `T00:00:00Z` suffix — either is equivalent; pick whichever reads more
  clearly).
- Pass `timeZone: "UTC"` explicitly in every `toLocaleDateString(...)` call
  in the file.

**Both halves are required together.** Adding `timeZone: "UTC"` to the
format call alone, while leaving the parse side interpreting the string as
*local* time, would reintroduce a mirror-image version of the exact bug
class the original `T00:00:00` suffix was added to avoid — for a visitor in
a zone *ahead* of UTC (e.g. Tokyo, UTC+9), parsing `"2026-09-15T00:00:00"`
as local midnight is `2026-09-14T15:00:00Z`, which a UTC-pinned formatter
would then read back as **September 14**, one calendar day earlier than the
stored date. Pinning both sides to UTC removes the runtime-zone dependency
entirely, in every environment, for good — not just for the two pages this
feature converts.

**Scope of this sub-change**: `dates.ts` is a shared module — this fix
necessarily applies to every call site, not only the two pages being
converted to SSR in this pass. See Impact analysis below for the full list
and what changes for each. `todayIso()` is deliberately left as-is: it
answers "what calendar date is it for a human filling out a form right
now," which must stay anchored to the browser's local "today" per
[ADR 0003](../../adr/0003-expense-date-column-sequencing.md), and none of
its call sites (`add-expense`, `expense/[id]/edit`) are touched by this
feature — they remain client components.

## Impact analysis

### `src/proxy.ts`

Not modified. Verified unchanged (requirement 3) — still the sole place
`/trips`/`/trip/*` auth-gating happens, still redirecting to `/?next=...`
on no session. The new pages' own `getUser()` + `redirect("/")` fallback is
purely defensive for an edge case `proxy.ts` cannot itself close (session
becoming invalid between its check and the page's render, or a trip that
exists but the visitor isn't a member of — the latter `proxy.ts`
structurally can't check, since it only verifies session existence, not
trip membership, and rightly leaves that to RLS + the page).

**Note on residual server-side auth cost**: both pages still call
`supabase.auth.getUser()` server-side (needed regardless of `proxy.ts`, to
get `user.id` for `getMyTrips`/`getTripView`'s "you" fields) — this is a
second Supabase-Auth-server round trip per request, on top of `proxy.ts`'s
own. Eliminating it (e.g. `proxy.ts` forwarding the verified identity via a
request header) is out of scope here because it requires changing
`proxy.ts`, which requirement 3 forbids touching in this pass. See ADR 0005
for the full reasoning and the flagged follow-up.

### `src/lib/data/trips.ts` (`getMyTrips`, `getTripView`)

**Not modified.** Confirmed backward-compatible with every existing
consumer, all of which keep calling them exactly as before, with the
browser client, unaffected by this feature:

- `src/app/trip/[id]/settle-up/page.tsx`
- `src/app/trip/[id]/invite/page.tsx`
- `src/app/join/[code]/welcome/page.tsx`
- `src/lib/data/trips.test.ts`, `src/lib/data/trips.placeholder-qa.test.ts`
  (unit tests against fakes — unaffected, no signature or behavior change)

The two pages in scope for this feature simply become new consumers that
pass a server-created client instead of a browser-created one — both are
`SupabaseClient<Database>`, so this is transparent to `trips.ts`.

### `src/lib/dates.ts` (`formatDate`, `formatDayDate`, `formatDateRange`)

**Behavior changes for every caller**, not just the two SSR'd pages, since
this is a shared module and the fix is applied at the source, not per call
site. Full caller list and effect:

| Caller | File | Stays client or converts? | Effect of the UTC pin |
|---|---|---|---|
| Trip dashboard header date range | `src/app/trip/[id]/page.tsx` | Converts (this feature) | None visible — was already correct for the SSR case being fixed; UTC pin is what makes it correct. |
| Trips list date range | `src/app/trips/page.tsx` | Converts (this feature) | Same as above. |
| Expense row day label (`formatDayDate`, via `getTripView`) | `src/lib/data/trips.ts` → `src/app/trip/[id]/page.tsx` | Converts (this feature) | Same as above. |
| Join-by-code preview date range | `src/app/join/[code]/page.tsx` | Stays client (non-goal, deferred) | For visitors outside UTC, the displayed date range may shift by how it's computed (now UTC-anchored instead of browser-local-anchored) — see below for why the actual displayed calendar date does not change. |
| Settle-up header date range | `src/app/trip/[id]/settle-up/page.tsx` | Stays client (out of scope) | Same as above. |
| Join-welcome date range | `src/app/join/[code]/welcome/page.tsx` | Stays client (out of scope) | Same as above. |

For the three still-client pages: because `formatDate`/`formatDayDate`/
`formatDateRange` format a **calendar date with no time-of-day component**,
and the fix pins *both* the parse and the format side to the same zone
(UTC), the output text is the calendar date and weekday literally encoded
in the stored ISO string — the same value a self-consistent
local-zone parse+format already produced (see the worked example in the
"UTC pin" section above: self-consistent parse+format in any single zone
reproduces the source date, since the zone offset cancels out). In other
words, this is a **correctness fix that also happens to be a no-op for
every existing caller's displayed output**, not a visible behavior change
for those three pages — it only matters going forward once code that reads
these functions can run in more than one zone for the same date (which,
before this feature, no code in this app could: everything calling
`dates.ts` ran exclusively in the browser). Flagging this explicitly for
the reviewer/QA rather than asserting it silently, since "no visible change
for out-of-scope pages" is exactly the kind of claim that should be spot
checked, not assumed.

`src/lib/dates.test.ts`'s existing assertions (e.g.
`formatDayDate("2026-09-14")` → `"Mon, 9/14"`) test a calendar date's
weekday, which is a zone-independent fact once parse and format agree on
one zone — expected to keep passing unchanged, but the engineer should run
them to confirm rather than assume.

### `src/components/ui.tsx`

Additive only (`LinkButton`, `IconLinkButton` are new exports). No existing
export (`Button`, `IconButton`, `TabSwitch`, `Card`, etc.) is changed, so
every current consumer of this module (every page in `src/app/`) is
unaffected.

### Backward-compatibility across the deploy boundary

No database migration is part of this feature, so there's no
migration-vs-deploy ordering window to worry about (unlike, e.g., ADR 0003's
`not null` sequencing concern). The only "boundary" here is a Vercel
deploy of pure frontend/rendering-strategy code with no API contract change
and no schema change — old and new code can't be live at the same time in a
way that matters, since there is no shared contract between them being
altered (RLS, table shapes, and RPC signatures are all untouched).

## Semver / breaking-change policy

No versioned route needed — there is no route contract change at all. This
confirms the requirements doc's own "Fix" classification: internal
rendering-strategy refactor, zero external contract change.
