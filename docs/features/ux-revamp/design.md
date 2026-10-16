# Design: UX Revamp (warm paper restyle)

Status: draft, for architect/engineering handoff. Scope is
`docs/features/ux-revamp/requirements.md` (Checkpoint 2, approved) — four
screens (Welcome, Create a trip, The trip, Add an expense), warm-paper
material only, no dark mode, no new screens/behavior. Visual reference is
the design-import canvas, options **2a** (Welcome), **2c** (The trip),
**2e** (Add an expense), **2k** (Create a trip) — all "warm paper" —
in `docs/features/ux-revamp/design-import/Splitiful Mobile.dc.html`.

**Addendum (2026-09-18):** AC13 was revised post-Checkpoint 3 — Miso is
now required on all four in-scope screens, not just Welcome. Sections 3,
4, and 5 below add new Miso placements for Create-a-trip, The trip, and
Add-an-expense accordingly. Re-checked the canvas first: options 2c (The
trip) and 2k (Create a trip) have no Miso art or placement at all, on
either warm-paper or dark-glass variants — there's nothing in the canvas
to copy for those two screens. What follows is new, built from Welcome's
established visual grammar (§2's tilted-photo-in-a-card treatment) at a
smaller, quieter scale appropriate to functional/data-dense screens, not
lifted from a canvas frame.

Per the requirements' non-goals, loading/error patterns are **not**
redesigned as a systemic pattern in this pass — each screen keeps its
existing loading/error/empty copy and logic, restyled only to the new
material (paper card, ink text, terracotta for errors), not redesigned.

## 0. What's already true in the codebase

Worth calling out because it changes the size of this restyle: the app's
existing tokens in `src/app/globals.css` (`--color-paper: #f5f0e6`,
`--color-ink: #231c12`, `--color-accent: oklch(0.45 0.09 80)`,
`--color-terracotta: oklch(0.42 0.09 44)`, etc.) and `Screen`'s `glow` prop
in `src/components/ui.tsx` **already match the canvas's warm-paper palette
and ambient-glow orbs almost exactly** — `glow` is already wired up and used
on the Welcome screen (`src/app/page.tsx`) and `/trips`. `Card`, `Button`,
`Field`, `Divider`, `Kicker` already use paper/ink/accent colors and soft
rounded-pill/rounded-card shapes.

So this is not a from-scratch visual language — it's extending an
already-warm palette with the pieces the canvas adds that the app doesn't
have yet:

1. **Blurred, sticky nav** — today's `TopBar` scrolls away with content; the
   canvas's nav is `position: sticky` with `backdrop-filter: blur(24px)
   saturate(1.6)` over a translucent paper fill, so content passes under it.
2. **Floating capsule primary action** — today's `BottomBar` is a full-width
   button sitting on a gradient scrim panel, flush to the screen edges. The
   canvas's primary action is a shorter capsule inset ~14px from both edges,
   dark ink-translucent with blur and a soft drop shadow, that springs up on
   entry.
3. **Paw-print texture** — a faint, full-bleed decorative texture layer
   (canvas classes `pw0`–`pw7`, one per screen) sitting behind content,
   on top of the glow orbs. Not in the app today at all.
4. **Miso the mascot** — not in the app today at all. Canvas art assets
   (`assets/miso-wide.png`, `assets/miso-face2.png`) didn't import cleanly
   (see design-import README); `public/images/miso-1.png` and
   `public/images/Miso-2.png` exist in the repo as placeholder candidates.
   **Flagged below (§6) — these two files are not a good placeholder as-is.**
5. **Add-expense as a sheet, not a page** — the actual architecture is
   flagged separately for the architect stage (AC11); this doc covers what
   it should look/feel like, not how routing/history achieves it.

Token *architecture* (naming, file structure, dark-mode-readiness) is the
architect's call per AC1 — this doc describes the values and where they
apply, not how they're organized in code.

## 1. Visual language reference (applies to all four screens)

- **Ground**: `--color-paper` (#f5f0e6), with the existing three-orb ambient
  glow (`Screen`'s `glow` prop) — ochre top-right, terracotta mid-right,
  warm-white bottom-right, all heavily blurred. Currently only wired on
  Welcome/`/trips`; extend to Create-a-trip and The trip too (canvas shows
  the identical glow on all four).
- **Paw-print texture**: a faint, low-opacity (canvas suggests background-
  texture-tile territory, not a bold pattern — treat as barely-there, more
  felt than seen) full-bleed texture layer, behind content, above the glow.
  Applies to all four screens per AC3. Exact asset/opacity is an engineering
  call; err toward *too subtle* rather than *too busy* — this is a paper
  grain, not a wallpaper print.
- **Cards**: white, rounded-22px, soft two-layer shadow — already
  `Card` in `ui.tsx`, unchanged.
- **Nav**: sticky, blurred, translucent-paper fill, content scrolls under
  it. Applies to Create-a-trip's and The trip's header rows (both currently
  plain, non-sticky `TopBar`/inline-flex rows). Welcome has no nav bar in
  the canvas (nothing to make sticky there).
- **Primary action**: floating capsule, inset from the screen edges (not
  flush), dark ink-translucent fill with blur and shadow, springs up on
  first paint. Applies to The trip's "Add an expense" and Create-a-trip's
  "Create trip". Both currently render as full-width `BottomBar` buttons on
  a gradient scrim panel.
  - **Judgment call (not escalating):** real trips can have many more
    expense rows than the canvas's 5-item mock, so unlike the canvas the
    floating pill will sit over a much longer scrolling list. Keep a subtle
    fade/scrim immediately behind the capsule (as `BottomBar` already does
    today) rather than dropping it entirely — pure drop-shadow-over-content
    (literal canvas treatment) risks the last couple of list rows getting
    lost under it on a long trip. Also keep `ScreenContent`'s existing
    bottom padding generous enough that the last real row clears the pill.
- **Type**: existing `text-display` (Bricolage-style display face) for
  numbers/headlines, `Instrument Sans`-style body — unchanged, canvas uses
  the same pairing.

## 2. Welcome (`src/app/page.tsx`, `home-screen.tsx`)

AC4: visual-only change, `WelcomeContent`'s behavior (buttons, invite-link
prompt, sign-in link) is untouched.

**Layout, top to bottom** (canvas 2a):
1. Miso art, tilted slightly (~-3.5°), in a small white rounded-card frame
   with a shadow — a snapshot-on-paper feel, not a full-bleed hero image.
2. A tilted, separate speech-bubble-style card next to it with a short,
   static flavor line. Not data-bound (there's no real member count yet at
   this point in the flow) — reuse the canvas's own line verbatim since it's
   pure flavor copy: **"Divide by 6?"**
3. Headline. **Decided (user, Checkpoint 2 follow-up): adopt the canvas's
   Miso-referencing headline** — now confirmed, not just recommended:
   - Headline: **"You have fun. Miso does the math."**
   - Subhead: **"Add what you spend. Miso works out who owes who — no
     account needed to start."**
   - This replaces the current shipped copy ("Trips are fun. The math
     isn't." / "We'll work out who owes who…").
4. Buttons — unchanged copy/behavior: **"Create your first trip"**,
   **"I have an invite link"**, **"Already have a trip? Sign in"**.
5. The two stat chips (**"∞ expenses a day"**, **"0 accounts to join"**) —
   unchanged, restyle only (accent-soft / terracotta-soft chip fills, which
   the app already has).

**States:**
- No loading state — this is a static, unauthenticated landing screen.
- `showSignIn` (the `/?signin=1` sign-in form, `SignInForm`): this shares
  `home-screen.tsx` and `Screen`'s `glow` wrapper with Welcome, so it
  unavoidably inherits the base token refresh (paper/ink/accent colors,
  ambient glow — it already has `glow` today). **Scope note, not a product
  decision:** don't add Welcome-specific elements to it (Miso art, the new
  paw-print texture) — the canvas's dedicated "sign back in" treatment
  (options 2m/2n) is explicitly deferred (non-goals list). Its own bespoke
  restyle is a later slice; today it just rides along on shared tokens,
  same as it already does.
- Error state (bad/empty email, auth error): unchanged — existing
  `friendlyAuthError` copy in terracotta text under the field.

## 3. Create a trip (`src/app/trip/new/page.tsx`)

AC5: form fields, validation, and submit are unchanged — visual-only.

**Layout** (canvas 2k, near-identical to what's shipped today):
- Sticky blurred nav: close (X) + **"New trip"** — promote today's
  plain `TopBar` row to sticky/blurred.
- **Miso cameo (AC13)** — see below, sits between the nav and the headline.
- Headline **"What are we calling it?"** — unchanged.
- Fields: **Trip name**, **Location — optional**, **Dates** (Start/End
  card with day-count summary), **Your name — how others on the trip will
  see you** — all unchanged, `Field`/`Card` restyle only.
- Planner note chip ("You'll be the trip's planner — you invite people and
  you decide when the trip is complete.") — unchanged copy, terracotta-soft
  chip fill (already matches).
- Primary action: **"Create trip"** — convert from full-width `BottomBar`
  button to the floating capsule (§1).

**Miso placement (AC13) — new, no canvas reference for this screen.**
Option 2k is Miso-free in the canvas (checked both warm-paper and
dark-glass variants), so this is a new placement, built from Welcome's own
materials (§2) rather than a new visual language, but shrunk down — this
is a form screen, not a landing page:

- A miniature version of Welcome's "photo tucked in a small white card"
  treatment: the same `miso-welcome.jpg` face-crop, ~28px square, in a
  white `rounded-[10px]` frame with ~4px padding and `shadow-card-sm`,
  tilted slightly (~-6°). Sits in its own small row directly below the nav
  and above the headline, left-aligned — not absolutely positioned over
  anything, so it can't overlap the headline or fields at any viewport
  width.
- Paired with a compact version of Welcome's speech-bubble treatment: a
  small white `rounded-[14px] rounded-bl-[3px]` pill next to it, one short
  static line — not data-bound (there's no trip name or member count yet):
  **"New trip? Let's get counting."**
- Frequency: this is seen once per trip a user creates, not on every visit
  to a screen the way The trip's main view is (see §4's flag on that
  point) — a one-time greeting, no repetition-fatigue concern here.
- Scope check: purely an added row above the existing headline; doesn't
  touch the form fields, validation, or submit below it (AC5 intact).

**States:**
- Submitting: existing **"Creating…"** label, spinner-free (button text
  swap, as today) — unchanged.
- Validation error: existing **"Trip name and your name are both
  required."** — unchanged, terracotta text.
- Submit failure: existing **"Couldn't create the trip — try again."** —
  unchanged.
- No empty/loading state applicable (it's a form, not a data view). The
  Miso cameo doesn't vary by state — it's static, shown identically
  whenever the form is shown.

## 4. The trip — main view (`src/app/trip/[id]/page.tsx`)

AC6: existing data (expenses, balances, members, hide-until-verified
organizer gating) renders and behaves exactly as today — visual-only.

**Layout** (canvas 2c, matches what's shipped today almost exactly):
- Sticky blurred nav: back chevron, trip name, action icons
  (invite/roster, new-trip, feedback, verified-owner actions) — promote
  today's plain inline header row to sticky/blurred, content (the stats
  card, tabs, expense list) scrolls under it. **Deliberately not** where
  Miso goes (see below) — this row is already four icon-buttons deep, and
  a static image sitting among tappable icons would read as a fifth,
  non-functional button.
- Trip stats card: unchanged — trip badge/locked badge, name, avatar
  stack, "Total so far" / "Avg / person", "You've paid so far" / "You'd
  owe" — restyle only. No persistent Miso element here (see decision below).
- Expenses/Details tab switch — unchanged.
- Expense list rows — unchanged (avatar, description, payer + date,
  amount, edit affordance on your own rows).
- Primary action: **"Add an expense"** — convert from full-width
  `BottomBar` button to the floating capsule (§1). This is also the sheet's
  entry point (AC7).

**Miso placement (AC13) — new, no canvas reference for this screen.**
Option 2c is Miso-free in the canvas (checked both variants). This screen
is the most data-dense of the four (a financial summary card, tabs, a
scrolling list) — not a place for a hero treatment, and not a place to put
Miso inside anything that displays real numbers.

**Decided (user, post-Checkpoint 3): empty-state only, no persistent
element.** The persistent-corner-sticker option originally proposed here
was flagged as a real product-feel call rather than decided unilaterally —
the user confirmed the lighter reading of AC13 ("Miso genuinely present in
this flow," not "rendered on literally every view"). So this screen's only
Miso placement is in the empty state: when there are zero expenses (today's
plain "No expenses logged yet." line), pair a small cameo (~24px image,
plain circular crop with a thin white ring — matching `Avatar`'s existing
`ring` prop) with updated copy: **"No expenses logged yet — Miso's ready
when you are."** This leans on an instinct the canvas's own author already
reached for elsewhere — Miso appears in the All-trips empty state (options
2ac/2ad), and the design-import file's own closing notes suggest trying
"Miso in the empty states too" — so this stays inside the canvas's own
design language rather than inventing a new one. Once a trip has real
expenses, this screen renders with **no Miso element at all** — the
common, high-frequency case stays clean.

**States** (all pre-existing, restyle only except where AC13 adds Miso,
per non-goals no new systemic pattern):
- Empty expenses: see Miso placement above — copy changes from
  **"No expenses logged yet."** to **"No expenses logged yet — Miso's
  ready when you are."**; restyle container only otherwise.
- Trip locked (organizer already settled up): existing muted button
  copy **"Trip is locked — no more expenses"** in place of the primary
  capsule — unchanged, just picks up the new muted-capsule material instead
  of the flat `BottomBar` muted button. No Miso element in this state
  (it's not the empty-expenses state).
- No session / can't load detail tier: existing `TripSummaryOnly` fallback
  card ("Trip summary", "Want the full expense list? … See full details")
  — unchanged, restyle only. **No Miso on this fallback card** — it's a
  distinct card shape shown to a visitor without full access (not the same
  stats `Card` the sticker would anchor to), and extending AC13 to it
  wasn't asked for. Flagging this exclusion explicitly rather than quietly
  growing scope; happy to add it in a follow-up if wanted.
- Trip not found at all: existing **"Couldn't load this trip — you may not
  be on it."** — unchanged, no Miso (there's no trip to attach a sticker
  to).

## 5. Add an expense — page → overlay sheet (`src/app/trip/[id]/add-expense/page.tsx`)

AC7–AC12. This is the one screen with a real interaction change, not just
material. Routing/history mechanics are the architect's call (AC11) — this
section describes what it looks and feels like.

### 5.1 Opening (in-app, from The trip)

Trigger: tapping the floating **"Add an expense"** capsule on the trip view.

1. The trip view behind starts easing toward a dimmed, blurred, slightly
   scaled-down resting state at the same time the sheet eases up — these
   aren't sequential (dim-then-sheet), they're one motion. Canvas values as
   a reference: background blurs ~3px, scales to ~96.5%, dims under a dark
   scrim (~22% ink), while the sheet springs up from the bottom on a
   spring-ish easing curve (canvas: `cubic-bezier(.22,.9,.28,1)`, ~0.5–0.7s).
2. **Mid-transition**, at any point, you should see: the trip view visibly
   receding (blurred/scaled/dimmed, not yet fully so) *behind* a sheet
   that's partway up from the bottom edge, its rounded top corners and drag
   handle already visible before it reaches rest. Nothing should pop in
   discontinuously — the dim and the sheet's position move together.
3. At rest: sheet fills from ~120px below the status bar to the bottom,
   rounded-28px top corners, frosted/translucent paper fill
   (`backdrop-filter: blur(34px) saturate(1.5)`), drag handle centered at
   top, trip view fully dimmed/blurred behind it.

### 5.2 Closing

Reverse of the above — sheet eases back down, background simultaneously
un-blurs/un-scales/un-dims, landing back on the plain, fully-interactive
trip view. Triggers: the existing close (X) affordance, tapping the dimmed
scrim outside the sheet, and (AC9) the browser back button when the sheet
was opened via in-app navigation.

**Decided (user, Checkpoint 2 follow-up):** no real swipe-to-dismiss drag
physics. The drag handle ships as a visual affordance only, signaling "this
is a sheet" — dismissal is via tap-the-scrim, the existing close (X), and
(AC9) the browser back button. This keeps the sheet within the approved
"restyle, not new mobile engineering" scope.

### 5.3 Opening via direct URL / refresh (AC8)

No prior "closed" moment for the user to have seen, so **recommend**: render
the sheet already at rest (open) with the trip view already dimmed behind
it — don't replay the spring-up entrance animation on a cold load. This is
a small perceptual-quality call, not a product one; flagging only so it
isn't assumed either way — confirm at the architect stage since it may
interact with how AC8's deep-link rendering is actually implemented.

### 5.4 Sheet content

Keep the sheet's actual form content as it exists today (AC10) — fields,
copy, validation, and submit are unchanged; only the container changes from
a full page to sheet chrome:

- Header row: **"Add an expense"** + close (X) — reuse today's `TopBar`
  pattern, just inside the sheet instead of a full page. Add an explicit
  `aria-label="Close"` to the close button while touching this file (not
  currently set) — small accessibility fix, low risk to bundle in.
- **Miso (AC13), in the header's trailing slot.** The canvas has no
  non-narrating Miso placement to copy here — its only appearance on this
  screen is the excluded per-person live-math callout ("Miso says that's
  $X each," options 2e/2f, excluded by AC12). Per AC12's own carve-out —
  if Miso appears here at all, "it must be doing/saying something else, or
  just present as a static presence" — this ships as pure static presence:
  the same face-crop, ~26px, in a plain circular frame with a thin white
  ring (matching `Avatar`'s existing `ring` treatment), placed in the
  `TopBar`'s trailing slot, opposite the close (X) — the side that's empty
  today. No caption, no text, `aria-hidden`. It sits in the header, nowhere
  near the amount field, the split summary pill, or any computed number,
  so there's no ambiguity with the excluded feature. Shown identically in
  both the normal and locked-trip renders of this header (same `TopBar`,
  same slot, both already render a header); not shown during the
  owner-gate-redirect branch, which renders no `TopBar` at all today and
  is typically instant — not worth adding chrome to a state that's meant
  to disappear immediately.
- Explanatory line (unchanged): *"Splits equally across everyone on the
  trip. You only log what **you** paid for."*
- Amount / What was it / Date fields (unchanged) inside a `Card`.
- Split summary pill (unchanged copy, e.g. *"Splits 6 ways" / "$206.67
  each"*) — **this already is the non-mascot version of the canvas's
  excluded row.** AC12 excludes the canvas's *Miso-narrated* version
  ("Miso says that's $X each") specifically; the shipped app's plain pill
  already satisfies "the existing split/amount UI is unaffected" — keep it
  exactly as-is, just restyle its container to the warm-paper material.
  **No Miso appears anywhere near this pill or the fields above it** — the
  only Miso on this screen is the header badge described above, which is
  spatially and functionally separate from the split math, satisfying
  AC12.
- Submit button: **"Add an expense"** (existing icon+label) — becomes the
  sheet's own bottom action, not a floating capsule (it's already inside a
  contained sheet, not the page-level primary action).

### 5.5 States (all pre-existing; restyle only)

- **Locked trip** (direct link or organizer settled it up mid-attempt):
  sheet still opens over the dimmed trip (satisfies AC8 — "not broken or
  blank"), showing the existing lock icon + **"This trip is locked — the
  organizer already settled it up, so no more expenses can be added."** —
  no form, no submit button. Header/close unchanged; the header's Miso
  badge (§5.4) still shows.
- **Owner-gate redirect** (unverified owner hit the URL directly): existing
  behavior redirects immediately; if anything must paint before that fires,
  keep today's plain **"Redirecting…"** text rather than inventing a
  skeleton (non-goals: no new systemic loading pattern this pass). No
  Miso here — there's no `TopBar` in this branch to attach it to.
- **Validation error**: existing **"Enter an amount, what it was for, and a
  valid date (today or earlier)."** — unchanged, terracotta text.
- **Submit failure**: existing **"Couldn't add that expense — try again."**
  — unchanged.
- **Submitting**: existing **"Adding…"** button-label swap — unchanged.

## 6. Decisions (resolved by the user, Checkpoint 2 follow-up)

All three items originally flagged in this section have been decided —
kept here as a record of the reasoning, not as open questions.

### 6.1 Miso placeholder art quality — resolved: tight face-crop stopgap

`public/images/miso-1.png` and `Miso-2.png` (the only Miso assets actually
in the repo right now) aren't merely lower-resolution versions of the
canvas's intended art — they're photorealistic, AI-generated "dog at a
desk" stock-style images, each with its own unrelated background text
baked in (a whiteboard reading "Group Trip Expenses" / a mug that says
"Accounts Paw-trol" in one; a whiteboard reading "Expense Reconciliation"
and a New York skyline in the other). Neither matches the flat,
simply-illustrated, single-character mascot implied by the canvas's small
thought-bubble treatment, and the incidental background text is legible
enough at hero size to read as confusing or off-brand rather than charming.

**Decided:** ship a tight crop of `miso-1.png`'s face/head for Welcome in
this slice (cropping out the whiteboard/mug/skyline background so the
mismatched text isn't part of what ships), over `Miso-2.png`, since
`miso-1.png`'s travel-themed background is at least thematically closer to
a trip-expense app. Swap in final flat-illustration art as a fast-follow
once it's re-exported through a path that isn't capped at the design-import
tool's 256KB read limit (see design-import README).

**Update (2026-09-18, AC13 revision):** this same face-crop (shipped as
`public/images/miso-welcome.jpg`) became the basis for Miso's placements
on Create-a-trip, The trip, and Add-an-expense (§3–§5 above) — always at
icon/sticker scale (~24–30px), never re-used at Welcome's larger hero size
anywhere else.

**Update (2026-09-18, asset swap):** after shipping, the user compared the
running app against the design and flagged the stopgap crop as visibly
different from intent. Re-checked the design-import project: the full
uncropped source art (`miso-wide.png`, `miso-face2.png`, `miso-face.png`,
`miso2-bust.png`) still exceeds the design-import tool's 256KB read cap and
remains unimportable. However, two **pre-cropped, already-circular avatar
derivatives** in the same project — `assets/miso-avatar.png` and
`assets/miso2-avatar.png`, both 240×240 with genuine alpha-transparent
corners (confirmed by pixel inspection, not just assumed) — imported
completely (173–184KB, under the cap) and have **no baked-in background
text** at all, unlike `miso-1.png`/`Miso-2.png`. User picked
`miso-avatar.png` (round glasses, red bandana, pencil) over `miso2-avatar.png`.
**This replaces `miso-welcome.jpg` everywhere it was used** (Welcome,
Create-a-trip, The trip empty state, Add-an-expense badge) — shipped as
`public/images/miso-avatar.png`. Being a true circular cutout (not a square
crop needing a border-radius mask), it drops cleanly into the existing
circular treatments (Trip-view avatar, Add-expense badge) as-is; for
Welcome's and Create-a-trip's square tilted-card treatment, the circular
image now sits centered in the white card rather than filling it edge-to-
edge — engineering's call on whether that still reads as intended or
whether the card should become circular too.

**Still true, not resolved by this swap:** this is still a photorealistic
AI-generated photo, not the flat, simply-illustrated mascot the canvas's
small thumbnail treatment implies — no asset in this design project
provides that. The user explicitly confirmed (when offered "neither, the
photorealistic style itself is the problem" as an option) that the two
avatar crops resolve their concern well enough to proceed; a genuine flat
illustration would require commissioning new art from scratch, which is
out of scope here.

**Update (2026-09-18, superseded by a separate concurrent session, then
explicitly re-affirmed by the user):** a second Claude Code session working
on this same repo in parallel independently swapped the asset again, this
time to `public/images/miso_01.jpg` — the **full, uncropped** AI stock photo
(not the cropped `miso-avatar.png` circular avatar above), shown at full
size on Welcome/Create-a-trip and even at 26px badge scale on Trip-view/
Add-expense. This reintroduces, at full visibility, exactly the problem
`compliance-report.md`'s original blocking finding was about: the source
photo has extensive legible baked-in text unrelated to the product
("Good Systems Better Outcomes," a "Today: Reconcile expenses…" notepad,
branded objects). When surfaced to the user, they explicitly chose to
**keep the full uncropped photo as shipped**, rather than reverting to the
cropped avatar or cropping out just the text — see
[`compliance-report.md`](../../reviews/security-compliance/features/ux-revamp/compliance-report.md) for the follow-up compliance
review of this specific decision. This section's earlier "resolved" framing
for the crop treatment no longer reflects what's actually shipping; treat
this update as the current state.

### 6.2 Sheet dismiss gesture scope — resolved: no drag physics

Covered in §5.2 above. **Decided:** tap-scrim/close-X/back-button only, no
real swipe-to-dismiss gesture engineering.

### 6.3 Welcome headline copy referencing Miso by name — resolved: adopt it

Covered in §2 above. **Decided:** adopt the canvas's Miso-voiced headline
("You have fun. Miso does the math.") as the new shipped copy.

## 7. Out of scope, restated

No changes to: Details/Settle-up screens, sign-back-in's own visual
treatment, trip-before-email-confirmed, edit-expense, invite-link-opening,
roster, feedback, All-trips (either state), any systemic loading-skeleton
or broken/dead-link pattern, or the All-trips cross-trip running-total
callout (excluded from the design language entirely, per AC14 — not to be
reintroduced anywhere later either). The `TripSummaryOnly` fallback card
(§4) also does not get a Miso placement in this pass — flagged there as an
explicit exclusion, not an oversight.
