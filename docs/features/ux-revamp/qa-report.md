# QA Report: UX Revamp

Status: reviewed against `requirements.md` (AC1-AC16), `design.md` (all four
screens + §6 resolved decisions), `architecture.md`, ADR 0007, and ADR 0008.
**Updated 2026-09-18** with a follow-up verification pass on the engineer's
two targeted fixes for Findings 1 and 4 (see "Follow-up verification"
below). **Updated again 2026-09-18 (pass 2)** with verification of two more
post-Checkpoint-3 fixes landed after real-app user feedback: the paw-print
texture being toned down, and Miso being added to three more screens per
the revised AC13 (see "Follow-up verification pass 2" at the bottom).
**Updated again 2026-09-18 (pass 3)** with verification of a user-reported
bug fix ("adding an expense doesn't register") and an accompanying
validation-message change to `add-expense-sheet-content.tsx`'s
`handleSubmit` — see "Bug-fix verification pass 3" at the bottom for full
detail, including an explicit residual manual-verification gap this
automated pass cannot close.
**Updated 2026-09-19 (pass 4)** with verification of AC17 (new scope
addition, 2026-09-18): the native `window.prompt()` invite-code entry on
Welcome replaced with a proper in-app `/join` screen — see "AC17
verification pass 4" at the bottom for full detail.

## Summary

**Overall: PASS.** All 16 acceptance criteria are met, no functional
regressions found in any flagged consumer, and both non-blocking findings
from the original review (Finding 1's `npm run lint` failure, Finding 4's
texture-on-sign-in design.md conformance gap) have now been fixed by the
engineer and independently verified. Findings 2 and 3 remain open as
explicitly out-of-scope follow-ups (minor/informational, not blocking).
The engineer's follow-up self-report (190/190 tests, lint/typecheck/build
all clean) is accurate, and now 193/193 with the 3 new tests QA added for
this verification pass.

**Pass 2 verdict (also PASS, see bottom section for full detail):** the
revised AC13 (Miso on all four screens) and the toned-down paw texture both
hold up under independent re-verification. One real gap was found and
closed by QA directly: the engineer's own updated tests for the new
empty-state copy asserted on the copy string only, not on the Miso image
element itself — QA strengthened both tests and added a dedicated new test
file for the one screen nobody could get eyes-on live (Add an expense),
using the same fake-verified-session jsdom technique
`page.owner-gate.qa.test.tsx` already established. No regressions found;
full suite (now 201/201) plus lint/typecheck/build all green.

## What was tested

- Read `requirements.md`, `design.md`, `architecture.md`, ADR 0007, ADR 0008
  in full.
- Independently re-ran `npm test`, `npm run typecheck`, `npm run lint`,
  `npm run build`.
- Wrote and ran 17 new Vitest tests (all passing) covering previously
  untested new logic:
  - `src/app/trip/[id]/trip-sheet-chrome.qa.test.tsx` (6 tests) — background
    dim/blur/scale: cold-load-dimmed, cold-load-undimmed, children never
    unmount, both directions of a genuine in-app pathname transition, and
    that an unrelated subroute (`settle-up`) is never misidentified as
    `/add-expense`.
  - `src/app/trip/[id]/sheet-shell.qa.test.tsx` (6 tests) — both directions
    of `animateEntrance` explicitly: `false` renders already at rest with
    the scrim fully opaque immediately (no replayed entrance on cold
    load/refresh), `true` mounts off-screen (`translateY(100%)`) first and
    only reaches rest after a `requestAnimationFrame` tick (real spring-up
    on a genuine in-app open).
  - `src/app/trip/[id]/add-expense/page.ac8-deep-link.qa.test.tsx` (5 tests)
    — AC8's "not blank/broken" requirement threaded through *every*
    `renderTripDashboard` tier via the hard-nav fallback: not-found,
    summary-only, full-detail, and locked-full-detail.
- Manually traced every consumer listed in architecture.md's impact
  analysis (`settle-up`, `invite`, `feedback`,
  `expense/[expenseId]/edit`, `/trips`, sign-back-in) against the shared
  `ui.tsx`/`layout.tsx` diff to confirm no default-behavior change leaked
  into them.
- Diffed `src/components/ui.tsx` and `trip-tabs.tsx` against `HEAD` line by
  line and verified every hardcoded-literal-to-token substitution
  (`--shadow-card-sm`, `--shadow-card`, `--radius-card`,
  `--color-accent-deep`, `--color-balance-positive/-negative`) resolves to
  the *exact same value* as the literal it replaced, so these are pixel-
  identical refactors, not visual changes.
- Grepped for the two explicitly-excluded content patterns (AC12, AC14) and
  for any dark-mode/toggle mechanism (AC2) — none found anywhere in `src/`.
- Grepped for stray `oklch(`/`rgba(`/hex literals outside `globals.css`
  across `src/app` and `ui.tsx` to spot-check ADR 0007's token-discipline
  claim.
- Visually inspected the shipped Miso art (`public/images/miso-welcome.jpg`)
  against design.md §6.1's resolved decision.
- Confirmed `supabase/migrations/0001_init.sql`'s only diff is an unrelated
  one-line comment rename (`TripSplit` → `Splitiful`), pre-existing and
  unrelated to this feature — no schema/RLS change shipped with this
  feature (AC16 verified by inspection, not just by architecture.md's
  claim).

## Acceptance criteria — pass/fail

| AC | Description | Result |
|----|---|---|
| AC1 | Named, themeable tokens for color/spacing/radius/shadow/typography | **PASS**, with a minor gap noted (Finding 2) |
| AC2 | Exactly one theme, no dark-mode/toggle mechanism | PASS |
| AC3 | Four screens match warm-paper language (glow, texture, blurred nav, floating capsule) | PASS |
| AC4 | Welcome restyled, behavior unchanged | PASS |
| AC5 | Create-a-trip restyled, form/validation/submit unchanged | PASS |
| AC6 | Trip main view restyled, data/gating unchanged | PASS |
| AC7 | Add-expense converted to overlay sheet | PASS |
| AC8 | Deep-link/refresh parity | PASS (new tests written and passing) |
| AC9 | Back button closes sheet to plain trip view (in-app-nav case) | PASS by code inspection (see Finding 3 — this specific case is not automatable in Vitest/jsdom) |
| AC10 | Add-expense functionality (fields/validation/submit/owner-gating) unchanged | PASS |
| AC11 | Flagged as real architecture work at architect stage | PASS (ADR 0008 exists, scoped) |
| AC12 | No "Miso says that's $X each" callout on add-expense | PASS (grep-confirmed, zero matches) |
| AC13 | Miso appears on mascot-bearing screens (welcome), except AC12's carve-out | PASS |
| AC14 | No cross-trip running-total callout, now or later | PASS (grep-confirmed, zero matches) |
| AC15 | No regression in existing test coverage | PASS — 173/173 pre-existing tests still pass; the one required rewrite (`add-expense/page.owner-gate.qa.test.tsx`) preserves every original assertion against the relocated component |
| AC16 | No schema/RLS/API contract change beyond AC7-AC9 routing | PASS |

## Regression check (architecture.md's flagged consumers)

All explicitly flagged in architecture.md's impact analysis and the task
prompt:

- **settle-up** (`src/app/trip/[id]/settle-up/page.tsx`): uses plain
  `Screen` (no `glow`/`texture`), non-sticky `TopBar` (no `sticky` prop),
  and `primary`/`muted` `Button` variants only. Unaffected by every new
  opt-in prop. Renders inside the new `layout.tsx`/`TripSheetChrome`, but
  `TripSheetChrome`'s `dimmed` check only matches a pathname ending in
  `/add-expense`, so it never dims. **No regression.**
- **invite** (`src/app/trip/[id]/invite/page.tsx`): same — plain `Screen`,
  no sticky nav, `accent`/`soft`/`primary` button variants only. Its own
  `page.owner-gate.qa.test.tsx` is untouched and still passes. **No
  regression.**
- **feedback** (`src/app/trip/[id]/feedback/page.tsx`): same pattern, plain
  `Screen`/non-sticky `TopBar`/`primary` button. **No regression.**
- **expense/[expenseId]/edit**: plain `Screen` (no props at all), non-sticky
  `TopBar`, `primary` button. **No regression.**
- **`/trips`**: still uses `Screen glow` only (no `texture` — confirmed this
  wasn't accidentally extended to a screen outside the four-screen scope).
  **No regression.**
- **Sign-back-in** (`/?signin=1`, `SignInForm` in `home-screen.tsx`): see
  **Finding 4** below — flagged a design.md conformance gap (texture
  leaking onto sign-in) in the original pass; fixed and verified in the
  2026-09-18 follow-up.
- `page.tsx`'s default export signature/behavior unchanged (verified by
  reading the extraction — `renderTripDashboard` holds the logic,
  `TripDashboardPage` is a thin wrapper); `page.qa.test.ts` passes
  unmodified.
- `trip-tabs.tsx`'s color-literal-to-token substitutions
  (`--color-accent-deep`, `--color-balance-positive/-negative`) are
  pixel-identical to the values they replaced — verified by reading
  `globals.css`'s token definitions against the removed literals.

## `animateEntrance` — both directions verified (explicitly flagged by architect)

Verified by the new `sheet-shell.qa.test.tsx`:
- `animateEntrance={false}` (hard-nav fallback, `add-expense/page.tsx`):
  sheet panel renders `transform: translateY(0)` on its very first paint —
  no off-screen frame ever occurs — and the scrim is fully opaque
  immediately. This is the correct "no replayed entrance" behavior for a
  direct hit/refresh.
- `animateEntrance` (intercepted route,
  `@sheet/(.)add-expense/page.tsx`): sheet panel's first paint is
  `translateY(100%)` (off-screen), and only reaches `translateY(0)` after a
  `requestAnimationFrame` tick — real spring-up motion, correctly gated
  behind an explicit prop rather than an inferred mount-lifecycle effect
  (which would have replayed identically on both cold load and in-app
  open, per ADR 0008's own reasoning for why it deliberately avoided that
  approach).
- Confirmed the two call sites are wired as claimed: `true` only at
  `@sheet/(.)add-expense/page.tsx`, `false` only at
  `add-expense/page.tsx`.

## Findings

### Finding 1 — RESOLVED (verified 2026-09-18)

Fix applied: `eslint.config.mjs`'s `globalIgnores` now includes
`"docs/features/*/design-import/**"`.

Verification performed:
- `npm run lint` re-run independently: **exit 0**, zero output — clean.
- Confirmed the ignore is correctly scoped to vendored material only, not
  broadened to hide real `src/` findings:
  - `find docs/features -type d -name design-import` returns exactly one
    directory (`docs/features/ux-revamp/design-import`), so the glob
    `docs/features/*/design-import/**` cannot currently reach anything
    outside that one vendored bundle.
  - `npx eslint "docs/features/ux-revamp/design-import/**"` explicitly
    confirms those files are now ignored (ESLint refuses to lint them,
    reporting they're excluded by a global ignore pattern) — i.e. the
    previous 2 errors/9 warnings are suppressed *because* they're vendored
    reference material, not because a broader/wrong pattern accidentally
    swallowed them.
  - `npx eslint src/app/page.tsx` (the file touched by Finding 4's fix)
    still lints individually with zero output — the ignore did not
    silence any real `src/` finding.
- No other `docs/**` or `src/**` path is affected by this change; the glob
  is anchored to the literal `design-import` directory name one level
  under `docs/features/<slug>/`.

**Verdict: FIXED.** `npm run lint` is genuinely green now, not just
excluded from CI's attention.

### Finding 1 (original) — `npm run lint` fails; self-report that it passed is incorrect

`npm run lint` exits **1** (not 0) as of this review:

```
docs/features/ux-revamp/design-import/support.js
  198:10  error  ReactDOM.render is deprecated since React 18.0.0, use createRoot instead
  1215:9  error  Do not assign to the variable `module`. @next/next/no-assign-module-variable
✖ 11 problems (2 errors, 9 warnings)
```

Both errors (and all 9 warnings) are inside
`docs/features/ux-revamp/design-import/` — the vendored design-exploration
canvas bundle (`support.js`, `_ds_bundle.js`), not application code in
`src/`. This repo's `eslint.config.mjs` does not ignore `docs/**`, so the
whole vendored bundle is linted along with real source. **No `src/` file
introduced by this feature has a lint error** (spot-checked separately:
`npx eslint` on the four in-scope screens and all three new QA test files
comes back clean). This is not a functional/behavioral regression, but it
is a real, reproducible discrepancy from the engineer's stated "lint...
passing" — anyone running `npm run lint` as a CI gate today gets a nonzero
exit code. **Recommend**: either add `docs/features/ux-revamp/design-import/**`
to `eslint.config.mjs`'s `globalIgnores` (it's reference material, not
shipped code) or exclude it before merge — this should go back to the
engineer/architect to decide the right ignore boundary, not be silently
patched by QA.

### Finding 2 (minor) — AC1 token coverage has a small, harmless gap

The `--radius-field: 18px` token was introduced (and mirrored into
`@theme inline` as the `rounded-field` utility) specifically for this
feature, but nothing in the codebase actually references it. Instead, the
same `18px` value is still hardcoded as `rounded-[18px]` in at least three
places: `src/components/ui.tsx`'s `Field` input (line 234), the planner-note
chip in `src/app/trip/new/page.tsx` (line 187, in-scope), and the
speech-bubble card in `src/app/home-screen.tsx` (line 168, in-scope). This
is exactly the "same value, duplicated instead of referencing the token"
pattern ADR 0007 says it's closing — it just wasn't fully closed for this
one value. **Not a visual or behavioral bug** (the value is identical
either way, and radii don't need to differ for a future dark theme), so
this doesn't fail AC1, but it's worth a follow-up cleanup pass so
`--radius-field` isn't a dead token.

Also found one raw literal in an in-scope file: `src/app/trip/new/page.tsx`
line 192, `color={{ bg: "var(--color-accent)", fg: "#fff" }}` — `fg` is a
raw `#fff` hex literal rather than a token reference. Defensible as a
genuine one-off per ADR 0007's own carve-out (a pure-white avatar
foreground is unlikely to need to change under a future dark theme), but
flagging since ADR 0007's consequences section explicitly asks for this
class of literal to be grepped for and reviewed.

### Finding 3 (informational, not a failure) — AC9 back-button case not covered by an automated test

AC9 ("browser back button closes the sheet... when opened via in-app
navigation") relies on Next.js's intercepting-route mechanism pushing a
real history entry, which is genuine App Router history/browser behavior
that Vitest + jsdom cannot exercise (there's no real multi-page navigation
history to pop). I verified this by code inspection instead: the
intercepted route (`@sheet/(.)add-expense/page.tsx`) is only ever reached
via client-side `<Link>` navigation from `/trip/[id]` (confirmed the
BottomBar's `<LinkButton href="/trip/${id}/add-expense">` call site is
unchanged), and there is no leftover `router.back()`, `pushState`, or other
bespoke history manipulation anywhere under `src/app/trip/[id]` for the
add-expense flow (grep-confirmed; the only remaining `router.back()` in
`src/app/trip` is Create-a-trip's own close button, unrelated to this
feature). This matches ADR 0008's claim that AC9 needs no bespoke code once
routes are genuinely intercepted. **This is a real architectural property,
not something I could falsify in this environment** — recommend a manual
or e2e (Playwright) smoke test of the actual back-button gesture before
this ships, since it's the one AC this test suite structurally cannot
verify end-to-end.

### Finding 4 — RESOLVED (verified 2026-09-18)

Fix applied: `src/app/page.tsx` now reads `<Screen glow texture={!showSignIn}>`
(previously an unconditional `<Screen glow texture>`), so `texture` is only
applied on the Welcome branch and `glow` stays unconditional on both, per
design.md §2's "States" note quoted below.

Verification performed:
- Read the updated `src/app/page.tsx` — confirmed the prop is now
  `texture={!showSignIn}`, and `glow` is unconditional (bare `glow`, no
  expression), matching design.md §2 exactly: glow on both, texture on
  Welcome only.
- Wrote and ran a new test, `src/app/page.texture-scope.qa.test.tsx` (3
  tests, all passing), that renders the real `HomePage` server component
  (mocking `@/lib/supabase/server` and `next/navigation`, and stubbing
  `./home-screen` to isolate this from HomeScreen's own client-only auth
  logic, already covered by `home-screen.auth-branching.qa.test.tsx`) via
  `renderToStaticMarkup`, and asserts on `Screen`'s actual rendered output
  (presence/absence of the `var(--texture-paw)` background-image and the
  `var(--glow-blob-1)` glow marker):
  - Welcome (no `signin` param, no session): renders both `--glow-blob-1`
    and `--texture-paw`.
  - Sign-in (`/?signin=1`, no session): renders `--glow-blob-1` but
    **not** `--texture-paw`.
  - Sign-in override with an active session (`/?signin=1` + a logged-in
    user): still renders the sign-in branch without `--texture-paw` (and
    confirms `redirect` is correctly *not* called — the `?signin=1`
    override still works after this change).
- This test is a permanent regression guard: no prior test covered
  `page.tsx`'s own prop-selection logic (`page.qa.test.ts` doesn't exist for
  this file; only `home-screen.auth-branching.qa.test.tsx` covered
  `SignInForm`'s internal auth behavior), so this closes that gap per the
  engineer's own note that it was untested.

**Verdict: FIXED.** `/?signin=1` no longer renders the paw-print texture;
both Welcome and sign-in still render `glow`, matching design.md §2 and ADR
0007's token discipline (no visual regression to the glow itself, which the
fix correctly left unconditional).

### Finding 4 (original, minor) — sign-in screen (`/?signin=1`) picks up the new paw-print texture, which design.md explicitly excluded

design.md §2 ("States") says, about the shared sign-in form: *"don't add
Welcome-specific elements to it (Miso art, the new paw-print texture)...
today it just rides along on shared tokens, same as it already does."*

In practice, `src/app/page.tsx` wraps **both** `WelcomeContent` and
`SignInForm` (via the shared `HomeScreen`) in a single, unconditional
`<Screen glow texture>` — `texture` is not conditioned on `showSignIn`:

```tsx
return (
  <Screen glow texture>
    <HomeScreen showSignIn={signin === "1"} />
  </Screen>
);
```

So `/?signin=1` does render the faint paw-print texture, contradicting
design.md's explicit scope note (Miso art itself is correctly *not* added
to `SignInForm`, since that's placed inside `WelcomeContent` only). No AC
explicitly forbids this — AC3 only requires the texture on the four
in-scope screens, it doesn't forbid it elsewhere — so this doesn't fail an
acceptance criterion, but it is a direct, named contradiction of a
"resolved, not open" design.md instruction and should go back to the
engineer to either conditionalize `texture` on `!showSignIn` or get an
explicit sign-off that this is an acceptable, intentional deviation.

## Test suite results (independently re-run, not taken from self-report)

Original pass (pre-fix):
- `npm test`: 190/190 passing (25 → 28 test files).
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `npm run lint`: **FAIL** (exit 1) — see Finding 1 (original).

**Follow-up pass, after the engineer's two targeted fixes (2026-09-18)** —
all independently re-run, not taken from the engineer's self-report:
- `npm test`: **193/193 passing** (28 → 29 test files; the 3 new tests are
  `src/app/page.texture-scope.qa.test.tsx`, added by QA for this
  verification pass). No flake observed.
- `npm run typecheck`: **PASS**, exit 0, zero errors.
- `npm run build`: **PASS**, exit 0 — production build succeeds; route
  table unchanged from the original pass (intercepting/parallel-route
  scaffold still compiles correctly).
- `npm run lint`: **PASS**, exit 0, zero output. Independently confirmed
  the fix is correctly scoped (see Finding 1 verification above), not just
  that the command now happens to return 0.

## Files touched by QA (tests only, no implementation changes)

- `src/app/trip/[id]/trip-sheet-chrome.qa.test.tsx` (new, original pass)
- `src/app/trip/[id]/sheet-shell.qa.test.tsx` (new, original pass)
- `src/app/trip/[id]/add-expense/page.ac8-deep-link.qa.test.tsx` (new,
  original pass)
- `src/app/page.texture-scope.qa.test.tsx` (new, follow-up verification
  pass — locks in `page.tsx`'s `Screen glow texture={!showSignIn}` prop
  selection so Finding 4's fix can't silently regress)

## Recommendation

**Ship it.** Both blocking-before-merge items are now resolved and
independently verified:
- Finding 1 (`npm run lint` failing) — fixed, verified clean and correctly
  scoped.
- Finding 4 (texture leaking onto the sign-in screen) — fixed, verified by
  inspection and by a new automated regression test.

Findings 2 (dead `--radius-field` token / one raw `#fff` literal) and 3
(AC9 back-button case needing a manual/e2e smoke test) remain open exactly
as before — both were explicitly called out as out-of-scope for this fix
and are non-blocking/informational, not forgotten. Recommend tracking them
as separate follow-up cleanup items rather than gating this feature's
merge on them.

**Final verdict: PASS.** All 16 acceptance criteria met, no regressions in
any flagged consumer, full suite green (193/193 tests, lint/typecheck/build
all exit 0).

---

## Follow-up verification pass 2 (2026-09-18) — paw texture toned down + Miso on three more screens (revised AC13)

Two fixes landed after the orchestrator ran the live dev server with
Playwright on real user feedback: (1) the paw-print texture toned down
(`public/images/paw-texture.svg`, `src/components/ui.tsx`,
`src/app/globals.css`), and (2) Miso added to Create-a-trip, The trip
(empty-state only), and Add-an-expense per `requirements.md`'s revised AC13
and `design.md` §3-§5. The orchestrator independently visually confirmed
three of four mascot-bearing screens (Welcome, Create-a-trip, Trip-view
empty state) via Playwright but could not reach the fourth (Add an expense)
without a verified-organizer session against the live Supabase project.
This pass re-verifies all of the above independently.

### 1. Full suite, independently re-run

- `npm test`: **201/201 passing** (30 test files, up from 29/193). The
  8 new tests are QA's own additions this pass (see "Files touched" below):
  2 strengthened assertions in `trip-tabs.qa.test.ts`, 2 in `page.qa.test.ts`,
  and 4 in a new `add-expense-sheet-content.miso-badge.qa.test.tsx`. No
  flake observed across two consecutive runs.
- `npm run typecheck`: **PASS**, exit 0, zero errors.
- `npm run lint`: **PASS**, exit 0, zero output.
- `npm run build`: **PASS**, exit 0. Route table unchanged from the prior
  pass, including `/trip/[id]/(.)add-expense` (the intercepted sheet route)
  and `/trip/[id]/add-expense` (the hard-nav fallback) both still present.

### 2. Do the two updated tests actually assert on the new copy/element, or just pass?

**Initial finding: only the copy string, not the element — a real,
closeable gap.** Before this pass, `trip-tabs.qa.test.ts` and
`page.qa.test.ts` had been updated to check
`expect(html).toContain("No expenses logged yet — Miso's ready when you
are.")` and nothing else. That would keep passing even if the `<img>`
element carrying the actual Miso cameo were deleted while the copy string
was hand-typed into a plain `<p>` — i.e. it locks in the copy but not the
"pair a small cameo ... with updated copy" requirement design.md §4
actually states.

**Closed by QA this pass** (test-only changes, no implementation touched):
- `trip-tabs.qa.test.ts`: added an assertion that the empty-expenses render
  contains `<img src="/images/miso-welcome.jpg" ... class="...rounded-full...">`
  (the circular-crop treatment design.md §4 specifies, matching `Avatar`'s
  `ring` styling — distinct from Welcome/Create-a-trip's square photo-card
  frame), plus a companion test confirming that once a trip has **real**
  expenses, no `miso-welcome.jpg` image and no "Miso" text renders anywhere
  in that tab (design.md §4: "the common, high-frequency case stays clean").
- `page.qa.test.ts` (the route-level smoke test, which renders the real
  page tree rather than `TripTabs` in isolation): added the same
  image-element assertion through the full page render, plus a
  non-empty-expenses case confirming no Miso image leaks through when a
  trip has real expenses (this is the version of the check that matters
  most, since it exercises the actual composed page, not just the child
  component in isolation).

All 4 new/strengthened assertions pass against the current implementation.
**This is a genuine test-coverage gap the engineer's own updates left open,
now closed** — not a product/behavior bug, since manual inspection of
`trip-tabs.tsx` (lines ~49-64) confirms the `<img>` is in fact present
today; the risk was purely "nothing would catch it if it later
regressed."

### 3. Getting eyes-on Add an expense (the one screen nobody could visually confirm)

Reaching this screen live requires a verified-organizer session against the
real (non-local) Supabase project, which isn't reproducible in this
environment either. Instead, this pass used the exact technique
`page.owner-gate.qa.test.tsx` already established for testing the
non-redirect path: mock `next/navigation` and `@/lib/supabase/client`,
fake a Supabase user object with `is_anonymous: false` (a "verified" owner
session) and a `trips`/`trip_members` query response, then render
`AddExpenseSheetContent` directly in jsdom via `createRoot`/`act` and
inspect the real DOM output.

New file: `src/app/trip/[id]/add-expense-sheet-content.miso-badge.qa.test.tsx`
(4 tests, all passing):
- **Verified owner, normal (unlocked) render**: confirms exactly one
  `<img src="/images/miso-welcome.jpg" aria-hidden="true" alt="">` renders,
  and the form (`input[placeholder="0.00"]`) is present alongside it —
  i.e. this is genuinely the same branch a real verified owner would see,
  not the redirect/locked/loading branch.
- **Verified owner, locked-trip render**: confirms the badge still renders
  in the locked header (design.md §5.4: "shown identically in both the
  normal and locked-trip renders of this header").
- **Owner-gate-blocked (redirecting) render**: confirms **no** Miso badge
  renders here, matching design.md §5.4's explicit exclusion ("not shown
  during the owner-gate-redirect branch, which renders no `TopBar` at all
  today").
- **AC12 re-check with the badge present** (see next section).

This is the closest this environment can get to visual confirmation
without a real verified email session: it proves the badge is actually
wired into the rendered DOM tree (not just present in source, which was
the orchestrator's own caveat about what they'd confirmed), in the correct
branch, with the correct `aria-hidden`/`alt=""` attributes, and absent
where design.md says it should be absent. It does **not** replace a real
visual/layout check (pixel position within the `TopBar`, whether it visibly
collides with anything at small viewport widths, whether the circular crop
looks right) — that residual risk is real and should still get an actual
Playwright/manual pass once a verified test session is available in this
environment (e.g. against a local/seeded Supabase instance rather than the
live project). Flagging this distinction explicitly rather than presenting
DOM-level confirmation as equivalent to a visual one.

### 4. AC12 re-confirmed with the badge now present on Add an expense

- Grepped `src/` for `/miso says/i` and any other Miso-attributed math
  narration — zero matches, same as the original pass.
- The new test file's fourth case renders the real component with the
  badge present and asserts: `container.textContent` does not match
  `/miso says/i` or `/miso.{0,20}each/i`; the plain split-summary pill text
  (`"Splits 4 ways"` / `"$0.00 each"`) is present and unchanged; and the
  badge element itself has empty `textContent` (it's `alt=""` and
  `aria-hidden="true"`, so it carries no accessible or visible text of its
  own that could be mistaken for narration).
- Confirmed by reading `add-expense-sheet-content.tsx` directly: the badge
  sits in `TopBar`'s `trailing` slot (opposite the close button), spatially
  separate from the `Card` containing the amount/description/date fields
  and from the split-summary pill below it — there is no code path where
  the badge's presence and the pill's value interact.
- **AC12 holds**: a Miso badge now exists on this screen (per revised
  AC13), but it is exactly the "just present as a static presence" carve-out
  AC12 itself allows, not a reintroduction of the excluded live-math
  callout.

### 5. Paw-print texture: is the toned-down math actually within design.md's bar?

Read the actual shipped values directly (not just the engineer's claimed
numbers):
- `public/images/paw-texture.svg`: `fill-opacity="0.5"` on the paw shapes,
  tan fill `#c9a97c`, tiled at 160×160 with the paw cluster inset ~32px
  from each edge (i.e. genuinely sparse per-tile, not edge-to-edge).
- `src/components/ui.tsx`'s `Screen` texture layer: `opacity: 0.14` on the
  whole layer, `backgroundSize: "160px 160px"` (matches the SVG's own
  dimensions, so no unintended scaling/blur from a size mismatch), applied
  above the glow, behind content, `aria-hidden`, `pointer-events-none`.
- **Math check**: `0.5 × 0.14 = 0.07`. The engineer's reported "≈0.07
  combined" figure is exactly right, not rounded generously. A shape that's
  already at 50% opacity in the source asset, then composited at 14% layer
  opacity onto a light paper background (`#f5f0e6`), yields an effective
  on-screen tint difference in the low single-digit percent range —
  genuinely at the "more felt than seen" end design.md §1 asks for, not
  just "reduced from something worse." This reads as a reasonable, honest
  interpretation of the bar, not a claim that happens to check out
  numerically while still looking busy.
- Could not do a true pixel-level before/after diff: `public/` is untracked
  in this repo's git history (confirmed via `git log` — no prior committed
  version of `paw-texture.svg` or the relevant `globals.css`/`ui.tsx` hunks
  exists to diff against), so "toned down from what" is taken on the
  engineer's word rather than independently re-derived from a prior
  version. This is a real limitation of this verification, not a claim
  that nothing changed — flagging it rather than silently treating the
  current-state math check as equivalent to a before/after comparison.
- Confirmed no accidental leakage: `texture` remains an opt-in `Screen`
  prop (default `false`); grepped every `<Screen` call site in `src/app`
  and confirmed `texture` is only passed on Welcome (`page.tsx`,
  conditional on `!showSignIn` per the already-verified Finding 4 fix),
  Create-a-trip (`trip/new/page.tsx`), and (via the shared render function)
  The trip's main view — the three in-scope screens beyond Welcome that
  design.md §1 calls for, not the previously-deferred screens
  (`settle-up`, `invite`, `feedback`, `expense/[expenseId]/edit`, `/trips`
  all still call `<Screen>` with no texture/glow props, or `glow`-only for
  `/trips`, unchanged from the original pass's regression check).

### 6. Regression re-check for the three newly-Miso'd screens

- **Create-a-trip** (`trip/new/page.tsx`): the Miso cameo + speech bubble
  are inserted as a new row between the (now-sticky) nav and the headline,
  not absolutely positioned — confirmed by reading the diff directly (a
  plain flex row, `<div className="h-4" />` spacers on both sides). Form
  fields, validation, and submit logic below are untouched (diff shows only
  token-literal-to-CSS-variable substitutions and the `Button`
  `primary`→`capsule` variant swap elsewhere in the file — no logic changes).
- **The trip main view, empty-expenses tab** (`trip-tabs.tsx`): the Miso
  row replaces the old plain `<p>` inside the same `expenses.length === 0`
  branch — no change to the non-empty branch's rendering (verified by the
  new "real expenses renders no Miso" test above) or to any Details-tab
  content.
- **Add an expense**: `AddExpenseSheetContent`'s gating/validation/submit
  logic is unchanged by this fix — the badge is purely additive markup in
  `TopBar`'s already-existing `trailing` slot (added by the earlier
  restyle pass, not new this pass); the pre-existing owner-gate test suite
  (`page.owner-gate.qa.test.tsx`, 6 tests) still passes unmodified,
  confirming the gating behavior itself has zero interaction with this
  markup-only addition.
- No other consumer of `TopBar`'s `trailing` prop exists outside this
  screen (grepped `src/app` for `trailing=`) — the new prop usage doesn't
  leak a visual change into any deferred screen.

### Acceptance criteria re-check (delta from the original table)

| AC | Description | Result |
|----|---|---|
| AC3 | Paw-print texture faint/barely-there | **PASS** — math confirmed (§5 above); no before/after diff possible (untracked `public/`), flagged as a limitation, not a failure |
| AC12 | No Miso live-math narration on add-expense | **PASS**, re-confirmed with the new header badge present (§4 above) |
| AC13 (revised) | Miso on all four in-scope screens | **PASS** on all four — Welcome (pre-existing, unchanged), Create-a-trip, Trip-view empty-state, and Add-an-expense (all three newly verified this pass) |
| AC15 | No regression in existing test coverage | **PASS**, and strengthened — see §2's closed gap |

All other ACs are unaffected by this pass's changes and remain as recorded
in the original table above.

### Files touched by QA this pass (tests only, no implementation changes)

- `src/app/trip/[id]/trip-tabs.qa.test.ts` (strengthened: 2 new tests —
  Miso image-element assertion, and "real expenses ⇒ no Miso" guard)
- `src/app/trip/[id]/page.qa.test.ts` (strengthened: 2 new tests — same
  two checks through the full page-render path)
- `src/app/trip/[id]/add-expense-sheet-content.miso-badge.qa.test.tsx`
  (new, 4 tests — the fake-verified-session DOM check for Add an expense)

### Recommendation (pass 2)

**Ship it**, with one residual risk flagged rather than hidden: the
Add-an-expense Miso badge is now verified at the DOM/attribute level (right
branch, right attributes, right exclusions) but not at a true visual/layout
level in this environment — recommend a real Playwright or manual pass
against a seeded/local Supabase session (not the live project) before or
shortly after this ships, specifically for that one screen's layout at
small viewport widths. The paw-texture math checks out against design.md's
stated bar as reported; the lack of a true before/after diff (due to
`public/` being untracked) is a process gap worth fixing going forward
(commit `public/` assets, or track texture-affecting values in a
version-controlled config) rather than a reason to doubt this specific
fix.

**Final verdict (pass 2): PASS.** No regressions found. One real test-
coverage gap identified and closed directly by QA (copy-only assertions
→ copy + element assertions). Full suite green: 201/201 tests,
lint/typecheck/build all exit 0.

---

## Bug-fix verification pass 3 (2026-09-18) — "adding an expense doesn't register" + dynamic validation message

### What was reported and what was fixed

A user reported that adding an expense "doesn't register" — the form
appeared to submit but the trip view never showed the new expense (the
expense *was* actually being saved; it just didn't visually appear). Root
cause: `src/app/trip/[id]/add-expense-sheet-content.tsx`'s `handleSubmit`
called `router.push('/trip/${id}')` on the success path but never called
`router.refresh()`, so Next.js's client router cache could serve the
stale, previously-loaded trip page instead of a fresh server render
reflecting the new expense.

Two changes landed together:
1. **The fix**: `router.refresh()` added immediately after the success-path
   `router.push('/trip/${id}')`, matching the pattern already established
   at `verify-inline.tsx`'s `markVerified()`.
2. **A separate, unrelated-but-bundled change**: `handleSubmit`'s
   validation early-return now builds a message naming only the
   specific missing field(s), instead of always showing the generic
   "Enter an amount, what it was for, and a valid date (today or
   earlier)."

### 1. Is the `router.refresh()` fix correct, and is jsdom the right tool to confirm it?

**Read the actual code** (not just the description) at
`add-expense-sheet-content.tsx` lines 165-170:

```tsx
trackEvent("expense_add_complete");
// router.push alone can land back on a stale client-cached copy of the trip page (the user
// was just there moments ago, before opening this sheet) — refresh reconciles the server-
// rendered expense list/balances with what was just inserted. Same pattern as verify-inline.tsx.
router.push(`/trip/${id}`);
router.refresh();
```

This matches the description exactly: `router.refresh()` is called
unconditionally right after `router.push()` on the success path, inside
the same `try` block, after `addExpense` has already resolved. Confirmed
this fix applies uniformly to **both** consumers of this component per
architecture.md's module-boundaries section — the intercepted sheet
(`@sheet/(.)add-expense/page.tsx`) and the hard-nav fallback
(`add-expense/page.tsx`) both render `AddExpenseSheetContent`, so there is
exactly one code path to fix and it was fixed in the one place shared by
both, not duplicated/missed in one branch.

**Checked the cited precedent isn't a loose analogy.** Re-read
`verify-inline.tsx`'s `markVerified()` (lines 48-56): it also calls
`router.refresh()` unconditionally after a client-side state change, with
an almost identical comment about reconciling server-rendered content in
the background. The one structural difference: `markVerified()` never
calls `router.push`/`replace` (it stays on the same route and only needs
to reconcile that route's own data), whereas the add-expense fix calls
`router.push` to a *different* route first, then `refresh()`. So this is
the same idiom applied to a navigate-then-refresh case, not a byte-for-byte
copy of a case that already covered "push then refresh" specifically — a
reasonable extension of the established pattern, not an exact precedent.

**Checked this isn't a version-specific API trap** (per this repo's own
`AGENTS.md` warning that this Next.js version has breaking API changes
from training-data expectations). Read
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/refresh.md`
and `.../use-router.md` directly (Next.js 16.3.4, confirmed via
`node_modules/next/package.json`):
- There are **two different, same-named `refresh` APIs** in this version:
  `next/cache`'s `refresh()`, which is new, and can **only** be called
  from inside a Server Action (calling it from a Client Component throws)
  — and `useRouter()`'s `router.refresh()`, a distinct Client Component
  method that still does exactly what's needed here: *"Refresh the
  current route... clears the Client Cache for the current route."*
- The fix correctly uses the latter (`const router = useRouter(); ...
  router.refresh()`), not the former. This is exactly the kind of
  version-specific gotcha `AGENTS.md` flags, and the engineer used the
  correct API for a `"use client"` component — confirmed by reading the
  import (`useRouter` from `next/navigation`, not `next/cache`).

**Can jsdom/Vitest verify the actual bug is fixed? No — and this needs to
be stated plainly, not softened.** There is no real Next.js client router
cache in jsdom; `next/navigation`'s `useRouter()` is fully mocked in every
test in this suite (here and in `verify-inline.qa.test.tsx`,
`page.owner-gate.qa.test.tsx`, etc.), so a Vitest test can only ever prove
"the component *called* `router.refresh()`," never "calling
`router.refresh()` actually invalidates a real router-cache entry and
causes the next paint to show the new expense." Those are different
claims, and only the first is testable here. I wrote a regression-guard
test for exactly that first claim (see below) — it is a real, useful test
(it will catch someone silently deleting or reordering the `refresh()`
call again), but **it cannot be the basis for closing out the bug report
itself.**

**Confidence breakdown, stated explicitly:**
- **What this automated pass CAN confirm** (and did): the fix is present
  in the one shared code path used by both the sheet and hard-nav
  fallback; it uses the correct, still-valid Client Component API for
  this Next.js version; it's called unconditionally on every successful
  submit and never on the validation-failure or check-email-redirect
  paths; a new test locks in that both `push` and `refresh` are actually
  invoked, in that order, exactly once each, on success.
- **What this automated pass CANNOT confirm, and still needs a real
  browser/manual check**: that `router.refresh()` actually clears the
  stale entry Next.js's real client router cache would otherwise serve,
  and that a real user doing the real repro steps (open the trip, add an
  expense, land back on the trip) now genuinely sees the new expense
  without a manual hard refresh. **This is the one thing this QA pass
  cannot close, and it should not be treated as closed until someone (the
  orchestrator, in a real browser, or a Playwright e2e run against a live
  dev server) confirms the actual visual repro no longer reproduces.**

### 2. New tests for the dynamic validation-message logic

Unlike the router-cache question, this is pure component logic (a
synchronous string-building branch based on already-validated local
state), fully exercisable in jsdom. New file:
`src/app/trip/[id]/add-expense-sheet-content.validation-message.qa.test.tsx`
(8 tests, all passing), using the same fake-verified-owner-session jsdom
technique already established by `page.owner-gate.qa.test.tsx` and
`add-expense-sheet-content.miso-badge.qa.test.tsx`:

- **Missing amount only** → `"Enter an amount."`, and neither of the other
  two field names appear.
- **Missing description only** → `"Enter what it was for."`, and neither
  of the other two field names appear.
- **Invalid (future) date only** (amount and description both valid) →
  `"Enter a valid date (today or earlier)."`, and neither of the other two
  field names appear.
- **Two missing fields (amount + description)** → comma-joined, in field
  order: `"Enter an amount, what it was for."`
- **All three missing/invalid** → `"Enter an amount, what it was for, a
  valid date (today or earlier)."`
- **Recovery**: after triggering the error, filling in valid values and
  resubmitting clears the message and proceeds to a real submit
  (`router.push` called).
- Two more tests in the same file confirm `router.refresh()`/`router.push`
  are called together exactly once each on a successful submit, and that
  neither is called when validation fails (the early-return path) — the
  regression guard described in section 1 above.

All 8 tests pass against the current implementation, confirming the
dynamic-message logic in `handleSubmit` (lines 128-136) does exactly what
the description claims: `missing` is built in `amount → description →
date` order and joined with `", "`, producing a message that names only
the field(s) actually failing validation.

### 3. Regression check

Confirmed no other in-scope AC or existing consumer is affected by this
change:
- The validation/gating logic itself (`isValidExpenseInput`,
  `isValidExpenseDate`, `isUnverifiedOwner`, `requireVerifiedSession`) is
  unchanged — only the string built in the early-return branch changed.
  AC10 ("all current add-expense functionality... unchanged in behavior")
  is not violated by a copy-only change to an error message.
- Re-ran the existing `add-expense-sheet-content.miso-badge.qa.test.tsx`
  and `page.owner-gate.qa.test.tsx` suites (14 tests combined) — both pass
  unmodified, confirming the badge/owner-gate behavior has zero
  interaction with this change.
- Grepped for any other call site that renders the old generic message
  string (`"Enter an amount, what it was for, and a valid date"`) — none
  found outside `add-expense-sheet-content.tsx` itself (the near-identical
  string in `expense/[expenseId]/edit/page.tsx`, noted below, is a
  separate file with its own unmodified copy, not a duplicate this change
  touched).

### 4. Related finding (informational, NOT part of this fix, NOT a regression) — the identical stale-router-cache bug is still present in edit-expense

While tracing every `router.push` call site to confirm this fix's
correctness and completeness (item 1 above), I found that
`src/app/trip/[id]/expense/[expenseId]/edit/page.tsx`'s `handleSubmit` has
the **exact same shape of bug** that was just fixed here, still
unpatched:

```tsx
await updateExpense(supabase, { expenseId, amountCents, description: description.trim(), date });

trackEvent("expense_edit_complete");
router.push(`/trip/${id}`);
```

No `router.refresh()` follows this `router.push`, so an edited expense's
new amount/description/date could plausibly suffer the identical
"saved but doesn't visually update" symptom on navigating back to the
trip view. This file is **not** part of `ux-revamp` or this bug-fix task
(it belongs to the separate `edit-own-expense` feature) and I have not
modified it or written tests against it — flagging it here only because
it's the same bug class, in a sibling file, discovered as a direct
byproduct of tracing this exact fix. Recommend a follow-up ticket/fix
using the identical `router.push(...); router.refresh();` pattern, rather
than treating this pass's fix as having closed the whole bug class. I
also checked `feedback/page.tsx` (mutates data the trip view doesn't
display, so no visible staleness) and `invite/page.tsx`/`settle-up`'s
in-page mutations (both re-fetch and update local state directly instead
of navigating away post-mutation) — neither has this pattern.

### 5. Full suite, independently re-run

- `npm test`: **210/210 passing** (32 test files, up from 201/201 across
  31 — the 8 new tests are the new
  `add-expense-sheet-content.validation-message.qa.test.tsx` file added
  this pass). No flake observed.
- `npm run typecheck`: **PASS**, exit 0, zero errors.
- `npm run lint`: **PASS**, exit 0, zero output.
- `npm run build`: **PASS**, exit 0 — production build succeeds; route
  table unchanged, including `/trip/[id]/(.)add-expense` (intercepted
  sheet) and `/trip/[id]/add-expense` (hard-nav fallback).

Note: this pass deliberately did not touch, test, or evaluate the
concurrent, unrelated in-flight changes to `src/app/trip/[id]/settle-up/page.tsx`
or `src/app/trips/page.tsx`/`page.qa.test.ts` (trips-dashboard grouping) —
per explicit instruction, those belong to a separate, concurrent session
and are out of scope for this review. They were not flagged as
regressions and no assertions in this pass depend on their contents.

### Files touched by QA this pass (tests only, no implementation changes)

- `src/app/trip/[id]/add-expense-sheet-content.validation-message.qa.test.tsx`
  (new, 8 tests — dynamic validation-message coverage plus the
  router.push/router.refresh call-order regression guard)

### Acceptance-criteria relevance (this bug fix is not itself tied to a numbered AC)

This fix does not map to a specific numbered AC in `requirements.md` (it's
a defect fix, not new scope), but it directly protects **AC10** ("All
current add-expense functionality... is unchanged in behavior") from
regressing into "expense is saved but appears not to be," and the
validation-message change is a UX improvement layered on the same
early-return branch AC10 covers. Neither the original nor this
follow-up pass found any conflict with AC1-AC16.

### Recommendation (pass 3)

**Conditional pass** — not a full, unqualified "ship it," because one part
of this fix (the actual defect this bug report is about) is structurally
outside what this environment can verify:

- The dynamic validation-message change: **PASS**, fully verified,
  8/8 new tests passing, no regressions.
- The `router.refresh()` fix: **code is correct and reasonably applied**
  (right API for this Next.js version, right shared code path, right
  place in the success flow), and a regression guard now exists to catch
  the call being removed/reordered again — but **the actual claim in the
  bug report ("the expense now visually appears without a manual
  refresh") has NOT been confirmed by this pass and cannot be confirmed
  by Vitest/jsdom.** Recommend the orchestrator (or a Playwright run
  against a real dev server) perform the literal repro — add an expense,
  land back on the trip view, confirm it appears without a manual
  page reload — before marking the underlying bug report closed.
- One related, out-of-scope finding surfaced as a byproduct of this
  review: the identical bug shape is still live in
  `expense/[expenseId]/edit/page.tsx` (§4 above) — not blocking this
  fix's merge, but should be tracked as a follow-up.

**Final verdict (pass 3): PASS on everything automatable; the router-cache
half of the bug fix carries a residual, explicitly-flagged manual-
verification gap that this pipeline stage cannot close on its own.** Full
suite green: 210/210 tests, lint/typecheck/build all exit 0.

## AC17 verification pass 4 (2026-09-19)

Scope: `requirements.md`'s "Scope addition (2026-09-18, post-Checkpoint 3,
user request)" section, AC17 — replace Welcome's native
`window.prompt("Paste your invite link or code")` with an in-app `/join`
screen. New files: `src/app/join/page.tsx`, `src/lib/invite-code.ts`,
`src/app/join/page.qa.test.tsx` (5 tests). Modified:
`src/app/home-screen.tsx` (button now does `router.push("/join")`).

The orchestrator independently ran this in a real browser via Playwright
and confirmed the empty-input state, the inline validation error, and
successful navigation to `/join/abc123` for a valid code. This pass
independently re-verifies via the automated suite, static analysis, and
direct diffing, and adds the checks a live-browser run can't easily cover
(byte-for-byte extraction diff, build route-table shape, code-path tracing
for the deliberate back-button deviation).

### 1. Full suite, independently re-run

- `npm test`: **215/215 passing** (32 test files). Matches the engineer's
  self-report exactly. No flake observed across the run.
- `npm run typecheck`: **PASS**, exit 0, zero errors.
- `npm run lint`: **PASS**, exit 0, zero output.
- `npm run build`: **PASS** — production build succeeds (Next.js 16.3.4 /
  Turbopack). Route table (see item 4 below) confirms both `/join` and
  `/join/[code]` are present as distinct entries.

### 2. `extractInviteCode` extraction — byte-for-byte diff, not just "it moved"

Diffed the pre-change `home-screen.tsx` against the new
`src/lib/invite-code.ts` directly (`git diff HEAD -- src/app/home-screen.tsx`
shows the function's exact removal; the new file's body was compared
line-by-line against it):

```ts
// removed from home-screen.tsx, added unchanged to src/lib/invite-code.ts
function extractInviteCode(input: string) {
  const trimmed = input.trim();
  const match = trimmed.match(/\/join\/([^/?#\s]+)/);
  return match ? match[1] : trimmed;
}
```

Trim behavior, regex (`/\/join\/([^/?#\s]+)/`), and the fallback-to-trimmed-
input branch are identical, character for character — only the `export`
keyword and a doc comment were added. Confirmed there is no other call
site: `grep -rn "extractInviteCode"` across `src/` shows exactly two real
references — the definition in `src/lib/invite-code.ts` and the one new
call site in `src/app/join/page.tsx` (`home-screen.tsx` no longer
references it at all, and no longer imports it). Also checked
`home-screen.auth-branching.qa.test.tsx` (the pre-existing home-screen
test file) for any stale assertions on `window.prompt` or the old inline
helper — it has none; it never touched that code path, so nothing there
went stale.

New test file `src/app/join/page.qa.test.tsx` covers, and I confirmed all
5 pass and are meaningful (not vacuous): empty-input validation message
+ no navigation, bare-code navigation, full-link code extraction, leading/
trailing whitespace trimming, and the error clearing once valid input is
entered on a second submit. I additionally hand-traced the regex against
a handful of adversarial inputs (`"/join/abc123/extra"` → `"abc123"`,
`"abc123?foo=bar"` → whole string since there's no `/join/` prefix to
match, matching pre-existing behavior) — no drift from what shipped
before this refactor.

### 3. Out-of-scope destination screens — confirmed untouched

`git status --porcelain -- 'src/app/join/[code]'` and
`git diff HEAD -- 'src/app/join/[code]'` are both empty: `src/app/join/[code]/page.tsx`
and `src/app/join/[code]/welcome/page.tsx` have zero uncommitted changes.
`src/app/join/page.tsx`'s only interaction with that route is a
`router.push` call into it (unchanged shape: `/join/${code}`), consistent
with AC17's "the `/join/[code]` destination route [is] reused unchanged."

### 4. Route collision check — `/join` vs `/join/[code]`

`npm run build`'s route table lists both as separate, correctly-typed
entries:

```
├ ○ /join
├ ƒ /join/[code]
├ ƒ /join/[code]/welcome
```

`/join` is static (○, no dynamic segment, matches its bare client-component
shell), `/join/[code]` and its `welcome` child remain dynamic (ƒ) and
unaffected. Next.js's App Router treats a literal segment (`/join/page.tsx`)
and a dynamic segment at the same depth (`/join/[code]/page.tsx`) as
distinct, non-shadowing routes — the literal segment always takes
precedence for an exact `/join` match, and `/join/<anything-else>` falls
through to `[code]`. The build output confirms this is exactly what
happened; no warnings or errors about ambiguous/duplicate routes were
emitted.

### 5. Close (X) button: `router.push("/")` vs the app's usual `router.back()`

Confirmed the deviation as described: `src/app/join/page.tsx` does
`router.push("/")`, while `src/app/trip/new/page.tsx`'s equivalent close
button does `router.back()`. The in-code comment on the new screen
explains the rationale: `/join` "may be reached directly (e.g. a fresh
tab) and should always have a safe way out" — `router.back()` on a page
with no history (fresh tab / direct link) would either no-op or leave the
app, whereas `router.push("/")` always lands somewhere safe and known.
This is a legitimate, defensible reason for the deviation and I did not
find a case where it produces a dead end, an error, or a loop.

One real but minor inconsistency, worth flagging as a UX note rather than
a defect: in the **common** path (Welcome → tap "I have an invite link" →
`/join`), the history stack after opening `/join` is `[..., "/", "/join"]`.
Tapping X does `router.push("/")` (a *push*, not a *replace*), so the
stack becomes `[..., "/", "/join", "/"]`. Pressing the browser/gesture
back button immediately after closing does **not** take the user
further back past Welcome as `router.back()` would — it re-enters
`/join`, and a second back press is needed to actually leave. This isn't
broken (no error, no dead end, no infinite loop — worst case is one extra
back-press to fully back out), and it's the direct, known consequence of
the orchestrator's explicit instruction to prioritize a safe exit for the
direct-link case over strict back-button symmetry for the common case. I
did not find any place where this fights the browser back button in a
way that traps the user or loses their place — flagging for visibility
per the task instructions, not as a blocking regression. If back-button
symmetry in the common case matters more than the direct-link safety net
in a future pass, `router.push(document.referrer ? ... : "/")`-style
branching or a `sessionStorage`-based "did I arrive from Welcome" check
would resolve it, but that's a product call, not a QA blocker.

### Files touched by QA this pass

None — no new test files were added; the engineer's own 5 tests in
`src/app/join/page.qa.test.tsx` were reviewed for meaningfulness (see
item 2) rather than duplicated, since they already cover the specified
happy path and the one edge case (empty input) called out in
requirements/design.

### Recommendation (pass 4)

**PASS.** AC17 is met: the native `window.prompt()` is gone, the new
`/join` screen reproduces its exact input-parsing behavior with no drift,
the out-of-scope destination screens are untouched, the new route does
not collide with the existing dynamic one, and the deliberate
close-button deviation is a reasoned tradeoff with no actual broken
behavior — only a minor, explicitly-flagged back-button-symmetry note in
the common (non-direct-link) path. Full suite green: 215/215 tests,
lint/typecheck/build all exit 0, matching the engineer's self-report
exactly.

One process note, not a blocker: `architecture.md`'s impact/consumer
analysis section was not updated for this scope addition (it still only
documents the pre-AC17 `home-screen.tsx` restyle, with no mention of the
new `/join` route or `src/lib/invite-code.ts`). The actual consumer
surface is small and was traced manually in item 2 above (exactly one
call site before, one after), so this did not block verification this
pass, but the architecture doc should be updated to reflect the new file
for future consumers/QA passes to find without re-deriving it from a
`grep`.
