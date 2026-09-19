# Requirements: UX Revamp

Status: draft — Checkpoint 2 (this doc). Formalizes the direction agreed in
`docs/features/ux-revamp/planning.md` after its Checkpoint 1 rescope. Does
not re-open anything under "Agreed direction" in the prompt that produced
this doc, or the corresponding "Recommended direction" / "Resolved at
Checkpoint 1" sections of `planning.md`.

## Problem statement

Splitiful's existing browser app (welcome, trip creation, trip view,
add-expense) works but presents in the current "modernist" design system
(sharp corners, flat `#ec3013` accent, no illustration, no motion) with no
warmth or brand personality — nothing distinguishes a moment like "you just
settled up with friends" from a generic CRUD form. A design exploration
(`docs/features/ux-revamp/design-import/`) produced a warmer, more tactile
visual language (lit paper ground, ochre/terracotta glow, blurred nav,
floating capsule primary action, spring-up sheet for add-expense, and a dog
mascot, Miso) that the user has approved as the app's new light theme. This
feature restyles the highest-traffic, structurally-connected part of the
existing flow to that language, and lays down themeable tokens so the
already-designed dark counterpart ("dark glass") is a future token swap, not
a second build.

This is **not** a new mobile surface, not a native app, not a PWA. It is a
presentation-layer restyle of the app that already exists, built on the
existing Next.js/Supabase stack and the ADR 0005 SSR pattern.

## In scope: first slice

Four screens, restyled as one coherent unit (per the design-import canvas's
warm-paper treatment as the visual/interaction reference, not a literal
mobile-only deliverable):

1. **Welcome** (`src/app/page.tsx` / `src/app/home-screen.tsx`)
2. **Create a trip** (`src/app/trip/new/page.tsx`)
3. **The trip — main view** (`src/app/trip/[id]/page.tsx`)
4. **Add an expense** (`src/app/trip/[id]/add-expense/page.tsx`) — converted
   from a full page route to an overlay sheet over the dimmed trip view

These four are re-confirmed (not assumed) as the right first slice under the
restyle framing: they are the highest-traffic path in the app (arrive →
create → view → log spend) and restyling the middle of that path while
leaving the front door in the old visual language would be a visibly
inconsistent journey. Details, Settle-up, and the remaining ~11 canvas
screens (sign-back-in, pre-confirmation state, edit-expense, invite-link
opening, roster, feedback, all-trips states, loading/error patterns) are
explicitly deferred to a later slice — loading and error states in
particular should be designed once as a systemic pattern when they're
tackled, not redesigned per screen as an afterthought here.

## Acceptance criteria

### Visual system / tokens
- AC1: Color, spacing, radius, shadow/glow, and typography values used by
  the four restyled screens are defined as named design tokens (e.g. CSS
  custom properties or an equivalent themeable layer), not hardcoded
  per-component values — so that a future dark-mode ("dark glass") pass can
  swap token values without touching component markup/logic.
- AC2: The token set ships with exactly one resolved theme (light /
  "warm paper"). No dark-mode UI, theme toggle, or `prefers-color-scheme`
  handling is required or expected in this pass.
- AC3: The four screens visually match the warm-paper treatment's
  established language from the design-import canvas: lit paper ground,
  ochre/terracotta glow accents, blurred nav bar with content scrolling
  under it, primary action rendered as a floating capsule, faint paw-print
  texture where the canvas shows it. Exact pixel-parity with the canvas is
  not required — the canvas is a reference, not a spec to pixel-match.

### Welcome
- AC4: The welcome screen (first-run entry point, `src/app/page.tsx`/
  `home-screen.tsx`) is restyled to the warm-paper treatment while
  preserving its current behavior (anonymous-session creation, routing into
  trip creation) exactly as-is — this is a visual change, not a change to
  the simplified-onboarding logic.

### Create a trip
- AC5: The create-a-trip screen (`src/app/trip/new/page.tsx`) is restyled
  to the warm-paper treatment. Form fields, validation, and submit behavior
  are unchanged.

### The trip (main view)
- AC6: The trip main view (`src/app/trip/[id]/page.tsx`) is restyled to the
  warm-paper treatment, including the blurred nav and floating capsule
  primary action (entry point into add-expense). Existing data (expense
  list, balances, member list, hide-until-verified organizer gating from
  simplified-onboarding) continues to render and behave exactly as it does
  today — this pass changes appearance, not data or permission logic.

### Add an expense (page → overlay sheet)
- AC7: Add-expense is converted from a standalone page route to an overlay
  sheet that opens over a dimmed trip view, matching the canvas's
  spring-up-sheet interaction.
- AC8: The URL for add-expense remains independently loadable/shareable
  (deep-linkable) — navigating directly to it (e.g. a bookmarked link,
  page refresh while it's open) still opens the trip with the sheet showing,
  not a broken or blank state. This preserves today's route as a working
  address rather than removing it outright.
- AC9: The browser back button closes the sheet and returns to the plain
  trip view (not back past the trip, and not out of the app) when the sheet
  was opened via in-app navigation from the trip view.
- AC10: All current add-expense functionality (fields, validation, submit,
  the existing owner-gating behavior covered by
  `page.owner-gate.qa.test.tsx`) is unchanged in behavior — only the
  container (page vs. sheet) changes.
- AC11: This is flagged explicitly for the architect stage as real
  routing/history/state architecture work (not a CSS/cosmetic change) —
  see "Flagged for architect" below.
- AC12: The canvas's per-person live-math callout on this screen ("Miso
  says that's $X each," shown live as amounts/split are entered — canvas
  options 2e/2f) is explicitly **excluded**. The add-expense sheet does not
  narrate or restate the per-person split amount through Miso; the existing
  split/amount UI is unaffected.

### Miso the mascot
- AC13 (revised 2026-09-18, user feedback post-Checkpoint 3): Miso appears
  on **all four** in-scope screens (Welcome, Create a trip, The trip main
  view, Add an expense), not just Welcome. The canvas itself only shows him
  on Welcome (and the excluded add-expense math callout, per AC12) — there
  is no canvas reference for his presence on Create-a-trip or Trip view, so
  `design.md` needs new placements for those, not just "implement what's
  there." Uses the best-available art at build time — see the
  placeholder-art default below — **except** the per-person live-math
  callout on add-expense excluded by AC12.
- AC14: The canvas's cross-trip running-total callout ("Across all your
  trips, you're up/down $X," canvas options 2i/2j, on the All trips screen)
  is explicitly **excluded** from the design language going forward. This
  doesn't change this pass's scope (All trips is already deferred, per
  Non-goals) but applies to the *design reference itself* — when a later
  slice reaches the All trips screen, this callout should not be built.

### Non-functional
- AC15: No regression in existing automated test coverage for the four
  touched routes/components (existing `.qa.test.tsx` files for these
  screens continue to pass, updated only where they assert on markup/classes
  that intentionally changed, not on behavior).
- AC16: No change to Supabase schema, RLS policies, or API/route contracts
  beyond what AC7-AC9 require for the add-expense sheet's routing — this is
  a presentation-layer feature, not a data-model change.

## Non-goals (explicitly out of scope for this pass)

- A separate mobile route tree, mobile-only screens, or dedicated mobile
  engineering effort. Whatever responsive/mobile-browser behavior the app
  has today stays as-is; the canvas's phone-width screens are a visual/
  interaction reference, not literal mobile deliverables.
- Dark mode / "dark glass" implementation. Tokens are built to support it
  later (AC1); the dark theme itself is not built, chosen at runtime, or
  exposed to users in this pass.
- Details (per-person share breakdown) and Settle-up screens.
- The remaining ~11 canvas screens: sign-back-in, trip-before-email-
  confirmed, edit-expense, opening-an-invite-link, the roster, feedback,
  all-trips (data/empty), loading skeleton, broken/dead-link error.
- Any change to simplified-onboarding logic, RLS/auth behavior, or the
  hide-until-verified organizer gating — this feature only restyles
  screens that logic already governs.
- A native app wrapper or installable/offline PWA.
- Resolving the invite-code RPC-grant issue, the broader compliance
  backlog, or the unverified ADR 0006 linking assumption — tracked
  separately in `docs/ROADMAP.md`; see "Carried-forward open questions"
  below for how this feature relates to the first of these.

## Semver classification

**Feature (backward-compatible)**, with one caveat to flag rather than
decide silently: AC7-AC9 change add-expense from a page route to an overlay
sheet. As specified (AC8, AC9), the existing URL keeps working and deep
links keep resolving, so this should land as backward-compatible from a
user/URL perspective. If the architect stage determines full deep-link
parity isn't achievable without disproportionate cost, that tradeoff should
come back to the user explicitly before shipping, since it would make this
a breaking change to an existing addressable URL rather than a pure
restyle.

## Flagged for architect stage

- The add-expense page-to-overlay-sheet conversion (AC7-AC10) is real
  routing/history/back-button/deep-link architecture work, independent of
  the token/theme decision. It should be scoped and de-risked explicitly at
  the architect stage, not treated as a cosmetic change bundled in with the
  visual restyle.
- Token architecture (AC1) should be decided once, at the architect stage,
  in a way that doesn't need to be revisited when dark mode is eventually
  built.

## Carried-forward open questions (defaults chosen below — confirm or
override at Checkpoint 2)

These were left open in `planning.md` for the user, not resolved by either
debating agent. Each has a working default so this doc is buildable as
written, but each default is a guess this pipeline is making on the user's
behalf and should be confirmed or overridden before engineering starts.

1. **Does the invite-code RPC-grant fix need to sequence before this work?**
   **Default: no — independent and separately scheduled.** The original
   concern (a more inviting *new* front door growing the exploited surface)
   assumed net-new mobile traffic; this feature restyles already-live,
   already-shipped welcome/create-trip screens, so it doesn't clearly grow
   that surface the same way. The RPC-grant fix remains tracked and
   unresolved in `docs/ROADMAP.md` regardless of this feature's timeline.
   **Override if:** the user wants the fix landed first purely out of
   caution, independent of this reasoning.

2. **Relative priority against the rest of the open roadmap** (the
   RPC-grant fix, the compliance backlog, the unverified ADR 0006 linking
   assumption). **Default: this feature proceeds now, in parallel** — none
   of those items are engineering blockers for a presentation-layer restyle
   (the compliance items are legal/product decisions, not code the restyle
   touches; the ADR 0006 assumption affects auth/linking, not the four
   screens' rendering). **Override if:** the user wants this feature
   sequenced behind or after any of those items regardless.

3. **Is placeholder/lower-resolution Miso art acceptable for the first
   slice?** **Default: yes.** Ship the mascot-bearing screens (welcome, at
   minimum) with the best-available (placeholder/lower-res) art now, and
   swap in final-resolution assets as a fast-follow once they're
   re-exported through a path that isn't capped at 256KB, rather than
   blocking the whole first slice on an unfinished asset pipeline.
   **Override if:** the user considers Miso's visual quality a
   brand-launch moment that must be final before any mascot-bearing screen
   ships, in which case welcome (and any other mascot-bearing screen in
   this slice) should be held back until final art lands, while the
   non-mascot screens (create-a-trip, trip view, add-expense) proceed.

4. **Target browser support matrix.** **Default: unchanged** — whatever
   desktop and mobile-web browsers the app already supports today, no
   narrower and no broader. **Override if:** the user wants this restyle to
   set a new, explicit floor (e.g. drop an old browser, add a new target).

## Scope addition (2026-09-18, post-Checkpoint 3, user request)

**AC17 (new):** the "I have an invite link" button on Welcome currently uses
a native `window.prompt("Paste your invite link or code")` — this predates
`ux-revamp` entirely (confirmed present in the pre-feature `HEAD` state, not
introduced by this feature or the concurrent session's work). The user
flagged it as a jarring browser-native dialog breaking the restyled Welcome
flow and asked for it to be fixed as part of this pass.

**Explicitly scoped narrowly**: this is a new small screen for *manually
entering* a code/link (the button's existing entry point), not the
canvas's deferred "opening an invite link" destination screen (options
2u/2v — what you see after actually clicking a real invite link, landing on
`/join/[code]`, which remains out of scope/deferred per the Non-goals
above). `extractInviteCode`'s existing logic (accepts either a full
`/join/xxx` link or a bare code) and the `/join/[code]` destination route
are both reused unchanged — only the *input* method changes, from a native
dialog to an in-app screen at a new bare `/join` route, styled consistently
with the other three form-like screens (matching Create-a-trip's
`Screen`/`TopBar`/`Field`/capsule-`Button` pattern). No Miso placement on
this screen (not one of the four AC13 mascot-bearing screens; adding one
wasn't asked for).

## Orientation notes (for downstream agents, not requirements themselves)

- Reuse the ADR 0005 SSR pattern (async Server Components, `<Link>`-based
  navigation, minimal client-side JS) for the four restyled routes — this
  is a presentation change, not a data-fetching pattern change.
- `docs/ROADMAP.md`'s "In progress" item (invite-code RPC hardening) and its
  attached compliance findings are unaffected by this feature per the
  defaults above; do not fold their remediation into this feature's scope.
