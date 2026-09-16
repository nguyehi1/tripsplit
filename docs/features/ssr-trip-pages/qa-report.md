# QA report: ssr-trip-pages

## Summary

Overall: **9 of 10 acceptance criteria PASS**. AC 3 **FAILS on its literal,
documented verification method** — `src/proxy.ts` is not, in fact, untouched
(see below) — even though live testing shows the resulting redirect
*behavior* for `/trips`/`/trip/*` is unchanged. Everything else (data
contract, visual parity, empty/error states, dates UTC pin, new
LinkButton/IconLinkButton primitives, no client-side `getUser()`) checks out.

Full suite: `npm test` 107/107 pass (83 pre-existing + 24 new QA tests),
`npm run typecheck` clean, `npm run lint` clean, `npm run build` succeeds
with `/trips` and `/trip/[id]` both listed as `ƒ` (server-rendered on
demand) in the build output.

## Acceptance criteria (requirements.md)

1. **PASS** — Initial HTML contains real data, not a loading placeholder.
   Verified with `renderToStaticMarkup` tests that call the actual page
   functions with mocked `getMyTrips`/`getTripView` and assert the returned
   markup contains real trip/expense content and never contains "Loading
   your trip(s)". Also confirmed via `next build` output: both routes are
   `ƒ` dynamic Server Components, not client-rendered shells.
2. **PASS** — Grepped both page files and `trip-tabs.tsx`: the only
   `supabase.auth.getUser()` calls left in `src/app/trips/page.tsx` and
   `src/app/trip/[id]/page.tsx` are inside the `async` Server Component
   functions, run server-side via `createClient()` from
   `src/lib/supabase/server.ts`. Neither file (nor `trip-tabs.tsx`) has a
   `"use client"` directive triggering a browser-side auth call. Other
   pages' client-side `getUser()` calls (`invite`, `settle-up`,
   `add-expense`, `expense/[id]/edit`, `feedback`) are out of scope and
   untouched.
3. **FAIL (on the letter of the requirement)** — Requirements.md states
   this is "verified by inspecting proxy.ts is untouched," and
   architecture.md/ADR 0005 both assert `src/proxy.ts` is "Not modified" /
   "must not be touched." `git diff HEAD -- src/proxy.ts` shows it **has**
   been modified in this working tree: an early `if (!isProtectedPath(...))
   return NextResponse.next()` was added before the Supabase Auth call, and
   the redirect condition was simplified from `if (!user &&
   isProtectedPath(...))` to `if (!user)` (safe only because of the new
   early return). I traced through this and, functionally, the redirect
   behavior for protected paths is preserved — confirmed live: unauthenticated
   `curl` to `/trips`, `/trip/deadbeef`, and `/trip/new` against the running
   dev server all still return `307` to `/?next=<path>` exactly as before,
   and `/` (public) still returns `200` without a redirect. So there is no
   *behavioral* regression, but the requirement's stated pass/fail
   mechanism — "proxy.ts is untouched" — is not met, and this directly
   contradicts the "Alternatives considered" section of ADR 0005, which
   explicitly rejected a proxy.ts change (header-forwarding) specifically
   *because* requirements forbid touching this file. This needs the
   engineer/PM to either revert `proxy.ts` to be byte-identical to before
   this feature, or explicitly get sign-off to change AC 3 and the ADR to
   reflect an intentional, in-scope proxy.ts optimization — as documented,
   it's an unreviewed scope violation, not a proven-safe no-op.
4. **PASS** — `getTripView` throwing (RLS filtering out a non-member, or a
   malformed id) is caught server-side and renders the exact inline
   `"Couldn't load this trip — you may not be on it."` copy, verified by a
   `renderToStaticMarkup` test with a rejected mock.
5. **PASS** — Verified each interactive path:
   - Tab switch: `trip-tabs.tsx`'s `useState` + `TabSwitch` unchanged in
     substance, defaults to `"expenses"` on both server and client render
     (tested).
   - Icon-button navigation (all trips, new trip, roster, settle up,
     feedback) and "Add an expense": all converted to `IconLinkButton`/
     `LinkButton`, rendered as real `<a href>`s (verified in rendered
     markup, e.g. `href="/trip/trip-1/add-expense"`).
   - Editable expense row: renders as `<Link href=".../expense/{id}/edit">`
     only when `payer.id === you.id && !isCompleted`; verified all three
     branches (you+open → link; someone else → no link; you+completed → no
     link) with dedicated tests in `trip-tabs.qa.test.ts`.
   - Trip row on `/trips`: renders as `<Link href="/trip/{id}">` wrapping
     the whole row.
   One real, already-documented behavior delta: the editable expense row
   drops `onKeyDown` (Enter+Space) in favor of a native `<a>`, which
   activates on `Enter` but not `Space`. This is called out explicitly in
   ADR 0005 point 2 as deliberate and accepted by the ticket ("acceptance
   criteria only requires click behavior"). I checked for a *broader*
   accessibility regression beyond this documented one: the row keeps
   `aria-label` on the anchor when editable ("Edit {description}, {amount}"),
   and non-editable rows are a plain `<div>` as before (never were
   keyboard-focusable, so no change there). I did not find any other
   dropped keyboard/ARIA behavior — the regression is exactly the one
   documented Space-key delta, not broader.
6. **PASS** — Empty states verified via rendered markup: `/trips` empty →
   "You're not on any trips yet." + "Start a trip" button linking to
   `/trip/new`; trip dashboard empty expenses → "No expenses logged yet."
7. **PASS (by code inspection + snapshot-style assertions)** — `LinkButton`/
   `IconLinkButton` in `src/components/ui.tsx` reproduce `Button`/
   `IconButton`'s class strings exactly, template-literal for
   template-literal, including the `variant`-keyed class maps and the
   `block`/`className` composition order. `Button`/`IconButton` themselves
   are byte-identical to before (no diff in the parts of `ui.tsx` other than
   the two new additive exports). I did not have a way to do true visual
   (pixel) side-by-side comparison in this environment (no authenticated
   browser session available — see "What I could not verify" below), so
   this is inspection-based parity, not a rendered screenshot diff.
8. **PASS** — `git diff HEAD -- src/lib/data/trips.ts` is empty: zero
   changes to `getMyTrips`/`getTripView` or their return shapes. No
   migration diff (`git diff HEAD -- supabase/migrations` empty). No RPC
   signature changes.
9. **PASS** — No SMTP/OTP/Gmail/email-related files appear in `git status`;
   this feature's diff is scoped to the two pages, `trip-tabs.tsx`, `ui.tsx`,
   `dates.ts`, `proxy.ts` (see AC 3), and docs.
10. **PARTIAL / COULD NOT FULLY VERIFY** — I do not have credentials for a
    real signed-in session (this app uses OTP email sign-in; no test inbox
    was available to me), so I could not open browser devtools' network
    panel against an authenticated `/trips`/`/trip/[id]` load as the
    requirement literally describes. What I did instead, as the closest
    available substitutes:
    - Grepped both page files and confirmed the only `getUser()` calls are
      server-side (AC 2 above).
    - Confirmed via `next build` output that both routes are dynamic
      (`ƒ`) Server-rendered routes, not static/client shells.
    - Live-`curl`'d the running dev server (an already-running instance
      found on `localhost:3000`, not one I needed to start) unauthenticated,
      confirming `/trips`, `/trip/[id]`, `/trip/new` all still 307-redirect
      at the proxy layer before any page code runs (so there's structurally
      no separate client-side auth call possible for a signed-out visitor —
      they never reach the page).
    - For the authenticated path, used `renderToStaticMarkup` against the
      real page component functions (mocking only the Supabase
      client/`getMyTrips`/`getTripView`, not React or Next) to confirm the
      full real HTML — including trip name, expense rows, tab content —
      is present in a single synchronous render pass, with no second
      "fetch-then-swap" render step in the code path at all (there's
      nothing in either page component that could produce a second
      client-side fetch — no `useEffect`, no client Supabase import).
    This is strong circumstantial/code-path evidence but not the literal
    "watched the network panel on a real authenticated load" the AC asks
    for — flagging the gap rather than claiming full verification.

## Regression check (architecture.md consumers)

- `src/lib/data/trips.ts` (`getMyTrips`/`getTripView`): unmodified (empty
  diff). Remaining client consumers (`settle-up/page.tsx`,
  `invite/page.tsx`, `join/[code]/welcome/page.tsx`) still import and call
  them unchanged, still `"use client"`, still using the browser Supabase
  client — confirmed by reading each file's imports/call sites.
- `src/lib/dates.ts` UTC pin: confirmed the three still-client callers
  (`join/[code]/page.tsx`, `settle-up/page.tsx`,
  `join/[code]/welcome/page.tsx`) only ever pass the result of
  `formatDateRange`/`formatDate` straight into JSX for display — no other
  logic (comparisons, arithmetic) depends on the returned `Date`/string in
  a way that would be sensitive to the zone change. Wrote and ran explicit
  cross-timezone regression tests (`src/lib/dates.qa.test.ts`) that flip
  `process.env.TZ` across UTC, Tokyo (UTC+9), Los Angeles, and two extreme
  zones (Kiritimati UTC+14, Niue UTC-11) and assert `formatDate`/
  `formatDayDate`/`formatDateRange` produce byte-identical output in every
  zone, including at month/year boundaries and a leap day — this
  substantiates architecture.md's "no-op for existing callers" claim rather
  than just trusting it. All pass.
- `src/lib/dates.test.ts` (pre-existing): re-ran, all pass unchanged
  (`formatDayDate("2026-09-14")` → `"Mon, 9/14"`, etc.) — the UTC pin didn't
  regress the existing weekday/date assertions.
- `src/components/ui.tsx`: purely additive; `Button`, `IconButton`,
  `TabSwitch`, `Card`, etc. have no diff, so every other consumer across
  `src/app/` is unaffected. Confirmed by inspection (no other files import
  `LinkButton`/`IconLinkButton` outside the two SSR'd pages/trip-tabs).
- `src/proxy.ts`: **see AC 3 — this is the one real finding.** File is
  modified relative to `git diff HEAD`, contradicting requirements.md AC 3
  and architecture.md's Impact analysis section, both of which assert it's
  untouched. Behaviorally verified equivalent via live curl (unauthenticated
  redirects to `/trips`, `/trip/[id]`, `/trip/new` all still land on
  `/?next=<path>` with 307), but the change itself (an early return that
  skips the Supabase Auth round trip entirely for non-protected paths, plus
  a simplified `if (!user)` redirect condition that relies on that early
  return) was not disclosed anywhere in requirements.md, architecture.md,
  or design.md, and is explicitly the kind of change ADR 0005 says was
  rejected as out of scope for this pass.

## Tests written (this QA pass)

All under `src/`, Vitest, run via `npm test`:
- `src/app/trips/page.qa.test.ts` — 5 tests: real data in initial render,
  empty state + CTA, inline error state, defensive redirect-when-no-user,
  no `"use client"` directive.
- `src/app/trip/[id]/page.qa.test.ts` — 7 tests: real data in initial
  render, "couldn't load" error state, empty-expenses state, locked
  badge/bottom-bar, active "Add an expense" link, defensive redirect,
  no `"use client"` directive.
- `src/app/trip/[id]/trip-tabs.qa.test.ts` — 5 tests: editable row is a
  real link to the edit page; non-payer row is not a link; row on a
  completed trip is not a link even for the payer; default tab is
  "Expenses" on first render (no hydration-mismatch risk); empty-expenses
  message.
- `src/lib/dates.qa.test.ts` — 7 tests: cross-timezone equivalence for
  `formatDate`/`formatDayDate`/`formatDateRange` across 5 zones including
  ones ahead of and behind UTC, a leap-day range, a cross-month range, the
  specific Tokyo/Niow UTC-midnight-boundary regression case the UTC pin was
  written to fix, plus two non-timezone regression checks (year omission,
  single-sided date range).

Total new tests: 24. Combined with the pre-existing suite: **107/107
passing**.

## Full-suite results

- `npm test` → **107/107 pass** (8 pre-existing files + 4 new QA test files).
- `npm run typecheck` → **clean**, no errors.
- `npm run lint` → **clean**, no errors/warnings.
- `npm run build` → **succeeds**; route table confirms `/trips` and
  `/trip/[id]` are `ƒ` (server-rendered on demand), not `○` (static).

## What I could not verify (environment limitations)

- No real authenticated browser session: sign-in is OTP-email-based and I
  had no access to an inbox/test account, so I could not do a literal
  devtools-network-panel check (AC 10) or a true pixel-level visual
  side-by-side (AC 7) against a live authenticated page. Substitutes used
  are described inline above (AC 7, AC 10, AC 1).
- I did not modify or run against a local Supabase instance/migrations —
  there's no migration in this feature's diff, so this wasn't necessary for
  regression purposes, but it also means the RLS "not a member" path (AC 4)
  was verified via a mocked-throw unit test, not a real RLS denial against
  live Postgres.

## Files touched by this feature (for reference)

- `src/app/trips/page.tsx`, `src/app/trip/[id]/page.tsx` — modified
  (converted to Server Components).
- `src/app/trip/[id]/trip-tabs.tsx`, `src/app/trips/loading.tsx`,
  `src/app/trip/[id]/loading.tsx` — new.
- `src/components/ui.tsx` — additive (`LinkButton`, `IconLinkButton`).
- `src/lib/dates.ts` — UTC pin, all three formatting functions.
- `src/proxy.ts` — **modified; flagged as AC 3 failure above.**
- `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/adr/0005-*`,
  `docs/features/ssr-trip-pages/*` — docs only.

## QA test files added (this pass, not implementation)

- `/Users/hiennguyen/Desktop/10. TripSplit/src/app/trips/page.qa.test.ts`
- `/Users/hiennguyen/Desktop/10. TripSplit/src/app/trip/[id]/page.qa.test.ts`
- `/Users/hiennguyen/Desktop/10. TripSplit/src/app/trip/[id]/trip-tabs.qa.test.ts`
- `/Users/hiennguyen/Desktop/10. TripSplit/src/lib/dates.qa.test.ts`
