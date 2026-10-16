# Design audit: built UI vs canvas (starter-list-exploration, 0.8.0)

Date: 2026-10-14. Read-only audit; no source changed. Light mode only.

Canvas = left 390px phone in `Main.dc.html` (A), `NewTrip.dc.html` (B), `ListSuggest.dc.html` (C), `HomeFirst.dc.html` (L), `EmptyNone.dc.html` (D). Built = `src/app/trips/page.tsx`, `src/app/page.tsx` + `home-screen.tsx`, `src/app/trip/new/page.tsx` + `trip-type-picker.tsx`, `src/app/trip/[id]/suggested-card.tsx` + `shopping-list-tab.tsx`. Spec sources: `brief.md`, `design.md`, `requirements.md`, `breakdown.md`, `planning.md`, `qa-report.md`.

Short answer to "why does the Home page have no templates": they were cut on purpose, in writing, at requirements. Screens A and L were never designed (design.md scope says "No ... tiles"), never built, and never tested. The brief's own acceptance criteria ("Home shows three template tiles", "Every screen matches canvas") were narrowed away. See section 3.

Legend for "Documented?": Y = listed in design.md section 7 "Deliberate deviations" or stated in design.md/requirements; N = not documented anywhere (silent drift); P = partly.

---

## 1. Deviation table

### A. Home (`/trips`) and L (first run). Nothing from the canvas is built.

| # | Element | Canvas | Built | Documented? | Fix? |
|---|---|---|---|---|---|
| A1 | "Start from a template" section: kicker + 3 tiles | Present | Absent | Y: requirements l.52 "Not in 0.8.0", criterion 14 "No ... template tile", design.md l.31 "(no template tiles in 0.8.0)", breakdown #5 = 0.8.1 | Yes (user now requests it). Spec in section 2 |
| A2 | "Blank trip" link, top-right of the section header, 12px/600, accent color | Present | Absent | Y (same as A1) | Yes. Enlarge hit area to 44px (see 2.3), the canvas text link is ~16px tall |
| A3 | Page title | `h1` "Trips", Bricolage 36px/600, `-0.03em`, with 36px initials avatar on the right | `TopBar` title "Your trips", 16px semibold, with Feedback and "New trip" plus icon buttons | N | Partly. Yes: title "Trips" in `text-display` 36px. Avatar: product call (no profile screen to link to; default skip and record as deviation). Keep the Feedback icon (not in canvas but an existing feature) |
| A4 | New trip entry | Full-width 56px FAB capsule "[+] New trip", bottom 18px, dark `ink/90`, shadow `0 10px 30px rgba(35,28,18,.28)` | 36px plus icon in the top bar (`IconLinkButton`), and "Start a trip" accent button in the empty state | N | Yes. Use the existing `BottomBar` + `LinkButton variant="capsule"` (same material as New trip's Create button, no new component). Remove the top-bar plus to avoid two entry points. Add bottom padding so the last row is not hidden |
| A5 | "Your trips" section | One kicker "Your trips" over ONE white card, rows 40px icon chip + 15px name + 12px subtitle ("Feb 14-17 · 6 people · 3 to get") + "Now" pill | Kickers "Ongoing" and "Completed", each its own `Card`; row = "Trip" pill + dates, 22px name, avatar stack, "N people · $total", balance line | N | NO, not without a product call. The built row carries the money summary (You owe / You're owed), which the canvas row drops, and "3 to get" would need a new shopping-list query on a perf-benchmarked page. Recommend: keep the rows and grouping; show the feature as a section above them. Flag to user |
| A6 | Page chrome | Glow + paw texture, 16px gutter | `Screen glow` (no `texture`), 20px gutter (`ScreenContent`) | N | Add `texture` to match "paw-print background" (brief: "Every screen matches canvas incl. paw-print"). Keep 20px gutter (app-wide) |
| L1 | First-run card | Kicker "Your trips" + white card, 22px radius, padding 28/20, centered: "No trips yet" 15px/600 + "Pick a template above and your list starts with the basics. Your trips will show up here." 13px/1.45 | `<p>` "You're not on any trips yet." + accent "Start a trip" button | N (requirements l.52 lists "No trips yet" as not in 0.8.0) | Yes, exact strings from the canvas/brief |
| L2 | Tiles stay when there are no trips | Yes | n/a | N | Yes: shelf renders in all states (zero trips, error, trips) |

### B. New trip

| # | Element | Canvas | Built | Documented? | Fix? |
|---|---|---|---|---|---|
| B1 | Tile grid | 3 columns, gap 8, 3 tiles (no Other) | 2x2 grid, gap 8, 4 tiles (Other added) | Y (dev. 1) | Keep. Other is a user-requested 4th tile; 3-up would orphan it. Reason is sound |
| B2 | Tile height | 104px fixed | `min-h-[88px]` | Y (dev. 1) | Keep (4 tiles, keeps Create on screen). Consider 96px; low value |
| B3 | Tile padding | 12px | `p-3.5` = 14px | N | Trivial. Yes: `p-3` |
| B4 | Tile border | 1.5px in both states (`ink/.12` unchecked, accent checked) | `border` 1px unchecked, `border-[1.5px]` checked (0.5px size jump on toggle) | N | Yes: 1.5px in both states, no layout shift |
| B5 | Unchecked ring | `ink/.28` | `ink/50` | Y (dev. 2, contrast) | Keep. A11y reason: non-text contrast 3:1 |
| B6 | Icon color | Unchecked: muted `ink/.74`; checked: accent `oklch(.42 .08 80)` | `accent-deep` (`.38 .08 80`) in both states | N | Yes: muted when unchecked, accent when checked. It is the second state cue the canvas gives |
| B7 | Check glyph | 11px, stroke 3.4 | 12px, stroke 3.2 | N | Trivial. Yes, match |
| B8 | Checked fill/border | `accent-soft` fill, accent 1.5px | Same | n/a | Matches |
| B9 | Group header | Kicker "What kind of trip?" + "pick any, or none" (lowercase), padded 4px each side, 10px gap to grid | Kicker + "Pick any, or none" (capitalised, brief string), NO 4px inset, `h-1.5` = 6px gap | P (capitalisation follows brief.md l.63; inset and gap N) | Yes: `px-1`, `h-2.5`. Keep the capital P (brief is the string authority) |
| B10 | Helper sentence | Margin `10px 4px 0`, 12.5px/1.45, `ink/.74` | `mt-2.5`, no `px-1`, same size/color | N | Yes: add `px-1` |
| B11 | Sentence copy | 2-type string verbatim | Same for 2; adaptive for 0/1/3 | Y (2.2) | Matches/keep |
| B12 | Space Dates to picker | 22px | `h-4` = 16px | N | Yes: `h-[22px]` |
| B13 | Form above the picker | Close X (44px) + "New trip" 15px; ONE white card holding Trip name (inline 10.5px uppercase label, 20px/600 value) and Dates ("Thu, Sep 3 - Thu, Sep 10 · 7 nights"); no Location, no h1, no planner note | Sticky `TopBar` close + "New trip" 16px; `h1` "What are we calling it?" 30px; bare `Field`s (white 54px inputs); Location field; separate Dates `Card` with two native date inputs; planner note card | P (design.md calls the New trip shell "unchanged"; never says it differs from canvas B) | Needs a user call. This is the pre-existing screen, and the canvas is a re-skin of it (it drops Location and the planner role note, which are real features). Recommend: do NOT restyle the existing fields in this fix; record it as a known deviation. Only the picker is in this feature's scope |
| B14 | Primary button | "Create trip", solid `#231c12`, no icon | Existing capsule (translucent/blur) + arrow icon, "Create trip" | N | No. Existing shared `capsule` variant used by every primary action; canvas drew a flat approximation. Record it |
| B15 | Pre-check from Home | Home tile opens New trip with that type checked (brief: Flow 1, behaviour rules, acceptance 1) | Page reads no URL input; always starts empty | N (a consequence of A1 being cut) | Yes, see 2.4 |

### C. List tab Suggested card

| # | Element | Canvas | Built | Documented? | Fix? |
|---|---|---|---|---|---|
| C1 | Card position | BELOW "To get" (To get first, Suggested second) | ABOVE "To get" | Y (dev. 4) | Decision for the user, because sources disagree: brief.md l.33 and requirements criterion 6 say "above To get"; the canvas pixels say below. On a new trip (the main case) "To get" is empty so it is first either way. Recommend keeping ABOVE (written rule, and it is where a new organizer lands) and telling the user it differs from the picture. If the user wants the canvas order, it is a one-line move of `{card}` in `shopping-list-tab.tsx` after the To get block, but then the early `allEmpty` return still renders it first |
| C2 | Header right side | Pill "Add all 7" (32px, `accent-soft`, 1px `ink/.12` border, 12.5px/600) | Kicker text "tap + to add" / "confirm your email to add" | Y (Add all = requirements 14, breakdown #3 = 0.8.1) | Keep for now; Add all is a separate item. When built it replaces this hint |
| C3 | Header row inset/spacing | `padding 0 4px`, 8px to card | `px-1`, `h-2` | n/a | Matches |
| C4 | Container | Dashed 1px `ink/.12`, radius 22, padding `2px 6px 2px 16px`, no fill, no shadow | Dashed 1px `ink/.12`, `rounded-card` (22), `pl-4 pr-1.5`, no `py` | Y (dev. 3: dashed not Card) | Matches. Add `py-0.5` |
| C5 | Row height | Padding `4px 0` + 44px button = ~52px | `py-[13px]` + `size-11` with NO negative margin = ~70px | N (design.md l.17 explicitly says to copy `ToGetRow`'s `-m-2.5 size-11` hit-area trick; the build dropped it and added ToGetRow's 13px padding) | Yes. 6 rows are 108px taller than the canvas, which pushes "To get" and the Add an item area down. Use `py-1` with the 44px button, or keep 13px padding with `-m-2.5` (row ~64px); canvas is `py-1` |
| C6 | Row divider | `ink/.08` | `ink/[0.07]` | N | Trivial. Yes |
| C7 | Source line wording | "Airbnb stay + International" for an item in two types | First pick only: "Suggested · Airbnb stay" | Y (dev. 5; brief.md l.31 rule, requirements 7) | Keep. The brief's behaviour rule ("shows the first in pick order") and open question 2 override the illustrative canvas string. Note the canvas also has no "Suggested ·" prefix; brief l.31 and 63 do ("Suggested · Airbnb stay"), built follows the brief |
| C8 | Caption color | `ink/.68` | `ink/[0.72]` | N | Keep (more contrast, no visual change) |
| C9 | "+" button | 44px hit, 30px `accent-soft` circle, 15px glyph stroke 2.8, glyph color `oklch(.42 .08 80)` | Same sizes; stroke 2.4; `accent-deep` (`.38`) | N | Trivial. Yes: stroke 2.8, accent color |
| C10 | Aria-label | "Add {name}" | "Add '{name}' to the list" + describedby caption | N | Keep (richer, accessible) |
| C11 | Rows shown | All 7 | First 6, then "Show N more" / "Show fewer" when more than 7 remain | Y (3.2, user default) | Keep. Canvas had only 7 items; real catalog is 12 to 33 |
| C12 | Space after card | 18px before next block | `h-3.5` = 14px | N | Trivial. Yes: `h-[18px]` |
| C13 | Item names | Sample ("Sunscreen", "Dish soap + sponge", ...) | Real catalog ("Tent", "Toilet paper", ...) | Y (requirements: catalog is DRAFT content) | Keep. Canvas names are placeholders |
| C14 | Header icons (Settle up / People / Share) | Present in the trip bar | Not part of this feature | Y (criterion 14: no Share) | Out of scope |
| C15 | Empty list text | (Board D) h1 "Nothing on the list yet" 28px + 14px subtitle + "Start from a template" + 3 tiles, 88px, radius 18, 13.5px labels (no counts) | Plain "Nothing on the list yet." 13px `ink/60` under the card | Y (requirements l.52, "not in 0.8.0") | Do NOT build the tiles. Types are fixed after create in 0.8.0 (no editing), so a tile on an existing trip's empty list has nothing to set. Revisit with type editing (0.8.1+). Text-only upgrade to the D heading/subtitle is optional |

Extras built that are not on any canvas (all documented): Other tile + input, success pill, "Adds after you confirm your email" waiting state, Cancel, inline verify headline. Not audited against the canvas.

---

## 2. Implementation spec: Home template tiles

Light mode only. Reuse existing tokens/classes; no new color values.

### 2.1 Where

- **`/trips` (canvas A, L)**: add the shelf under the header, above the trip list, in all states (error, zero trips, trips). This is the "Home" the canvas draws and breakdown #5/#6 intended.
- **`/` (welcome page)**: a user with one trip is redirected from `/` straight into that trip, and a user with 2+ trips or a verified account goes to `/trips`. A brand-new organizer is an anonymous session with 0 trips, so they stay on the welcome page and would NEVER see `/trips`. So tiles on `/trips` alone miss the audience the feature is for (a first-time user), and the L "No trips yet" card is only reachable by a verified user who has left all their trips. **Product call to flag:** recommend also rendering the same shelf (header + 3 tiles + Blank trip link, no "Your trips" section) on the welcome page between the intro copy and "Create your first trip" (keep that button as the blank path). planning.md recommended tiles on `/`; breakdown.md said `/trips`; both are cheap if the shelf is one shared component. Default to doing both unless the user objects.
- Shared component `TemplateShelf` (server-renderable, no state). Put it in `src/components/` and have both pages import it.

### 2.2 Layout (390px canvas values, within the app's 20px gutter)

```
 START FROM A TEMPLATE                         Blank trip
 +-----------+ +-----------+ +-----------+
 | [tent]    | | [house]   | | [globe]   |   3 columns, gap 8px
 |           | |           | |           |   each tile 128px tall, radius 20px
 | Camping   | | Airbnb... | | Internat..|   label 14px/600
 | 18 items  | | 15 items  | | 12 items  |   count 11.5px, ink/[0.68]
 +-----------+ +-----------+ +-----------+
 (26px)
 YOUR TRIPS   (or the existing Ongoing / Completed block, or the L card)
```

- Header row: `Kicker` "Start from a template" (left); "Blank trip" link (right), 12px/600, `var(--color-accent-strong)`, `Link href="/trip/new"`, hit area >= 44px high via padding with a negative margin so layout is unchanged. Header row has 4px inset (`px-1`); 10px to the grid.
- Tile: `Link`, `h-[128px] rounded-[20px] bg-white shadow-card p-[14px_12px_12px] flex flex-col justify-between`, no border (canvas border is transparent), icon 22px stroke 2 in `var(--color-accent)`, text block bottom-left.
- 26px gap (`h-[26px]`) between the shelf and the next section.
- Icons: `TentIcon`, `HouseIcon`, `GlobeIcon` already exist. Move the `TILE_ICONS` map out of `trip-type-picker.tsx` into one shared module so the picker and shelf cannot drift.
- **Narrow screens:** content width at 390 is 350px, so a tile has ~87px of text width; "International" (14px/600) just fits. At 320px it will not. Let the label wrap (`min-w-0`, `[overflow-wrap:anywhere]`, `leading-tight`), never truncate it, and check 320px by eye. Do not shrink tiles below 40px tap target (they are 128px tall, fine).
- Tiles are links (navigation), not buttons. Accessible name = visible text ("Camping, 18 items"); the shelf is a `<section aria-labelledby>` with the Kicker as its heading id. Visible focus ring: same `outline-2 outline-offset-2 accent` as the picker tiles.

### 2.3 First-run (L)

When the user has zero trips and no error: under a "Your trips" Kicker, one white `Card` (`rounded-card`, padding 28px 20px, centered): "No trips yet" (15px/600) and "Pick a template above and your list starts with the basics. Your trips will show up here." (13px, 1.45 line height, `ink/[0.74]`). Replaces "You're not on any trips yet." and the "Start a trip" button (the FAB covers it). Error state keeps "Couldn't load your trips." under the shelf; the shelf still shows.

### 2.4 Tap flow and pre-check

1. Tap tile -> `/trip/new?type=camping` (`airbnb`, `international`). "Blank trip" -> `/trip/new` (no param).
2. `src/app/trip/new/page.tsx` is a client component. Do not read the param with `useSearchParams` without a Suspense boundary (this repo's Next has breaking changes; read `node_modules/next/dist/docs/` first). Simplest: make `page.tsx` a thin server component that awaits `searchParams`, validates, and passes `initialType` to the existing client form (rename it, e.g. `new-trip-form.tsx`). `useState<TripType[]>(initialType ? [initialType] : [])`. No effect, so no flash of an unchecked tile.
3. Validation: accept exactly ONE `type` value; `isTripType(value)` from `starter-suggestions.ts` against `STARTER_TYPES`. Anything else (unknown code, array/repeated param, empty, wrong case, `other`) is ignored and the form opens blank. Never throw, never render the value, never echo it in an error.
4. The user can untick it, add others, add Other, or none; Create behaves exactly as today (`typesStored`, `?tab=list` landing, `trip_type_selected_*`).
5. Back/close: the existing `router.back()` returns to the Home that launched it.

**Security/compliance notes**
- The param carries only a closed-set catalog code: no PII, no trip id, no invite code, no Other text (the Other text must never go in a URL: [security constraints](../../reviews/security-compliance/features/starter-list-exploration/security-constraints.md), l.118; this spec keeps `type` catalog-only and there is deliberately no `other` value). Constraints C8/C11 forbid putting pending actions, item names, trip ids and invite codes in URLs; a catalog type code is the "closed-set identifier" those rules allow, so no new review item, but state it in the PR.
- URL appears in server/Vercel logs and Referer. A bare catalog type is not personal data and not linked to an identity at that point; note it, nothing else needed.
- The privacy page already lists trip type; a tile tap before account creation sets nothing in storage and sends no request except the page load, so no consent or privacy-page change. Do not persist the pick in `localStorage`/`sessionStorage` (no draft persistence rule).
- No new database or RLS surface; the stored value still goes through the existing `createTrip` validation.

### 2.5 Item counts

Derive, never hardcode: `STARTER_TYPES.find(t => t.code === code).items.length` (currently 18 / 15 / 12, which matches the canvas). Label "{n} items"; there is no singular case in practice, but guard `n === 1 ? "1 item"`. Counts are the type's own catalog size, not the de-duplicated total (the canvas shows per-type counts). Tile order and labels come from `STARTER_TYPES` array order, so editing the catalog file updates Home, New trip and the List tab together. Add a unit test that the shelf renders `STARTER_TYPES.length` tiles with matching counts (catches a hardcoded number).

### 2.6 Analytics (name-only, per docs/ANALYTICS.md)

- Do NOT reuse `trip_type_selected_*` on tile tap: that name means "stored on a created trip" and fires after Create; reusing it would double-count and corrupt the pick-rate metric.
- Propose new fixed names built through a closed-set helper next to `tripTypeSelectedEvent`: `home_template_tapped_camping | _airbnb | _international` (helper returns undefined for unknown codes) and `home_blank_trip_tapped`. This replaces the brief's `template_tile_tapped{type, from}`, because the app only supports property-less event names (brief l.56 says shapes are adjustable). Add the four rows to `docs/ANALYTICS.md`. Fire on click only; one event per tap; no properties, no trip id.
- Click tracking needs a small client wrapper (`"use client"` `TemplateTile` with `onClick`), or fire the event from the New trip page on load when `initialType` is valid (server-validated, avoids a client wrapper but also fires on direct deep links). Recommend the click handler: it measures the tile, not the URL.
- Conversion is already measurable: a `trip_type_selected_<code>` after a `home_template_tapped_<code>`.
- Because `trackEvent` is a no-throw wrapper, navigation must never wait on it.

### 2.7 Tests to add

Shelf renders in zero-trip, error and has-trips states; tile `href`s; invalid/duplicate/`other`/array `type` param opens blank; valid param pre-checks exactly that tile and the adaptive sentence shows the 1-type string; counts equal catalog lengths; click fires only the expected name; keyboard focus order Blank trip -> tiles -> first trip.

---

## 3. Root cause: why the build drifted

Evidence-based; "stage" = pipeline stage that introduced it.

1. **Home tiles and first-run were scoped out, in writing, before design.** Planning's strategist said "Cut from phase 1: ... Home tiles" and wanted tiles to be "a second entry point on the most-seen screen" cut (planning.md l.54, l.75). The breakdown moved them to 0.8.1 as items #5 and #6 (breakdown.md l.11-12). Requirements then wrote "Not in 0.8.0: ... 'Start from a template', 'Blank trip', ... 'No trips yet'" (requirements.md l.52) and acceptance criterion 14 ("No ... template tile ... is added"). Stage: planning/breakdown, then PM. The brief itself (the user's source) lists "Home shows the same three types as templates" in scope and "Home shows three template tiles" as acceptance (brief.md l.18, l.78), so the narrowing contradicted the brief. The planning doc raised it as an open question (planning.md l.95 "Home tiles: put on `/`, on `/trips`, or drop them?"), and planning and breakdown disagreed on location (`/` vs `/trips`); no record shows the user answered "drop" for 0.8.0. I could not find a user decision recording the cut; it appears to have been inherited from the breakdown draft ("DRAFT for review", "tentative versions").
2. **Design never covered A or L.** design.md line 3 lists sources as "canvas boards B and C" only, and line 3 repeats "No ... tiles". UX cited requirements criteria 1-16, 22-26, 40-46, 57 and took the requirements scope as given. Stage: UX.
3. **"Matches the canvas" was weakened and then self-certified.** The brief says "Every screen matches canvas (LIGHT for now) incl. paw-print". Requirements criterion 22 narrowed it to "matches canvas B and C" and let the UX "extend the pattern". design.md chose "No separate mockup: canvas B and C already fix the look", then departed from the canvas in seven places (design.md section 7), so the canvas no longer fixed the look. Each of those seven is documented with a reason (3-up to 2x2, 88px, ring contrast, dashed card, position, source line, visible plus), but the three that matter visually (tile layout, card position, source line) were decided by the UX stage without a user checkpoint: they appear in design.md section 8 only as "resolved by defaults", not as questions. The doc also flags item 4 (position) as differing from the canvas but without asking.
4. **Undocumented drift is engineering-level.** Items B3, B4, B6, B7, B9, B10, B12, C5, C6, C9, C12 are not in design.md. The most costly is C5: design.md l.17 told engineering to copy `ToGetRow`'s `-m-2.5 size-11` hit area; the built `SuggestedCard` uses `size-11` without `-m-2.5` and `py-[13px]`, so rows are ~70px instead of 52px. Stage: engineer. Cause: the design gave a pointer to an existing row ("copies it") instead of pixel values, and the canvas was not reopened at build.
5. **QA verified criteria, not pixels.** qa-report.md checks 71 numbered requirements (criterion 22 is "PASS (extends existing tile style)", line 94) and has no canvas comparison; there is no visual or screenshot check, and no checklist item for the brief's "Every screen matches canvas". Because Home was descoped, QA also had no A/L criteria to fail. Stage: QA. [Compliance](../../reviews/security-compliance/features/starter-list-exploration/compliance-final.md) and [security](../../reviews/security-compliance/features/starter-list-exploration/security-final.md) reviews don't evaluate visuals by design.
6. **The existing New trip screen was assumed to be canvas B.** design.md calls the shell "unchanged" and applies "existing conventions" (bare `Field`, `TopBar`, `h1`), but canvas B shows a different shell (single card, no h1, no Location). The inventory pass in section 0 (correctly) protected existing patterns, but nothing reconciled that against the canvas, so the whole top half of B differs silently (B13). Stage: UX.
7. **Process gap that made 1-6 possible.** The pipeline's checkpoints were on risk (OTP gate, DB, Other text, compliance), and the "Phase 1 = screens A-G, I, L" line in brief.md l.11 was reduced to B and C without a visible "these canvas boards are being dropped" prompt. Add a canvas-coverage table to requirements (each board: in / out / which version) that the user signs off, and a QA step that screenshots built screens beside the board at 390px.

## 4. Recommended order of work

1. User decisions (two): tiles also on welcome `/` (yes/no); keep card above "To get" (recommended) or move below to match the canvas picture.
2. Shared `TemplateShelf` + `TemplateTile` + shared icon map; `/trips` header, FAB, first-run card, `texture`; `/` shelf if approved.
3. `?type=` pre-check via server wrapper, with tests.
4. Analytics names + `docs/ANALYTICS.md` rows + tests.
5. Quick picker fixes: B3, B4, B6, B7, B9, B10, B12.
6. Card fixes: C5 (row height), C6, C9, C12.
7. Update design.md (add A and L, the deviation list including B13/B14, and the rule "values from the canvas unless listed") and the requirements "Not in 0.8.0" line, criterion 14, and the breakdown, then a QA pass that compares screenshots to boards A, B, C, L at 390px and 320px.
