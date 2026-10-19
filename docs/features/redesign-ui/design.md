# Design: Splitiful UX redesign — UI restyle (`redesign-ui`)

Status: draft, for architect/engineering handoff. Scope is `docs/features/redesign-ui/requirements.md`
(18 acceptance criteria, approved; **dark mode is out of scope for this pass** — user decision,
2026-10-16, requirements decision #6 — deferred to a future feature). Visual reference is the
engineering handoff doc (`../Splitiful UX redesign engineering handoff.md`) since the design canvas
itself isn't available to this agent — per the handoff's own rule ("build from the canvas, not from this
text, wherever the two differ"), anywhere this text is ambiguous is flagged below rather than guessed.

**Light theme only, this pass.** Every token below is specified as a semantic name with its light value
only, so a future dark-mode feature can add a dark value per token without renaming or restructuring
anything here — but no dark value, dark asset variant, or dark-mode state is specified in this document.

**Brand mark superseded twice, 2026-10-16 — current source of truth is `requirements.md`'s "Brand and
logo" scope item, not this file or `brand-lockup-s.md`.** Sequence: board T (below) → board S's small
unified `BrandRow` on all three placements (`brand-lockup-s.md`) → a live-feedback correction that
reverted Welcome and Home's title back toward board T's original scale and composition while keeping
only the first-run card on the small `BrandRow`. Concretely, as shipped:
- **Welcome**: a bespoke composition, NOT `BrandRow` — a ~196×196px rounded-square "sticker card"
  (board S's housing shape) at board T's original prominence, with the dog face at its original
  164×121px and the "Divide by 6?" speech bubble restored (board S2's title confirms the bubble is
  part of base Idea C), plus a separate 150×42px wordmark line below. Neither §3 below (board T's
  circle) nor `brand-lockup-s.md`'s small 44px tile (board S's first draft) is what's built.
- **Home title**: wordmark-only, like board T's original rule, but at 150×42px (not 112×31px — user:
  "way too small"). No dog icon here, unlike `brand-lockup-s.md`'s `"compact"` `BrandRow`.
- **Home first-run card**: unchanged from the board-S pass — still the small `BrandRow size="compact"`
  (icon + wordmark). The only placement where `brand-lockup-s.md` is still accurate.
`brand-lockup-s.md` itself now carries the same superseded note for Welcome/Home-title. §3 and
§4.1/§4.2 below are left as-written for historical context (layout order, copy, states, responsive
behavior outside the brand mark still apply) but their brand-mark bullets, and `brand-lockup-s.md`'s,
are both stale for two of the three placements.

## 0. Before anything else: two scope gaps the requirements doc assumes away

Read end-to-end, the actual shipped code (`src/app/**`, `src/components/ui.tsx`) does not have the
navigational structure the requirements describe restyling. Both are now resolved (coordinator decision
below); keeping the finding here so the architect understands *why* this is a new build, not a repaint:

1. **There is no persistent bottom tab bar today, anywhere.** What exists:
   - `/trips` (Home): a `FabBar` with one floating "New trip" pill — not a 3-tab bar.
   - Inside a trip: a `TabSwitch` *segmented control* (Expenses / Details / List) inline in the scrolling
     content, plus a `BottomBar` holding one contextual capsule button ("Add an expense"/"Add an item"),
     plus a back-chevron `IconLinkButton` in the `TopBar` that returns to `/trips`.
   - Settle up / Invite / Trip complete: a `BottomBar` with a single full-width action button (`Trip
     complete`, `Go to the trip`), no tabs at all.
   - There is no "Trips" tab, no "New trip" tab, no "You" tab anywhere — none of the three tab *sets* the
     handoff describes (Home/You: Trips, New trip, You · in-trip: Trips, Expenses, Details, List) exist as
     persistent chrome.
   **Resolved**: the new unified bottom bar (§5) **replaces** `FabBar`, `TabSwitch`, and `BottomBar`
   outright — it is a new shared component, not a restyle of any of the three. §5 specifies its full
   contract on that basis.
2. **There is no "You" screen at all.** Privacy/Terms today are two links (`LegalLinks`) rendered inline
   at the bottom of `/trips` and of the Welcome screen's content — not a distinct account page, and there
   is no account/profile content (display name, sign-out, etc.) anywhere in the app. **Resolved**: this
   ships as a new screen (§4.6), in scope for this feature. It is a real, small navigation change — moving
   Privacy/Terms off `/trips` and the Welcome screen into their own destination — not a pure visual
   restyle, even though it's small enough to easily read as one. Architecture and engineering should treat
   it as adding a route and relocating two existing links' destination, not as a no-op.

Everything below designs against the handoff's intent on that basis.

## 1. Inventory — what's reused, verbatim, from `src/components/ui.tsx`

Convention checklist built before designing anything new, and the specific primitive each screen below
reuses:

| Existing pattern | Where it already lives | Reused for |
|---|---|---|
| `Screen` with `glow`/`texture` props | ui.tsx | Every in-scope screen keeps `glow`/`texture`; token values swap under it, markup doesn't change |
| `Card` (22px radius, `shadow-card`) | ui.tsx | Summary card, template tiles' outer frame, roster/placeholder rows, "No trips yet" card |
| `Kicker` / `Kicker canvas` | ui.tsx | Section labels ("Ongoing", "Completed", "Start from a template") — already has the exact tone/leading board A/L/C want |
| `TopBar` (`sticky` prop) | ui.tsx | Welcome has none (per canvas); Home/trip/You use the same component, not a bespoke header |
| `Divider` | ui.tsx | Home row dividers — AC9 asks for *stronger* contrast; see §2.2 for the token-level fix, not a new component |
| `AvatarStack` / `Avatar` | ui.tsx | Summary card people, roster |
| `Button` / `LinkButton` variants (`capsule`, `fab`, `accent`, `soft`, `ghost`) | ui.tsx | All primary actions — the handoff's "primary button" token slots into the existing `primary`/`accent` variant, not a new one |
| `ScreenLoading` / `ScreenError` | ui.tsx | Every loading/error state below reuses these two, not bespoke copy-and-spinner markup per screen |
| `LockedNotice` / `LockedNoticeInline` | ui.tsx | Any "trip is locked" messaging this feature touches — already extracted (2026-09-30 consistency review) specifically because it used to be duplicated three ways; nothing here should recreate a fourth copy |
| `TemplateShelf` / `TemplateTile` | components/ | Home + Home first-run shelf — unchanged behavior, token-only restyle |
| `LegalLinks` | legal-page.tsx | Reused *inside* the new You screen (§4.6) rather than rebuilt — same component, new destination |

No screen below invents a bespoke card/row/section-header shape where one of the above already exists.
Where a genuine new shape is needed (the bottom bar itself; the dog-mark/wordmark lockups — see
`brand-lockup-s.md` for the brand mark's actual current shape), it's called out explicitly as new,
because the handoff explicitly adds it and no existing primitive covers it.

## 2. Design tokens and type — how the new table lands on the existing one, light values only

The existing `globals.css` is light-only today, and stays light-only through this feature. This feature
formalizes a *semantic* token layer (named roles like `background`/`text`/`accent` rather than today's
mix of named and inline `rgba()`/`oklch()` utility values) so a future dark-mode feature can attach dark
values to each name later without a rewrite — but no dark value is specified here.

Mapping (old token/utility → new semantic name, light value only):

| Old token/utility | New semantic name | Light value | Notes |
|---|---|---|---|
| `--color-paper` | `background` | `#f5f0e6` (unchanged) | |
| `--color-ink` | `text` | `#231c12` (unchanged) | |
| *(new name for an existing value)* | `text-muted` | `rgba(35,28,18,.74)` | Today's `Kicker canvas` tone (`ink 74%`) already matches this value — rename, don't re-tune |
| *(new name for an existing value)* | `text-faint` | `rgba(35,28,18,.68)` | Matches today's generic `ink/[0.68]` utility already used for hints/captions |
| `--color-card` | `card` | `#ffffff` (unchanged) | |
| *(new, light value)* | `card-border` | `transparent` | No light-mode card border exists today; keep it `transparent` — this token exists now purely so a future dark pass has a name to attach a value to, not because light mode needs one |
| *(derived from `.border-ink/[0.15]` and `/[0.08]` usages)* | `hairline` | `rgba(35,28,18,.08)` | Generic cross-screen hairline (nav border, generic card dividers) |
| *(derived from today's `TripRow` divider)* | `hairline-strong` | `rgba(35,28,18,.15)` | **AC9 note:** today's Home row divider is already `border-ink/[0.15]`, above the handoff's plain `.08` hairline value. Don't regress it down to `.08` chasing the token name — AC9 asks for a *stronger* divider than today's, and `.15` is the stronger one; give it its own named token rather than losing the distinction. |
| `--color-accent` | `accent` | `oklch(0.45 0.09 80)` (unchanged) | |
| `--color-accent-ink` | `accent-text` | `oklch(0.42 0.08 80)` (unchanged) | |
| *(new)* | `on-accent` | `#ffffff` | |
| `--color-accent-soft` | `chip-fill` | `oklch(0.95 0.04 88)` (unchanged) | |
| *(new name for an existing value)* | `tint` | `rgba(35,28,18,.05)` | Matches today's `bg-ink/[0.05]` utility already used for input fills — rename, don't re-tune |
| `--surface-capsule` (ink 86%) / today's plain `bg-ink text-white` `primary` button | `primary-button` | handoff: `rgba(35,28,18,.9)` | **Flag:** today's floating-capsule fill is ink-86%; the handoff's token is ink-90%. A 4-point difference — architect/engineer's call whether to fold the capsule into this one token or keep `--surface-capsule` distinct, since the capsule is blurred/translucent and the handoff's "primary button" entry describes a flat fill. Don't silently pick one; the handoff doesn't disambiguate "primary button" (flat) from the capsule (blurred) as two different things even though the app currently ships both. |
| `--surface-nav` | `nav-bar` | handoff: `rgba(245,240,230,.72)` | Today's value is paper-78%; handoff wants 72%. Small, update to match. |
| *(new)* | `brand-brown` | `#4a2d22` | New — wordmark only |
| *(new)* | `logo-plate` | `#fffaf1` | **Stale under board S** — this token backed board T's Welcome circle, which board S removes (see `brand-lockup-s.md` §3). Keep the token defined (harmless, named) but nothing in the current brand design references it anymore. |

**Balance colors** (`--color-balance-positive`/`-negative`, used on Home's `BalanceLabel` and the trip
page's "up/down" text): keep as-is, light values unchanged. No dark counterpart needed or specified this
pass.

**Type scale and shape**: adopt verbatim — page title 28/600, trip name 26 (see §4.4 — this replaces
today's shipped 32px; the 32px is the thing being changed, not a conflict to preserve), summary numbers
24/17, Welcome headline 40/600 (-0.035em tracking, matches today's existing `text-display` `-0.03em`
closely enough to fold in, not stack a second tracking value), list row title 15/600 (already exactly
what `TripRow` ships today), subtitle 12, section label 10.5 uppercase (already `text-kicker`'s exact
value — no change needed there at all). Shape: card radius 22px (already `--radius-card`, no change),
template tiles 20px (today: `--radius-chip` 20px, already correct), trip icon tiles 14px (today:
`--radius-tile` 14px, already correct), avatars 34px (today: `Avatar` defaults to 36px — a 2px
reconciliation, trivial). **Brand-mark sticker-card radius (10px) is a separate, smaller value** —
see `brand-lockup-s.md` §1 — reused from the pre-redesign Miso cameo, not from this shape scale.

## 3. Welcome (board T)

**Brand mark superseded — see note at top of this document.** Steps 2–4 below (cream circle, speech
bubble, wordmark-alone) describe board T and are no longer what ships; `brand-lockup-s.md` §3 is the
current spec for Welcome's brand row. Everything else in this section (entry/flow, headline, paragraph,
buttons, stat-chip removal, states, responsive notes for the non-brand content) is unchanged and still
applies.

### Entry and flow
Unauthenticated visitor to `/` with no `signin=1` param and no session (or an anonymous session with zero
trips) lands here. Unchanged behavior per requirements item 4/AC8 — only the visual shell changes.

### Layout, top to bottom
1. **Status bar stays legible** (AC8) — ~~the cream circle (`logo-plate` token, `#fffaf1`) sits behind the
   status bar area, so status-bar text has a consistent light backing to read dark against~~. **Stale
   under board S** (no circle exists to back the status bar anymore) — see `brand-lockup-s.md` §3's
   flag that this AC needs a rewrite.
2. ~~Cream circle, 244px, bleeding off the top-right corner, dog face 164×121px inside it, `logo-plate`
   fill.~~ **Superseded** — replaced by the board-S brand row (`brand-lockup-s.md` §2/§3).
3. ~~Speech bubble "Divide by 6?"~~ **Removed under board S** — no speech bubble ships; see
   `brand-lockup-s.md` §3.
4. ~~Wordmark, 150×42px, left-aligned, `brand-brown` (#4a2d22), alone.~~ **Superseded** — the wordmark
   still renders at 150×42px, `brand-brown`, never stretched, but now as part of the brand row (icon tile
   + wordmark) per `brand-lockup-s.md` §2, not as a standalone element.
5. Headline (unchanged copy, decision #1): **"You have fun.\nMiso does the math."** — 40/600,
   -0.035em tracking.
6. Paragraph (unchanged copy): **"Add what you spend. Miso works out who owes who — no account needed to
   start."**
7. Buttons: **"Create your first trip"** (56px, `primary`/`accent` variant), **"I have an invite link"**
   (52px, glass/`soft` variant), **"Already have a trip? Sign in"** (ghost link).
8. **The two stat chips ("∞ expenses a day" / "0 accounts to join") are removed** — requirements item 4
   and AC8 both say so explicitly. This is a real content removal, not just a restyle; flagging only so
   it isn't missed as "oh, just restyle those too" — they're gone, full stop. Still true under board S;
   unaffected by the brand-mark swap.

### States
- **No loading state** — static, unauthenticated landing screen, same as today.
- **Error state**: N/A — this screen makes no network call on render.
- **`signin=1` variant**: out of this screen's board (it's board-T-adjacent, not board T itself per the
  handoff's table — "Welcome (unlettered), superseded by T" covers the no-Miso welcome, and the sign-in
  form was never on the canvas at all). Per the existing `ux-revamp/design.md`'s own scope note on this
  exact page (§2, "Scope note, not a product decision"), carry the same rule forward: the sign-in form
  rides along on the shared token refresh (background/text/card tokens) but gets none of the brand row's
  elements either — its own dedicated restyle is not in this pass.

### Responsive — 390px / 320px
- ~~Circle (244px) at 320px viewport width extends well past center...~~ **Moot under board S** — no
  circle, no bleed geometry to check; see `brand-lockup-s.md` §3's note that this simplifies the
  responsive check list for this screen.
- Headline at 320px: two short lines already; no truncation risk at 40px/-0.035em across ~280px of
  available width for either line ("You have fun." / "Miso does the math.").
- Buttons: 56px/52px heights already clear the 40px tap-target minimum (AC17) with margin.
- Paragraph is capped at a `max-w` (today: 290px) — keep that cap; it previously existed to keep the line
  from reaching under the circle — under board S there's no circle to clear, but the cap is still a
  reasonable line-length constraint and there's no reason to remove it.

## 4. Home, Home first-run, New trip, Trip screens, You

### 4.1 Home (board A) — `/trips`

**Brand mark superseded** — the "wordmark title (112×31px, `brand-brown`, replacing today's plain
'Trips' h1 — AC4)" bullet below described board T, where Home's title was wordmark-only (no dog mark).
Board S changes this: see `brand-lockup-s.md` §4 — Home's title now renders the same icon-tile +
wordmark brand row as Welcome (smaller size), which is a real content change from AC4's "no dog mark next
to the title," flagged there, not here.

**Default state**: `TopBar` with ~~wordmark title (112×31px, `brand-brown`, replacing today's plain
"Trips" `text-display` h1 — AC4)~~ **brand row (sticker-card icon + 112×31px wordmark, per
`brand-lockup-s.md` §2/§4)**, Feedback icon trailing (unchanged). `TemplateShelf` (unchanged behavior,
token restyle only). Then Ongoing/Completed sections, each a `Kicker canvas` label *with a count
appended* — new copy pattern, e.g. **"Ongoing (2)"** / **"Completed (1)"** — the handoff says "counts in
the section label" but doesn't give exact punctuation; parens is the lowest-ambiguity reading and matches
how `AvatarStack`'s own "N people" pattern already reads elsewhere in this app, so it's consistent with an
existing count-copy convention rather than inventing a new one. Each `TripRow`'s existing anatomy (icon
tile, name, dates · people · items-or-total, balance or Locked pill) is kept — AC9 asks for restyled row
anatomy, not new anatomy. Row divider: use the new `hairline-strong` token (§2) — today's `.15` is already
the "stronger" version AC9 wants; don't weaken it chasing the handoff's plain `.08` hairline token.

**Loading**: no client-side loading state exists today (this is a Server Component awaited before paint)
— keep that; there's no spinner/skeleton to design here, consistent with this feature's "restyle, don't
add a systemic loading pattern" posture (mirrors `ux-revamp/design.md`'s identical non-goal).

**Empty state**: zero trips → see §4.2 (Home first-run is the empty state of this same route, not a
separate URL).

**Error state** (today: `error = "Couldn't load your trips."` rendered as a plain terracotta line in
place of the trip lists, shelf still shown): keep this exact copy and placement, restyle only — token
swap (`terracotta` stays a named token) and nothing else. No retry action exists today; not adding one
here either (out of scope — this pass restyles, it doesn't add recovery affordances the handoff didn't
ask for).

**Responsive — 390/320px**: Row's existing two-line-vs-three-line logic ("balance moves to a third line
below 360px") is unchanged behavior (confirmed in `trips/page.tsx`'s own comment) — just confirm the new
count-bearing kicker text ("Completed (1)") doesn't wrap at 320px; at 10.5px uppercase it's short enough
that it won't, but flag it as the one new string on this screen worth a narrow-width check specifically.

### 4.2 Home first-run (board L)

**Brand mark superseded** — the dog-in-64px-circle badge described below is board T's treatment.
`brand-lockup-s.md` §4 replaces it with the same sticker-card tile used everywhere else the dog mark
appears (icon only, no wordmark repeated in this card — see that section's reasoning).

Same shelf (unchanged). Below it, **one `Card`** (reuse — not a new empty-state shape):
- ~~Dog mark, 46px wide inside a 64px circle, `#f5ecdc` plate fill~~ **Superseded** — sticker-card tile
  (10px radius, `card` fill, `shadow-card-sm`) per `brand-lockup-s.md` §1/§4, sized ~48×48px, dog-face
  icon only.
- Copy, verbatim from the handoff — do not paraphrase:
  **"No trips yet"**
  **"Splitiful is ready when you are. Pick a template above, or start a blank trip."**
- No Ongoing/Completed sections render at all (AC10) — not "render but empty," genuinely absent, matching
  today's existing `trips.length === 0` branch structure (`trips/page.tsx` lines 177–186) which already
  does exactly this; only the card's internal content (dog mark added, copy already present verbatim
  today) changes.

**Responsive**: card already center-text, fixed internal padding — no risk at 320px; the longer line
("Splitiful is ready when you are...") is the one to check doesn't wrap awkwardly mid-word at 320px (it
shouldn't, at 13px in a card with `px-5`).

### 4.3 New trip (board B)

Picker and form chrome restyle only (AC11) — existing field order (type picker → name → location →
dates → your name) and validation are explicitly unchanged. Reuse: `Tile` component's existing
checked/unchecked treatment (border + `accent-soft` fill) maps directly onto the new `accent`/`chip-fill`
tokens with no structural change. `Field`'s label/hint/input anatomy is unchanged — this screen needs no
new container.

**States**: unchanged from today (`Creating…` submitting label, existing validation/submit-failure copy)
— restyle only, per AC11.

**Responsive**: the 2-column type-tile grid (`grid-cols-2`) already reflows correctly at 320px (tiles are
`minmax(0,1fr)`-sized); no change needed, just confirm the restyled tile's new token-driven border/fill
doesn't need a minimum width that breaks this.

### 4.4 Trip screens / summary card (board C)

**The headline behavior change in this screen, AC12**: the summary card **stops being sticky** and
scrolls away with the page. Today's `TopBar sticky` (the "Your trip" back-chevron row) stays sticky —
that's unchanged; only the big `Card` below it (trip name, dates, avatars, totals, "you've paid"/"you'd
owe") loses its current non-sticky-but-directly-under-a-sticky-bar position and becomes an ordinary
scrolling block, per the handoff's "it scrolls away; nothing sticks" (§"Screens" table, board C row).
Concretely: today's markup already has the summary `Card` as a plain, non-sticky sibling of `TopBar`
inside `ScreenContent` — so this AC is **already satisfied by the current DOM structure**; nothing
needs to change structurally, only the token/spacing restyle. Worth confirming explicitly in case an
engineer assumes AC12 implies new scroll-behavior code: it doesn't, the card was never sticky.

Settle up/Invite icon links: new to this pass structurally only in placement — currently these live as
`VerifiedActionIcons` in the `TopBar`'s trailing slot, not inside the summary card itself. The handoff's
board C puts them "on the right" of the summary card's own trip-name row. **Open question for
architect/engineer** (not resolved here): moving them from the `TopBar` into the `Card` is a layout change
beyond "restyle the existing card," since it relocates existing icon-buttons across two different
containers (`TopBar.trailing` → inside `Card`). Recommend following the handoff here (it's explicit about
icon placement for this specific board), but calling it out since requirements item 4's board-C bullet
doesn't separately flag it as a structural move the way this section now is.

List and merged suggestions below the summary card: token/spacing restyle only, existing `TabSwitch`
(Expenses/Details/List) and `ShoppingListTab`'s suggestion-chip pattern unchanged structurally — note,
though, that `TabSwitch`'s *role* changes per §5: the Expenses/Details/List selection moves into the new
bottom bar's in-trip tab set, so this inline segmented control is being replaced, not just restyled
alongside the bar.

**States** — all pre-existing, restyle only:
- Empty expenses ("No expenses logged yet.") — unchanged copy, token restyle.
- Trip locked — existing `LockedNotice`/muted-capsule pattern, unchanged.
- `TripSummaryOnly` fallback (visitor without full access) — restyle only; same card/kicker/divider
  primitives it already uses.
- "Couldn't load this trip" / `RemovedFromTripScreen` — restyle only.

**Responsive — 390/320px, specifically the summary card**: trip name moves from today's shipped
`text-display text-[32px]` to the handoff's **26px** — resolved: build 26px; the 32px currently shipping
is the thing being changed by this feature, not a value to preserve. At 26px, a long trip name (e.g.
"Grandma's 80th Birthday Extravaganza Weekend") wraps to two lines rather than truncating — recommend
**wrap, not truncate**, consistent with `TripRow`'s own `[overflow-wrap:anywhere]` choice on Home (§4.1)
rather than introducing a truncation pattern nowhere else in the app uses for a trip name. Dates beneath
the name: single line, truncate with ellipsis is acceptable here only because the date-range formatter
(`formatDateRange`) already produces a short, bounded string — never a user-typed field.

**Miso cameo removal**: `ux-revamp/design.md`'s existing Miso-photo cameos on this screen (the
empty-expenses-state face badge, §4 of that doc) and on New-trip (§3 of that doc) are **removed** as part
of this feature — the new flat dog-face mark is the only brand mark going forward; no mixed-mascot state
ships. See §7 for the full cross-reference.

### 4.5 Settle up, Trip complete, Invite — content/layout untouched, nav bar only

Per the explicit product decision, no new header card, status card, or any other visual element from the
handoff is designed here. The only change on these three screens is their bottom chrome: each currently
has a single contextual action (Settle up: "Trip complete" button + organizer caption; Trip complete:
"Trip completed"/"Create a new trip" buttons; Invite: "Go to the trip" button), rendered in today's plain
`BottomBar`. **Resolved**: these three screens do **not** gain a tab set. Their existing single action
stays exactly as-is, content- and behavior-wise, just re-wrapped in the new unified bar's visual shell —
same height, padding, blur, and hairline-top-border treatment as every other instance of the bar (§5) —
with the one existing action button/caption as its only content. This satisfies AC14's "pixel-for-pixel
unchanged... content/layout" while still picking up "the new unified bottom bar" per item 5, since the
bar's defining visual traits (translucent blur, hairline border, bar height/padding) apply even when it's
carrying one action instead of a tab set.

### 4.6 You (board O) — new screen, not in the current app

Per §0 item 2, this doesn't exist yet and is in scope as a new screen — a real, small navigation change
(a new route, and Privacy/Terms moving here from `/trips` and Welcome), not a pure visual restyle, even
though its content is minimal:

- `TopBar` (non-sticky, short page), title **"You"**.
- A `Card` with a basic identity row (display name — reuse `NamePromptForm`'s existing editable-name
  pattern if a name isn't set, otherwise just show it; no new account-settings behavior is being
  designed here, since requirements item 4's board-O bullet is explicit that this is "account page
  restyled," not "account page gains new settings").
- **Privacy** and **Terms** rows — reuse `LegalLinks`' two links, promoted to look like list rows (reuse
  the same row anatomy as `TripRow`/roster rows: label + chevron, `Card` wrapper, `Divider` between) rather
  than the centered small-text link pair they are today, since "remain present as rows" (AC13's language)
  implies row-shaped, not centered-link-shaped.
- No sign-out action is specified by the handoff's board-O description ("Account, plus Privacy and Terms
  as rows") — not adding one silently; if the product wants sign-out reachable from here, that's a product
  decision to make explicitly, not an inference from "account page."

**States**: static page, no loading/error state (same reasoning as Welcome — no network call to fail).

**Responsive**: trivial — two short link rows and an identity row, no risk at 320px.

## 5. The unified bottom bar — shared component contract

Specified once; every consumer points at this same contract. **This is a new shared component that
replaces `FabBar`, `TabSwitch`, and the single-action `BottomBar`** (§0 item 1) — not a restyle layered on
top of any of the three.

**Structure** (per handoff "Spacing and navigation" section, adopted verbatim, light values only):
- Container: `position: fixed` (or `sticky bottom-0`, architect's call), full width capped at the app's
  existing `max-w-md` column (matching `FabBar`'s existing centering behavior so it doesn't go
  full-viewport-width on a wide browser window).
- Fill: `nav-bar` token (`rgba(245,240,230,.72)`), `backdrop-filter: blur(16px)`, hairline top border
  (`hairline` token).
- Padding: 8px top, 20px bottom (plus `env(safe-area-inset-bottom)`, matching today's existing
  `BottomBar`'s safe-area handling — don't drop that).
- Each tab: 52px tall, flex-equal width within the tab set.
- Icon: 24px. Label: 11px.
- **Inactive tab**: icon stroke weight 2, label in `text-muted` token, regular weight.
- **Active tab**: icon stroke weight 2.5, label bold in `accent-text` token, plus a 56×3px accent-colored
  line centered on the tab's top edge, positioned 9px above the bar's top edge, rounded at its bottom
  corners (per handoff: "top -9px, rounded at the bottom corners" — i.e. the line sits just above the bar,
  not flush with it, with its lower two corners rounded and its upper two square against the screen edge
  it's closest to — flagging this geometry as the one spot the handoff's prose is genuinely ambiguous
  without seeing the canvas: "rounded at the bottom corners" most plausibly means the line's own bottom
  corners, i.e. the end closer to the bar, are rounded, giving it a tab/flag shape rather than a plain
  rounded pill. Build that reading; if the canvas shows a full pill (rounded all four corners), that's a
  one-line change, not a rework — leaving this open for the architect/engineer to confirm once the canvas
  is reachable).
- Tap targets: each tab's full 52px height easily clears the 40px minimum (AC17); width per tab at 3
  tabs/320px is ~106px, at 4 tabs/320px is ~80px — both comfortably above 40px, no narrow-width risk here.

**Three variants of the same component**, by content:
1. **Home/You tab set**: Trips, New trip, You. Lives on `/trips` and the new `/you` route. "Trips" is
   active on Home; "New trip" navigates to `/trip/new`. This bar's "New trip" tab replaces today's
   floating `FabBar` pill outright (both pointing at the same destination would be redundant navigation on
   the same screen) — `FabBar` is retired, not kept alongside this bar.
2. **In-trip tab set**: Trips, Expenses, Details, List. "Trips" returns to `/trips`, replacing today's
   `TopBar` back-chevron as the primary way back. Expenses/Details/List select the same three states
   `TabSwitch` already drives today — this bar **replaces** `TabSwitch` as the selection mechanism; the
   segmented control is retired, not kept as a second, redundant selector alongside the bar. This also
   moves the primary navigation for a trip's three sub-views from the top of the scrolling content (where
   `TabSwitch` sits today) to the bottom of the screen — a real relocation, which is exactly what
   requirements item 2 asks for.
3. **Settle up / Trip complete / Invite — no tab set.** These three screens do not gain tabs. Render the
   bar's visual shell only (same fill/blur/hairline/height/padding as variants 1 and 2) with each screen's
   existing single contextual action/caption as its sole content — do not invent a tab set with a
   "selected" state for these screens, since none of their content corresponds to a tab. See §4.5.

## 6. Constraints satisfied (compliance baseline)

Checked against `docs/reviews/security-compliance/project/compliance-baseline.md`; no
`compliance-constraints.md` exists yet for this feature slug.

- **No new personal data, no new processor, no new message to a person** — this feature touches no data
  model, no analytics event, no email/SMS/share path (matches the requirements' own risk-surface table,
  "None" on every row). Nothing in this design adds a new input, a new field, or a new send path.
- **Consumer-facing claims rule** ("copy must be literally true... tied to a code fact"): every new or
  reused string in this doc was checked —
  - Welcome headline/paragraph: unchanged copy (decision #1), not re-reviewed here since it isn't new.
  - "No trips yet" / "Splitiful is ready when you are..." (§4.2): reused verbatim from the handoff, no
    privacy/security claim, no "never shared"/"private"/"encrypted" language.
  - "Ongoing (N)" / "Completed (N)" kicker copy (§4.1): factual counts only, no claim.
  - You screen's row labels ("Privacy", "Terms", identity row): no new claim; links point at the existing,
    unmodified `/privacy` and `/terms` pages.
  - No string anywhere in this doc uses "private," "never shared," "we don't track," "secure," or similar
    — the one place that risk naturally arises (an account/profile screen) was deliberately scoped to
    reused rows only (§4.6), not new assurance copy.
  - Board S's brand row (`brand-lockup-s.md`) introduces no new copy at all — see that doc's own §6.
- **Sender identity / consent / opt-outs**: not applicable — no outbound communication is introduced or
  changed by this feature (Invite's existing mailto-based "invite by email," unchanged per non-goals,
  already keeps the address client-side per its own design — not re-litigated here).
- **Page-edited-for-a-new-feature stat-chip/tagline check** (baseline: "any older claims on the same
  screen are checked"): Welcome's two stat chips ("∞ expenses a day" / "0 accounts to join") are the one
  pre-existing claim-adjacent element on a screen this feature touches — they are **removed** (§3, AC8),
  not restyled, so there's no older claim left on this screen to re-check for truth.
- **Money records**: no settled/locked amount is read, written, or displayed differently by anything in
  this doc — Settle up/Trip complete/Invite content is explicitly frozen (§4.5), and the summary card's
  numbers (§4.4) are restyled, not recomputed or relabeled.

No item in this design requires escalation to the compliance agent beyond the normal design-stage review
this document is now available for.

## 7. Consistency check against `docs/features/ux-revamp/design.md`

`ux-revamp/design.md` is the currently-shipped design doc for the app's existing warm-paper material
(Welcome, Create-a-trip, The trip, Add-an-expense). Cross-referencing:

- **Superseded outright**: its §2 Welcome layout (Miso photo in a tilted card, two stat chips) is fully
  replaced — first by board T (§3 above), then by board S (`brand-lockup-s.md`) for the brand mark
  specifically — the photo-in-a-card treatment and the stat chips both go away, though board S brings
  back the *same underlying sticker-card construction* (10px radius, `shadow-card-sm`) as the housing for
  the new dog-face mark, per `brand-lockup-s.md` §1. Anywhere `ux-revamp/design.md` is cited as the
  rationale for `miso_01.jpg`'s placement on Welcome, that citation is now stale once this feature ships.
- **Miso cameos removed, resolved**: `ux-revamp/design.md`'s small Miso-photo cameos on New-trip's header
  (§3 of that doc), The-trip's empty-expenses state (§4), and Add-expense's header badge (§5) are removed.
  The new flat dog-face mark is the only brand mark going forward — no mixed-mascot state ships. Anywhere
  those three sections of `ux-revamp/design.md` describe the photo cameo, treat it as superseded by this
  feature.
- **Still valid, unchanged by this feature**: §1's sticky/blurred `TopBar` pattern, the floating-capsule
  primary-action material (`capsule`/`capsuleMuted` button variants), the paw-print `texture` prop, and
  the add-expense sheet's open/close motion (§5 of that doc) are **not** touched by this feature at all —
  this feature's scope is tokens/spacing/brand/nav, not sheet mechanics or the capsule's existence. Those
  patterns carry forward as-is; this feature only swaps the *values* underneath them (ink-86% capsule fill
  → possibly ink-90%, per §2's flag above).
- **Token naming**: `ux-revamp/design.md` never introduced a semantic token layer of its own (it describes
  values inline against `globals.css`'s existing `--color-*` names) — no conflict there, this feature is
  the first to formalize the semantic-token table at all (AC1).

## 8. Open items for the user/PM (collected from above, not resolved here)

1. §4.4: icons (Settle up/Invite) moving from the `TopBar`'s trailing slot into the summary card is a
   structural relocation, not a pure restyle — confirm this is intended (the handoff's board-C layout
   implies it; requirements item 4 doesn't call it out separately).
2. §5: the 56×3px active-tab accent line's corner-rounding geometry ("rounded at the bottom corners") is
   the one spot this doc had to guess at prose alone — confirm against the actual canvas once available.
3. §4.6: whether anyone with `/trips`'s old inline Privacy/Terms links bookmarked or linked externally
   needs a redirect once they move to the new You screen (low stakes — both are public static pages — but
   worth a yes/no rather than leaving it implicit).
4. **Brand mark (board S), from `brand-lockup-s.md`**: AC8's status-bar/circle clause and AC4's "no dog
   mark next to the [Home] title" both need rewriting in `requirements.md` now that board S ships instead
   of board T — flagged there, repeated here since it's a requirements-doc change, not just a design one.
   Also open: whether the first-run card badge should carry the full icon+wordmark brand row or icon only
   (this doc's call: icon only, reasoning in `brand-lockup-s.md` §4) — confirm or override.
