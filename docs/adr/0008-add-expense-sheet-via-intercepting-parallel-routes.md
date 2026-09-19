# 0008. Add-expense as an intercepted/parallel-route sheet, not a client-state overlay

Status: accepted
Date: 2026-09-18

## Context

`docs/features/ux-revamp/requirements.md` AC7-AC12 converts
`src/app/trip/[id]/add-expense/page.tsx` from a standalone full-page route to
an overlay sheet that springs up over a dimmed trip view, while requiring
(AC8) that the URL stays independently loadable/shareable — a direct
navigation or refresh must still show the trip with the sheet open, not a
blank/broken state — and (AC9) that the browser back button closes the sheet
back to the plain trip view (not out of the app) when it was opened via
in-app navigation. Requirements explicitly flag this as real
routing/history/state architecture work (AC11), independent of the
token/theme decision (ADR 0007), and ask that if full deep-link parity turns
out disproportionately costly, that tradeoff come back to the user rather
than being quietly downgraded.

Today, `/trip/[id]/page.tsx` is an `async` Server Component (ADR 0005's SSR
pattern) doing a tiered fetch (`getTripSummary`, then `getTripView` if a
session exists) and rendering three distinct branches (summary-only,
hide-and-reveal for an unverified owner, full detail). `/trip/[id]/add-expense/page.tsx`
is a separate, fully `"use client"` route with its own client-side gating
(`isUnverifiedOwner`, member count, lock state) that has nothing to do with
the trip page's SSR fetch. `docs/adr/0005-ssr-page-conversion-pattern.md`'s
stated preference is Server Components doing the data fetch, `<Link>`-based
navigation, and client-side JS confined to genuinely stateful leaves.

Next.js 16's documented mechanism for exactly this shape — "a modal that's
also a real, shareable route" — is **intercepting routes** (`(.)segment`)
combined with **parallel routes** (`@slot`), confirmed against
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/{intercepting-routes,parallel-routes}.md`.
The parallel-routes doc's own "Modals" example targets this precise
combination of goals: shareable URL, preserved context on refresh, closing on
back, reopening on forward.

## Decision

**Use intercepting + parallel routes**, not a query-param/client-state
overlay on the single `/trip/[id]` route:

1. Add `src/app/trip/[id]/layout.tsx` (new — no layout exists at this segment
   today), rendering `children` and a new `@sheet` parallel slot side by
   side. Purely structural — no data fetching of its own.
2. `@sheet` gets three files, all returning `null`, so the sheet never gets
   "stuck" open outside the one path that should show it:
   - `@sheet/default.tsx` — unmatched-slot fallback on hard reload.
   - `@sheet/page.tsx` — matches a `<Link>` back to the bare `/trip/[id]`
     (parallel-route soft navigation otherwise keeps a slot's last active
     content even when the URL no longer implies it — see the parallel-routes
     doc's "closing the modal" example, which needs this same explicit
     `page.tsx`, not just `default.tsx`).
   - `@sheet/[...catchAll]/page.tsx` — matches navigating from the trip view
     to any *other* `/trip/[id]/*` subroute (settle-up, invite, feedback,
     edit-expense) without a `/trip/[id]` stop in between, for the same
     "otherwise stuck open" reason.
3. `@sheet/(.)add-expense/page.tsx` — the intercepted route. Renders a small
   `"use client"` `SheetShell` (scrim + spring-up panel, closes on
   backdrop-click via `<Link href="/trip/[id]">`) wrapping the existing
   add-expense form/gating logic, extracted into a shared component (see
   point 5). Because this only ever mounts via client-side interception of a
   same-app `<Link>`/navigation, the trip view underneath (the `children`
   slot) is never re-fetched or remounted — it's the already-rendered DOM,
   which is what makes a real "spring up over an undisturbed, dimmed trip
   view" animation (AC7) achievable without a flash.
4. `src/app/trip/[id]/add-expense/page.tsx` (the literal, un-intercepted
   route) stays as the **hard-navigation/deep-link fallback** required by
   AC8: a direct hit, bookmark, or refresh doesn't go through the `@sheet`
   slot at all (Next only intercepts client-side soft navigation), so this
   file must independently render the full trip dashboard with the sheet
   already open. To avoid duplicating `/trip/[id]/page.tsx`'s tiered-fetch
   Server Component logic, that page's body is extracted into an exported
   render function (e.g. `renderTripDashboard(id, { tab, sheet })`) that both
   `page.tsx` (`sheet: null`) and this fallback (`sheet: <AddExpenseSheetContent tripId={id} />`)
   call — one implementation of the summary/hide-and-reveal/detail branches,
   not two.
5. The add-expense form/gating logic itself (state, `useEffect` ownership
   check, submit, the three render branches — normal/locked/owner-gate-blocked)
   moves into a shared client component (`AddExpenseSheetContent`), used
   identically by both the intercepted modal (step 3) and the hard-nav
   fallback (step 4). Its behavior is unchanged (AC10) — only its container
   changes. All three of its "close" affordances (X button in each branch)
   are standardized on `<Link href={`/trip/${id}`}>` (via the existing
   `IconLinkButton` primitive in `src/components/ui.tsx`, not a new one) —
   not `router.back()`: this component is reachable both via in-app
   interception (where "back" and "the fixed trip URL" are equivalent) and
   via the hard-nav fallback (where there is no guaranteed prior same-app
   history entry, so `router.back()` could exit the app or land somewhere
   unrelated). The **browser's native back button**, by contrast, needs no
   explicit code at all for AC9: intercepting a route pushes a real history
   entry, so back naturally lands on `/trip/[id]` when the sheet was opened
   via in-app navigation, and does whatever it would have anyway (no special
   claim made) when reached via a deep link — matching AC9's own scoping to
   "when opened via in-app navigation."
6. **Background dim/blur/scale of the trip view, and suppressing the sheet's
   own entrance animation on a cold load (design.md §5.1-§5.3)** — neither is
   solved by the routing mechanism above on its own, and design.md §5.3
   explicitly asked for this to be confirmed or adjusted at the architect
   stage once the real mechanism was known. Resolved as follows:
   - `layout.tsx` doesn't pass `children` straight through; it renders them
     via a new `"use client"` leaf, `src/app/trip/[id]/trip-sheet-chrome.tsx`.
     This leaf calls `usePathname()` and derives one `dimmed` boolean
     (`pathname.endsWith("/add-expense")`) — true whether the URL got there
     by interception or by hard navigation, since intercepting routes update
     the real, observable pathname (only the rendered tree differs from a
     hard load, not the URL). `dimmed` is initialized synchronously from the
     first render's pathname and only updated afterwards, in a `useEffect`
     keyed on `pathname`. It wraps `children` in a container whose
     blur/scale/dim-tint styles key off that boolean and transition via
     plain CSS (`transition: filter, transform ~0.5–0.7s var(--ease-spring)`,
     the motion tokens ADR 0007 adds for this feature). This satisfies
     §5.3's "no entrance-animation replay on cold load" for the *background*
     half of the motion for free, as a consequence of ordinary CSS-transition
     semantics: a value already in place at first paint never transitions
     (nothing to animate from) — only a *later* state change (the real,
     in-app, soft-navigated open) does. No separate "am I a hard load or a
     soft one" flag needs to be threaded through for this half.
   - The **sheet panel's own** spring-up-from-bottom entrance can't use that
     same trick: unlike `children`'s wrapper (part of the persistent
     `layout.tsx` tree, so it can compare "before" and "after" pathnames),
     the sheet's own component instance is freshly mounted every time it
     becomes active, in *both* the intercepted and hard-nav-fallback cases —
     there's no prior render to diff against in either. A mount-lifecycle-only
     technique (flip an "at rest" class in a post-mount `useEffect`) would
     replay the spring-up on a cold load exactly as often as on a genuine
     in-app open — the opposite of §5.3's recommendation. This needs an
     explicit signal instead of an inferred one: `SheetShell` takes an
     `animateEntrance: boolean` prop, passed `true` only at the intercepted
     route's call site (`@sheet/(.)add-expense/page.tsx`) and `false` at the
     hard-nav-fallback's call site (the `sheet` slot argument used by
     `add-expense/page.tsx`, point 4). `animateEntrance={false}` renders
     directly in the at-rest position with no transition; `animateEntrance`
     mounts off-screen/zero-opacity and flips to at-rest one tick later,
     producing real spring motion only for a genuine in-app open. This is
     the one piece design.md flagged as needing explicit confirmation once
     the routing mechanism was chosen — confirmed here as: yes, a cold load
     (direct hit or refresh) renders the sheet already at rest with no
     replay, via this explicit prop at each call site, not inferred from
     route type or referrer.
   - The tap-to-dismiss scrim (design.md §5.2) is `SheetShell`'s own
     full-viewport backdrop (rendered in the `@sheet` slot, above
     `children`), a separate layer from `trip-sheet-chrome.tsx`'s
     blur/scale/tint transform on `children` itself — together they produce
     the one continuous effect design.md §5.1 describes, but only the scrim
     layer needs a click handler (`<Link href="/trip/[id]">`), and each can
     be tuned independently.
   - No new animation or gesture library is introduced for any of the above.
     Both effects are plain CSS transitions on `transform`/`filter`/`opacity`
     driven by React state — consistent with ADR 0005's minimal-client-JS
     bias, and with design.md §5.2/§6.2's resolved decision that no
     swipe-to-dismiss drag physics are in scope for this pass. A
     physics/gesture library (Framer Motion, react-spring, etc.) would only
     be justified by drag physics, which this feature explicitly excludes —
     do not add one for the spring-up/dim motion alone.

## Alternatives considered

- **Query-param-driven single segment** (`/trip/[id]?sheet=add-expense`,
  rendered conditionally inside the one existing `page.tsx`, with
  `/trip/[id]/add-expense` kept alive only as a `redirect()` for
  backward-compatible deep links). Genuinely simpler — no new App Router
  primitive, no `@sheet` scaffold, reuses the existing single Server
  Component outright. **Rejected** because changing a search param on the
  same route still causes Next.js to re-run and reconcile the whole page
  segment: `getTripSummary`/`getTripView` would re-fetch on every sheet
  open *and* close (a real, avoidable pair of extra Supabase round trips
  this app doesn't take today), and the trip view behind the sheet isn't
  guaranteed to be the untouched, already-painted DOM — undermining AC7's
  "spring-up sheet over a dimmed trip view" as a real overlay rather than a
  page swap that happens to look similar. Intercepting routes are Next's
  documented answer to exactly this cost: only the new segment (`@sheet`)
  is fetched/rendered on a soft navigation; the existing `children` slot's
  already-mounted content is left alone.
- **Pure client-state overlay with no distinct route for the sheet at all**
  (a boolean in a client component, no URL change). Rejected outright: fails
  AC8 by construction — there would be nothing for a bookmark, shared link,
  or refresh to resolve to.
- **Full deep-link parity is disproportionately costly; ship a lighter
  version and flag it to the user per requirements' semver caveat.**
  Considered and rejected as the operative conclusion here: the intercepting
  + parallel-route scaffold (one new `layout.tsx`, three trivial null-returning
  files, one client dimming leaf, one shared client component, one extracted
  render function) is bounded, standard, first-class App Router
  functionality — not exotic or high-risk — so this doesn't rise to the
  "disproportionate cost" bar the requirements asked to be escalated. The
  real, non-trivial cost is concentrated in one place instead:
  `add-expense/page.owner-gate.qa.test.tsx` currently imports `./page`'s
  default export and synchronously `root.render()`s it as a plain client
  component; once `page.tsx` needs to produce the full (async,
  Server-Component-shaped) dashboard-plus-sheet output for the hard-nav
  case, that test must be rewritten to target `AddExpenseSheetContent`
  directly rather than the route file. This is flagged for the
  engineer/QA stage as required, expected work — a test restructuring to
  preserve the same behavioral assertions, not a scope cut.

## Consequences

- `src/app/trip/[id]/` gains its first `layout.tsx` and its first parallel
  route (`@sheet`) — every existing subroute under it (`settle-up`, `invite`,
  `feedback`, `expense/[expenseId]/edit`) now renders inside that layout too.
  None of them should change visually or behaviorally: the `@sheet` slot
  resolves to `null` for all of them via the catch-all, and
  `trip-sheet-chrome.tsx`'s `dimmed` check only ever matches a pathname
  ending in `/add-expense`, so `children` renders completely unaffected on
  every other subroute — but this is new shared surface all of them pass
  through for the first time, worth an explicit regression check in QA
  rather than relying on the pathname check alone.
- `add-expense/page.owner-gate.qa.test.tsx` needs a real rewrite (see
  "Alternatives considered"), not a markup-only touch-up — this is the one
  place AC15 ("no regression... updated only where markup/classes
  intentionally changed, not behavior") requires care: the assertions
  (redirect-on-direct-hit, fail-closed on ambiguous ownership, form
  renders/doesn't) must all still exist against the relocated component.
- `/trip/[id]/page.tsx`'s body must be extracted into a shared, independently
  callable render function before `add-expense/page.tsx` can reuse it — a
  refactor of an already-tested file (`trip/[id]/page.qa.test.ts` calls the
  default export directly with `params`/`searchParams`). That test's calling
  convention is unaffected as long as `page.tsx`'s default export signature
  and output stay the same, which this decision preserves by construction
  (the extraction changes what's *inside* the function, not its signature or
  behavior).
- `SheetShell`'s `animateEntrance` prop is a manual wire-up at exactly two
  call sites (point 6) — easy to get backwards or forget when either call
  site is touched later. QA should explicitly check both directions: opening
  the sheet via the in-app "Add an expense" capsule visibly springs up over
  a visibly-transitioning dim; hitting `/trip/[id]/add-expense` directly (or
  refreshing while it's open) shows the sheet and the dimmed trip view both
  already at rest, with no jump or replayed animation on that paint.
- This is the first use of parallel/intercepting routes in this codebase —
  a second routing primitive alongside ADR 0005's plain Server Component +
  `<Link>` pattern, not a replacement for it. Future features adding another
  "modal that's also a route" should follow this same shape rather than
  re-deriving it, but plain pages/forms should keep defaulting to ADR 0005's
  simpler pattern — this mechanism is deliberately reserved for the
  page-vs-overlay case, not adopted as a new default.
