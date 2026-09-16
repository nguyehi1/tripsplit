# 0005. Pattern for converting a client-fetched page to a Server Component

Status: accepted
Date: 2026-09-15

## Context

`src/app/trips/page.tsx` and `src/app/trip/[id]/page.tsx` were `"use client"`
components that, on mount, called `supabase.auth.getUser()` via the browser
client and then `getMyTrips`/`getTripView` from `src/lib/data/trips.ts`,
rendering a "Loading…" placeholder until both resolved. `src/proxy.ts` already
gates these routes server-side (redirecting signed-out visitors before the
page renders at all), so the client-side `getUser()` call was pure redundant
latency stacked in front of the real data fetch — HTML shell → JS parse →
client auth round trip → data round trip → render.

This is the first of what the requirements flag as a series of page
conversions (`check-email`, `join/[code]`, the home page are explicitly
deferred, not rejected). The decisions below are written to generalize to
those future conversions, not just this pair of pages, per the requesting
agent's request to capture this as a template. Two hard constraints came from
requirements: `src/proxy.ts` must not be touched or duplicated (verified by
inspecting the diff, not by re-deriving its redirect logic elsewhere), and
visual output/copy must be unchanged, verified by side-by-side comparison —
this is a perf refactor, not a rewrite.

This version of Next.js (16.3.4) makes `params` a `Promise` in page props and
treats Server Components as the default; reading `cookies()` (which
`src/lib/supabase/server.ts`'s `createClient()` already does) opts a route
into per-request dynamic rendering automatically, with no `export const
dynamic = "force-dynamic"` needed. Confirmed against
`node_modules/next/dist/docs/01-app/`.

## Decision

**1. Split each page into an `async` Server Component (data + static
structure) plus, only where genuine client-side state exists, a small
`"use client"` leaf that receives already-fetched, plain-object data as
props.**

- `src/app/trips/page.tsx`: nothing on this page holds local state (no tabs,
  no toggles) — every interactive element is pure navigation. It converts
  entirely to an `async` Server Component; no client subcomponent is needed
  for it at all.
- `src/app/trip/[id]/page.tsx`: the Expenses/Details `TabSwitch` is genuine
  client-side UI state (`useState`) with no server round trip involved in
  switching it. The page becomes an `async` Server Component that fetches
  `getTripView` once and renders the header/summary card/bottom bar
  server-side, handing `members`/`expenses`/`you`/`isCompleted`/`tripId` as
  props to a new co-located client component
  (`src/app/trip/[id]/trip-tabs.tsx`) that owns the tab state and renders
  both tab bodies (including the editable-expense-row navigation — see
  point 2). This is the only client-side JS shipped for this route.

**2. Replace every `onClick={() => router.push(...)}` used for pure
navigation with `<Link>` (or a new `Link`-based styled primitive), removing
`useRouter` from both pages entirely.** `next/link` renders as a real
anchor, needs no client-component boundary in the parent to use, is more
correct for navigation (keyboard `Enter`, middle-click, open-in-new-tab, no
extra JS needed before it's clickable) than a `<button onClick>` doing the
same thing, and — per
`node_modules/next/dist/docs/01-app/02-guides/server-and-client-boundary.md`
— a function prop (`onClick`) cannot cross the Server → Client boundary
being introduced here, whereas passing `href` (a string) can. Concretely:
  - `src/components/ui.tsx` gains two new pure-presentational, `next/link`-based
    siblings to the existing `Button`/`IconButton`: `LinkButton` and
    `IconLinkButton`, reproducing the same class strings so a styled
    "button" that's actually a navigation can be used from a Server
    Component (or anywhere else) without pulling in a client boundary just
    to navigate. `Button`/`IconButton` themselves are unchanged — call sites
    that need a real `onClick` (forms, other pages not in this feature's
    scope) keep using them as-is.
  - The trip dashboard's header icons (all trips, new trip, roster, settle
    up, feedback), the bottom-bar "Add an expense" button, `/trips`' "New
    trip" icon and "Start a trip" CTA, and the `/trips` trip-row navigation
    all become `Link`/`LinkButton`/`IconLinkButton`.
  - The one non-trivial case is the editable expense row on the trip
    dashboard, which today is a `<div role="button" tabIndex={0}>` with a
    manual `onKeyDown` handling both `Enter` and `Space`, wrapped around
    several children (avatar, text, amount, pencil icon). This becomes a
    `<Link>` wrapping the same children when `editable`, a plain `<div>`
    otherwise — dropping the manual `onKeyDown`. **Documented, deliberate
    behavior note**: a real anchor activates on `Enter` natively but not on
    `Space` (browsers reserve `Space` for scrolling on links, not buttons).
    This is a one-key regression in exchange for a strictly more correct
    element (real link semantics for screen readers, middle-click, "open in
    new tab") for what was already visually and functionally a link, not a
    stateful toggle. Flagged here rather than silently dropped; acceptance
    criteria only requires the click behavior, not the exact keyboard
    handling, so this doesn't fail acceptance, but it is a real, if minor,
    UX delta the reviewer should sign off on rather than a pure no-op change.

**3. Handle the "couldn't load this trip" case with an explicit
`try/catch` around the data fetch inside the Server Component, rendering the
existing inline error markup/copy — not `notFound()`, not `redirect()`, and
not relying on the route's `error.tsx` boundary.** `getTripView`'s
`.single()` call throws when RLS filters the row out (visitor isn't a trip
member) or the id is malformed, exactly as it does today when called from
the client — so wrapping the same call in `try/catch` server-side reproduces
today's behavior byte-for-byte (same copy, same "still on this screen, no
navigation" UX), which is what acceptance criterion 4 asks for. `notFound()`
would render the app's 404 page (wrong copy, wrong navigation option —
"Go home" instead of nothing); an uncaught throw would hit `src/app/error.tsx`
("Something went wrong" + "Try again" retry button) instead of the specific
"you may not be on it" message. Both were considered and rejected as changing
user-visible behavior for what must be a no-op refactor.

**4. Keep using `supabase.auth.getUser()` server-side (via
`src/lib/supabase/server.ts`) to obtain `currentUserId` for
`getTripView`/`getMyTrips`, matching every other server-side call site in
this repo (`proxy.ts`, `src/app/api/trip-email/route.ts`,
`src/app/api/join/route.ts`) — do not switch to `getSession()`/`getClaims()`
to save the extra Auth-server round trip, and do not have `proxy.ts` forward
the already-verified identity via a request header.** See Impact analysis
below for why this residual round trip exists and is being accepted rather
than eliminated in this pass.

## Alternatives considered

- **Have `proxy.ts` attach a trusted header (e.g. `x-user-id`) after its own
  `getUser()` check, and have the page trust that header instead of calling
  `getUser()` again**, fully eliminating the second Auth-server round trip
  per request. Rejected for this pass: requirements are explicit that
  `proxy.ts`'s behavior must be verified unchanged by inspecting the diff,
  not re-derived; adding a header-injection responsibility to it is a
  behavior change to the file the requirements say must stay untouched.
  Worth revisiting as its own scoped change if server-side latency numbers
  after this feature ships still show the second `getUser()` call as a
  meaningful cost.
- **Use `supabase.auth.getSession()` (or `getClaims()`) in the page instead
  of `getUser()`**, since `currentUserId` here is used only to shape display
  fields (`you`, `yourNetCents`) and RLS — not this id — is what actually
  scopes which rows come back. Rejected: the Supabase SDK's own docstring
  (`node_modules/@supabase/auth-js`) calls `getSession()` "insecure on the
  server" and says `getUser()` "should always be used ... on the server";
  every other server-side call site in this codebase already follows that
  rule. Introducing the one exception here, even for a narrow
  display-only justification, creates a second server-side auth-read
  pattern that a future change could copy into an actually
  security-sensitive spot by mistake. The performance goal of this feature
  (removing the *client-side* round trip) is fully achieved without this;
  saving the remaining *server-side* round trip is a separate, smaller
  optimization not worth that maintenance risk.
- **Render the editable expense row's navigation via `useRouter().push()`
  inside the new `trip-tabs.tsx` client component** (it's a client component
  anyway, so `useRouter` is available there) instead of `<Link>`. Rejected
  in favor of `<Link>` throughout for consistency (see point 2) — there's no
  behavior this route needs that `router.push` provides and `<Link>`
  doesn't (no side effect to run before navigating, no conditional
  redirect target), so using `<Link>` uniformly, including inside the one
  client leaf, avoids leaving `useRouter` in the codebase for these two
  routes at all and keeps one navigation idiom instead of two.
- **`notFound()` for the "not on this trip" case.** Rejected — see point 3.

## Consequences

- This is the template for the deferred conversions (`check-email`,
  `join/[code]`, the home page): identify what's genuinely stateful
  (form inputs, in-flight submission state) vs. pure navigation or
  server-fetchable data, keep the former as small `"use client"` leaves fed
  by props, convert the latter to `<Link>`/server-fetched markup. Those
  pages are form-heavy (submit-on-click, not just navigate-on-click), so
  expect more of the tree to stay client-side than in this pass — that's a
  case-by-case call each time, not a rule that whole pages must go fully
  server.
- `src/components/ui.tsx` now has two navigation-flavored siblings
  (`LinkButton`, `IconLinkButton`) next to the click-flavored originals
  (`Button`, `IconButton`). Future features adding a styled control should
  pick based on whether the action navigates or performs a client-side
  operation, not by habit — a `Link`-based control that also needs to run
  code before navigating (e.g. an optimistic update) should stay a
  `Button`/`IconButton` with `onClick` inside a client component instead of
  being forced into this pair.
- Two `supabase.auth.getUser()` calls now happen per request to `/trips` or
  `/trip/[id]` (one in `proxy.ts`, one in the page) instead of one server
  call plus one client call. This is strictly faster end to end (the
  eliminated client round trip included a full JS bundle parse plus a
  browser-to-Supabase network hop, both slower than a same-region
  server-to-Supabase hop), but it is not the theoretical minimum. If this
  shows up as a real cost later, the header-forwarding alternative above is
  the documented next step — it needs its own requirements/architecture
  pass since it touches `proxy.ts`.
- Space-key activation on the editable expense row is intentionally dropped
  (see point 2). If a future accessibility pass wants it back without
  reverting to a fake-button `div`, the fix is a small `onKeyDown` on the
  `Link` itself (anchors do support `onKeyDown` as a client-side handler),
  not a reversion of this ADR's approach.
