# Architecture: `redesign-ui`

Status: design complete, pending the SVG brand-asset blocker (see "Brand asset pipeline").
Scope boundary: `docs/features/redesign-ui/requirements.md`. This doc does not re-open anything
listed there as resolved or non-goal. **Light theme only, this pass** — dark mode was descoped
mid-design (requirements decision #6, 2026-10-16) and deferred to its own future feature; nothing
below designs, plans, or accounts for dark-mode rendering, dark asset variants, or a theme-switch
mechanism. Where that matters for a later feature, this doc says so explicitly rather than silently
dropping the groundwork.

## 0. Orientation — what the requirements assume vs. what exists today

The requirements doc (and the handoff it's scoped from) describe several of the in-scope screens
as if they already exist and just need restyling. Orienting in `src/` surfaced three places where
that assumption doesn't hold. These aren't rejections of the requirements — the acceptance
criteria are still achievable — but the *mechanism* is "build new, nav-bar-styled" rather than
"restyle existing nav bar," which changes the size and risk of the change. Flagging all three up
front because they change what "nav-bar-only" can mean for criterion 14.

1. **There is no unified bottom tab bar anywhere today.** `BottomBar` (`src/components/ui.tsx`) is
   a sticky-bottom gradient *CTA slot* — it wraps a single primary action (the trip dashboard's
   "Add expense" capsule, Settle up's "Trip complete" button, Invite's "Go to the trip" button). It
   has never been a navigation control with tabs. `/trips` uses `FabBar`, a single floating pill
   ("New trip"), not a tab strip. Inside a trip, Expenses/Details/List is a `TabSwitch` segmented
   control docked at the *top* of the scrolling content (`TripTabs`), not a bottom bar, and it has
   no "Trips" tab — leaving a trip is via the top bar's back chevron. Home/You's "Trips, New trip,
   You" bar and the trip view's "Trips, Expenses, Details, List" bottom bar are both **new
   navigational surfaces**, not restyles of an existing one.
2. **`/you` (board O) does not exist.** Privacy/Terms today are a two-link footer
   (`LegalLinks` in `src/components/legal-page.tsx`) printed at the bottom of `/trips` and `/`, not
   an account page. Board O needs a new route built, not restyled.
3. **"Settle up" and "Trip complete" are the same route and the same React component**,
   `src/app/trip/[id]/settle-up/page.tsx`, branching on `trip.isCompleted`. There is no separate
   "Trip complete" page to restyle. The `!isCompleted` branch has a `BottomBar`-wrapped CTA; the
   `isCompleted` branch has no `BottomBar` at all today — its two buttons render inline in the
   scrolling content. "Nav-bar-only" for "Trip complete" therefore means: add the new bottom nav
   bar to the `isCompleted` branch (new), restyle the nav bar already present in the other branch,
   and touch nothing else in either branch's JSX/content.

None of this reopens requirements — criterion 14's "otherwise pixel-for-pixel unchanged" still
holds for the *content* of all three screens. It does mean the engineer's diff on
`settle-up/page.tsx` and `trips/page.tsx` is larger than a token/class swap, and QA's regression
pass should diff against current content screenshots, not assume "nav bar only" implies "small
diff."

## 1. Token system

### 1.1 Mechanism: extend ADR 0007, don't replace it

`src/app/globals.css`'s `:root` custom-property block (mirrored into `@theme inline`) is already
the one token source (ADR 0007). Good news: most of the handoff's token *names* already have a
light-mode equivalent in this file with the same or a very close value — this is additive, not a
rename:

| Handoff token | Existing token | Action |
|---|---|---|
| background | `--color-paper` | reuse |
| text | `--color-ink` | reuse |
| card | `--color-card` | reuse |
| accent | `--color-accent` (`oklch(0.45 0.09 80)` — identical) | reuse |
| accent text | `--color-accent-ink` | reuse |
| chip fill | `--color-accent-soft` | reuse |
| nav bar | `--surface-nav` (close; value needs a light-mode tune) | extend |
| text muted / text faint / card border / hairline / on accent / tint / primary button / brand brown / logo plate | — | **new tokens**, no existing equivalent |

Every new token gets **only its light value** this pass — there is no `[data-theme]` block, no
dark-value column in `globals.css`, and no theme-switch mechanism of any kind, per decision #6.
New tokens are added to `:root` and mirrored into `@theme inline` exactly like the existing set, so
`bg-card`, `text-muted`, `border-hairline`-style Tailwind utilities become available alongside the
existing `bg-paper`/`text-ink` ones. Naming follows the existing `--color-<role>` convention
(`--color-text-muted`, `--color-text-faint`, `--color-card-border`, `--color-hairline`,
`--color-on-accent`, `--color-tint`, `--color-primary-button`, `--color-brand-brown`,
`--color-logo-plate`).

**Why name them as semantic tokens anyway, if dark mode isn't being wired up now:** this is the
one piece of forward-looking groundwork worth keeping even though dark mode is out of scope — it
costs nothing extra (the light value has to be named *something* regardless) and is exactly what
ADR 0007 already committed this codebase to: as long as every consumer references `var(--token)`
and never a raw literal, a future dark-mode feature adds a `[data-theme="dark"]` block of values
and nothing else, in component code untouched by this one. This doc does not design that future
block, that attribute, or any switching mechanism — that's explicitly the next feature's job (see
`docs/adr/0016-system-preference-dark-theme-via-data-theme-attribute.md`, written mid-draft before
the descope and left `withdrawn` as a head start for whoever picks that up).

**A real gap this surfaces, independent of dark mode:** today's "muted text" isn't a token at all
— it's the Tailwind opacity modifier `text-ink/[0.72]` (and `/[0.73]`, `/[0.74]`, `/[0.68]` — at
least four different ad hoc alpha values across the codebase) applied directly at dozens of call
sites. That isn't a raw hex/oklch literal, so it would pass criterion 1's literal grep check even
though it isn't the semantic "text muted" token the handoff specifies (muted alpha is `.74`, faint
is `.68`, neither matches today's scattered `.72`/`.73`). Decision: every **screen this feature
restyles** switches these call sites to `text-muted`/`text-faint` utility classes backed by the new
tokens; screens outside this feature's scope (Expenses/Details tabs, add-expense, edit-expense,
etc.) are left on their current ad hoc opacity classes — migrating them is out of scope and would
be a much larger, separately-reviewable diff. Note this for the `compliance`/`security` re-check of
criterion 1: the literal-grep check should be read as "no raw hex/oklch in a *restyled* file," not
"repo-wide," since AC1 only claims the in-scope screens.

### 1.2 Type scale and shape

`Bricolage_Grotesque`'s `next/font/google` config in `src/app/layout.tsx` currently only loads
weights `600`/`700`; the handoff's type scale needs `500` too (Welcome's "Miso does the math" and
section labels use 600, but board-level kickers and some button weights sit at 500). Add `"500"`
to the existing `weight` array — additive, no breaking change to any current consumer, just a
slightly larger font payload. `Instrument_Sans`'s `400`–`600` already matches.

Shape tokens (`--radius-card: 22px`, `--radius-tile`, `--radius-chip` for buttons' full-round, a
new `--avatar-size: 34px` if a token is wanted, though this is arguably a one-off per ADR 0007's
own "don't force-fit every literal" rule) slot into the existing radius set with no renaming
needed — `--radius-card` is already 22px.

## 2. Component/module boundaries

### 2.1 `BottomNavBar` — the new shared tab bar (new file: `src/components/bottom-nav-bar.tsx`)

Deliberately **not** a rename or repurposing of `BottomBar` — `BottomBar` keeps its existing job
(a CTA slot) and every current consumer (`trip/[id]/page.tsx`, `settle-up/page.tsx`,
`invite/page.tsx`, `trip/new/new-trip-form.tsx`) is unaffected by this feature unless this doc
says otherwise below. `BottomNavBar` is new, sticky-bottom, translucent/blurred per token 2.2
below, and takes a closed-set `tabs` config, not arbitrary children (so the 56×3px active-line/
icon-weight/label-weight treatment is one implementation, not re-derived per screen):

```ts
type NavTab = { href: string; label: string; icon: IconComponent; isActive: boolean };
function BottomNavBar({ tabs }: { tabs: readonly NavTab[] }): ReactNode
```

Two call shapes, both thin "use client" leaves that compute `isActive` from `usePathname()` (the
same pattern `trip-sheet-chrome.tsx` already established for pathname-derived UI state) and pass a
fixed tab list into the shared component — no new context needed beyond what's already there:

- **`HomeNavBar`** (`Trips`, `New trip`, `You`) — mounted once, in a new shared layout
  (`src/app/(tabbed)/layout.tsx` or simpler, directly in each of `/trips`, `/trip/new`'s page, and
  the new `/you` page — see 2.3 for why a shared layout route group is the better call once `/you`
  exists). Replaces `FabBar` on `/trips` (same destination, `/trip/new`, now reached via a tab
  instead of a floating pill) — see impact analysis 3.1.
- **`TripNavBar`** (`Trips`, `Expenses`, `Details`, `List`) — mounted inside `renderTripDashboard`
  (`trip/[id]/page.tsx`), reading the active sub-tab from the existing `TripTabProvider`/
  `useTripTab()` context so it doesn't duplicate `TripTabs`' own state. Tapping `Expenses`/
  `Details`/`List` is equivalent to tapping the existing top `TabSwitch` (updates the same
  `?tab=` state); tapping `Trips` navigates to `/trips`.

**Settle up and Invite are inside a trip but outside `TripTabProvider`'s tree** (they're separate
routes, not a tab inside `TripDashboardPage`). Per the handoff's own "Orientation" note ("screens
deeper than a tab root... show a back link"), these two screens were never meant to have an
*active* sub-tab — they mount `TripNavBar` with none of the four tabs marked active (equivalent to
viewing the trip from one level down). This is the one implementation detail the handoff doesn't
pin down explicitly; flagging it back to the ux-designer/engineer as the reasonable default
rather than guessing silently, since getting it wrong is a one-line `isActive` fix, not a
structural one.

**Stacking with the existing CTA slot.** Three screens keep an existing `BottomBar` CTA
*and* gain `TripNavBar`: the trip dashboard's Add-expense/Add-item capsule, Settle up's
"Trip complete" button, and Invite's "Go to the trip" button. `TripNavBar` renders *below* the
existing `BottomBar` (nav bar is the true bottom-of-viewport element; the CTA floats just above
it) — both already use `position: sticky`/`fixed`, so this is a stacking-order and spacing change,
not a rewrite of either. The handoff's "Trip screens scroll area: 44px top, 176px bottom" spacing
value is sized for exactly this stacked pair (capsule + nav bar), which is a good sign the design
already accounted for it rather than something this doc is introducing unprompted.

### 2.2 Token additions `BottomNavBar` needs

`--surface-nav` already exists (translucent paper, used by `TopBar`'s `sticky` variant) but needs
retuning to the handoff's exact light-theme `rgba(245,240,230,.72)` value. The hairline top border
and 16px blur are new Tailwind utility usage (`backdrop-blur-[16px]`, `border-t border-hairline`)
— no new token needed beyond `--color-hairline` from 1.1.

### 2.3 `/you` (board O) — new route

New Server Component page, `src/app/you/page.tsx`, following the existing SSR pattern (ADR 0005):
fetch `getMyDisplayName` server-side (already exists in `src/lib/data/trips.ts`), render account
info (display name, with the existing `NamePromptForm`/`setMyDisplayName` wired the same way
`invite/page.tsx` already uses it — no new backend), then Privacy/Terms as full rows linking to
the existing `/privacy`/`/terms` pages (unchanged content, per non-goals). Mounts `HomeNavBar`
with `You` active. `src/proxy.ts` needs a one-line addition to gate `/you` the same way it gates
`/trips` (some session required) — consistent with the existing gate, not a new auth model.

Given three routes (`/trips`, `/trip/new`, `/you`) all now mount the identical `HomeNavBar`, a
shared route-group layout (`src/app/(tabbed)/layout.tsx` wrapping all three, Next App Router
route groups don't affect the URL) is the cleaner home for it than repeating the mount in three
page files — flagged as the engineer's call, not load-bearing either way.

### 2.4 Home (board A) — `src/app/trips/page.tsx`

Restyle only: row anatomy (icon tile, name/dates/people/balance, Locked badge), stronger divider
(`--color-hairline` at a higher alpha than today's `border-ink/[0.15]`), and — new content, not
just style — **counts in the section label** ("Ongoing (3)" / "Completed (2)"), per AC9. This is a
one-line label change (`Kicker` text), not a logic change; `ongoingTrips.length`/
`completedTrips.length` are already computed. `FabBar` is removed from this page (superseded by
`HomeNavBar`'s "New trip" tab, same destination `/trip/new`) — see impact analysis 3.1 for the
`ui.fab.test.tsx` consumer this affects.

### 2.5 Welcome (board T) — `src/app/home-screen.tsx`

`WelcomeContent`'s Miso-photo block, speech-bubble card, and the two stat chips at the bottom are
replaced with: wordmark (150×42px) + headline (unchanged copy, decision #1) + paragraph + the
cream circle/dog-face/speech-bubble composition from board T. `SignInForm` (the `?signin=1`
branch) is untouched — board T's layout only governs `WelcomeContent`. No `BottomNavBar` on this
screen (Welcome isn't a tab root and isn't in AC3's explicit "every screen that shows it" list).

### 2.6 New trip (board B) — `src/app/trip/new/`

Token/spacing restyle of `trip-type-picker.tsx` and `new-trip-form.tsx`'s chrome only. Per AC11
and the non-goal list, `toggleType`/`toggleOther`/`validateOtherType`/the field order/`createTrip`
call are not touched — this is a className-level diff. No `BottomNavBar` here either per the
requirements' screen list (board B isn't named as a nav-bar screen; it's reached via the Home
nav bar's "New trip" tab, and once on it the existing `BottomBar` CTA ("Create trip") is unchanged).

### 2.7 Trip screens (board C) — `src/app/trip/[id]/page.tsx`

Good news: the summary card is **already non-sticky** today (only the small "Your trip" `TopBar`
above it uses `sticky`) — the handoff's "no longer sticky" language refers to an *earlier*,
superseded design doc (its own header says so), not a change needed against current shipped code.
This section is a token/spacing restyle of the existing `Card` markup (name, dates, Settle
up/Invite icon links [`VerifiedActionIcons`, already present in `TopBar`'s `trailing` slot],
avatars, totals, paid/owed), not a structural change. `TripNavBar` mounts per 2.1.

## 3. Impact analysis

### 3.1 `FabBar` — one existing consumer, removed

`src/components/ui.tsx`'s `FabBar` is used in exactly one place today, `src/app/trips/page.tsx`
(confirmed by search — `ui.fab.test.tsx` is its only other reference, a test). Replacing it with
`HomeNavBar` removes that one call site. **Backward-compatibility note:** `FabBar` the component
stays in `ui.tsx` (not deleted) since deleting a shared primitive on a hunch it has no other future
use is unnecessary churn; only its one call site changes. `ui.fab.test.tsx` will need the engineer
to either retarget it at `HomeNavBar` or delete it if `FabBar` is fully decommissioned — flagged
for QA's test-suite pass, not a production break (no RLS/data/API involved).

### 3.2 `BottomBar` — unchanged contract, new neighbor

`BottomBar`'s existing consumers (`trip/[id]/page.tsx`, `settle-up/page.tsx`,
`invite/page.tsx`, `trip/new/new-trip-form.tsx`) keep calling it exactly as today. This feature
only adds a sibling fixed element (`TripNavBar`) below it on three of those four files (not
`new-trip-form.tsx`, which gets no nav bar per 2.6). No prop/behavior change to `BottomBar` itself.

### 3.3 `TopBar`'s `sticky` prop and the trip dashboard's title row

Unaffected. The restyled summary card sits below the existing sticky `TopBar`; this feature changes
the card's visual tokens, not the sticky title row above it.

### 3.4 `src/proxy.ts`

One additive line: gate `/you` the same way `/trips` is already gated (session required, same
redirect-to-`/?next=...` behavior). No change to the existing `/trips`/`/feedback` gating logic.

### 3.5 Database / RLS / migrations

**None.** Confirmed against the non-goals list and against this feature's own scope: no new
column, table, RPC, or policy. `completed_at`/`is_trip_open` and every RLS predicate listed in
`docs/ARCHITECTURE.md` are untouched. The organizer-lock grouping logic `/trips/page.tsx` reads
(`trip.isCompleted`, already computed by `getMyTrips`) is read, not modified — criterion 15 holds
by construction, not by a new check.

### 3.6 Existing tests likely to need engineer/QA attention

- `src/components/ui.fab.test.tsx` (FabBar's one test) — see 3.1.
- `src/app/trips/page.qa.test.ts`, `page.shelf.qa.test.tsx` — assert on current row/shelf markup;
  will need updated selectors/snapshots for the restyled row anatomy and new section-label counts,
  not new behavior assertions.
- `src/app/page.texture-scope.qa.test.tsx`, `page.shelf.qa.test.tsx` — Welcome's texture/glow scope
  test; should still pass unchanged (texture/glow props aren't touched by board T's content swap)
  but worth an explicit re-run given the Miso-photo block it currently covers is replaced.
- `src/app/trip/[id]/trip-tabs.qa.test.tsx`, `trip-tab-context.tsx` consumers — unaffected in
  behavior (no `tab` state-machine change), but any snapshot/DOM-shape assertion on the segmented
  `TabSwitch` should be checked once `TripNavBar` is mounted alongside it (two tab-ish controls on
  one screen — `TabSwitch` for Expenses/Details/List content, `TripNavBar` for the four-tab nav —
  are visually distinct per the canvas, but worth QA explicitly confirming no duplicate/confusing
  control).

### 3.7 Semver / deploy ordering

Backward-compatible, additive, no schema change — this feature can ship as a single deploy with no
migration-ordering concern (unlike, e.g., ADR 0003's phased `not null` rollout). The only
ordering note: land the new `/you` route and its `proxy.ts` gate in the same PR (a half-shipped
nav bar linking to a 404 is a real, if minor, user-facing bug during a partial rollout window).

## 4. Brand asset pipeline

### 4.1 Where assets live

New static files under `public/images/`: `dog-face.svg` and `wordmark.svg` (single light-theme
asset each this pass — no theme-variant swapping logic is built, since there's no second theme to
swap to; see the note under 1.1 about why the token names still exist for a future dark-mode
feature to populate). Both pieces render via small presentational components
(`src/components/brand/wordmark.tsx`, `src/components/brand/dog-face.tsx`), each taking a `size`
prop; color is applied via the `--color-brand-brown`/`--color-logo-plate` tokens from 1.1 (ideally
through `fill="currentColor"` on the SVG, once the SVG master exists, so swapping the token's value
later — e.g. for a future theme — needs no component change). **App icon/splash/favicon are
currently fully absent** — no `src/app/icon.*`, `apple-icon.*`, `manifest.ts`, or `favicon.ico`
exist today; this is new Next.js App Router convention-based metadata to add (`src/app/icon.png`,
`src/app/apple-icon.png`, a `manifest.ts`), not a restyle of an existing file.

### 4.2 De-risking the SVG blocker

The SVG master is a genuine, named-in-requirements blocking dependency for the *art itself*, but
not for the surrounding code. Engineering can and should start immediately on everything that
doesn't need final pixels:

- Build `Wordmark`/`DogFace` as components that accept a `src`/size prop today, backed by the held
  1254px raster (cropped/scaled as a stopgap, with the known white-edge artifact accepted as a
  temporary, documented visual defect — the artifact is specifically a dark-background problem per
  the handoff, so it's largely moot for this light-theme-only pass, but still visible on any dark
  decorative surface the light theme itself uses) or even a placeholder box with the right
  dimensions if the raster's artifacts are worse than a blank slot.
- Every placement (Home title, Welcome, first-run card, icon/splash/favicon slots) is wired to
  these components now, at the exact sizes/positions AC4/AC5 specify, so the *only* remaining work
  once design delivers the SVG is swapping the file the component points at — zero JSX/layout
  changes, since size/position logic lives in the component, not at each call site.
- Tokens (brand brown, logo plate) ship now regardless of the asset — they govern color, not the
  art file.
- **What stays blocked:** final icon/splash/favicon generation at the checked sizes (132/60/40px,
  16/32px) can't be verified as *correct* until the SVG lands, only built against a placeholder.
  Flag this blocker to design/PM now, as requirements already does — this doc doesn't resolve it,
  only confirms the build isn't fully blocked by it.

## 5. Constraints satisfied

| Constraint (compliance/security baseline) | How this design satisfies it |
|---|---|
| Analytics: event name only, closed set, no properties (compliance) | No new tracked interaction introduced by this feature beyond existing tap targets moving location (e.g. "New trip" tap moves from `FabBar` to `HomeNavBar`); no new `trackEvent` call site changes shape. If the engineer adds a nav-tap event, it must be a closed-set name with no properties — flagged for the engineer, not decided here since no such event is required by requirements. |
| Consumer-facing claims: copy must be literally true, no new privacy/security claim (compliance) | Welcome headline wording unchanged (decision #1). New first-run/Home microcopy this feature adds is limited to section-label counts ("Ongoing (3)") and the board-L first-run strings already specified in the handoff — no new privacy/security claim. Any new string the ux-designer finalizes should still be checked against this rule before merge, per requirements' own risk-surface note. |
| Personal data: no new column/field (compliance) | Confirmed — no new table/column (3.5). The `/you` page reads `display_name` via the existing `get_my_display_name` RPC; no new read path or export/erasure runbook entry needed. |
| RLS/access control: every table has RLS matching the real access rule (security) | Unaffected — no schema/RLS change (3.5). `/you`'s data fetch reuses `getMyDisplayName`, already covered by existing RLS. |
| Migrations: new numbered migration, old-code/new-schema and new-code/old-schema both safe (security) | N/A — no migration in this feature. |
| Secrets: nothing secret in client bundle (security) | N/A — no new secret/env var; brand assets are public static files by design. |
| Design documents must not specify behavior an ADR rejected (security) | Checked against ADR 0007 (extended, not contradicted — token names added now, no values/mechanism beyond light theme) and ADR 0008/0005 (unaffected — no new route-interception or SSR-conversion pattern introduced). |
| Data exposure: no `select *`, explicit column lists (security) | `/you`'s new fetch uses the existing `getMyDisplayName` RPC (already scoped); no new `select("*")` introduced. |

No constraint in either baseline is left unmet by this design; the two genuinely new surfaces
(`/you`, the brand asset files) are additive and don't touch any existing data-access or RLS path.

## 6. ADR

No ADR is in force for this feature. A dark-mode activation-mechanism ADR was drafted mid-design
(`docs/adr/0016-system-preference-dark-theme-via-data-theme-attribute.md`) while dark mode was
still in scope; once it was descoped (requirements decision #6) that draft was marked `withdrawn`
rather than merged, and kept only as a starting point for whichever future feature actually ships
dark mode. Everything this feature actually builds is routine application of ADR 0007's existing
token discipline to new light-theme-only values and new components — no new tradeoff here rises to
ADR-worthy.
