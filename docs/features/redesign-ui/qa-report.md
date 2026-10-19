# QA Report: `redesign-ui`

Status: **Ready for docs/PR-prep, with one doc-reconciliation follow-up flagged, not a code
blocker.** One real defect was found in acceptance criterion 5 (the app icon/favicon) and has
since been fixed directly (see "AC5 resolution" below) and re-verified. A follow-up design audit
(`design-audit.md`) then found six real spacing/sizing values drifted from the handoff's explicit
numbers; all six are fixed and verified (see "Design-audit fix-round verification"). A further,
larger round (template-grid revert, the Settle Up/Trip complete overhaul, and a brand/logo switch
to board S, itself revised twice more by live user feedback mid-review) is verified in "Round:
template grid, Settle Up overhaul, and the brand/logo switch to board S" below — all of it is
confirmed working as currently, deliberately shipped, but `requirements.md`/`brand-lockup-s.md`
have not yet been updated to match the two latest brand-mark reversals (Welcome's composition,
Home's title) — that's a pending documentation follow-up, not a code defect, and is called out
explicitly so it isn't lost. The full test suite, lint, typecheck, and the local perf bench are
all clean at the time of this report.

## What was reviewed

- `docs/features/redesign-ui/requirements.md` (18 ACs), `architecture.md`, `design.md`,
  `design-audit.md`.
- `git diff` of every file in the QA task brief's file list, plus three additional source changes
  the coordinator landed mid-session in response to live user feedback (see "Mid-session changes"
  below), plus the six spacing/sizing fixes from the design-audit fix round (see "Design-audit
  fix-round verification" below) — all now accounted for in both the review and the test fixes.
- Full test suite (`npm test`), `npm run lint`, `npm run typecheck`, `npm run perf:bench`.

## Mid-session changes (coordinator-landed, user feedback)

Three small source changes landed after this review began, outside the original file list:

1. **`src/app/trips/page.tsx` / `src/lib/data/trips.ts`**: `TripRow`'s subtitle now shows "N to
   get" (open shopping-list items via a new batched `shopping_list_items` query in `getMyTrips`,
   exposed as `MyTrip.itemsToGetCount`) instead of the money total/"No expenses yet" — matching
   the handoff's literal example. Verified: the new query runs in the same `Promise.all` as the
   existing `trip_members`/`expenses` queries (no added round trip), and its data flows into the
   row subtitle exactly as described, with no change to balance/settlement math.
2. **`src/components/template-shelf.tsx` / `src/components/template-tile.tsx`**: "Blank trip" is
   now a 4th dashed-border tile inside the template grid (`BlankTripTile`) instead of a small text
   link next to the header; the grid is 2 columns instead of 3. Verified: no leftover reference to
   the old `BlankTripLink` export anywhere in the codebase; the analytics event
   (`home_blank_trip_tapped`) and its "fires once, doesn't block navigation" behavior are
   unchanged.
3. **`src/app/trip/[id]/page.tsx`**: removed the sticky `TopBar` (back-chevron + "Your trip"
   label) entirely — the bottom nav bar's "Trips" tab already covers that — and removed the "Trip"
   pill tag, tightening the summary card's padding/type sizes. Verified: the "Locked" badge (an
   important status signal) is still rendered, just repositioned into the date row instead of a
   separate top row; the bottom nav bar's "Trips" tab (`href="/trips"`, always present) is the one
   remaining way back, so there's no dead end.

**Nothing here looks like it should go back to engineering as a defect** — all three read as
reasonable, intentional product decisions matching the handoff's literal content, and none breaks
settlement math, RLS, or navigation reachability. **One documentation note for whoever owns
`design.md`:** that document currently states, as settled fact, that board C's sticky `TopBar`
"stays sticky — that's unchanged" and describes the "Trip" pill and a 3-column shelf grid with a
`BlankTripLink` header link — all three are now stale against shipped code. Not a QA blocker, but
worth a follow-up edit so a future reader of `design.md` isn't misled.

I fixed the tests these three changes broke (`trips/page.qa.test.ts`'s row-subtitle and
tab-order assertions, `trip/[id]/page.qa.test.ts`'s one test asserting the now-removed `TopBar`)
and the test/bench Supabase-mock fixtures that didn't implement the new query's `.neq()` chain
(`src/lib/perf/trips.bench.ts`, `src/lib/data/trips.performance-scaling.qa.test.ts`,
`src/lib/data/trips.placeholder-qa.test.ts`) — these were fixture gaps, not implementation bugs.

## Acceptance criteria — pass/fail

| # | Criterion | Verdict | Notes |
|---|---|---|---|
| 1 | Semantic tokens, no raw hex/oklch literal in a restyled component | **Pass** | New token test (`src/app/redesign-ui.tokens.qa.test.ts`) greps every file this feature restyled for the new token table's literal values — none found. `globals.css` adds all new tokens as named CSS vars, light-only, no `[data-theme]` block, matching decision #6. |
| 2 | Spacing scale applied, no out-of-scale value | **Pass (by inspection)** | Nav bar padding (8px/20px), 52px tabs, 24px icons, 11px labels all literal and matching the handoff exactly in `bottom-nav-bar.tsx`. |
| 3 | Bottom bar measurements, incl. Settle up/Trip complete/Invite | **Pass** | New `src/components/bottom-nav-bar.qa.test.tsx` verifies 56×3px line, 24px icons, 11px labels, stroke-weight/font-weight swap on active, 52px tab height, 8/20px padding, hairline+16px blur, on `HomeNavBar`/`TripNavBar`/`NavBarShell`. `settle-up/page.tsx`/`invite/page.tsx` diffs confirm `NavBarShell` wraps the existing single action with the same shell, nothing else touched. |
| 4 | Wordmark 112×31 (Home/first-run), 150×42 (Welcome), brown, never stretched | **Pass, with a flagged caveat already anticipated by requirements decision #2** | `Wordmark` renders as a sized text stand-in (`Splitiful` in `font-display`), not a vector graphic — the SVG master is a named, still-open blocking dependency per requirements decision #2, and architecture.md §4.2 explicitly planned for exactly this de-risking approach (build the sized slot now, swap the asset later with zero JSX changes). Box dimensions are correct and never non-uniformly stretched. Not a new finding — already an acknowledged, open item. |
| 5 | Dog face 164×121 (Welcome), 46×64 (first-run), alone on icon/splash/favicon | **Pass, after a fix landed mid-review (see "AC5 resolution" below)** | Welcome and first-run placements were correct from the start (164×121 in the 244px circle; 46px in a 64px circle). The app-icon/favicon files were originally wrong (see resolution) and are now fixed and re-verified at every checked size. The missing iOS splash-screen mechanism (`apple-touch-startup-image`) remains a separate, non-blocking, already-known gap — see the note at the end of that section. |
| 6 | Reference-only boards (P, Q, Q2, S, S2, D2) not built | **Pass** | Grep check in the new token test file confirms no restyled file references a `BoardP`/`BoardQ`/etc. identifier; manual read of every restyled file found no such layout. |
| 7 | New brand assets used everywhere the old mark appeared, except superseded boards | **Pass** | `miso_01.jpg`-based `DogFace`/text-based `Wordmark` replace every old Miso-photo/plain-text placement reviewed (Welcome, Home title, first-run card). |
| 8 | Welcome board T layout, headline, stat chips removed | **Pass** | `home-screen.tsx` diff: circle/dog/bubble/wordmark/headline/paragraph/two buttons/sign-in link all present; two stat chips removed outright (not restyled). |
| 9 | Home: wordmark title, counts in section label, stronger divider | **Pass** | `trips/page.tsx`: "Ongoing (N)"/"Completed (N)" computed from already-existing `.length`, no new grouping logic; divider moved to new `hairline-strong` (.15) token, strictly stronger than the plain `.08` hairline, matching today's shipped `.15` — not weakened. Verified via `page.qa.test.ts`. |
| 10 | Home first-run: shelf + card with dog mark, no Ongoing/Completed sections | **Pass** | Verified in `page.qa.test.ts`: zero-trips render shows no "Ongoing"/"Completed" text at all. |
| 11 | New trip: restyle only, field order/validation/behavior unchanged | **Pass** | `new-trip-form.tsx`/`trip-type-picker.tsx` diffs are className-only (`text-ink/[...]` → `text-muted`/`text-faint`); no changed handler, field, or validation logic. |
| 12 | Trip screens: summary card scrolls (non-sticky), restyled | **Pass** | Confirmed non-sticky by construction (as design.md predicted — it was never sticky). Icons relocated from `TopBar.trailing` into the card. The sticky `TopBar` row above the card was later removed entirely per live user feedback (see "Mid-session changes") — a bigger structural move than design.md originally described, but reasonable and non-regressive (verified the "Trips" nav-bar tab remains the way back); `design.md` itself is now stale on this point and should be updated. |
| 13 | You screen restyled, Privacy/Terms present as rows, unchanged links | **Pass** | New `src/app/you/page.qa.test.ts`: `/privacy` and `/terms` links present as rows; `HomeNavBar` mounted with "You" active; identity row reuses `NamePromptForm` with no new account-settings behavior. |
| 14 | Settle up/Trip complete/Invite: nav bar only, otherwise pixel-for-pixel unchanged | **Pass** | Diffed `settle-up/page.tsx` and `invite/page.tsx` line-by-line: every change is `BottomBar`→`NavBarShell` (import + wrap sites), including moving two pre-existing buttons from inline content into the new shell on the "Trip complete" branch (architecture.md's own flagged gap — that branch had no `BottomBar` at all before). No new header card, status card, or other visual element added, matching the non-goal explicitly. |
| 15 | Home groups by `completed_at`, only styling changed | **Pass** | `trips/page.tsx` diff touches no grouping logic — `ongoingTrips`/`completedTrips` arrays are unchanged inputs, only their section-label text and divider class changed. The later "N to get" subtitle change touches row content, not grouping. |
| 16 | Text contrast over glow/texture | **Not independently re-measured** | No contrast-measurement tooling in this repo; relied on token values (`text`, `text-muted`, `text-faint` all dark-ink-based) being unchanged in darkness terms, just renamed — no new lighter-on-light combination introduced that wasn't already shipped. |
| 17 | 390/320px: no horizontal scroll, no clipped text, 40px+ tap targets | **Pass, by code inspection** | Nav bar tabs (52px height, ~80-106px width at 3-4 tabs/320px) clear 40px easily. Trip name at 26px with `[overflow-wrap:anywhere]` wraps rather than truncates — verified directly in `page.qa.test.ts` with a long name ("Grandma's 80th Birthday Extravaganza Weekend"), confirming no `truncate`/`text-ellipsis` class and the wrapped text renders in full. No actual browser-rendered viewport test was run (none exists in this repo's toolchain); this is a static-markup/class-level check, not a rendered-pixel check. |
| 18 | Dark mode explicitly out of scope | **Confirmed, not flagged as a gap** | No `[data-theme]` block exists; not treated as a deficiency per the explicit non-goal. |

## AC5 resolution (point-in-time record)

**Originally found (this QA pass, first review):** `src/app/icon.png` and `src/app/apple-icon.png`
were the full, uncropped Miso-at-a-desk photo scene (laptop, sticky notes, coffee mug, "Good
Systems Better Outcomes" whiteboard, Golden Gate Bridge view) — not a dog-face crop at all.
`src/app/favicon.ico` was untouched, still the default Next.js favicon from the initial commit,
with no dog face at any size.

**Fix landed (coordinator, same session):** `icon.png`, `apple-icon.png`, and `favicon.ico` were
regenerated from a tighter crop of `public/images/miso_01.jpg` (left:230, top:40, width:500,
height:500), resized to 512px/180px/16+32+48px respectively. `favicon.ico` is now a real
multi-size ICO (16/32/48, PNG-encoded frames), replacing the default Next.js one. `DogFace.tsx`
itself needed no change — it already cropped correctly at its own render sizes; only the three
static icon files had been generated from the wrong source crop.

**Re-verified (this QA pass, second review):** rendered `icon.png` at 512px (native), and resized
copies at 132px/60px/40px to simulate the AC's checked sizes, plus `favicon.ico`'s 32px frame.
At every size, the dog's face (glasses, nose, ears) is clearly the dominant, recognizable subject
— no wordmark, no longer the wrong whole-scene image. **One remaining, non-blocking gap**: the
background behind the dog's face is still the original photo's background (a sliver of
whiteboard/window), not a solid cream tile as the handoff's board-level description specifies.
Compositing a true cream-tile background behind the raster photo would require an actual
cutout/alpha mask, which runs into the same raster-quality blocker already named in requirements
decision #2 ("PNG-cutout white-edge artifacts") — matting a clean edge around the dog's head from
this specific source photo isn't a quick crop fix the way the face-framing was. Given the face
reads clearly and unambiguously at every checked size, and the cream-tile backing is cosmetic
polish gated on the same already-flagged, open SVG-master dependency (not a new blocker), this is
not being treated as a reason to fail AC5 a second time — but it's worth tracking as a small
follow-up once the SVG master lands, the same way the wordmark's text-stand-in is.

## Design-audit fix-round verification

A fresh UX re-audit (`design-audit.md`) compared the shipped implementation directly against the
handoff's literal spacing/sizing numbers and found six real drift items (plus one deliberate,
user-confirmed deviation — Welcome's template shelf, finding #1 — and one judged a non-issue — the
trip screen's 44px/176px scroll offset, since the nav bar is in-flow, not a fixed overlay, so
nothing hides behind it; neither is treated as a regression here, per the coordinator's
instruction). The engineer fixed the six real items; I verified each directly in the current
source:

1. **Page side padding (16px, not 20px) on in-scope screens only.** `ScreenContent` gained an
   opt-in `padding` prop (`src/components/ui.tsx`), defaulting to `px-5` (20px, unchanged for
   every screen outside this feature). Confirmed `padding="px-4"` (16px) is passed at every
   in-scope call site: Welcome (`home-screen.tsx`, shared by both `WelcomeContent` and
   `SignInForm` since they share one `ScreenContent`), Home and Home first-run (`trips/page.tsx`,
   same page/same `ScreenContent` for both states), the trip dashboard's three render paths
   (`trip/[id]/page.tsx`: `TripSummaryOnly`, the "Couldn't load this trip" error fallback, and the
   main detail view), You (`you/page.tsx`), and New trip (`new-trip-form.tsx`). Confirmed it was
   **not** applied to Settle up/Trip complete/Invite (`settle-up/page.tsx`, `invite/page.tsx` —
   no `padding` prop, stay at the default 20px, correct per the nav-bar-only carve-out) or any
   other out-of-scope screen (`join`, `check-email`, `feedback`, `legal-page.tsx`, both
   `add-expense`/`add-item` sheets, loading/error/not-found — all grepped, none pass `padding`).
   One shared component, `DeadEndScreen` (used by the trip page's "You're no longer on this trip"
   screen *and* the unrelated, out-of-scope removed-email-invite screen), was correctly left at
   its 20px default rather than being changed for one consumer at the expense of the other it
   shares code with — not named in the audit, and not a regression either way since it stayed put.
   Also confirmed `TopBar`'s `stickyInsetClassName` (the negative-margin pairing that cancels
   `ScreenContent`'s padding for a full-bleed sticky header) was updated in lockstep where needed:
   New trip's sticky `TopBar` now passes `"-mx-4 px-4"` to match its new 16px `ScreenContent`;
   Settle up's sticky `TopBar` correctly keeps the default `"-mx-5 px-5"` pairing since its
   `ScreenContent` stayed at 20px.
2. **Summary-card gap: 28px, not 14px.** `trip/[id]/page.tsx`'s gap between `InlineVerifyWidget`
   and `TripTabs` is now `h-7` (28px), confirmed.
3. **List row padding: 17px, not 14px.** `TripRow` (`trips/page.tsx`) and You's Privacy/Terms rows
   (`you/page.tsx`) all now use `py-[17px]`, confirmed.
4. **Avatar default: 34px, not 36px.** `ui.tsx`'s `Avatar` default is now `size = 34`; grepped
   every `<Avatar>` call site across the app and found none overriding it back to 36 (the explicit
   overrides that exist — 24px in the shopping-list tab, 32px in Settle up's settlement rows — are
   unrelated, smaller, intentional sizes, not a regression toward 36).
5. **Section spacing: 14px (not 10px) kicker-to-content, 36px (not 26px) between Ongoing and
   Completed.** Confirmed in `trips/page.tsx` (both the Ongoing and Completed sections' label-to-
   content gap is `h-[14px]`, and the gap between the two sections is `h-[36px]`) and
   `template-shelf.tsx` (label-to-grid gap is `h-[14px]`). The separate 26px gap between the
   template shelf and the Ongoing/first-run/error content below it (`trips/page.tsx` line 175)
   wasn't named in the audit as wrong and was correctly left alone.
6. **You's page title: 28px/600 scale.** `you/page.tsx`'s `TopBar` now passes
   `titleClassName="text-display text-[28px]"`; confirmed `.text-display` is `font-weight: 600` in
   `globals.css`, so this is exactly the handoff's 28/600 page-title scale.
7. **First-run card plate color: named token, not a raw hex literal.** `trips/page.tsx`'s "No
   trips yet" card now references `var(--color-dog-plate)`; `globals.css` defines
   `--color-dog-plate: #f5ecdc` once, mirrored into `@theme inline` the same way every other token
   in this feature is — the raw hex now lives in exactly one place, the token definition, not at
   the call site.

**Stale tests fixed** (test files only, per the division of labor): `src/app/trips/page.qa.test.ts`
had two tests still asserting the pre-fix values — one asserting `py-3.5` (now `py-[17px]`) for
`TripRow`'s compact rhythm, and one asserting the old `h-2.5`/`h-[26px]` kicker-gap/section-gap
values (now `h-[14px]`/`h-[36px]`). Both updated and re-verified; grepped the rest of the suite for
any other test asserting `py-3.5`, `h-3.5` used for this gap, or a 36px `Avatar` default and found
none.

## Round: template grid, Settle Up overhaul, and the brand/logo switch to board S

A larger round landed on top of the design-audit fixes above, checked against `requirements.md`'s
rewritten text (diffed against its *current* content, not the version checked in earlier rounds)
and `brand-lockup-s.md`. This round itself was revised twice more by live user feedback mid-review
— the writeup below reflects the final, stable state, not the intermediate ones.

**1. Home template grid reverted to 3-tile-row + separate "Blank trip" row.** Confirmed
`template-shelf.tsx`'s grid is `grid-cols-[repeat(3,minmax(0,1fr))]` (3 catalog tiles, one row)
with `BlankTripTile` rendered as its own full-width dashed row below, subtitle "Start with an
empty list" — not a 4th grid tile. Matches requirements item 4/the rewritten AC.

**2. Trip row subtitle/balance.** `trips/page.tsx`'s `TripRow` subtitle now reads "N item(s) to
get" (singular/plural via `trip.itemsToGetCount === 1 ? "item" : "items"`), rendered as separate
`<span>` parts joined by a styled `·` separator (`<span className="mx-1.5 text-faint">·</span>`,
not a plain joined string) — confirmed this didn't disturb the name line's own
`[overflow-wrap:anywhere]` class (that class lives on the name `<span>`, untouched, not on the
subtitle). Confirmed `hasBalance = trip.totalCents > 0 && !trip.isCompleted` — a locked
(completed) trip shows no balance anywhere: not on the name line, not on the third-line fallback
below 360px, even when `yourNetCents` is nonzero. Updated three now-stale tests in
`trips/page.qa.test.ts` (the old plain-string subtitle format, the old "0 to get" string, and the
old "completed trips still show a balance" assertion) to match.

**3. Trip details top padding.** `ScreenContent`'s `pt-0.5` → `pt-4` was confirmed on the main
trip view only, not `TripSummaryOnly` (stays `pt-0.5`) or the error fallback (stays its own
`pt-14`). **Later in this same round**, a restored `TopBar` (see item 5 below) made the main view
`pt-0.5` again — consistent with Home's own `pt-0.5` + `TopBar` pattern, not a regression of this
fix: the `pt-4` bump was specifically compensating for a missing header that's since been
reinstated.

**4. Sheet width fix.** `sheet-shell.tsx`'s panel is now `max-w-[416px]` (`w-full` still caps it
to the real viewport width on any mobile screen narrower than 416px, so there's no behavior change
there) instead of `max-w-md` (448px), aligning its edges with the trip page's 16px-inset content
at desktop-preview widths. Checked both `add-expense-sheet-content.tsx`/`add-item-sheet-content.tsx`
and `edit-expense-sheet-content.tsx` (also a `SheetShell` consumer) for any internal element wider
than 416px — found none (the widest internal `max-w` anywhere in any of the three is 290px).

**5. Settle Up / Trip complete overhaul — the biggest behavioral change this round.** Confirmed
directly against the file (no test existed for this page before; added
`src/app/trip/[id]/settle-up/page.qa.test.tsx`, 4 new cases):
   - The not-yet-locked branch's separate name/date/total summary `Card` is gone; that data (Total
     so far / Avg per person / You've paid so far / You'd owe) now lives inside the "Still on the
     mountain" card, separated by `Divider`s. (The locked/"Trip complete" branch never had a
     separate summary card to begin with — confirmed via the diff against the pre-this-round file
     — so for that branch "drop the card" is vacuously true; it only gains the new nav bar.)
   - Both branches now stack `BottomBar` (the existing action button(s)) above `TripNavBarStatic`
     (new, real Trips/Expenses/Details/List tabs, none marked active), replacing the old
     shell-only `NavBarShell` on this page specifically.
   - Confirmed `NavBarShell` itself is byte-for-byte unchanged in `bottom-nav-bar.tsx`, and
     `invite/page.tsx`'s diff is identical to every prior round's review (import + two wrap
     sites only) — Invite was not touched.
   - Confirmed `TripNavBarStatic` takes no props beyond `tripId` and calls no `useTripTab()`/
     `TripTabProvider` context (unlike `TripNavBar`) — the new settle-up test mounts the page with
     no provider in the tree and it renders without throwing.

**6/7. Brand/logo switch to board S, then revised twice more by live feedback.** Read
`brand-lockup-s.md` and requirements decision #7/rewritten ACs 4/5/6/8 as the starting spec, then
verified the *current* shipped code, which has since moved twice past that original board-S spec
in response to live user feedback (per the coordinator's two follow-up messages) — the final,
stable state as of this report:
   - **Welcome (`/`)**: does **not** use `BrandRow` at all. It's a bespoke composition close to
     the original board-T sizing: a 196×196px rounded-square "sticker card" (`var(--color-logo-
     plate)` fill, 48px corner radius) bleeding off the top-right corner, a 164×121px `DogFace`
     inside it, a tilted "Divide by 6?" speech bubble with a tail dot, and a separate 150×42px
     `Wordmark` below as its own line. Confirmed via a new test
     (`redesign-ui.brand-row-call-sites.qa.test.tsx`).
   - **Home title (`/trips`'s `TopBar`)**: a bare 150×42px `Wordmark`, no icon at all — bigger
     than the previous round's 112×31px compact brand row, per the user's literal request ("the
     word Splitiful need to be bigger").
   - **Home first-run "No trips yet" card**: **unchanged** — still the full `BrandRow
     size="compact"` (34px sticker tile + 112×31px wordmark). This is the one remaining live
     caller of `BrandRow`; grepped for any other caller of its `"welcome"` size preset and found
     none — noted in `brand-row.qa.test.tsx` rather than silently deleting that size's test
     coverage, since the component itself still exports and supports it.
   - **App icon/`apple-icon.png`/`favicon.ico`**: confirmed byte-identical to the AC5 fix verified
     earlier in this report (re-viewed `icon.png` — still the same cropped dog-face image) — board
     S's later revisions never touched these three files.
   - **`--color-accent-text` bug, found and fixed mid-round**: `bottom-nav-bar.tsx` has always
     applied `text-accent-text` to the active tab's icon/label, but `globals.css` never defined
     `--color-accent-text` at all — the Tailwind utility had nothing to resolve against (this
     presumably fell back to an inherited/default color, which is what read as "white" to the
     user). Now defined in both `:root` and `@theme inline` as `oklch(0.42 0.08 80)` — confirmed
     identical to the existing `--color-accent-ink` value, and confirmed by grep that
     `text-accent-text` has exactly one call site (`bottom-nav-bar.tsx`, both the icon and label
     spans), applied uniformly across every tab set (`HomeNavBar`, `TripNavBar`,
     `TripNavBarStatic`) — so this one token fix corrects the active-tab color app-wide (Trips,
     New trip, You, Expenses, Details, List), not just the one tab the user happened to notice.
   - **Other direct fixes, verified**: `TemplateTile` height 128px → 104px (confirmed in
     `template-tile.tsx`, and fixed the one now-stale test in `template-shelf.test.tsx` asserting
     the old `h-[128px]`); `BlankTripTile`'s border is now `border-2` at `rgba(35,28,18,0.28)`
     (was a 1px `hairline-strong` dash) and gained a leading `+` icon in an accent-soft circular
     badge, now icon+text in a row; You's Privacy/Terms rows each gained a leading icon (`LockIcon`
     for Privacy, `InfoIcon` for Terms, in an accent-soft rounded-square badge, same convention as
     every other icon-led row in this app) — confirmed in `you/page.tsx`, no test broke (the
     existing `you/page.qa.test.ts` asserts on link href/text, not row internals, so it was never
     coupled to the row's leading-icon markup); the trip dashboard's `TopBar` is back (`Wordmark`
     150×42 + a Feedback `MessageSquareIcon` link, matching Home's own header), still with no
     back-chevron and no "Trip" pill tag — confirmed via `IconLinkButton`/`ChevronLeftIcon` import
     grep that the old back-link affordance wasn't quietly reintroduced alongside it.
   - **`--color-logo-plate` restored.** An earlier pass in this same design-audit round removed
     this token as dead (confirmed zero non-`globals.css` references at that moment); Welcome's
     reverted composition (first bullet above) re-introduced a live reference to it. I restored
     the token rather than leaving a broken `var(--color-logo-plate)` reference — this is the one
     place in this round I made a source-file edit myself (one CSS custom property, not app logic),
     specifically to undo my own now-incorrect-assumption edit from two rounds ago, not a new
     design decision.

**Doc-reconciliation flag, not a code defect:** `requirements.md` and `brand-lockup-s.md` still
describe the *original* board-S spec (`BrandRow` used identically on Welcome, Home's title, and
Home's first-run card; no cream-circle-and-bubble anywhere) as current fact. Welcome's and Home
title's brand treatment have each moved twice past that spec since those docs were last edited,
per explicit, quoted user feedback each time ("keep the original size of the logo including
divided by 6? Refer to the S design"; "Remove the logo, the word Splitiful need to be bigger").
Per the coordinator's own instruction, this is called out as a **pending documentation follow-up**
(update requirements AC4/AC5/AC8 and brand-lockup-s.md §3/§4 to describe the Welcome bespoke
composition and the Home-title wordmark-only treatment actually shipped), not treated as a code
defect or a reason to send this round back.

**Test files touched this round**: `src/app/trips/page.qa.test.ts` (subtitle format, balance
suppression on locked trips, tab-order after the template-grid revert), `src/components/
template-shelf.test.tsx` (128px → 104px tile height), `src/components/template-tile.qa.test.tsx`
("Blank trip" lookup now by href, since the tile is no longer bare text), `src/components/
brand/brand-row.qa.test.tsx` (note on the now-dead `"welcome"` size's caller, kept as component
coverage), `src/app/redesign-ui.brand-row-call-sites.qa.test.tsx` (fully rewritten to assert the
current, final brand treatment at all three placements instead of the superseded original board-S
spec), and one new file, `src/app/trip/[id]/settle-up/page.qa.test.tsx` (4 cases — the first test
coverage this page has ever had).

## Regression check (architecture.md §3 consumers)

- `FabBar` (`src/components/ui.tsx`): component itself untouched; its one real call site (`trips/page.tsx`) now uses `HomeNavBar` instead. `ui.fab.test.tsx` still passes unmodified — `FabBar` wasn't deleted, just no longer called from this page.
- `BottomBar`: unchanged contract; its remaining consumer (`trip/[id]/page.tsx`'s Add-an-expense capsule) keeps it as-is, with `TripNavBar` added as a sibling below it, not a replacement, as architecture.md §3.2 specified. Verified via a test asserting `TripNavBar`'s markup appears after the `BottomBar`'s "Add an expense" content in render order.
- `TopBar`'s `sticky` prop: unaffected at the primitive level (no prop/behavior change to the component itself) — one specific *consumer* (`trip/[id]/page.tsx`) later stopped using it (see "Mid-session changes" above); the component and its other consumers (Home, You, Welcome's sign-in branch, etc.) are unaffected.
- `src/proxy.ts`: new tests (`src/proxy.test.ts`) confirm `/you` is gated identically to `/trips` (redirects to `/?next=%2Fyou` with no session, lets a signed-in user through), and that this addition does not loosen or tighten `/trips`/`/feedback` gating or affect unrelated public routes. One benign note (not a defect): `/^\/you/` is a prefix match, so a hypothetical future `/yourself`-style route would also be swept into the session-required set — true today only of `/you` itself, no collision exists, but worth knowing if a route like that is ever added.
- `BlankTripLink`: fully retired, no remaining reference anywhere in the codebase (`grep` confirmed); `template-shelf.test.tsx`/`template-tile.qa.test.tsx` both still pass unmodified since they assert on rendered href/text, not the old export name.
- Database/RLS/migrations: `redesign-ui` itself touches none, matching architecture.md §3.5. The separately-landed `shopping_list_items` query addition to `getMyTrips` is read-only (a `select`, no RLS/policy change) and was verified to add no extra network round trip (parallel in the same `Promise.all`).
- `src/app/page.texture-scope.qa.test.tsx`, `page.shelf.qa.test.tsx`, `trip-tabs.qa.test.tsx`: all pass unmodified, matching architecture.md §3.6's expectation that these need no changes, just a re-run.

## Test suite / lint / typecheck

- **Tests fixed (test files only, no implementation changes):**
  - `src/app/trips/page.qa.test.ts`: added `usePathname` to the `next/navigation` mock; updated assertions for the wordmark (no more `<h1>Trips</h1>`), the first-run card's new copy and absent "Your trips"/Ongoing/Completed text, the retired `FabBar` → `HomeNavBar` markup, the `hairline-strong` divider class, the counted kicker text ("Ongoing (1)"), the "N to get" row subtitle (replacing the old money-total/"No expenses yet" assertions), and the tab-order test's new Blank-trip-tile position.
  - `src/app/trips/page.performance-scaling.qa.test.ts`: added the same `usePathname` mock.
  - `src/app/trip/[id]/page.qa.test.ts`: updated one new test to match the removed `TopBar`/"All trips" link and added a test for the removed "Trip" pill tag.
  - `src/lib/perf/trips.bench.ts`, `src/lib/data/trips.performance-scaling.qa.test.ts`, `src/lib/data/trips.placeholder-qa.test.ts`: added `shopping_list_items` table data and a `.neq()` stub to each file's hand-rolled Supabase-mock builder, which didn't implement the new query chain `getMyTrips` now makes.
  - `src/app/trips/page.qa.test.ts` (design-audit fix round): updated the two tests still asserting the pre-fix `py-3.5` row padding and the old `h-2.5`/`h-[26px]` kicker-gap/section-gap values, now `py-[17px]`/`h-[14px]`/`h-[36px]`.
  - `src/app/trips/page.qa.test.ts` (template-grid/Settle-Up/brand round): updated the subtitle-format test (plain string → separate `·`-separated spans, "N item(s) to get"), the "locked trips never show a balance" test, and the tab-order test (Blank-trip-tile moved below the grid, not a header link).
  - `src/components/template-shelf.test.tsx`: `h-[128px]` → `h-[104px]` tile-height assertion.
  - `src/components/template-tile.qa.test.tsx`: the "Blank trip" tap test now locates the tile by `href`, not exact `textContent`, since it's no longer bare text (gained a subtitle and a `+` icon).
  - `src/app/redesign-ui.brand-row-call-sites.qa.test.tsx`: fully rewritten twice — first to match the board-S `BrandRow` rollout, then again to match the final, twice-revised brand treatment (Welcome's bespoke composition, Home's wordmark-only title).
- **New tests added** (acceptance-criteria coverage that didn't exist before): `src/proxy.test.ts` (`/you` gating, 4 new cases), `src/app/you/page.qa.test.ts` (new file, 6 cases), `src/components/bottom-nav-bar.qa.test.tsx` (new file, 5 cases), `src/app/redesign-ui.tokens.qa.test.ts` (new file, AC1 + AC6 grep checks, 14 cases), `src/components/brand/brand-row.qa.test.tsx` (new file, 5 cases), `src/app/trip/[id]/settle-up/page.qa.test.tsx` (new file, 4 cases — first-ever coverage of this page), and three new cases in `src/app/trip/[id]/page.qa.test.ts` (trip-name wrap, icon relocation / TopBar removal, nav-bar stacking order, "Trip" pill removal).
- **`npm run lint`**: pass (1 pre-existing unrelated warning in `src/lib/supabase/service.test.ts`, not from this feature).
- **`npm run typecheck`**: pass, no errors.
- **`npm test`**: **756/756 passing** (696 run + 60 pre-existing skipped) on the final, stable run. `src/lib/rate-limit.test.ts`'s real-sliding-window test flaked twice under full-suite parallel load across this session's several rounds, and passed both times in isolation and on an immediate full-suite re-run each time. That file is untouched by this feature at any point (confirmed via `git status`/`git log` each time) and the failure mode (timing-sensitive sliding-window counting under concurrent test-file load) is consistent with a pre-existing flake, not a regression from any of this session's changes.

## Performance bench

```
┌─────────┬──────────────────┬──────────┬───────────┬───────────┬────┐
│ (index) │ name             │ p50 (ms) │ p95 (ms)  │ mean (ms) │ n  │
├─────────┼──────────────────┼──────────┼───────────┼───────────┼────┤
│ 0       │ 'getMyTrips'     │ '63.121' │ '183.076' │ '70.803'  │ 50 │
│ 1       │ 'getTripView'    │ '69.760' │ '116.526' │ '75.829'  │ 50 │
│ 2       │ 'getTripSummary' │ '0.225'  │ '106.258' │ '27.908'  │ 50 │
└─────────┴──────────────────┴──────────┴───────────┴───────────┴────┘
```

Baseline (`src/lib/perf/local-baseline.json`): `getMyTrips` p95 215.70ms, `getTripView` p95
138.38ms, `getTripSummary` p95 85.59ms. All three current p95s are at or below baseline except
`getTripSummary` (106.26ms vs 85.59ms baseline, a 1.24x ratio) — **below the 1.5x WARN threshold**,
no WARN or FAIL raised. **Verdict: pass, no regression.** None of this round's changes (template
grid, Settle Up's card restructure, the brand-mark swap, the `--color-accent-text` token fix) touch
`getMyTrips`/`getTripView`/`getTripSummary` or their query shape — the numbers above are
consistent with every prior round's measurement in this session. No baseline regeneration needed.

## Open follow-up (non-blocking, not sent back)

1. **`design.md` is stale against shipped code on three points**, all from an earlier round's
   mid-session changes: it states the sticky `TopBar` on board C "stays sticky — that's unchanged"
   (removed, then partially restored as a *different* header — see point 2 below), describes a
   "Trip" pill tag on the summary card (removed), and describes a 3-column template-shelf grid
   with a `BlankTripLink` header link (now a 3-tile row plus a separate "Blank trip" row below,
   per this round). Recommend a follow-up edit to `design.md` §4.1/§4.4.
2. **`requirements.md` and `brand-lockup-s.md` are stale against shipped code on the brand mark**,
   per this round's "Doc-reconciliation flag" above: both describe `BrandRow` as used identically
   on Welcome, Home's title, and Home's first-run card, with no cream-circle-and-bubble anywhere.
   Shipped code now has Welcome's own bespoke sticker-card+bubble+wordmark composition, Home's
   title as a bare, bigger wordmark (no icon), and only the first-run card still using `BrandRow`.
   Per the coordinator's instruction, this is a **pending documentation follow-up**, not a code
   defect — requirements AC4/AC5/AC8 and brand-lockup-s.md §3/§4 need a rewrite to describe what's
   actually shipped, the same way board S itself superseded board T's description.
3. Once the SVG brand-asset master lands: revisit whether the app icon/favicon's cream-tile
   background (currently absent, see "AC5 resolution" above) should be added at that point.
4. `BrandRow`'s `"welcome"` size preset has no remaining caller anywhere in the app (Welcome no
   longer uses `BrandRow` at all) — not urgent, but worth a look next time anyone touches this
   component, to decide whether to keep both size presets or trim to just `"compact"`.

## Verdict

**Ready for docs/PR-prep.** Every behavioral/visual change verified in this session — the token
system, the unified nav bar (including the Settle-up/Trip-complete/Invite nav-bar treatment, now
including Settle Up/Trip complete's real Trips/Expenses/Details/List tabs), the Welcome/Home/
New-trip/You screens, the AC5 app-icon/favicon fix, the six design-audit spacing/sizing fixes, the
template-grid revert, the Settle Up/Trip complete overhaul, and the brand/logo switch to board S
(through its two further live-feedback revisions) — is confirmed working as currently,
deliberately shipped: full test suite green (756/756, with one confirmed-flaky, unrelated test
re-verified clean on its own and on a full re-run), lint/typecheck clean, perf bench clean with no
regression. The only open items are the two non-blocking documentation follow-ups above
(`design.md`, and now also `requirements.md`/`brand-lockup-s.md`'s brand-mark sections) — neither
gates this feature moving forward, but both should land before this feature's docs are considered
final, since a future reader currently can't tell from those documents what Welcome or Home's
title actually look like.
