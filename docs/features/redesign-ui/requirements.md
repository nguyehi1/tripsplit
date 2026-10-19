# Requirements: Splitiful UX redesign — UI restyle (`redesign-ui`)

Source: [Engineering handoff](../Splitiful%20UX%20redesign%20engineering%20handoff.md) (the design canvas is the
source of truth for pixel values; this doc scopes what gets built, not how it looks).
Builds on, and restyles only, behavior already shipped in
[`starter-list-exploration`](../starter-list-exploration/requirements.md) (trip types, template shelf, first-run
card) — this feature does not re-decide that behavior.

## Problem

The app's visuals (brand mark, type scale, spacing, bottom nav, trip-screen layout) predate the new design
system and are inconsistent screen to screen. The redesign gives the app one coherent visual language — tokens,
spacing scale, a unified bottom bar, a new brand mark — so the product reads as finished and consistent, and so
the two features that follow (`copy-list-from-past-trip`, `share-list-with-other`) have a stable foundation of
tokens/spacing to build on rather than each inventing its own.

## Scope

1. **Design tokens.** Adopt the full semantic token set (background, text, text muted/faint, card, card border,
   hairline, accent, accent text, on-accent, chip fill, tint, primary button, nav bar, brand brown, logo plate)
   from the handoff's "Design tokens" section, plus the type scale and shape (corner radii, avatar size) values.
   **Light theme only, this pass** (resolved below, decision #6) — tokens are still implemented as named
   semantic variables, not raw values, so dark mode can be wired up later as its own feature without a rewrite.
2. **Spacing and navigation.** Adopt the fixed spacing scale (page padding, section gaps, list row padding, trip
   screen scroll offsets) and rebuild the bottom bar as one unified style app-wide: 24px icons, 11px labels, a
   heavier icon and bold accent-colored label on the active tab, a 56×3px accent line on the active tab's top
   edge, 8px/20px bar padding, 52px tab height, translucent with 16px blur and a hairline top border. The same bar
   style appears on Home/You (tabs: Trips, New trip, You), inside a trip (Trips, Expenses, Details, List), and —
   per the explicit constraint below — on Settle up, Trip complete and Invite, where it is the *only* visual
   change to those three screens.
3. **Brand and logo — board S, not board T (decision #7), then corrected toward board T's original sizing
   (user call, 2026-10-16, superseding the first board-S pass below).** New dog-face mark and new
   "Splitiful" wordmark graphic, both pieces restyled (not just an icon swap). Two different treatments
   now, not one unified "brand row" — the first board-S pass tried to unify all three placements into one
   small row and the user corrected it back toward board T's original scale:
   - **Welcome**: NOT the small `BrandRow` component. A bespoke, board-T-sized composition: a ~196×196px
     rounded-square "sticker card" (`--color-logo-plate` fill, restored after a brief removal) bleeding off
     the top-right corner, containing the dog face at its original 164×121px, with the "Divide by 6?"
     speech bubble (tilted ~-3deg, tail dot) to its left — same prominence as board T, just a rounded square
     instead of a circle. A separate 150×42px `Wordmark` sits on its own line below, left-aligned (the big
     dog+bubble above already carries the mark, so this line is wordmark-only, not paired with a small icon).
   - **Home title (board A)**: wordmark-only again, like board T's original rule — but **bigger**: 150×42px
     (was 112×31px; user: "the word Splitiful need to be bigger, currently it's way too small"). No dog icon
     here.
   - **"No trips yet" card on Home first-run (board L)**: unchanged from the prior board-S pass — the small
     `BrandRow` (`size="compact"`, 34×34px sticker tile + 112×31px wordmark, icon-then-wordmark). This is the
     only placement still using the small unified brand row; `BrandRow`'s `"welcome"` size preset is now
     dead code (zero callers) as a result and needs a decision (remove the unused preset, or leave it for a
     future placement).
   - App icon, splash screen, favicon: dog face only (same asset, no sticker-card housing, no wordmark), on a
     cream tile, checked at 132/60/40px (icon) and 16/32px (favicon) — unchanged throughout every revision.
   - All other logo-placement boards (P, Q, Q2, S2, D2) are reference-only and explicitly not built. (S itself
     moved out of this list — see decision #7.)
4. **Screens restyled to the new tokens/spacing/brand:**
   - **Welcome:** board S's brand row (item 3) in place of board T's circle/bubble, then headline, paragraph,
     two buttons, sign-in link. Terms/Privacy are not on this screen.
   - **A — Home:** brand row title (item 3); "Start from a template" shelf (existing behavior, restyled, catalog
     tiles in one row plus "Blank trip" as its own full-width row below, user decision 2026-10-16);
     Ongoing/Completed trip lists with counts in the section label, restyled row anatomy (name, dates, people,
     items to get, balance — balance suppressed entirely on a locked trip, user decision 2026-10-16), locked
     badge, divider visibly stronger than today's.
   - **L — Home first-run:** same shelf, restyled "No trips yet" card with the brand row (item 3).
   - **B — New trip:** restyled type picker and form chrome to new tokens/spacing (existing field order and
     behavior from `starter-list-exploration` is unchanged by this feature).
   - **C — trip screens:** summary card (name, dates, Settle up/Invite icon links, avatars, "N people", totals,
     "You've paid"/"You'd owe or you're owed") restyled and scrolling with the page (no longer sticky); list and
     merged suggestions restyled to new tokens/spacing.
   - **O — You:** account page restyled; Privacy and Terms remain as rows (no content change).
5. **Settle up, Trip complete, Invite.** Invite's content and layout do not change at all in this pass — only
   its bottom nav bar becomes the same unified style described in item 2, per the original product decision.
   **Settle up and Trip complete are superseded by a later user decision (2026-10-16):** both states (reached
   via the one `settle-up` route) drop their separate name/date/total summary card, fold that same Total/Avg/
   paid/owed data into the "Still on the mountain" card instead, and get the **real** Trips/Expenses/Details/
   List nav bar (not a shell with no tabs) stacked below their existing action button(s), the same stacking
   pattern as the main trip page's `BottomBar` + `TripNavBar`. The handoff's described back-link header card and
   tinted status card are still not built — this is a narrower, user-specified change, not the full handoff
   redesign of these screens.
6. **Organizer-lock-based trip completion.** Confirmed as the existing, already-shipped data model: a trip is
   grouped into Home's "Completed" section only when the organizer has locked it at Settle up (`completed_at` is
   set), never because balances reach zero. This feature does not change that behavior; it only restyles the
   Home screen that displays the grouping (item 4, board A) and the Settle-up/Trip-complete nav bar (item 5). No
   new migration, RPC, or lock-permission change is in scope here — flagged as "already correct" rather than
   left ambiguous, since the handoff lists it as a behavior bullet.

## Resolved and open decisions (from the handoff's "Open decisions")

| # | Decision | Status |
|---|---|---|
| 1 | Welcome headline wording ("Miso does the math" vs. "We do the math") | **Resolved (user decision, 2026-10-16): keep "Miso does the math."** Miso stays as the product's character/voice in copy even though the logo itself no longer depicts Miso. |
| 2 | Vector (SVG) logo master | **Open — blocking dependency, not a PM decision.** The held artwork is a 1254px raster with PNG-cutout white-edge artifacts on dark backgrounds (the dark-background artifact is moot for this pass since dark mode is deferred, decision #6 — but the SVG master is still needed for clean brand-asset rendering at the required sizes in light theme). Flagged to the user/design, not resolved here. |
| 3 | Permissions — who can add items / edit expenses / view a shared link | **Open — out of scope for this pass, needs a product decision before `share-list-with-other` or any permission-sensitive engineering work proceeds.** Only "organizer locks the trip" is answered (already true in shipped behavior). This feature does not touch any permission check. |
| 4 | Expenses and Details tabs undesigned | **Explicit non-goal.** No canvas exists for these two tabs; this feature does not restyle them. Flagged as a future design gap — the next feature to touch either tab needs its own design pass first. |
| 5 | Home first-run (board L) header | **Superseded by decision #7.** Originally "wordmark only, no dog mark beside the title" under board T; board S's brand row (dog icon + wordmark) now renders there too, by user decision. |
| 6 | Dark mode | **Resolved (user decision, 2026-10-16): out of scope for `redesign-ui`, deferred to its own future feature.** This pass ships light theme only. Tokens are still implemented as named semantic variables (not raw hex/oklch), so a later dark-mode feature can add dark values without restructuring components. No screen in this feature is required to render correctly in dark mode, and no QA check verifies dark-theme appearance. |
| 7 | Brand/logo board choice | **Resolved (user decision, 2026-10-16): switch from board T to board S** ("Idea C: wordmark as brand row, dog in the original sticker card"), stated reason "simpler." This **reverses** the earlier board-T-only decision (originally item 3 in Scope, below) and the handoff's own "reference only, do not build" status for board S. Full spec: [`brand-lockup-s.md`](brand-lockup-s.md). Board T's circle/bubble/cream-plate Welcome treatment, and its "wordmark-only, no dog mark" rule for Home/first-run, are both superseded — see ACs 4, 5, 8 below, rewritten for board S. The brand row (sticker-card dog icon + wordmark) now appears identically on Welcome, Home's title, and Home first-run's "No trips yet" card (user decision, 2026-10-16: full row everywhere, not icon-only on the first-run card). |

## Acceptance criteria

Tokens and spacing
1. Light-theme values for every token in the handoff's Design tokens table are implemented as semantic tokens
   (CSS variables or equivalent), not raw hex/oklch values hard-coded in components. A code check (grep or lint
   rule) can confirm no raw value from the table appears literally in a component file. Dark-theme values are
   not wired up in this feature (decision #6); the token *names* exist so a future dark-mode feature can add
   dark values without restructuring components.
2. The spacing scale (page padding, section gaps, row padding, trip-screen scroll offsets) is applied with no
   value observed outside the scale on any in-scope screen.
3. The bottom bar matches the handoff's measurements (56×3px accent line, 24px icons, 11px labels, heavier
   active icon stroke, bold accent label, 8px/20px padding, 52px tab height, translucent 16px blur, hairline top
   border) on every screen that shows it, including Settle up, Trip complete and Invite.

Brand (board S — decision #7; see [`brand-lockup-s.md`](brand-lockup-s.md) for the full spec)
4. The brand row (sticker-card dog icon + wordmark, `flex items-center gap-3`, icon-then-wordmark) renders
   identically — same construction, different fixed size — on Home's title, Home first-run's "No trips yet"
   card, and Welcome: 44×44px tile + 150×42px wordmark on Welcome; 34×34px tile + 112×31px wordmark on Home's
   title and on the first-run card. Wordmark is brown, light theme only (decision #6), never stretched (uniform
   scale only) in every placement. This supersedes the old board-T rule ("wordmark only, no dog mark" on Home/
   first-run) — a dog mark next to the title is now correct, not a defect.
5. The sticker-card tile itself (10px radius, white `card` fill, `shadow-card-sm`, no border, no tilt) is the
   same housing at every placement, just scaled per criterion 4's sizes. It replaces board T's 244px cream
   circle, the "Divide by 6?" speech bubble, and the Home-first-run dog-in-64px-circle badge — none of those
   three elements exist anywhere in the shipped build. The dog-face icon inside the tile is alone (no wordmark)
   on the app icon, splash screen, and favicon at the specified check sizes (132/60/40px icon, 16/32px favicon)
   — unchanged from board T.
6. Reference-only boards (P, Q, Q2, S2, D2) are not built; a QA check confirms no screen in the app uses their
   layout. (Board S itself is no longer in this list — see decision #7.)
7. New brand assets (dog face and wordmark) are used everywhere the old Miso photo or old wordmark previously
   appeared, except the explicitly superseded/reference boards.

Screens
8. Welcome matches board S's brand treatment (decision #7): the brand row (criterion 4) in place of board T's
   circle/bubble, then headline ("Miso does the math" — confirmed wording, decision #1), paragraph, "Create
   your first trip" (56px primary), "I have an invite link" (52px glass), "Already have a trip? Sign in" link.
   The two old stat cards are absent. No cream circle exists, so the status-bar-legibility concern that was
   specific to it no longer applies — status-bar text just needs to stay legible over `Screen`'s ordinary
   glow/texture background, same as every other screen.
9. Home (board A) shows the wordmark title, template shelf, and Ongoing/Completed sections with counts in the
   section label, restyled row anatomy, and a divider with visibly stronger contrast than the current one.
10. Home first-run (board L) shows the shelf plus the "No trips yet" card with the small dog mark; no
    Ongoing/Completed sections render when there are zero trips.
11. New trip (board B) picker and form chrome use the new tokens/spacing; existing field order, validation, and
    create behavior (from `starter-list-exploration`) are unchanged.
12. Trip screens (board C): the summary card (name, dates, Settle up/Invite icons, avatars, people count, totals,
    "you've paid"/"you'd owe or you're owed") scrolls with the page — nothing about it is sticky — and matches
    the new tokens/spacing. The list and merged suggestions below it are restyled to match.
13. You (board O) is restyled; Privacy and Terms rows remain present with unchanged content and links.
14. Invite shows the new unified bottom bar (shell only, no tabs) and is otherwise pixel-for-pixel unchanged
    from its current shipped content/layout — no back-link header card, tinted status card, or other visual
    element described elsewhere in the handoff is added. Settle up and Trip complete (superseded, item 5):
    both drop their separate summary card, show the Total/Avg/paid/owed data inside the "Still on the
    mountain" card instead, and show the **real** Trips/Expenses/Details/List nav bar stacked below their
    existing action button(s) — not the shell-only variant, and not pixel-for-pixel unchanged. Still no
    back-link header card or tinted status card from the handoff's fuller redesign of these two screens.
15. Home groups trips into Ongoing/Completed based on `completed_at` (organizer lock at Settle up) exactly as
    today; this feature changes no completion logic, only the Home visual grouping's styling.
16. Text stays readable (contrast) over the background's radial glows and paw-print pattern, light theme, on
    every in-scope screen.
17. Every in-scope board is checked at 390px and 320px: no horizontal scroll, no clipped/truncated text, tap
    targets at least 40px.
18. Dark mode is explicitly out of scope (decision #6): no in-scope screen is required to render correctly in
    dark mode, and QA does not verify dark-theme appearance for this feature. This feature is light-mode-only,
    same as `starter-list-exploration`.

## Non-goals

- Any content, layout, or behavioral change to Settle up, Trip complete, or Invite beyond the bottom nav bar.
- Expenses and Details tab visual design — no canvas exists; out of scope, flagged as a future design gap.
- Any change to who can lock a trip, add items, edit expenses, or view a shared link (permissions question stays
  open, flagged above, not answered or implemented here).
- Re-deciding trip-type/template behavior already shipped in `starter-list-exploration` — only its visual
  surface (board A shelf, board B picker, board L card) is restyled.
- Boards D–K (copy-from-past-trip and share/receive flows) — owned by the other two redesign features.
- Any new migration, RPC, or data-model change. The organizer-lock completion model is already implemented;
  this feature touches no schema.
- Building any of the reference-only logo boards (P, Q, Q2, S, S2, D2) or the superseded plain "Welcome" board.
- Sourcing the SVG logo master — flagged as a blocking open item for design, not resolved by this requirements
  doc. (The Welcome headline wording is resolved — see decision #1 above.)
- Combining-trip-types suggestion rules — already resolved in `starter-list-exploration`, not reopened here.
- **Dark mode.** Explicitly deferred to its own future feature (decision #6, user call 2026-10-16). This pass
  ships light theme only; dark-theme token values, dark-variant brand assets, and dark-mode QA are all out of
  scope here.

## Risk surface

| Item | Assessment |
|---|---|
| New personal data collected/stored | None. No new fields, columns, or inputs. |
| Message sent to a person | None. No email/SMS/push/share-sheet change. |
| New third-party vendor | None. No new processor. |
| New unauthenticated/public endpoint or anonymous-account abuse surface | None. Welcome and Home are already public/anonymous-reachable pages; this feature only restyles them — no new route, RPC, or data exposed to anonymous sessions. |
| Changes to money records | None. Balances, settle-up math, and the lock action's write path are unchanged. Only the Settle up/Trip complete screens' nav bar changes visually; the underlying `completed_at` lock mechanism and its RLS/RPC are untouched. |
| User-generated free text | None newly collected. Existing free text (trip name, location, "Other" type text) is displayed with existing escaping; no new rendering path for untrusted text is introduced beyond what's already reviewed. |
| New copy that makes a claim about privacy/security | None. The Welcome headline keeps its existing wording ("Miso does the math," decision #1) — no rewrite, so no new claim there. Any other new microcopy (e.g. first-run card text, button labels) must still stay factual per the compliance baseline (no "private", "we don't track," etc.). The ux-designer/engineer should route any new string past this rule even though no claim is currently planned. |

**Early compliance/security review:** every risk item above is "none," including the copy-claim row now that the
headline wording is resolved as a keep-as-is (no rewrite). On that basis this feature does not clearly require the
mandatory early review trigger, but because it touches public-facing brand/copy and the organizer-lock completion
model (a money-adjacent state), the PM recommends routing it through the early review anyway as a light-touch
check — primarily to confirm any new first-run/Home microcopy stays inside the consumer-facing-claims rules, and
to confirm no claim is made about the nav-bar-only change implying anything else changed on Settle up/Trip
complete/Invite.

## Semver classification

**`feature`, backward-compatible.** This is a visual restyle of existing screens and an already-shipped
completion model — no removed capability, no breaking API/data change, no change to who can do what. Flag for the
version-bump step: because this spans nearly every screen and introduces a new brand mark, treat it as a visible
minor release even though nothing breaks.

## Sequencing note for the architect (not decided here)

`copy-list-from-past-trip` and `share-list-with-other` are expected to consume the tokens and spacing established
by this feature rather than redefining them, so this feature should land first.
