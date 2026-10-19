# Design audit: `redesign-ui` — fresh comparison of implementation vs. design intent

Status: re-audit, post-fixes. Does not re-flag the three already-fixed items (card subtitle "N to
get", back-nav/"Trip" pill removal, blank-trip-as-dashed-tile) or anything QA's acceptance-criteria
checklist already verified line-by-line (nav bar component measurements, token-literal greps,
Settle up/Trip complete/Invite's nav-bar-only diff). Everything below was found by reading the
current implementation directly against the handoff
(`docs/features/Splitiful UX redesign engineering handoff.md`) and, where design.md is silent or
stale, against the handoff alone.

Ranked most → least visually significant.

## 1. Welcome (board T) now renders the full template-picker shelf — not in the handoff or design.md at all

`src/app/home-screen.tsx` lines 179–181: `WelcomeContent` renders `<TemplateShelf />` (the same
Camping/Airbnb/International/Blank-trip 2×2 grid shown on Home) between the paragraph and the
"Create your first trip" button.

- **Handoff** (`Screens` table, board T row, and the board-T layout description in "Brand and
  logo"): Welcome's content is circle, bubble, wordmark, headline, paragraph, two buttons, sign-in
  link. No template shelf anywhere on this board.
- **`design.md` §3** ("Layout, top to bottom", 8 numbered items): same list, no shelf, no mention
  of adding one.
- **Why it matters**: this is a structural addition, not a restyle choice — it duplicates content
  the user sees again one tap later on Home (board A), lengthens an unauthenticated landing screen
  that the handoff explicitly designed as short and decision-free, and was never called out as an
  intentional deviation anywhere in design.md's "Consistency with existing screens" reasoning or
  QA's report. If this was a deliberate late product call (e.g. "let people start a trip type pick
  straight from Welcome to cut a step"), it needs to be written down somewhere — right now it reads
  as copy-paste drift from Home's structure, not a decision.
- **Resolved (user decision, 2026-10-16): keep the shelf.** Not a bug — an intentional deviation
  from the handoff's board-T layout, letting a first-time visitor start a trip type pick directly
  from Welcome instead of landing on Home first. No engineering change needed for this item; not
  included in the fix pass below.

## 2. Page side padding is 20px everywhere, not the handoff's fixed 16px

`src/components/ui.tsx` line 71, `ScreenContent`: `px-5` = 20px. Every in-scope screen (Welcome,
Home, Home first-run, You, trip screens) is built on this one shared component, so this single
value is the side gutter on every restyled screen in the feature.

- **Handoff** ("Spacing and navigation" table): "Page side padding: 16 px" — explicitly "one scale
  ... use these values and nothing in between."
- **`design.md`**: never revisits `ScreenContent`'s padding at all; §1's inventory table lists
  `Screen`/`ScreenContent` as reused "as-is," silently carrying the pre-redesign 20px value forward
  rather than reconciling it against the handoff's 16px, the way §2 did explicitly for avatar size,
  nav-bar tint, and the hairline-strong divider.
- **Why it matters**: this is the widest-reaching single gap found — it's not a one-off tile, it's
  the base horizontal rhythm of literally every screen the feature touches, and it directly
  contradicts AC2's "no value observed outside the scale." QA's AC2 verdict ("Pass, by inspection")
  only checked the nav bar's own numbers, not `ScreenContent`'s padding, so this slipped through.

## 3. Gap under the trip summary card is 14px, not the handoff's 28px

`src/app/trip/[id]/page.tsx` line 402: a single `<div className="h-3.5" />` (14px) between
`InlineVerifyWidget` and `TripTabs`, directly under the closing of the summary `Card`.

- **Handoff**: "Gap under the summary card: 28 px" — its own named row in the spacing table,
  separate from "Gap between sections."
- **`design.md`**: §4.4 discusses the summary card's non-sticky behavior and icon placement in
  detail but never calls out this specific gap value, so nothing flagged it as "already handled" or
  "being changed" — it's a plain miss.
- **Why it matters**: visually, this is the gap most readers will notice first, since it's the seam
  right below the highest-detail card on the trip's most-visited screen; at half the spec'd value
  the card and the tab content underneath it currently read as crowded together rather than as two
  separate blocks.

## 4. List row vertical padding is 14px, not the handoff's 17px

`src/app/home-screen.tsx` line 72 (`TripRow`, Home's Ongoing/Completed lists) and
`src/app/you/page.tsx` lines 42/47 (Privacy/Terms rows): both use `py-3.5` = 14px.

- **Handoff**: "List row vertical padding: 17 px," listed as one of the fixed scale values.
- **`design.md`**: §4.1 discusses `TripRow`'s anatomy and divider strength at length but never
  reconciles this specific padding number against the handoff's 17px the way it did for the divider
  token — an oversight of the same kind, just smaller in visual impact than finding #3.
- **Why it matters**: smaller than #2/#3, but it's the same scale value repeated on every row of
  every list screen in the feature (Home's trip rows, You's two legal rows), so the shortfall is
  systemic rather than isolated.

## 5. Avatar is still 36px — design.md's own flagged "trivial" fix was never made

`src/components/ui.tsx` line 365, `Avatar`: `size = 36` default. `AvatarStack` (line 390) never
overrides it, and no call site anywhere (`TripSummaryOnly`, the trip page's own `AvatarStack`) passes
`size={34}`.

- **Handoff**: "Avatars are 34 px circles."
- **`design.md` §2**: explicitly names this exact gap — "avatars 34px (today: `Avatar` defaults to
  36px — a 2px reconciliation, trivial)" — i.e. design.md already did the comparison work and
  called out the fix needed, but the fix itself never landed in code.
- **Why it matters**: lowest visual stakes on this list (2px), but it's the one item here that isn't
  a fresh finding so much as a previously-identified, explicitly-flagged-as-easy fix that simply
  wasn't done — worth a one-line patch rather than a design discussion.

## 6. Section-label-to-content and between-section gaps are both short of the handoff's values

- `src/app/trips/page.tsx` lines 204/218 and `src/components/template-shelf.tsx` line 28: the gap
  from a `Kicker` section label down to its content card/grid is `h-2.5` (10px) in all three places.
  **Handoff**: "Section label to its content: 14 px."
- `src/app/trips/page.tsx` line 214: the gap between the Ongoing and Completed sections is
  `h-[26px]`. **Handoff**: "Gap between sections: 36 px (56 px above 'Suggested for this trip')."
- Neither value is discussed in design.md (§4.1 covers the count-copy convention and the divider
  token, not these two gaps).
- **Why it matters**: smallest-impact items on this list individually, but combined with #2–#4 above
  they show the spacing-scale adoption (AC2) was done carefully for the bottom nav bar specifically
  (which QA's new component test covers) and far less carefully for the page-level rhythm
  everywhere else — a pattern worth flagging to engineering as "re-check every spacer div against
  the scale," not five separate one-line tickets.

## Smaller/no-action notes (checked, not ranked as defects)

- **You screen's title isn't at the handoff's 28/600 "page title" scale.** `src/app/you/page.tsx`
  line 37 uses the shared `TopBar`'s default `text-[16px] font-semibold`. No other in-scope screen
  actually needs a bare page-title treatment (Home/Welcome use the wordmark; trip screens use the
  26px trip name), so this is the one place the handoff's "page title 28/600" scale value could
  apply and doesn't — worth a one-line confirmation with the user on whether "You" should pick it up
  or whether the existing shared-header convention is the intended, deliberate exception.
- **First-run "No trips yet" card's dog-plate fill (`#f5ecdc`) is a raw hex literal**
  (`src/app/trips/page.tsx` line 188), not a named token. It's correct per the handoff's own
  brand-and-logo table (a separate value from `logo-plate`'s `#fffaf1`), and AC1's token-literal grep
  check only covers the main Design-tokens table, so this isn't a token-system violation — just
  flagging that a second, un-named plate color now exists in the brand table with no semantic name,
  should a future screen need the same fill.
- **Wordmark/DogFace are still text/photo stand-ins** (`src/components/brand/wordmark.tsx`,
  `dog-face.tsx`) — already an open, acknowledged blocking dependency (requirements decision #2),
  not re-flagged here as new.
- **Trip screen's top/bottom scroll offsets (handoff: 44px top / 176px bottom) don't appear as
  literal values anywhere** (`pt-0.5` ≈ 2px top; no bottom-clearance spacer, unlike Home's explicit
  `h-[72px]`) — but the bottom nav bar and CTA capsule are laid out as in-flow sticky siblings after
  the scroll content, not fixed overlays, so nothing actually hides behind them the way the handoff's
  176px clearance exists to prevent. This reads as an intentional, different-but-equivalent layout
  architecture rather than a miss — flagging only so engineering doesn't "fix" it by literally adding
  a 176px spacer that isn't needed under this architecture, and so the user can confirm that's the
  intended reading.

## What was *not* re-checked here

Per scope: the bottom nav bar's own pixel geometry (56×3px line, 24px icons, 11px labels, 8/20px bar
padding, 52px tab height) — QA's `bottom-nav-bar.qa.test.tsx` and this audit's read of
`src/components/bottom-nav-bar.tsx` both confirm the literal values match; the Settle
up/Trip-complete/Invite nav-bar-only diff; the token-literal grep (AC1); and the three
already-fixed items named in the task brief.
