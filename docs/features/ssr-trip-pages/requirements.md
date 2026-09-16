# Server-render the trips list and trip dashboard

## Problem

`src/app/trips/page.tsx` and `src/app/trip/[id]/page.tsx` are `"use client"`
components that render a loading state, then in `useEffect` call
`supabase.auth.getUser()` client-side before fetching page data (`getMyTrips`
/ `getTripView` from `src/lib/data/trips.ts`). Since `src/proxy.ts` already
gates these routes server-side and redirects unauthenticated visitors before
the page ever renders, the client-side `getUser()` call is pure redundant
latency, not a real auth check. The result is a visible waterfall on every
navigation to these two pages: HTML shell → JS parse → client auth round
trip → data round trip → render — which users are experiencing as "pages
take a few seconds to load."

Converting these two pages to Server Components lets them fetch trip data
during SSR (using the existing `src/lib/supabase/server.ts` client, whose
session is already populated by `proxy.ts`), so the response sent to the
browser already contains the real content instead of a loading placeholder,
and removes one full network round trip from the critical path.

## Scope (v1)

In scope:
- `src/app/trips/page.tsx` (trips list / dashboard)
- `src/app/trip/[id]/page.tsx` (trip dashboard: summary card, Expenses/Details
  tab content, bottom action bar)

Out of scope for this pass (see Non-goals):
- `src/app/check-email/page.tsx`, `src/app/join/[code]/page.tsx`,
  `src/app/page.tsx` (home/sign-in) — these are primarily forms/interactive
  flows, not data-fetch-then-render pages, and lower traffic. Flagged as
  candidates for a later pass, not bundled into this one.
- Other trip subpages (`invite`, `settle-up`, `feedback`, `add-expense`,
  `expense/[id]/edit`, `trip/new`) — unchanged in this pass.

## Acceptance criteria

1. Navigating to `/trips` or `/trip/[id]` while signed in returns an initial
   HTML response that already contains the real trip data (list of trips, or
   the trip summary/expenses/members) — not a "Loading your trips…" /
   "Loading your trip…" placeholder that then swaps in after a client fetch.
2. Neither page makes a client-side `supabase.auth.getUser()` call on initial
   load. Data fetching for the initial render happens server-side via
   `src/lib/supabase/server.ts`.
3. `src/proxy.ts`'s auth-gating behavior is unchanged and not duplicated:
   unauthenticated visitors to `/trips` or `/trip/*` are still redirected to
   `/` with `?next=` set, exactly as today. This requirement is verified by
   inspecting proxy.ts is untouched, not by re-deriving the redirect in the
   page.
4. Visiting a trip you don't belong to still shows the existing error state
   ("Couldn't load this trip — you may not be on it."), now determined
   server-side instead of via a caught client error.
5. All existing interactive behavior is preserved and still works without a
   full page reload where it doesn't today:
   - Expenses/Details tab switch on the trip dashboard
   - Navigation via icon buttons (all trips, new trip, roster, settle up,
     feedback) and the "Add an expense" bottom bar button
   - Clicking an editable expense row (payer viewing their own expense on a
     non-completed trip) navigates to its edit page
   - Clicking a trip row on `/trips` navigates to that trip
6. Empty states are preserved: "You're not on any trips yet" (with "Start a
   trip" CTA) on `/trips`, and "No expenses logged yet." on the trip
   dashboard.
7. Visual output (markup, styling, copy) is unchanged from today — this is
   a behind-the-scenes refactor, verified by side-by-side comparison, not a
   redesign.
8. No changes to `supabase/migrations/*`, RPC signatures, or the shape of
   data returned by `getMyTrips`/`getTripView` in `src/lib/data/trips.ts`
   (their consumers may move, but their contracts don't change).
9. The Supabase SMTP/OTP delivery issue is not touched by this work.
10. Manually verified (e.g. via browser devtools network panel) that loading
    `/trips` or `/trip/[id]` no longer shows a separate client-side
    `auth.getUser()` request followed by a separate data-fetch request after
    the document loads — the data arrives with the initial navigation.

## Non-goals

- Converting `check-email`, `join/[code]`, or the home page (`page.tsx`) to
  Server Components — deliberately deferred.
- Any visual/UX redesign, new features, or copy changes.
- Changing or duplicating the auth-redirect logic in `src/proxy.ts`.
- Fixing the Supabase SMTP/OTP email delivery issue — separate, already
  tracked work.
- Introducing a client-side data-fetching/caching library (SWR, React
  Query, etc.).
- Converting other trip subpages (invite, settle-up, feedback, add/edit
  expense, new trip) in this pass.

## Semver classification

**Fix.** No new user-facing capability is introduced and no existing
behavior changes from the user's perspective — this addresses the "pages
take a few seconds to load" complaint by removing redundant client-side
round trips. Flagging for the reviewer to confirm before the version bump,
since it does touch two core routes' rendering strategy even though the
external contract doesn't change.
