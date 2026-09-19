# Architecture: UX Revamp

Status: draft, architect stage (post Checkpoint 2). Implements
`docs/features/ux-revamp/requirements.md`. Builds on ADR 0005 (SSR page
conversion pattern) and ADR 0006 (anonymous auth); introduces
[ADR 0007](../../adr/0007-css-custom-property-tokens-for-themeable-restyle.md)
(token mechanism) and
[ADR 0008](../../adr/0008-add-expense-sheet-via-intercepting-parallel-routes.md)
(add-expense sheet routing).

## Orientation finding — read this before scoping engineering effort

Requirements.md's problem statement describes today's app as the "modernist"
design system (sharp corners, flat `#ec3013` accent, no illustration, no
motion) — matching `docs/features/ux-revamp/design-import/_ds/modernist-.../styles.css`,
which the design-import README says the canvas's turn-1 baseline screens were
matched against. **That is not what's actually in the repository.**
`src/app/globals.css`, `src/components/ui.tsx`, and all four in-scope screens
already use a warm-toned, rounded token set: `--color-paper`/`--color-ink`,
an ochre `--color-accent` and `--color-terracotta` (both `oklch`), a
`text-display` role on `Bricolage_Grotesque`/`Instrument_Sans` (not
`Archivo`), rounded-full "capsule" `Button`/`Card`/`Field` components, and a
`Screen` component with an ambient-glow prop already live on `/` and
`/trips`. There is no evidence in git history available to this pass of when
or why this diverged from the design-import's own baseline snapshot — it may
predate this feature entirely. Either way, the **actual gap** between today's
app and full AC1-AC14 compliance is narrower than "restyle from scratch,"
but is not zero: several concrete pieces the canvas/requirements call for are
genuinely absent (see "What's actually missing" below), and much of the
*existing* styling is hardcoded per-component literals rather than named
tokens, which is exactly the AC1 problem requirements asked to be solved,
just with different starting literals than assumed. This doc designs against
the **real** current state (as read from the files), not the stale
description — flagging it here so the reviewer/PM isn't surprised when the
engineering diff looks smaller in places (colors, fonts) and about the same
in others (nav blur, capsule elevation, texture, Miso, the sheet conversion)
than requirements' framing implied.

**What's already in place** (verify, don't rebuild):
- Color/font primitives close to "warm paper" (`globals.css`, font loading in
  `layout.tsx`).
- Rounded, capsule-shaped shared components (`Button`, `Card`, `Field`,
  `Avatar`, `TabSwitch`, etc. in `src/components/ui.tsx`), including
  `IconLinkButton` (an `IconButton` styled the same but backed by `<Link>`
  instead of `onClick`) — the primitive the relocated add-expense close (X)
  affordance should reuse (see Decision 2 and ADR 0008 point 5), not a
  new component.
- An ambient "glow" background already used on `/` and `/trips` (`Screen`'s
  `glow` prop) — the same visual idea AC3 asks for, just not yet on the trip
  or add-expense screens, and not using named tokens for its three blob
  colors (currently inline `oklch(...)` literals — see ADR 0007).
- Placeholder Miso art already present at `public/images/miso-1.png` and
  `public/images/Miso-2.png` (untracked in git today) — matches the
  "placeholder art acceptable" default in requirements.md's open question 3;
  no asset-import blocker remains for this pass.

**What's actually missing** (real engineering work this doc scopes):
- A **sticky, blurred nav bar** with content scrolling under it — today's
  headers (`TopBar`, the trip page's icon row) are static, non-sticky, opaque.
- A **floating capsule primary action** — today's `BottomBar` primary button
  is full-width against a gradient-fade backdrop, not a shorter, elevated,
  floating pill.
- **Paw-print texture** — not implemented anywhere.
- **Miso the mascot rendered on-screen** — assets exist; nothing in `src/`
  references or places them (confirmed by grep — zero matches for
  `Miso`/`miso` under `src/`).
- **Full token coverage** for AC1 (see ADR 0007) — many colors/shadows/radii
  the four screens use are hardcoded literals duplicated per file, not named
  properties, even though the palette itself is already warm-toned. Confirmed
  concretely: `add-expense/page.tsx` hardcodes `oklch(0.95 0.035 44)` inline
  for the split-summary pill's background even though that exact value is
  already the named token `--color-terracotta-soft` — precisely the
  "same value, duplicated instead of referencing the token" pattern ADR 0007
  is closing.
- **The add-expense page-to-sheet conversion** (AC7-AC12) — entirely
  unbuilt; today it's a full, separate client-rendered route, and its close
  (X) affordances aren't even internally consistent yet (the normal-state
  branch closes via `router.back()`, the locked-state branch via
  `router.push`) — both get unified onto `<Link>`/`IconLinkButton` as part of
  this conversion (ADR 0008 point 5), not just moved as-is.

## Data model impact

**None.** No new tables, columns, migrations, RLS policy changes, or API
routes. AC16 is satisfied by construction: the token work is CSS/component
-only, and the add-expense sheet conversion (ADR 0008) is App Router
file/component structure — it changes *how* the existing
`src/lib/data/trips.ts` functions (`getTripSummary`, `getTripView`,
`addExpense`) get called from, not what they do or how they're authorized.
If the engineer stage finds itself needing a schema/RLS change to make this
work, that's outside this design and should come back through
requirements, not be added ad hoc.

## Module/component boundaries

- `src/app/globals.css` — token layer (ADR 0007). Gains the extended
  `:root` custom-property set and matching `@theme inline` entries. No new
  file; this stays the single source of token truth.
- `src/components/ui.tsx` — shared primitives. Existing components
  (`Screen`, `TopBar`, `BottomBar`, `Card`, `Button`) get **new opt-in
  props/variants** for the new visual behaviors (see "Shared-component
  blast radius" below) rather than changed defaults, so screens outside this
  slice's scope (check-email, join/*, settle-up, invite, feedback, trips
  list) don't silently pick up an unrequested partial restyle.
- `src/app/page.tsx` / `src/app/home-screen.tsx` — restyle in place (AC4).
  No structural change; `HomeScreen`'s existing `showSignIn` branching and
  anonymous-session-on-submit behavior in `WelcomeContent`/`SignInForm` are
  untouched. Miso placement (AC13) goes here, as a plain `<img>` (no
  `next/image` config exists for `public/images/*` yet — confirm during
  implementation whether to add it or ship an unoptimized `<img>` for this
  pass; either is fine, this is not an architectural fork).
- `src/app/trip/new/page.tsx` — restyle in place (AC5). No structural change.
- `src/app/trip/[id]/page.tsx` — restyle in place (AC6), **plus** a
  structural extraction: its body becomes a shared, exported render function
  so `add-expense/page.tsx`'s hard-nav fallback can reuse it without
  duplicating the tiered-fetch/hide-and-reveal logic (see ADR 0008 point 4).
  Its default export's signature/behavior is unchanged — `trip/[id]/page.qa.test.ts`,
  which calls it directly, should need no changes.
- `src/app/trip/[id]/layout.tsx` (new), `src/app/trip/[id]/@sheet/*` (new) —
  the parallel/intercepting-route scaffold (ADR 0008 points 1-5).
- `src/app/trip/[id]/trip-sheet-chrome.tsx` (new, `"use client"`) — the
  pathname-driven background dim/blur/scale wrapper around `children`
  (ADR 0008 point 6). `layout.tsx` renders `children` through this leaf
  instead of passing it straight through. This is what actually produces
  design.md §5.1's "trip view recedes behind the sheet" effect and, as a
  side effect of ordinary CSS-transition semantics (a value already present
  at first paint never animates), resolves design.md §5.3's "no
  entrance-animation replay on cold load" for the background half of the
  motion with no extra flag needed.
- `src/app/trip/[id]/add-expense-sheet-content.tsx` (new, `"use client"`) —
  the extracted form/gating logic from today's `add-expense/page.tsx`,
  shared by the intercepted modal and the hard-nav fallback. Owns the same
  state/effects/validation/submit as today; AC10 requires this be a
  relocation, not a rewrite. Wrapped by a `SheetShell` chrome component
  (scrim + panel) that takes the `animateEntrance: boolean` prop described
  in ADR 0008 point 6 — `true` at the intercepted call site, `false` at the
  hard-nav-fallback call site — which is the *other* half of design.md
  §5.3's resolution (the sheet panel's own entrance can't use the pathname
  trick `trip-sheet-chrome.tsx` uses, since the panel is freshly mounted in
  both cases; see ADR 0008 for why).
- `src/app/trip/[id]/add-expense/page.tsx` — becomes the hard-nav fallback
  (ADR 0008 point 4): calls the shared trip-dashboard render function with
  the sheet slot populated, rather than being its own standalone form page.
- Everything under `src/lib/` (`data/trips.ts`, `validation/expense.ts`,
  `dates.ts`, `auth-gate.ts`, `pending-action.ts`, `tracking.ts`) is
  consumed as-is by the relocated `AddExpenseSheetContent` — no signature or
  behavior changes needed there. The one existing `useEffect(() =>
  trackEvent("expense_add_start"), [])` fires once per mount of that shared
  component regardless of container, so it fires exactly once per sheet
  open under either mechanism (interception creates a fresh instance per
  open; the hard-nav fallback creates one on page load) — no duplicate-fire
  or missing-fire risk from this restructuring.
- No new dependency (animation or gesture library) is introduced anywhere in
  this feature — see ADR 0008 point 6's closing note. Both the sheet's
  spring-up and the background's dim/blur/scale are plain CSS transitions on
  `transform`/`filter`/`opacity`, driven by React state changes, which is
  sufficient once real swipe-to-dismiss drag physics are off the table (per
  design.md §5.2/§6.2's resolved decision) and keeps this in line with
  ADR 0005's minimal-client-JS bias.
- `src/app/join/page.tsx` (new, AC17) — a small, static bare-`/join` route
  styled like `trip/new/page.tsx`, added post-Checkpoint-3 to replace
  Welcome's native `window.prompt()` invite-entry with an in-app screen.
  `extractInviteCode()` moved out of `home-screen.tsx` into a new shared
  module, `src/lib/invite-code.ts` (logic unchanged, only relocated), with
  `home-screen.tsx` and the new `join/page.tsx` both importing it. The
  existing dynamic `src/app/join/[code]/*` destination routes are untouched
  and structurally distinct from this static route — confirmed no collision
  in the build's route table (`○ /join` vs. `ƒ /join/[code]`).

## Decision 1: Token architecture (AC1, AC2)

See [ADR 0007](../../adr/0007-css-custom-property-tokens-for-themeable-restyle.md)
for the full decision and alternatives. Summary: CSS custom properties in
`src/app/globals.css`'s `:root`, extended to cover every color/shadow/radius
value the four screens actually use (closing today's "same value, hardcoded
in three places instead of referencing the existing token" gap), mirrored
into the existing `@theme inline` block for Tailwind utility access, with no
`[data-theme]`/toggle/`prefers-color-scheme` mechanism added yet (AC2). The
acceptance bar for "themeable" is: when dark mode is eventually built, only
`globals.css` changes (new selector block with dark-glass values) — zero
`.tsx` files should need touching. New tokens this feature introduces for
concerns that didn't exist before (nav blur surface, capsule elevation, paw
texture, sheet motion timing) get named tokens from the start rather than
one-off values, since there's no legacy literal to reconcile for those.

## Decision 2: Add-expense page → overlay sheet (AC7-AC12)

See [ADR 0008](../../adr/0008-add-expense-sheet-via-intercepting-parallel-routes.md)
for the full decision, the rejected query-param alternative, and why this
doesn't trigger the semver-caveat escalation. Summary:

- **Mechanism**: Next.js intercepting routes (`(.)add-expense`) + parallel
  routes (`@sheet` slot on a new `src/app/trip/[id]/layout.tsx`) — the
  documented App-Router pattern for "modal that's also a real, shareable
  route." In-app navigation (the existing `<LinkButton href="/trip/[id]/add-expense">`
  in the BottomBar, unchanged) gets transparently intercepted into the sheet;
  no call-site change needed there.
- **Deep-link/refresh (AC8)**: `/trip/[id]/add-expense`'s own route file
  stops being a bare form page and instead renders the full trip dashboard
  (via a function extracted from `/trip/[id]/page.tsx`) with the sheet
  already open on top — a direct hit or refresh shows the real trip, not a
  blank/broken state, exactly as AC8 requires.
- **Back button (AC9)**: free from history semantics once intercepted — no
  bespoke code needed for the in-app-navigation case AC9 actually scopes
  itself to. All *explicit* close affordances (the sheet's own X button, in
  every branch — normal/locked/owner-gate-blocked) are standardized on
  `<Link href="/trip/[id]">` (via `IconLinkButton`) rather than
  `router.back()`, since that component is reachable from both the
  intercepted and the hard-nav-fallback contexts and only the fixed-target
  link is safe in both.
- **Behavior (AC10)**: the gating/validation/submit logic
  (`isUnverifiedOwner`, `requireVerifiedSession`, `isValidExpenseInput`,
  `addExpense`) is relocated into a shared component unchanged — a
  container swap, not a rewrite.
- **Motion (design.md §5.1-§5.3)**: resolved by ADR 0008 point 6 — a new
  `trip-sheet-chrome.tsx` client leaf drives the background's dim/blur/scale
  off `usePathname()`, and `SheetShell` takes an explicit `animateEntrance`
  prop (true only at the intercepted call site) for the sheet panel's own
  spring-up. **This confirms design.md §5.3's recommendation as adopted, not
  just assumed**: a cold load (direct hit or refresh) renders both the sheet
  and the dimmed background already at rest, with no entrance animation
  replayed on that paint — verified against the actual mechanism, which is
  the confirmation §5.3 asked the architect stage to make explicitly. No
  swipe-to-dismiss gesture engineering is included, per design.md §5.2/§6.2's
  resolved decision — the drag handle is a static visual affordance only.
- **Excluded by AC12**: no per-person live-math ("Miso says...") callout is
  added anywhere in this component; the existing split-summary pill
  (`Splits N ways / $X each`) stays exactly as it renders today, just inside
  the new container.
- **Semver**: full AC7-AC9 deep-link parity is achieved via this mechanism
  at bounded, ordinary cost (one new `layout.tsx`, three null-returning
  scaffold files, one dimming leaf, one extracted render function, one
  relocated client component) — this does **not** cross into
  "disproportionately costly," so per requirements' stated policy, no user
  check-in is needed before engineering proceeds. The real, concentrated
  cost is rewriting `add-expense/page.owner-gate.qa.test.tsx` to target the
  relocated component instead of the route file directly — see Impact
  analysis.

## Explicitly out of scope for this design (per requirements)

- No "Miso says that's $X each" live-math callout on add-expense (AC12) —
  not designed, not stubbed.
- No cross-trip running-total callout on All trips (AC14) — moot for this
  pass (All trips isn't touched), noted here only so a later slice doesn't
  reintroduce it.
- No dark-mode switching mechanism, toggle, or `prefers-color-scheme`
  handling (AC2) — only the token *shape* that makes it cheap later.
- No swipe-to-dismiss drag physics for the sheet (design.md §5.2/§6.2,
  resolved) — no gesture/physics library is introduced; do not add one
  speculatively while building the spring-up/dim motion.
- Details, Settle-up, and the remaining ~11 canvas screens — untouched.

## Impact analysis

### `src/app/trip/[id]/add-expense/page.owner-gate.qa.test.tsx` — breaking, requires rewrite

Today this test imports `./page`'s default export and calls
`root.render(<AddExpensePage />)` synchronously in jsdom, mocking
`next/navigation` and `@/lib/supabase/client`. Once `add-expense/page.tsx`
must render the full async trip-dashboard-plus-sheet output for the hard-nav
case (ADR 0008 point 4), that route file's default export is no longer a
plain client component callable this way. **This test must be rewritten** to
import and render `AddExpenseSheetContent` (the relocated component)
directly instead of `./page`. This is required, expected work, not a scope
cut — every existing assertion (unverified-owner redirect-on-direct-hit,
fail-closed on ambiguous ownership query, form renders/doesn't for an
invitee) must still exist against the relocated component; AC15 allows
updating a test for intentionally-changed structure but not for changed
behavior, and none of the behavior here is meant to change.

### `src/app/trip/[id]/page.tsx` — internal refactor, external contract preserved

Its default export's signature (`{ params, searchParams }` in,
`Promise<JSX>` out) and rendered output are unchanged; only its body moves
into a shared, independently-callable function. `trip/[id]/page.qa.test.ts`
calls the default export directly and asserts on rendered HTML — this should
keep passing unmodified as long as the extraction doesn't change output,
which it's designed not to. No other file imports this page's default export
directly today (confirmed by grep).

### Shared-component blast radius (`src/components/ui.tsx`) — 20 consumers, must not regress

`Screen`, `TopBar`, `BottomBar`, `Card`, `Button`, etc. are imported by all
~20 route files in `src/app`, not just the four in-scope screens
(check-email, join/[code]* , settle-up, invite, feedback, trips list all use
them too). Any change to these components' **default** rendering would
visually leak into screens this pass explicitly defers (Non-goals). The
design here is additive: new opt-in props/variants (e.g. a `sticky`/`blurred`
prop on `TopBar`, a `floating` variant on `Button`/`BottomBar`, a `texture`
prop on `Screen` alongside its existing `glow`) default to `false`/off, so
every screen not touched by this feature keeps rendering exactly as it does
today unless a screen's own file opts in. The engineer stage should verify
this by diffing rendered output of at least one deferred screen (e.g.
`settle-up`) before/after, not just relying on "I only changed the in-scope
call sites."

### Routes newly wrapped by `src/app/trip/[id]/layout.tsx`

Adding the first layout at this segment means `settle-up`, `invite`,
`feedback`, and `expense/[expenseId]/edit` — none of which are in this
feature's scope — now render inside it too. The `@sheet` slot resolves to
`null` for all of them via the catch-all scaffold (ADR 0008 point 2), and
`trip-sheet-chrome.tsx`'s `dimmed` derivation only matches a pathname ending
in `/add-expense` (ADR 0008 point 6), so `children` should render completely
unaffected on every other subroute — but this is new shared surface all of
them pass through for the first time; QA should smoke-test each rather than
assume either scaffold is sufficient proof by itself.

### No consumer impact found for

- `src/lib/data/trips.ts`, `src/lib/validation/expense.ts`,
  `src/lib/dates.ts`, `src/lib/auth-gate.ts`, `src/lib/pending-action.ts`,
  `src/lib/tracking.ts` — all consumed as-is by the relocated
  `AddExpenseSheetContent`; no signature changes.
- `src/proxy.ts` — doesn't gate `/trip/[id]*` at all today (per
  `docs/ARCHITECTURE.md`'s auth-model section) and nothing here changes
  that; the sheet's own client-side gating is unaffected by the routing
  mechanism around it.
- `src/app/check-email/page.tsx`, `src/app/join/[code]/welcome/page.tsx` —
  both reference `/trip/${id}/add-expense` only as a redirect-target string
  (`next=...`); that URL keeps resolving to a working, sheet-open trip view
  under this design, so these call sites need no change.
- Supabase schema/RLS/migrations — none, per "Data model impact" above.

## Backward-compatibility / semver

**Feature (backward-compatible)**, matching requirements.md's classification,
with the caveat requirements asked to be resolved rather than silently
decided: this design achieves full AC7-AC9 deep-link parity at ordinary
cost (see Decision 2), so the caveat resolves to **no downgrade, no user
check-in needed** — the existing `/trip/[id]/add-expense` URL keeps working
exactly as a bookmark/shared link, refresh included.
