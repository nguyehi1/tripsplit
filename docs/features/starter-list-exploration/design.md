# Design: Starter lists, version 0.8.0 (starter-list-exploration)

Scope: New trip "What kind of trip?" (incl. Other), the Suggested card on the List tab, the unverified-organizer "+" flow, the Home template shelf on `/trips` (canvas A, L) and on the welcome page `/`, the bottom "New trip" pill, the first-run card, the `?type=` pre-check, the canvas fidelity fixes for B and C, and (**Revision 4, user test feedback 2026-10-14, explicit user decisions that override earlier decisions**) restyled `/trips` trip rows and spacing, the Suggested card moved below the list content, a sticky bottom action bar on the trip page, and the trip-type picker moved directly under the trip name. **Light mode only**; existing dark styling must not break (use existing tokens/classes only; the new token and the new pill variant are named in section 12). Sources: [requirements.md](requirements.md) (criteria 1-16, 22-26, 40-46, 57, and Revision 3 criteria 74-121 plus the Canvas coverage table), [brief.md](brief.md), [design-audit.md](design-audit.md), and the canvas light phones (left 390px) of boards A (`Main.dc.html`), B (`NewTrip.dc.html`), C (`ListSuggest.dc.html`), L (`HomeFirst.dc.html`). No Add all, Undo, copy, share or notes. **Rule (criterion 87): values come from the canvas unless listed as a documented deviation.** Sections 9-15 are the Revision 3 additions; **sections 16-19 are Revision 4 and win over any earlier section that says otherwise**; sections 0-8 are the earlier design with the changes marked "(Rev 3)" or "(Rev 4)". Superseded decisions are not deleted: they are listed in section 17 (history).

No separate mockup: the four canvas boards already fix the look. Other, the gated states, the long-list handling and the 320px rules are specified below in prose, ASCII and exact values.

## 0. Inventory and conventions checklist

Read in full: `src/components/ui.tsx` (Screen, ScreenContent, BottomBar, TopBar, IconButton, IconLinkButton, Button, LinkButton, Card, Divider, Kicker, LockedNotice, LockedNoticeInline, ScreenLoading, ScreenError, Field, TabSwitch, ConfirmInlineAction, DeadEndScreen), `inline-otp-panel.tsx`, `src/app/trip/new/page.tsx`, `shopping-list-tab.tsx`, `add-item-sheet-content.tsx`, `verify-inline.tsx`, `check-email/page.tsx`, `src/lib/auth-gate.ts`, `locked-trip-copy.ts`, `trip/[id]/page.tsx` (List tab host). Rev 3 additionally: `src/app/trips/page.tsx`, `src/app/page.tsx`, `src/app/home-screen.tsx`, `trip-type-picker.tsx`, `suggested-card.tsx`, `globals.css` tokens. Rev 4 additionally: `trip-bottom-bar-button.tsx`, `new-trip-form.tsx`, `legal-page.tsx` (`LegalLinks`), and the board A "Your trips" card and board B/C spacers (inline styles).

Conventions this feature follows:

| Concern | Existing convention | Applied here |
|---|---|---|
| Field container | New trip: bare `Field` (white 54px rounded-18 input, 12px label above), grouped blocks in `Card`, section header = `Kicker` | Other input is a `Field`; the tile group sits under a `Kicker` row like "Dates" |
| Section headers | `Kicker` (left) plus a second `Kicker` (right) for the how-to hint ("To get" / "tap a circle to grab it") | "Suggested for this trip" / "tap + to add"; Rev 3: "Start from a template" / "Blank trip" link |
| Row anatomy | `ToGetRow`: 15px semibold name, 12px caption, 44px hit area, `disabled:opacity-60`, aria-label `Claim 'X'` + `aria-describedby` caption id | Suggested row copies it; aria-label `Add 'X' to the list`; row height now fixed by the fidelity list (section 11) |
| Gate | Organizer (unverified): hide-and-reveal plus `InlineVerifyWidget` above the tabs. An unverified non-owner never reaches the List tab (they get `TripSummaryOnly`), so the `/check-email` redirect gate is not used by this feature | Guest "+" uses the new `requestVerification` context method (architecture section 2) and the inline widget; see section 4 |
| Errors | Inline `text-[13px] text-terracotta`, generic strings; `UNEXPECTED_COPY`; `LOCKED_TRIP_COPY.items.long` when the trip is completed | Same; never echoes server text |
| Transient notice | `raceMessage` pill (`rounded-[14px] bg-ink/[0.06] px-3.5 py-2.5 text-[13px] font-medium`), auto-clears | **(Rev 4)** The Suggested success confirmation can no longer sit inline above the card (it would shift the rows under the user's thumb); it becomes a floating notice above the bottom bar (section 16.2) |
| Floating primary action | `BottomBar` + capsule button (`Button variant="capsule"` / `LinkButton variant="capsule"`), static label | New trip's "Create trip" and every other `BottomBar` screen are **unchanged in look**. **(Rev 4)** `BottomBar` must actually stay at the bottom of the viewport (section 16.3). Rev 3: the `/trips` "New trip" pill is the canvas pill, a different material, with its own `LinkButton variant="fab"` and `FabBar` wrapper (section 9.2a) |
| Page chrome | `Screen glow texture` on decorated screens (the welcome page already passes `texture`) | Rev 3: `/trips` gains `texture` (A6) |
| Instrumentation | New trip and shopping list use `trackEvent` only (no `timeClient`); add-item sheet uses neither | `trackEvent(name)` only, success paths only (criteria 19, 20, 39, 58). Rev 3: tile tap events fire on click (section 9.5). No `timeClient`/`timeAsync` labels (criterion 63). Rev 4 adds no events |

**Defects found (flag, do not copy a third time):**
1. `gateOrRedirect` in `shopping-list-tab.tsx` and the inline `requireVerifiedSession` + `redirectToVerify(router, "invitee-shopping-list", ...)` in `add-item-sheet-content.tsx` are the same attempt-then-redirect sequence written twice. The suggestion "+" does **not** become a third caller: it does not call `gateOrRedirect`. The only viewer who can be unverified on the List tab is the organizer, who verifies in place through the inline widget via `requestVerification` (architecture section 2). The existing duplication is out of scope here; flag it for a separate cleanup.
2. `ShoppingListTab` returns early on `allEmpty` and on `shoppingList === null`. A brand-new trip is exactly the `allEmpty` case, so the early return would hide the Suggested card in its main use. The card must render in the `allEmpty` branch too (section 16.2).
3. `Field` has no slot for helper text, counter or error. Don't extend `Field`; render those under it and wire them with `aria-describedby` (Field spreads props onto the input).
4. (Rev 3) `TILE_ICONS` is a private map inside `trip-type-picker.tsx`. The shelf needs the same icons; it must be moved to one shared module, not copied (criterion 95). (Now done: `trip-type-icons.ts`; the new trip rows reuse it, section 16.1.)
5. (Rev 3) `TopBar` renders its `title` in a `<span>`, so `/trips` has no `h1` today. The new "Trips" title must be an `h1` (section 9.2).
6. (Rev 4) **`Screen glow`/`texture` adds `overflow-hidden`, which makes `Screen` a scroll container and defeats `position: sticky` for every sticky child (`BottomBar`, and very likely the sticky `TopBar`).** `FabBar` already works around it with `position: fixed`. This is the likely cause of the "Add an expense / Add an item button is not sticky" report (section 16.3).
7. (Rev 4) The `/trips` `TripRow` still uses a pre-canvas layout (18px padding, "Trip" pill, 22px display name, 36px avatar row, `divide-y` at ink 7%) that was explicitly left unchanged in Rev 3; user testing shows it is the heaviest, loosest part of the page (section 16.1).

## 1. Entry points and happy path

1. (Rev 3) Home entry points to `src/app/trip/new/page.tsx`: a shelf tile (`/trip/new?type=<code>`, that type pre-checked), "Blank trip" (`/trip/new`), the bottom "New trip" pill on `/trips` (`/trip/new`), and on the welcome page also "Create your first trip" (`/trip/new`). Section 9 has the shelf, section 10 the pre-check.
2. **(Rev 4)** Form order: Trip name, **What kind of trip?** (directly under the name), Location, Dates card, planner note, Create trip (BottomBar). Section 16.4.
3. Organizer ticks 0 to 4 tiles. Nothing is saved until Create. (Tapping a Home tile records only an anonymous, name-only usage event; section 9.5.)
4. Create succeeds -> `/trip/<id>`. **Designed behavior (user default, matches architecture U4):** when at least one catalog type was picked, land on `/trip/<id>?tab=list` so the Suggested card is reachable straight away (the page already supports `?tab=list`). **(Rev 4)** The card is now at the end of the list content, so on a brand-new (empty) trip it is the first thing under "Nothing on the list yet."; there is no auto-scroll. With no catalog type (none, or Other only) the landing is unchanged (default tab).
5. **(Rev 4)** List tab: the lists ("Your bag", "To get", "Bought") first, **Suggested card after them**. Tap "+" -> item joins the shared list, leaves the card.

## 2. New trip: "What kind of trip?"

### 2.1 Layout

**(Rev 4) The group now sits directly under the Trip name field** (full order and spacing in section 16.4). The group itself is unchanged:

```
 Trip name  [ Field ]
 (22px)
 WHAT KIND OF TRIP?                    Pick any, or none      <- px-1 (4px) both sides
 (10px)
 +--------------------+ +--------------------+
 | [tent]        ( )  | | [house]       (v)  |   2 x 2 grid, gap 8px
 | Camping            | | Airbnb stay        |   tile min-h 88px, radius 20px, padding 12px
 +--------------------+ +--------------------+
 +--------------------+ +--------------------+
 | [globe]       (v)  | | [pencil]      (v)  |
 | International      | | Other              |
 +--------------------+ +--------------------+
 Your list will open with suggestions for an Airbnb stay and
 international travel, combined with no repeats.          <- adaptive sentence, px-1, mt 10px

 (Other checked)
 Your trip type                                       <- Field label
 [ Ski weekend                               ]        <- Field, 54px
 Saved with this trip. Please don't include           12/30
 names or personal details.
 [error line, when present]
 (22px)
 Location (optional)  [ Field ]   ...then Dates card, planner note
```

- Header row: `Kicker` "What kind of trip?" on the left, `text-[12px] text-ink/[0.68]` "Pick any, or none" on the right, **4px inset each side (`px-1`) and a 10px gap (`h-2.5`) to the grid** (B9). Group: `role="group"` with `aria-labelledby` (Kicker id) and `aria-describedby` (hint id). The page's `h1` is "What are we calling it?".
- **2x2 grid, not the canvas 3-up.** Four tiles in 3 columns orphan the fourth; 2x2 keeps tiles ~171px wide and a stable rhythm. Reason for deviating from canvas B (which has three tiles). Tile height 88px min (not 104) so four tiles do not push Create off screen.
- **Tile = native checkbox in a label.** `<label>` wrapping a visually hidden `<input type="checkbox">` (so keyboard, Space toggle, and screen-reader state are native); tile is the whole hit area (>= 40px). Disabled while submitting.
- Tile content: icon top-left (22px, stroke 2: tent, house, globe from canvas B; `PencilIcon` for Other), state circle top-right, label bottom-left (14px semibold). **Exact tile styling is in the fidelity list (section 11, rows B3, B4, B6, B7).**
- **Checked, not by colour alone:** a filled 20px circle containing a check mark (shape change from the empty ring), plus 1.5px accent border and `--color-accent-soft` fill, plus the icon turning to the accent colour. Unchecked: white fill, `ink/12` border, empty ring. Make the unchecked ring `border-ink/50` rather than the canvas `ink/28` so the control reads at about 3:1 on white (deviation, contrast reason). Keyboard focus: 2px accent outline, 2px offset, via `has-[:focus-visible]` on the label.
- Pick order: the order of check events. Unticking and re-ticking moves the type to the end. No visible numbering (the source line only shows the first type). **A tile pre-checked from Home is first in pick order** (section 10).

### 2.2 Adaptive helper sentence

One `text-[12.5px] leading-[1.45] text-ink/[0.74]` paragraph under the grid, **`mt-2.5 px-1` (canvas margin `10px 4px 0`, B10)**, `aria-live="polite"`. It names only catalog types, in pick order, using a `phrase` field per type that lives in the catalog config (camping -> "camping", airbnb -> "an Airbnb stay", international -> "international travel"). Other is never mentioned. **(Rev 4) Position relative to the grid is unchanged; only what follows it changed: the 22px section gap and the Location field now come after it (16.4).**

| Catalog types picked | Sentence |
|---|---|
| 0 (none, or only Other) | "Your list will start empty. Pick a type to get suggestions you can tap to add." |
| 1 | "Your list will open with suggestions for camping." |
| 2 | "Your list will open with suggestions for an Airbnb stay and international travel, combined with no repeats." (canvas B string verbatim for this pair) |
| 3 | "Your list will open with suggestions for camping, an Airbnb stay and international travel, combined with no repeats." |

(Open question 3 default applied. The 0, 1 and 3 wordings are new copy: confirm.)

### 2.3 Other: reveal, input, copy

- **Reveal:** ticking Other renders the input block directly under the helper sentence (not between tiles), no animation beyond the app default (respect reduced motion). **Focus stays on the Other checkbox**; do not auto-focus the input. After reveal, scroll the block into view with `scrollIntoView({ block: "nearest" })` so the sticky BottomBar does not cover it (**Rev 4: the bar now really is sticky, so the 104px bottom scroll padding of section 16.3 must apply**). **(Rev 4)** The block now pushes the Location field, Dates card and planner note down instead of pushing only the planner note; nothing about its own markup changes.
- **Unticking:** hides the block and **discards** the text and any error (never submitted; not kept on re-tick; no draft persistence, criterion 63). Hidden by not rendering (not CSS-hiding), so it cannot be submitted.
- **Field:** the existing `Field` component. Label "Your trip type" (visible, 12px, above, matches Trip name/Location). Placeholder "Ski weekend" (example only; the label does the naming). `maxLength={30}`, `autoComplete="off"`, `autoCapitalize="sentences"`, `enterKeyHint="done"`. `id="trip-other-type"`. Height 54px (>= 40px).
- **Helper (exact, nothing else):** "Saved with this trip. Please don't include names or personal details." 12px `text-ink/[0.68]` under the field, `id="trip-other-help"`. No purpose, privacy or security wording (criteria 40, 57).
- **Counter:** right-aligned on the helper's row, "12/30" (12px, tabular figures). Visually `12/30`; screen-reader text via an sr-only suffix ("12/30 characters"). Not a live region itself, so it never announces per keystroke. At 30/30 it becomes `font-semibold`. `id="trip-other-count"`.
- **Near/at-limit announcement:** a separate visually hidden `role="status"` (polite) element, empty until length >= 25. At 25 it reads "5 characters left"; it updates only at 25 and at 30 ("Limit reached, 30 of 30"), and clears below 25. Not announced on other keystrokes.
- **aria-describedby** on the input: `trip-other-help trip-other-count` plus `trip-other-error` while an error shows. `aria-invalid="true"` when erroring.
- **Normalisation on submit (silent), in this order:** map typographic characters to their ASCII equivalents (U+2018 and U+2019 to `'`; U+2013 and U+2014 to `-`), so "Sam’s trip" typed on iOS is accepted (architecture U6); then trim, collapse runs of whitespace (including pasted tabs/newlines) to one space, and NFC. Validation (2.4) runs on the normalised text. A paste over 30 characters is truncated by `maxLength` and the counter caps at 30/30.

### 2.4 Validation and errors (inline, generic)

Validate on Create, before any network call. Errors render directly under the helper row as `text-[12.5px] text-terracotta` with `role="alert"`, `id="trip-other-error"`; the input also gets a 1.5px terracotta ring (the message text carries the meaning, so not colour alone). On a failed submit **focus returns to the input** (if the name field is also invalid, focus goes to the first invalid field in page order; the Other error still shows). The error clears as soon as the text becomes valid or Other is unticked. **(Rev 4) Page order is now Trip name, then Other, so the name and the picker are adjacent; the rule is unchanged.**

| Condition | Message |
|---|---|
| Other ticked, trimmed text empty (incl. whitespace only) | "Type a trip type, or untick Other." |
| First character is not a letter or number | "Start with a letter or number." |
| Contains a character the DB charset rule rejects (emoji, `< > " = + @ #`, etc.) | "Use letters, numbers, spaces and - ' & , . / only." |

**The client validates the Other text with the shared allowlist class**, the same class string the database CHECK uses, exported from `validation/trip-type.ts` and kept in step by the drift test (architecture section 3). It is not a denylist and not a separate symbol-range check: a denylist could accept text the DB rejects (criterion 46). Order: run the class check before the length check, so a lone surrogate or astral emoji gets the charset message. The three inline messages above stay as designed and map onto the shared rule's outcomes (empty, first character, any other character). Messages never quote what the user typed.

**Server-side failure** (network, RPC error, CHECK violation, anything else): the existing form-level line above the BottomBar, "Couldn't create the trip — try again." (existing copy). Never shows `error.message`, `details`, constraint or column names (criteria 35, 62). The form keeps everything typed (name, dates, ticks, Other text). Create button re-enables; no fallback creation on a check violation (criterion 61). Known residue: if the DB rejects text the shared class allowed (should be unreachable given the drift test), retry will fail the same way with only the generic message.

### 2.5 States

- **Initial:** all four tiles unticked (or exactly one catalog tile ticked when `initialType` is valid, section 10), matching sentence, no input block. Create works with nothing picked (criterion 2).
- **Submitting:** tiles and Other input disabled (`readOnly` for the input so text stays visible), button "Creating…" (existing).
- **Offline:** form is usable; Create fails into the generic line above. No offline-specific copy (matches the existing page).
- **Long text:** 30 characters fit one line in the 54px field at 16px; no wrapping needed.
- **Migration-not-applied fallback:** trip is created without types; user sees nothing different, then no Suggested card. Silent by design (criterion 31); flagged below.

## 3. Suggested card (List tab)

### 3.1 Placement and shape

**(Rev 4) At the end of the List tab content, after "Your bag", "To get" and "Bought" (whichever are shown). Full placement, spacing and behavior: section 16.2.** (The earlier "above To get" placement is superseded, section 17.)

```
 ... To get card / Bought card (last list block)
 (18px)
 SUGGESTED FOR THIS TRIP                       tap + to add
 (8px)
 +- - - - - - - - - - - - - - - - - - - - - - - - - -+   dashed, radius 22px, no shadow, py 2px
 |  Tent                                          (+) |   row 52px: 4px + 44px button + 4px
 |  Suggested · Camping                               |
 |  - - - - - - - - - - - - - - - - - - - - - - - - -|   divider ink 8%
 |  Trash bags                                    (+) |
 |  Suggested · Airbnb stay                           |
 |  ... (6 rows total)                                |
 |  Show 12 more                                      |
 +- - - - - - - - - - - - - - - - - - - - - - - - - - +
 (40px content bottom padding, then the sticky bottom bar)
```

- Header row identical in shape to "To get": `Kicker` "Suggested for this trip" left, `Kicker` right "tap + to add" (unverified organizer: "confirm your email to add", section 4). The right-hand text is new copy (canvas had "Add all 7", out of scope).
- Container: the canvas dashed outline (`rounded-card border border-dashed border-ink/[0.12] py-0.5 pl-4 pr-1.5`), **not `Card`**. Reason: the dashed, shadowless treatment signals "not on the list yet" against the white `Card` of real items, which is the point of canvas C. One div with class composition. Rows are separated by `border-ink/[0.08]`, none after the last. **Row height and hit area: section 11, rows C5, C6, C9.**
- Row: name `text-[15px] font-semibold`, caption `text-[12px] text-ink/[0.72]` "Suggested · <first-pick type label>" (single type, never "A + B"; canvas C's "Airbnb stay + International" is superseded by criterion 7). Caption `id` = `suggestion-caption-<key>`. **(Rev 3) The name wraps; it is no longer truncated with an ellipsis** (`min-w-0 flex-1 [overflow-wrap:anywhere]`), because criterion 91 forbids truncated text at 320px and the catalog has names such as "Tent footprint or ground tarp" (29 characters, about 200px at 15px/600, which is the whole text column at 320px). A wrapped row is taller than 52px; that is accepted for long names only.
- "+" control: 44x44 hit area, inner 30px circle `--color-accent-soft` fill, `PlusIcon` 15px stroke 2.8 in the accent colour (section 11, C9). `aria-label="Add 'Tent' to the list"`, `aria-describedby` the caption. Disabled (`disabled:opacity-60`) while its own add is in flight; other rows' "+" are also disabled while one is in flight (single `pendingId`, same as claim).
- Order: pick order of types, then catalog order within a type, merged and de-duplicated (criteria 7, 8).

### 3.2 Long lists (designed behavior)

Camping alone is 18 items and three types can exceed 35. **Designed behavior (user default):** the card shows **6 rows**; if more than 7 remain, a 44px text button at the bottom of the card, "Show 12 more" / "Show fewer" (`aria-expanded`), expands the rest in place; if 7 or fewer remain, show them all (never a "Show 1 more"). The count tracks remaining items. **(Rev 4) Where the toggle sits and how scrolling behaves now that the card is the last thing on the page: section 16.2.**

### 3.3 Tap "+" (verified member)

1. Row goes to the in-flight state: "+" dimmed and disabled, caption stays.
2. Item added through the existing add path (name only). On success the list refreshes; the row leaves the card.
3. **(Rev 4)** Success notice: a floating notice just above the bottom bar (section 16.2), auto-clears after about 4s: "Added 'Tent' — everyone on the trip can see it." (satisfies Comp C6: never implies a private tap). Plus a visually hidden `role="status"` carrying "Added Tent to the list." for screen readers. It does not move any row.
4. Focus: the tapped button unmounts, so move focus to the next row's "+" (or the previous one if it was last). If the card disappears (last suggestion), focus moves to the "To get" `Kicker` (`tabIndex={-1}`) so keyboard users are not dropped to the page top; it must end up visible below the sticky top bar (section 16.2).
5. `trackEvent("suggestion_add_complete")` once, name only, after success.

### 3.4 Card lifecycle

- **Last suggestion added:** the card disappears; nothing replaces it (criterion 10). The header row goes with it.
- **Suggestion deleted from the list later:** reappears at its catalog position on the next render (derived, criterion 11). No special UI.
- **Someone else adds the same item meanwhile:** after any refresh it silently leaves the card (name-match dedupe). If the tapper's own insert races, the refresh still removes it and shows the success notice only when their own insert succeeded.
- **Locked (completed) trip:** **the card is hidden** (user default, matches architecture U5). The list cannot change, so suggestions would be a dead control; "To get" and the Locked pill already explain the state.

### 3.5 Other card states

| State | Behavior |
|---|---|
| Loading | No separate loading state. Types come with the trip view and the catalog is bundled, so the card renders on first paint with no spinner. If the list fetch is in flight at page level, the existing page loading applies. |
| Empty list (new trip) | **(Rev 4)** The existing "Nothing on the list yet." (muted, `px-1`) first, then 18px, then the card. The card must render in the `allEmpty` branch (defect 2). No template tiles here (criterion 90, 98). |
| No types, only Other, or **old trip with no types** | No card, no placeholder, no "add a type" prompt (no editing in 0.8.0). Page identical to today (criterion 5). |
| List failed to load (`shoppingList === null`) | Existing "Couldn't load the list — try again in a moment." only; no card (it cannot de-duplicate without the list). |
| All suggestions already on the list | No card. |
| Completed trip | No card (3.4). |
| Long name | Wraps (see 3.1); full name also in the aria-label and in the success notice, which wraps. |
| Add error (verified) | Terracotta line directly above the card's header row (same slot as `actionError`, 12px below it): "Couldn't add 'Tent' — try again." The row's "+" is live again. If the trip became completed meanwhile: `LOCKED_TRIP_COPY.items.long`. Never shows a server or constraint message (criterion 35). It is the only element that may shift the card (it is rare and demands attention). |
| Offline | Card renders from the bundle, "+" is tappable; the add fails into: "Couldn't add 'Tent' — check your connection and try again." (existing join-page phrasing), used when `navigator.onLine === false`, else the generic line above. |
| Sign-out / token expiry mid-add | The session check on tap fails and the tap is treated as the unverified case (section 4); a waiting row never survives sign-out. |

## 4. Unverified (guest) states

**Resolution of the earlier open question:** an unverified non-owner never reaches the List tab (they see `TripSummaryOnly`), so the only unverified viewer of the Suggested card is **the organizer of this trip**. The card is visible read-only to everyone who can see the List tab; "+" is shown on every row but, for the unverified organizer, routes into the inline verification widget instead of adding. This differs from `ToGetRow`, which hides its circle control for unverified viewers; here the control must stay visible because it is the entry to verification. The right-hand header text tells them why: "confirm your email to add".

The guest "+" does **not** call `gateOrRedirect` and does not navigate away. It stores the tapped item name in a single in-memory pending slot and calls `requestVerification()` (new additive method on `TripVerificationContext`, read as optional). The pending item is **memory only**: never the URL, `sessionStorage`, `localStorage`, or `pending-action.ts` (ADR 0015).

### 4.1 Unverified organizer (primary new-trip path)

A brand-new organizer is always anonymous, so **the first "+" tap for almost every new trip goes through this flow**. The trip page already shows `InlineVerifyWidget` (accent-soft panel with the inline OTP panel) above the tabs. No new screen. **(Rev 4) Because the card is now at the bottom of the page and the widget is at the top, tapping "+" scrolls the page up to the widget (the sticky top bar stays), and after the replay completes the page scrolls back so the card is in view (`block: "nearest"`, respecting the scroll padding of 16.3).**

```
 widget (existing)                 List tab (card at the end of the list)
 "Confirm your email to start      Suggested row:
  adding expenses or inviting       Tent
  others."                          Suggested · Camping            (+)
        |  tap "+" on Tent
        v
 "Confirm your email to add        Tent
  'Tent' to the list."              Adds after you confirm your email   [Cancel]
 [ you@email.com ] [Send code]
        | code confirmed -> "You're verified." (existing, ~0.9s) -> widget unmounts
        v
 Tent row: "Adding…" -> leaves the card -> success notice
```

**Where the pending slot lives.** The widget headline and the Cancel path both need the item name, and the widget sits above the tabs, outside `ShoppingListTab`. Architecture owns the final choice (S1): the slot is either lifted into `TripVerificationProvider` (exposing the pending name and a clear/cancel function through the context) or kept in `ShoppingListTab` and passed up. The UI below is written to work with either: the widget reads "the pending item name, if any" from the verification context, and the row reads "is my item pending, and is it still valid" from the same source. Whichever side holds it, these lifecycle rules are fixed by design and must hold:

- The slot holds only `{ item name, tapped-at time, user id }`: catalog text, never Other text.
- **It expires at the 10-minute TTL.** On expiry the waiting row silently reverts to a normal "+" (caption back to "Suggested · <type>"), the widget headline reverts to its normal copy, and nothing is added. The row must never keep showing "Adds after you confirm your email" after the slot has expired (enforce the TTL on read, plus a timer or re-render at expiry).
- **It clears when the user leaves the List tab**, on Cancel, on sign-out, after use (replay), and on reload.

1. **Tap "+"** (unverified organizer): no network call. The row enters a *waiting* state: the "+" is replaced by a 44px text button "Cancel" and the caption becomes "Adds after you confirm your email". Only one item can wait; tapping another "+" moves the waiting state to it (the previous reverts to normal).
2. The widget headline swaps to "Confirm your email to add 'Tent' to the list." (name is catalog text, so safe). Reverts to its normal headline on cancel, expiry, tab leave and sign-out.
3. `requestVerification()` scrolls the widget into view (`scrollIntoView({ block: "center", behavior: "smooth" })`, instant under reduced motion) and **focuses its email field** (or the code field if the widget is already on the code step). Remembered email stays a prefill only; nothing is sent until the user taps "Send me a sign-in code" (existing behavior and copy).
4. Existing OTP steps, copy and errors are unchanged: "Sending…", "We sent a code to …", "Confirm code", resend, wrong-code and send errors inside the widget, name step if the account has no name. The add waits for the name step too: replay runs only once the user is fully verified.
5. On success the existing "You're verified." confirmation shows, then the widget unmounts. The pending add **auto-runs once** (replay, criterion 26: only the tapped item, in memory only; nothing is replayed without that tap). Replay re-checks that the item is still a current suggestion (not already on the list) and that the session is still the tapping user's; if not, it drops silently. The row shows "Adding…", then leaves the card; success notice as in 3.3; scroll the card into view if it moved off screen.
6. **Failure after verifying:** the waiting state clears, the row returns to a normal "+", and the line "Couldn't add 'Tent' — try again." shows. The user is verified, so a second tap just works.
7. **Cancel / abandon:** "Cancel" clears the waiting state, restores the widget headline, no add. Leaving the List tab, signing out, reloading or waiting past 10 minutes also clears it (memory only, no persistence). Tapping another "+" moves the waiting state. A user who never verifies simply sees the waiting row until it expires or they cancel; nothing is added.

### 4.2 Unverified invitee: unreachable

Not designed. An unverified non-owner never reaches the List tab (`getTripView` returns nothing for them and they get `TripSummaryOnly`), so there is no invitee "+" flow, no `/check-email` redirect for this feature, no `sessionStorage` and no resume after redirect. If a future change makes the List tab visible to unverified non-owners, that needs a new architecture and security review (ADR 0015) before any UI is specified.

### 4.3 Rejected inserts

UI hiding is UX only (criterion 25). If RLS rejects the insert for any reason (not a member, not verified, trip completed), the user sees the generic "Couldn't add 'Tent' — try again." and the server decides; no variant copy reveals why.

## 5. Accessibility summary

- New trip: group has a label and a hint; each tile is a native checkbox with a visible check shape; focus-visible ring; Other checkbox keeps focus on reveal; input has a visible label, helper and counter in `aria-describedby`, error is `role="alert"` and linked, focus returns on failed submit; counter text is not live; separate polite status at 25 and 30 characters only; input 54px tall; tiles 88px.
- List: "+" is 44px, labelled with the item name, described by its caption; success and "Adding…" are announced by a polite `role="status"`; focus moves to the next "+" or the "To get" heading after an add; the disclosure button uses `aria-expanded`; waiting state "Cancel" is a 44px button; when the waiting row expires or is cancelled, focus stays where it is unless the Cancel button itself unmounted, in which case it moves to that row's "+". **(Rev 4) Focus is never hidden behind the sticky top bar or the sticky bottom bar (scroll padding, 16.3); the floating success notice is `aria-hidden` and does not take pointer events.**
- Home (Rev 3): the shelf is a labelled `<section>`; tiles and "Blank trip" are links with 44px+ hit areas; tab order Blank trip, tiles, then trips; link names read "Camping, 18 items"; visible focus ring; the page has one `h1` ("Trips"). **(Rev 4) Each trip row is one link; its accessible name is its visible text read in order: name, then the subtitle, then the balance, then "Locked" when completed (the icon is `aria-hidden`).**
- Colour is never the only signal: checked tiles add a check shape; errors carry text; terracotta is paired with a message.
- Reduced motion: no scroll animation, no reveal animation. The "New trip" pill has no entrance animation.

## 6. Constraints satisfied

| Constraint | How the design meets it |
|---|---|
| Comp C6 / criterion 45-ish (not private) | Success notice says everyone on the trip can see the item; the card is described as "for this trip"; no private-sounding copy. |
| Comp O5 / criteria 40, 42, 57 (helper copy) | Other helper is exactly "Saved with this trip. Please don't include names or personal details." Only a fact and an instruction; no privacy/security claim and no stated purpose. |
| Criteria 41-46 (Other UI) | Reveal on check, discard on uncheck, `autoComplete="off"`, visible label, helper, `maxLength` 30, counter, empty-text inline error, `aria-describedby`, announced error, focus return, >= 40px input, check not colour-only, focus stays on checkbox. |
| Criterion 46 / charset | Client validates with the shared allowlist class (same as the DB CHECK, drift-tested), not a denylist; inline messages for disallowed characters; emoji not allowed; plain text only; smart quotes and en/em dashes mapped to ASCII before validation. |
| Criteria 35, 62 (no raw errors) | Every create/add failure uses fixed copy; typed text and constraint/column names are never echoed. |
| Criteria 63, 53 (no side channels) | Other text is component state only: no URL, storage, draft, event or perf label. Events fire only on success (Rev 3: tile events on click) and carry no properties. Rev 4 adds no events, storage or data. |
| Criteria 15, 16, 25, 26 (gate) | Memory only: the pending item (catalog name, tap time, user id) is held in memory, never in a URL, `sessionStorage` or `pending-action.ts`; replays only the tapped item once; cleared on use, Cancel, tab leave, sign-out, reload and the 10-minute TTL. The guest "+" uses `requestVerification` and the existing inline widget; the unreachable invitee path is not designed (4.2). RLS decides the insert. |
| Criteria 10, 11, 14 | Card disappears when empty; deleted suggestions reappear; no Add all, Undo, copy, share, notes. Template tiles exist only on Home (criteria 90, 98). |
| Criterion 22 (light only) | Uses existing light tokens/classes; dashed card and tiles use `ink` opacities and `--color-accent-*`; one new light token and one new button variant (section 12). Rev 4 row styling uses only existing tokens and `ink` opacities. |
| Criterion 56 (privacy page) | Not a design-doc change, but design copy above is consistent with the planned privacy text (neither adds claims). `/terms`: no promise about user-entered trip text is made by any copy here. |
| Criteria 74-80, 96, 116 (Rev 3 copy) | Shelf, tile and first-run copy are factual ("N items", "Blank trip", the "No trips yet" sentence). No "nothing is saved", "no sign-up needed" or "we don't track what you tap" anywhere near the shelf or first-run card. |
| Criteria 94, 106, 107, 119 (Rev 3, public page) | The shelf is static: bundled catalog strings and counts only, tile hrefs built from catalog code literals, no fetch, Supabase call or sign-in, `src/app/page.tsx` still reads only `signin`. |
| Criteria 81-84, 101-110 (Rev 3, `?type=`) | Closed-set code only, parsed on the server, exact match, invalid ignored, never echoed, no redirect, no storage (section 10). |
| Criteria 85, 111-114 (Rev 3, analytics) | Four name-only events built through a closed-set helper, fired on click, never blocking navigation (section 9.5). |
| Rev 4 data rule | The trip rows keep showing the same data the page shows today (name, dates, people count, total, your balance, Locked); only the avatar stack is dropped (16.1). The row's icon uses the trip's catalog type **code** (already selected in `TRIP_LIST_COLUMNS`); the Other text (`other_type`) is never read on this page. |

## 7. Consistency with existing screens

Reused: `Screen`/`ScreenContent`/`TopBar`/`BottomBar`/`Button variant="capsule"` (New trip shell unchanged); `Field` (Other input); `Kicker` (group header, card header, both right-hand hints, shelf header, "Your trips", **Rev 4: "Ongoing" / "Completed"**); `Card` for the "Dates", the first-run card, the unchanged real-item cards and **the Rev 4 trip rows**; `PencilIcon`, `PlusIcon`, `CheckIcon`, `TentIcon`, `HouseIcon`, `GlobeIcon` (and `iconForTripType`, Rev 4 rows); `ToGetRow` row anatomy; the `raceMessage` pill and `actionError` slot; `UNEXPECTED_COPY` style generic errors; `LOCKED_TRIP_COPY.items.long`; `InlineVerifyWidget`, `InlineOtpPanel` and `TripVerificationProvider` (plus the additive `requestVerification` method); existing "Creating…" and "Couldn't create the trip — try again." copy; (Rev 3) `LinkButton` (with one new variant, `fab`), `Screen glow texture`, `IconLinkButton` for Feedback. Not reused on purpose: `gateOrRedirect`/`redirectToVerify`, `/check-email` and `pending-action.ts` (unreachable for this feature, ADR 0015). `BottomBar` and `variant="capsule"` are not used for the `/trips` pill. **(Rev 4)** `AvatarStack` stays in `ui.tsx` for the trip page but is no longer used on `/trips`.

**Revision 3 QA follow-up (exact values, 2026-10-14).** (1) `Kicker` gained an opt-in `canvas` prop (ink 74%, 13px line box, class `text-kicker-canvas`) used only by the shelf, "Your trips", the New trip picker and the Suggested card; the shared kicker on every other screen is unchanged. **(Rev 4) It is also used by "Ongoing" / "Completed" on `/trips`.** (2) Tile text stack now matches the board: label line-height 18px, count line-height normal (14px) with no margin, and a transparent 1px border (the canvas box model), so icon top, label and count sit at 15 / 27 / 13px from the tile edges as on board A. (3) On `/trips` the gap under the title is 22px rather than 24px, so the kicker sits 62px below the h1 top as on board A (the 40px Feedback button makes the top bar taller than the 36px title); the kicker-to-tile gap is 23px. "Blank trip" uses `leading-none` with 16px vertical padding (44px hit area) so it does not make the header row taller than the kicker. (4) The tile's accessible name is an explicit `aria-label` ("Camping, 18 items"); a hidden ", " span read as "Camping , 18 items" in Chromium. (5) At 320px "International" wraps to two lines (rule: `overflow-wrap:anywhere` plus `hyphens:auto`, `lang="en"` is set). Headless Chrome for Testing has no hyphenation dictionary, so there it breaks at the last fitting character ("Internati / onal"); a browser with a dictionary hyphenates at a syllable. Both outcomes are the documented rule; nothing is clipped.

Deliberate deviations from the canvas (with reasons) that are **still in force**:
1. 2x2 tile grid and 88px tiles instead of canvas B's 3-up 104px (four tiles) (B1, B2).
2. Unchecked tile ring at `ink/50` instead of `ink/28` (contrast of the control indicator) (B5).
3. Suggested card is a dashed shadowless container, not `Card` (canvas C intent: "not yet on the list").
4. Source line shows only the first-pick type with a "Suggested · " prefix, not canvas C's "A + B" (C7).
5. "+" is visible and active for the unverified organizer, unlike hidden claim controls (it is the entry to verification).
6. Pending-add auto-run is new for this tab, held in memory only: today shopping-list one-tap mutations have no resume, and `pending-action.ts` (sessionStorage) is deliberately not used.
7. (Rev 3) Header hint "tap + to add" instead of the "Add all 7" pill until 0.8.1 (C2); first 6 rows then "Show N more" (C11); real catalog names (C13); richer "+" aria-label (C10); caption ink/72 instead of 68 (C8); "Pick any, or none" capitalised (B9).
8. (Rev 3, Home) `/trips` keeps the Ongoing / Completed grouping instead of canvas A's single "Your trips" card; no profile avatar (A3, criterion 89); the Feedback icon stays beside the title. **(Rev 4) The grouping stays, but the rows now follow board A's row (section 16.1); the "3 to get" subtitle and the "Now" pill are not built (no data for them; the "Now" pill is replaced by the balance label, the only state label the app shows).**
9. (Rev 3, New trip) The Create button material, shell, h1, Location and Dates card internals and planner note are existing UI and are not restyled (B13, B14, criterion 89). **(Rev 4) Their order changed (16.4).**
10. (Rev 3) Suggested row names wrap instead of truncating (3.1), for criterion 91.
11. (Rev 3) Pill: **no deviation.** User decision 2026-10-14: the `/trips` "New trip" pill matches the canvas exactly (section 9.2a).
12. **(Rev 4)** Trip row divider is ink 15% rather than board A's ink 8% (user feedback "separator line not clear"; section 16.1). Row subtitle ink/72 instead of 68 (same caption rule as C8). Compact en-dash date range "Mar 5–9" as on the board.
13. **(Rev 4)** Suggested success confirmation is a floating notice above the bottom bar, not the inline `raceMessage` pill (layout shift; 16.2).

Superseded deviations and decisions: section 17.

## 8. Items for the user / PM

Resolved by the user's defaults (now designed behavior, listed for the record): after Create with a catalog type land on `?tab=list`; Suggested card shows 6 rows plus "Show N more" / "Show fewer"; the card is hidden on completed trips. Change them only if the user says otherwise.

1. **First-run friction:** a new organizer is anonymous, so the first "+" always needs email confirmation. Design makes it as light as possible (inline, auto-add), but the user should know this is the main path, not an edge case.
2. **New copy to approve:** adaptive sentences for 0/1/3 types; Other label "Your trip type"; placeholder "Ski weekend"; the three inline Other errors; card hint "tap + to add" / "confirm your email to add"; notice "Added 'X' — everyone on the trip can see it."; waiting caption "Adds after you confirm your email"; widget headline "Confirm your email to add 'X' to the list."; "Show N more" / "Show fewer"; add-error lines (generic and offline). Rev 3 Home copy is canvas copy and needs no approval (section 15). Rev 4 adds no new copy except the row subtitle assembly rules (16.1: "No expenses yet", "Settled up", "You owe", "You're owed" are existing strings).
3. **Silent fallback:** if the migration is not applied, the trip is created without types and the user is never told (criterion 31). Acceptable, but the organizer would not understand why no card appears.
4. **No way to fix or add types later** in 0.8.0 (old trips and skipped pickers get no card and no prompt). Deliberate; 0.8.1 question.
5. **Minor, no PM call needed:** failed Create focuses the first invalid field in page order, which gives the name field the same treatment the Other field needs.
6. **For the architect (S1):** confirm whether the pending slot is lifted into `TripVerificationProvider`; the design works either way but needs the name readable by the widget and the TTL/clear rules above.
7. **Rev 3 open decisions:** section 15. **Rev 4 open decisions:** section 19.

---

# Revision 3 (approved 2026-10-14)

## 9. Home template shelf: boards A and L (`/trips`), and the welcome page `/`

Canvas values below are copied from the inline styles of `Main.dc.html` (A) and `HomeFirst.dc.html` (L), light theme, left 390px phone. Canvas tokens: `tx` #231c12 = `--color-ink`; `mu` ink/.74; `fa` ink/.68; `cd` #ffffff; `sh` = `--shadow-card`; `ac` oklch(0.45 0.09 80) = `--color-accent`; `mi` oklch(0.42 0.08 80) = `--color-accent-ink` (new, section 12); `hr` rgba(35,28,18,.08); `ch` oklch(0.95 0.04 88) = `--color-accent-soft`; `tint` rgba(35,28,18,.05); `fb` rgba(35,28,18,.9); `fsh` 0 10px 30px rgba(35,28,18,.28). The app's gutter is 20px (`ScreenContent px-5`), not the canvas 16px; that is an app-wide convention and stays, so all widths below are 350px of content at 390px.

### 9.1 Shared component

`TemplateShelf` (one component, used by `/trips` and `/`): header row, tile grid, no trips section. Suggested files: `src/components/template-shelf.tsx` (server-renderable, no state, reads `STARTER_TYPES`), `src/components/template-tile.tsx` (`"use client"`, only for the `onClick` analytics call), `src/components/trip-type-icons.ts` (the shared icon map used by the picker and the shelf; defect 4). If `STARTER_TYPES` is empty the component renders nothing, including no header (criterion 119).

### 9.2 `/trips` page, top to bottom (390px)

```
 [Screen glow texture]                                  page gutter 20px
 Trips                                   [feedback icon]   <- h1, TopBar
 (22px)
 START FROM A TEMPLATE                          Blank trip   <- px-1
 (10px)
 +---------+ +---------+ +---------+
 | [tent]  | | [house] | | [globe] |   3 columns, gap 8px, each 128px tall, radius 20px
 |         | |         | |         |
 | Camping | | Airbnb  | | Interna |   label 14px/600
 | 18 items| | 15 items| | 12 items|   count 11.5px ink/68
 +---------+ +---------+ +---------+
 (26px)
 YOUR TRIPS   (first run: kicker + card)  |  "Ongoing" / "Completed" blocks: Rev 4 rows (section 16.1)
 ...
 (end of content, LegalLinks)
 [ FabBar:  ( + New trip )  ]       <- 56px flat pill, 14px sides, 18px bottom (9.2a)
```

| Element | Exact value | Source |
|---|---|---|
| Page chrome | `Screen glow texture` (adds the paw print) | A6 |
| Title | `h1` text "Trips", `text-display text-[36px] leading-none`, in `TopBar title={<h1 ...>Trips</h1>} titleClassName=""` (TopBar wraps the title in a span; an `h1` inside it gives the page its heading). Canvas: Bricolage 600, -0.03em, 36px, line-height 1, inset 4px (TopBar already has `px-1`). The Feedback `IconLinkButton` stays in `trailing`; the "New trip" plus icon is removed. | A3 |
| Avatar | Not built | criterion 89 |
| "You left X." banner | Unchanged, directly under the TopBar (`h-3` after it) | existing |
| Gap title to shelf | 22px (see Revision 3 QA follow-up) | A |
| Shelf header | `flex items-baseline justify-between px-1`: left `Kicker` "Start from a template" (the shelf is `<section aria-labelledby>`; the Kicker carries the id); right "Blank trip" link | A |
| "Blank trip" | `Link href="/trip/new"`, 12px/600, colour `var(--color-accent-ink)`, no underline, hit area at least 44px high with padding and an equal negative margin (`-my-3.5 py-3.5 -mr-2 pl-2 pr-2` pattern) so layout is unchanged; focus ring as picker tiles | A, criterion 80 |
| Gap header to grid | 10px (`h-2.5`) | A |
| Grid | `grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2` (3 columns, 8px) | A |
| Tile | `Link href="/trip/new?type=<code>"`, `flex h-[128px] min-w-0 flex-col justify-between rounded-[20px] bg-white p-[14px_12px_12px] shadow-card`, no border (canvas border is transparent) | A |
| Tile icon | 22px, stroke 2, `color: var(--color-accent)` (canvas stroke `ac`) | A |
| Tile label | `block text-[14px] font-semibold leading-tight` + wrap rule (9.4) | A |
| Tile count | `block text-[11.5px] text-ink/[0.68]`: "18 items", "1 item" for one | A |
| Accessible name | Explicit `aria-label` "Camping, 18 items". Icon `aria-hidden`. | criterion 80 |
| Focus | Same ring as the picker tiles: 2px `--color-accent` outline, 2px offset (global `:focus-visible` already does this; do not remove it) | criterion 80 |
| Gap shelf to next section | 26px (`h-[26px]`) | A |
| "Your trips" kicker (first run only) | `Kicker canvas className="px-1"` "Your trips", then 10px (`h-2.5`) | L |
| Trips present | "Ongoing" / "Completed" kickers and cards with the **Rev 4 rows and spacing (section 16.1)** (no extra "Your trips" kicker, so there is one section label, not two) | A5 |
| Bottom pill | The canvas pill, exact (9.2a). Replaces the top-bar plus and the "Start a trip" button. Fires no analytics event (9.5). | A, criterion 77 |
| Content never hidden by the pill | `FabBar` is fixed and the page adds a bottom spacer after `LegalLinks`, so at the end of the scroll the last row and `LegalLinks` end above it. While scrolling, content passes under the pill exactly as on the canvas. | criterion 77 |

#### 9.2a Bottom "New trip" pill: exact canvas values (user decision, no deviation)

Canvas source: `Main.dc.html` and `HomeFirst.dc.html`, the absolutely positioned `<div>` (left 14px, right 14px, bottom 18px) and its `<a>`.

| Property | Exact value |
|---|---|
| Position | 14px from the left and right edges of the screen, 18px from the bottom edge |
| Size | full width between the insets, height 56px |
| Shape | fully round (`rounded-full`, canvas radius 999px) |
| Fill | `rgba(35,28,18,.9)` = ink at 90%, flat: no blur, no gradient, no entrance animation |
| Text | "New trip", white, 16px, weight 600 |
| Icon | plus, 19px, stroke 2.6, round caps and joins, `currentColor`, before the text |
| Layout | centred, gap 8px |
| Shadow | `0 10px 30px rgba(35,28,18,.28)` |
| Behind it | nothing (no bar background or gradient: the canvas has none) |
| Link | `href="/trip/new"` |

How to build it without touching any existing screen:

- **New `LinkButton` variant `fab`** in `buttonVariantClasses`: `text-white [background:color-mix(in_srgb,var(--color-ink)_90%,transparent)] [box-shadow:0_10px_30px_rgba(35,28,18,.28)]`. No `backdrop-blur-xl`, no `animate-capsule-in`. Used as `<LinkButton href="/trip/new" variant="fab" className="text-[16px]">` with `<PlusIcon size={19} strokeWidth={2.6} />` then "New trip".
- **New `FabBar` wrapper** in `ui.tsx`, next to `BottomBar` (built `fixed`, centred, `max-w-md`, `px-3.5`, `pb-[max(18px,env(safe-area-inset-bottom))]`, `z-10`, wrapper ignores pointer events). Transparent, no gradient.
- **Unchanged:** `BottomBar` and `variant="capsule"` look (their 16px sides, 24px bottom, gradient, blur and entrance animation are not altered); Rev 4 only requires that `BottomBar` actually sticks (16.3).
- The pill is a link to `/trip/new` with the accessible name "New trip"; the icon is `aria-hidden`.

Shelf in every state:

| State | Under the shelf |
|---|---|
| Trips present | Ongoing / Completed blocks (Rev 4 rows) |
| Zero trips, no error | "Your trips" kicker + first-run card (9.3) |
| Load error | The existing `<p className="px-1 text-[13px] text-terracotta">Couldn't load your trips.</p>` directly below the shelf (26px gap); no first-run card; shelf and pill still show |
| Loading | None. `/trips` is server-rendered; there is no client loading state, so the shelf is part of the first paint. |

### 9.3 First-run card (board L)

Shown only when there is no error and zero trips. Kicker "Your trips" (`px-1`), 10px, then one `Card` with `px-5 py-7 text-center` (canvas padding 28px 20px, radius 22 = `rounded-card`, white, `shadow-card`):

- Title: "No trips yet", `block text-[15px] font-semibold`.
- Body: "Pick a template above and your list starts with the basics. Your trips will show up here.", `mt-1.5 block text-[13px] leading-[1.45] text-ink/[0.74]` (canvas `mu`).
- No button inside (the pill is the entry point). Copy is exactly the canvas text and stays factual (criteria 79, 116).

### 9.4 Narrow screens: 320px

At 390px a tile is (350 - 16) / 3 = 111px wide with 87px of text width. At 320px it is (280 - 16) / 3 = 88px wide with 64px of text width. "International" at 14px/600 is about 88px, so it fits at neither width without breaking at 320 (it only just fits at 390). Wrap rule, applied to the tile label (and nothing else):

1. Label element: `min-w-0 [overflow-wrap:anywhere] [hyphens:auto] leading-tight`, with `lang="en"` inherited from the document. Never `truncate`, never `text-ellipsis`, never `whitespace-nowrap`, never a smaller font.
2. A multi-word label ("Airbnb stay") wraps at the space to two lines. A single long word ("International") wraps at a hyphenation point ("Inter-national") where the browser supports `hyphens: auto`, and otherwise breaks at the last character that fits. Both outcomes are acceptable; clipping is not.
3. The tile keeps its fixed 128px height: icon 22px + up to two label lines (about 36px) + count line (about 15px) + padding 26px = about 100px, so it never overflows. The text block stays pinned to the bottom (`justify-between`); the count never wraps ("18 items" is about 48px).
4. No horizontal scroll: the grid uses `minmax(0, 1fr)` and the tile `min-w-0`; the page container is already `max-w-md w-full`.
5. The "Start from a template" kicker (about 155px) and "Blank trip" (about 55px) fit on one row at 280px (210px used). If a future translation or font size makes them collide, the link may drop under the kicker; it must never overlap.
6. The bottom pill stays 56px high and spans the screen less 14px each side (292px wide at 320px).
7. On the welcome page the same rule applies (same component).

### 9.5 Tap behavior and analytics

- Tile tap: navigate to `/trip/new?type=<code>` (`Link`, no custom navigation). "Blank trip": `/trip/new`. Both work with a modified click (open in new tab) because they are real links.
- Analytics (criteria 85, 111-114): tile `onClick` calls the closed-set helper with the tile's own catalog `code` (never from the URL or DOM); if it returns a name, `trackEvent(name)` with exactly one argument, inside a try/catch so a failure can never block navigation; the click handler never awaits and never calls `preventDefault`. The shelf's "Blank trip" link fires `home_blank_trip_tapped` the same way. The bottom pill and the welcome page's "Create your first trip" fire nothing. No event fires on render or on `/trip/new` load. Trip rows fire nothing.
- The shelf makes no network call and writes no storage (criteria 107, 110).

### 9.6 Welcome page `/` (criterion 76)

Behavior unchanged: `page.tsx` still reads only `signin` and keeps every redirect; `?signin=1` still shows only the sign-in form (no shelf there). The shelf lives inside `WelcomeContent` in `home-screen.tsx`.

New order of the welcome content:

```
 [Miso photo + "Divide by 6?" bubble]
 (28px)
 You have fun. Miso does the math.            <- h1, unchanged
 (14px)
 Add what you spend. Miso works out ...       <- intro, unchanged
 (28px)
 START FROM A TEMPLATE            Blank trip
 (10px)
 [ tent ] [ house ] [ globe ]            <- same TemplateShelf, same tiles, counts and links
 (26px)
 [ Create your first trip -> ]                <- unchanged, still the blank path
 (10px)
 I have an invite link                        <- unchanged
 Already have a trip? Sign in                 <- unchanged
 (24px)
 [infinity expenses a day] [0 accounts to join]   <- unchanged
 LegalLinks
```

- The shelf sits between the intro copy and "Create your first trip": the 28px gap that was there stays above the shelf, and a 26px gap (`h-[26px]`) separates the shelf from the button.
- The shelf on the welcome page has **no "Your trips" section and no bottom pill**. "Create your first trip" remains the single primary button.
- Rationale for placement: a first-time organizer reads the pitch, sees the three starting points, then has the plain "Create your first trip" as the no-template path. Placing tiles above the pitch would push the explanation off the first screen.
- Height check: about 350px of art, h1 and intro, then 175px of shelf puts "Create your first trip" at about 590px of an 844px screen, so it stays on the first screen at 390px. At 320px width (short phones about 568px tall) the button may fall below the fold; acceptable, the page already scrolls.
- "Blank trip" next to a "Create your first trip" button is a small redundancy; kept because the shelf is one shared component (decision 2 in section 15).
- Texture and glow stay as today (`texture={!showSignIn}`).
- Welcome page tiles and "Blank trip" fire the same events as `/trips` (they are the same component).

## 10. `?type=` pre-check on New trip

Contract (criteria 81-84, 101-110), seen from the user:

| Situation | Result |
|---|---|
| Tile tapped, URL `/trip/new?type=camping` | Form opens with the Camping tile already checked on the first paint, and the one-type sentence "Your list will open with suggestions for camping." No flash of an unchecked tile, no tile animation, no focus move, no announcement beyond the normal page load. **(Rev 4) The checked tile is now visible right under the name field, so the user sees the pre-check without scrolling.** |
| Direct deep link with a valid code (signed out or in) | Same. 200, no redirect, no sign-in prompt. No `home_template_tapped_*` event (intended). |
| "Blank trip" or pill, `/trip/new` | Blank form, exactly as today. |
| Unknown code, empty, wrong case (`Camping`), padded (`camping `), `other`, `__proto__`, repeated parameter (`?type=camping&type=junk`), array, malformed encoding, markup in the value, extra parameters | Blank form. 200, no redirect, no error text, no mention of the value anywhere on the page. |
| User unticks the pre-checked tile | Behaves as an unchecked tile; Create makes a trip with no type (as today). |
| User ticks more tiles or Other | Pick order starts with the pre-checked type, then ticks in order. The sentence follows. |
| Create with the pre-checked type | Unchanged: trip stored with the type, landing on `/trip/<id>?tab=list` (the code is never appended to later URLs, criterion 109). |
| Back/close | The existing close affordance returns to the launching page (`/trips` or `/`). Nothing is remembered; reopening `/trip/new` is blank. |
| Browser restore / refresh | Re-reads the URL, so a refresh keeps the pre-check; there is no storage. |

All other query keys, including any `utm_*`, are ignored and never read.

Implementation constraints the design depends on: the pick is read once from a server-validated typed prop into the initial state of the form (no effect, no `useSearchParams`), only the validated catalog code crosses to the client form, and the pre-check never auto-submits.

## 11. Fidelity fix list (boards B and C, plus the A/L page fixes)

One list. "Target" is what engineering builds; QA verifies it against the "Canvas source" column (element in the named board file). Everything not listed here keeps its current built value. Paths: B = `NewTrip.dc.html`, C = `ListSuggest.dc.html`, A = `Main.dc.html`, L = `HomeFirst.dc.html`.

### 11.1 Board B (New trip picker, in `trip-type-picker.tsx` and `trip/new/new-trip-form.tsx`; `page.tsx` is now the thin server wrapper)

| Audit row | Element | Built now | Target (exact) | Canvas source |
|---|---|---|---|---|
| B3 | Tile padding | `p-3.5` (14px) | `p-3` (12px) all sides | B tile `padding: 12px` |
| B4 | Tile border width | 1px unchecked, 1.5px checked (tile jumps 0.5px per side on toggle) | **1.5px in both states**: `border-[1.5px]` on the label always; unchecked `border-ink/[0.12]`, checked `border-[var(--color-accent)]`. Nothing else on the tile changes size on toggle. | B tile `border: 1.5px solid` (chb or ac) |
| B6 | Icon colour | `--color-accent-deep` in both states | Unchecked: `text-ink/[0.74]` (canvas `mu`); checked: `var(--color-accent-ink)` (oklch(0.42 0.08 80)). The wrapper span carries the colour, the icon uses `currentColor`. | B tile svg `stroke` mu / mi |
| B7 | Check glyph | `CheckIcon size={12} strokeWidth={3.2}` | `size={11} strokeWidth={3.4}`; circle stays 20px, fill `var(--color-accent)`, glyph white | B check svg 11px, stroke-width 3.4 |
| B5 | Unchecked ring | `ink/50` 1.8px | **Keep** `border-[1.8px] border-ink/50` (documented deviation; canvas ink/.28) | B ring `border: 1.8px solid ci` |
| B8 | Checked fill | accent-soft | Matches, no change | B `ch` |
| B9 | Group header insets and gap | no inset, `h-1.5` (6px) | Header row `flex items-baseline justify-between px-1`; spacer `h-2.5` (10px). Hint text keeps the capital "Pick any, or none". | B header `padding: 0 4px`, gap 10px |
| B10 | Helper sentence inset | `mt-2.5`, no side inset | `mt-2.5 px-1` (4px each side) | B `margin: 10px 4px 0` |
| B12 | Gap between the field(s) above the picker and the picker | `h-[22px]` after the Dates card | **(Rev 4) `h-[22px]` after the Trip name field** (the section gap of board B, now between the name and the picker); and `h-[22px]` after the picker, before Location (16.4) | B spacer 22px |
| B15 | Pre-check from Home | none | `?type=` pre-check (section 10) | brief Flow 1 |
| (derived) | Tile gap | 8px | Keep 8px (`gap-2`) | B grid `gap: 8px` |
| (derived) | Kept as built | | 2x2 grid, `min-h-[88px]`, radius 20px, icon 22px stroke 2, label 14px/600, helper 12.5px/1.45 ink/.74 | deviations 1, 2 |

After B3 and B4 the tile content box is 2 x 12px padding inside 1.5px borders; a tile's outer size is identical checked and unchecked at every width. QA test: toggle a tile and confirm its bounding box and its neighbours' positions do not change.

### 11.2 Board C (Suggested card, in `suggested-card.tsx` and its host)

| Audit row | Element | Built now | Target (exact) | Canvas source |
|---|---|---|---|---|
| C4 | Card vertical padding | none | `py-0.5` (2px) top and bottom; keep `pl-4 pr-1.5`, 1px dashed `border-ink/[0.12]`, `rounded-card`, transparent, no shadow | C container `padding: 2px 6px 2px 16px` |
| C5 | Row height | `py-[13px]` + 44px button without negative margin = about 70px | **Row is 52px**: `py-1` (4px) around a 44px (`size-11`) button, text block (about 40px) centred. QA measures the row, not the classes. Long names wrap and make that row taller (3.1); that is the only allowed exception. | C row `padding: 4px 0`, button 44x44 |
| C5 | Hit area | 44x44 | 44x44, circle 30px centred in it | C button 44x44 |
| C6 | Row divider | `border-ink/[0.07]` | `border-ink/[0.08]` (8% ink). Last row: none (unless the "Show N more" button follows, as today). | C row `border-bottom: hr` |
| C9 | "+" circle | 30px accent-soft | Keep 30px, fill `var(--color-accent-soft)` | C span 30px, `ch` |
| C9 | "+" glyph | `size={15} strokeWidth={2.4}`, accent-deep | `size={15} strokeWidth={2.8}`, colour `var(--color-accent-ink)` | C svg 15px stroke-width 2.8, colour mi |
| C12 | Gap between the card and the block **above it** | 18px *after* the card (card on top) | **(Rev 4) `h-[18px]` above the "Suggested for this trip" header**, whatever block precedes it; nothing after the card (the 40px content bottom padding does that job). This is exactly board C, which draws the card below "To get" with 18px between. | C spacer 18px |
| C3 | Header inset and gap to card | `px-1`, `h-2` | Matches, no change (4px inset, 8px gap) | C header, spacer 8px |
| C8 | Caption colour | `ink/[0.72]` | Keep (documented deviation, canvas .68) | C `fa` |
| (new) | Name overflow | `truncate` | `min-w-0 flex-1 [overflow-wrap:anywhere]`, no truncation (3.1) | criterion 91 |
| C1, C2, C7, C10, C11, C13 | Position; hint instead of Add all; first-pick source line; richer aria-label; Show N more; real names | | **(Rev 4) C1 position now matches board C (below the list).** Others keep (documented deviations) | |

### 11.3 Pages A and L (new build, same rule)

| Audit row | Target | Where specified |
|---|---|---|
| A1, A2 | Shelf header, "Blank trip", 3 tiles with the values in 9.2 | 9.2 |
| A3 | `h1` "Trips" 36px; no avatar | 9.2 |
| A4 | Bottom 56px "New trip" pill, exact canvas values; top-bar plus removed; empty-state button removed | 9.2a |
| A5 | **(Rev 4, reverses the Rev 3 "not changed")** Trip rows follow board A's "Your trips" card row; grouping kept | 16.1 |
| A6 | `texture` on `/trips` | 9.2 |
| L1 | "No trips yet" card with canvas copy | 9.3 |
| L2 | Shelf in every state | 9.2 |

## 12. New token and new button variant

- **Token:** one new CSS custom property in `src/app/globals.css`, next to the other accent tokens: `--color-accent-ink: oklch(0.42 0.08 80);`, with the matching Tailwind theme alias line. It is the canvas `mi` value that no existing token matches (accent-strong is .40, accent-deep .38). Used by: "Blank trip", checked tile icon (B6), "+" glyph (C9), **Rev 4: the ongoing trip row's icon**. If `globals.css` has a dark override block for the accent tokens, mirror `--color-accent-strong`'s dark value there so dark styling is not broken; no other dark work (criterion 22).
- **Button variant and bar:** `LinkButton variant="fab"` and the `FabBar` wrapper, as specified in 9.2a. Additive only. If `fab` is later wanted in dark mode, it needs its own review (not in scope).
- **(Rev 4)** No further tokens or variants. The 15% row divider and the 5% icon tint are `ink` opacities (`border-ink/[0.15]`, `bg-ink/[0.05]`).

## 13. Verification checklist (QA, screenshot versus board)

For each pair, open the canvas board file (light phone, left) at 390px wide and the built route in the same viewport width (390 and 320), and compare in the browser's inspector. Reference values come only from the canvas inline styles listed in this doc (sections 9 and 11, and 16 for Revision 4); an unexplained difference fails QA, a difference matching a documented deviation (section 7) is recorded and passes (criterion 92). Record each comparison (screenshot or file link plus the list of differences) in [qa-report.md](qa-report.md). **The Revision 4 checks are in section 18; where a line below conflicts with section 18, section 18 wins.**

Seed data for screenshots: A = a verified user with 2 trips (one ongoing, one completed); L = a verified user with 0 trips; B = `/trip/new` with the Airbnb and International tiles ticked and the 2-type sentence; C = a new trip with Airbnb + International on the List tab, unverified and verified.

### Board A (`Main.dc.html` vs `/trips`, two trips)

At 390px:
- [ ] Title is an `h1` "Trips", 36px display font, line-height 1; no "Your trips" title; no plus icon at the top; Feedback icon present; no avatar (deviation).
- [ ] 22px between the title block and the "Start from a template" row; the row is inset 4px; "Blank trip" is right-aligned, 12px/600, accent-ink colour.
- [ ] 10px under the header; 3 tiles in 3 equal columns, 8px gaps; each exactly 128px tall, 20px radius, white, card shadow, padding 14/12/12; icon 22px accent colour; label 14px/600; count 11.5px ink/68; counts equal the catalog.
- [ ] 26px between the tiles and the next section.
- [ ] **(Rev 4) Trip rows, kickers, dividers and gaps: section 18.1.**
- [ ] Pill matches the canvas exactly (no deviation): left and right edges 14px from the screen edge, bottom edge 18px above the screen bottom, 56px high, fill ink at 90% and flat (no blur, no gradient behind it), shadow `0 10px 30px rgba(35,28,18,.28)`, "New trip" white 16px/600, plus icon 19px stroke 2.6, gap 8px, fully round. Computed-style check against the `<a>` in `Main.dc.html`.
- [ ] Scrolled to the end, the last trip row and legal links are fully visible above the pill.
- [ ] Open another screen with a `BottomBar` (New trip "Create trip"): its look is unchanged from before this work (it must now also be sticky, 18.3).
- [ ] Paw texture and glow visible.
- [ ] No horizontal scroll.

At 320px:
- [ ] Tiles are about 88px wide; "International" wraps or hyphenates; nothing is clipped, ellipsised or overflowing; "Airbnb stay" on two lines is fine; tiles stay 128px tall.
- [ ] Header row on one line, no overlap; pill 292px wide (14px each side), 56px high, not covering any content at the end of the scroll; no horizontal scroll.
- [ ] Tile, "Blank trip" and pill hit areas measure at least 44px tall.

### Board L (`HomeFirst.dc.html` vs `/trips`, zero trips)

At 390px:
- [ ] Same title, header, tiles and gaps as A (shelf identical).
- [ ] "Your trips" kicker with 4px inset and 10px under; one white card, radius 22, padding 28px 20px, centred text.
- [ ] Text exactly "No trips yet" (15px/600) and "Pick a template above and your list starts with the basics. Your trips will show up here." (13px, line-height 1.45, ink/74), 6px between them. No button in the card, no "You're not on any trips yet.", no "Start a trip".
- [ ] Pill present and identical to A's. No sentence containing "nothing is saved" or "we don't track" anywhere.
- [ ] Error variant (force a load failure): shelf and pill still show, the "Couldn't load your trips." line sits under the shelf, no first-run card.

At 320px: as A; card text wraps without clipping.

Also check on the welcome page `/` (no board; spec in 9.6), signed out: shelf between the intro and "Create your first trip", same tile values, same wrap rule at 320, redirects for a returning user unchanged, `?signin=1` shows no shelf, no pill.

### Board B (`NewTrip.dc.html` vs `/trip/new`)

Compare only the picker; the top half and Create button are not compared (B13, B14). **(Rev 4) The order and gaps around the picker: section 18.4.**

At 390px:
- [ ] 22px between the Trip name field and the "What kind of trip?" row (Rev 4); row inset 4px both sides; 10px to the grid.
- [ ] Grid is 2x2 with 8px gaps (deviation); tile padding 12px; radius 20px; min height 88px (deviation); border 1.5px in both states.
- [ ] Unchecked: white, border ink/12, icon ink/74, empty ring 20px, 1.8px border at ink/50 (deviation).
- [ ] Checked: accent-soft fill, 1.5px accent border, icon accent-ink, filled accent 20px circle with a white 11px check, stroke 3.4.
- [ ] Toggle a tile: tile size and surrounding layout do not change by even 1px.
- [ ] Helper sentence has 4px side inset, 10px above, 12.5px/1.45 ink/74, with the exact 2-type string on the board.
- [ ] Arriving from a tile: the tile is checked on first paint, the 1-type sentence shows.

At 320px:
- [ ] Two tiles per row; "International" on one line inside its tile (about 112px of text width) with the ring beside the icon, no overlap.
- [ ] Other block, counter, helper wrap without clipping; Create bar does not cover the last field.

### Board C (`ListSuggest.dc.html` vs List tab)

At 390px:
- [ ] Header row: kicker left, hint right (deviation: text hint instead of "Add all 7"), 4px inset, 8px gap to the card.
- [ ] Card: 1px dashed ink/12, radius 22, padding 2px 6px 2px 16px, transparent, no shadow.
- [ ] Measure a one-line row: 52px (4 + 44 + 4), the "+" hit area 44x44, circle 30px accent-soft, glyph 15px stroke 2.8 in accent-ink; divider ink/8, none under the last row.
- [ ] Name 15px/600, caption 12px with "Suggested · <type>" (deviation).
- [ ] **(Rev 4) 18px between the last list block and the card header (canvas C); the card is last on the page: section 18.2.**
- [ ] The first 6 rows plus "Show N more" are about 312px tall.

At 320px:
- [ ] A long name ("Tent footprint or ground tarp") wraps to two lines, is fully readable and not truncated; row grows only for that name; "+" stays 44px and aligned at the right.
- [ ] Caption, "Cancel" (waiting state) and "Show N more" fit without clipping; no horizontal scroll.

Cross-checks for all four: light mode only; keyboard focus ring visible on tiles, links and "+" buttons; zoom to 200% shows no overlap.

## 14. Accessibility and states added by Revision 3

- `/trips`: one `h1`; shelf is `<section aria-labelledby>` with the Kicker id; tiles are `<a>` elements (navigation) with names like "Camping, 18 items"; tab order: Feedback, Blank trip, the three tiles, the trips, legal links, the pill.
- First-run card: plain text (no role); not a live region (it renders on load).
- Pill link: name "New trip" (icon `aria-hidden`); white text on ink at 90% is well above 4.5:1.
- Hit areas: tiles 128px tall by at least 88px wide; "Blank trip" at least 44px tall; pill 56px. **(Rev 4) Trip rows are at least 68px tall.**
- Colour: tiles are identifiable by text, not by colour; focus ring is not colour-only (2px outline offset 2px).
- Reduced motion: no new animation (the pill has none).

## 15. Copy (Revision 3) and decisions for the user

Copy, all from the canvas and requirements, so already approved: "Trips", "Start from a template", "Blank trip", "Your trips", "N items" / "1 item", "New trip", "No trips yet", "Pick a template above and your list starts with the basics. Your trips will show up here." Existing error "Couldn't load your trips." Tile labels come from the catalog ("Camping", "Airbnb stay", "International"). No privacy or security claim anywhere near the shelf (criteria 96, 116).

Decided by the user (2026-10-14): the "New trip" pill matches the canvas exactly (9.2a); new `fab` variant and `FabBar`, existing `BottomBar` untouched in look.

Decisions still open (defaults applied; tell me if you disagree):

1. **New token `--color-accent-ink`** (oklch(0.42 0.08 80)) so the canvas colour is exact, instead of reusing the nearby `--color-accent-strong` (.40, visually almost identical). Default: add it.
2. **"Blank trip" link on the welcome page**, directly above the "Create your first trip" button, does the same thing as that button. Default: keep (one shared component, matches canvas header). The alternative is to hide the link on `/` only.
3. **Suggested row names wrap instead of truncating** (needed for criterion 91 at 320px; rows with a long name are taller than 52px). Default: wrap.
4. **"International" at 320px hyphenates or breaks inside the word** ("Inter-national"). It cannot fit on one line in 64px at 14px type; the alternatives are a smaller label or letting the shelf drop to 2 columns below 360px. Default: wrap inside the word, keep 3 columns and 14px.
5. **Fourth catalog type.** The shelf is designed for 1 to 3 types in one row. If a fourth type is added, the shelf should switch to 2 columns (like New trip) and the board needs a refresh. Default: not designed now, flagged.
6. ~~Avatar skipped, rows not restyled (A3, A5).~~ **Superseded by Rev 4 (user feedback): rows are restyled (section 16.1); the profile avatar (A3) is still skipped.**

---

# Revision 4 (user test feedback, 2026-10-14; explicit user decisions)

Four changes, all from hands-on testing. Each overrides any earlier decision it contradicts (listed in section 17). No new data, storage, events, copy beyond what is stated, or backend work. Engineering decides implementation; this section states target values and acceptance.

## 16. Specification

### 16.1 Home (`/trips`): trip rows, divider and every vertical gap

**What the user said:** too much space between things; the separator line between trips is not clear; the "Trip" tag is redundant (remove it). Rows are now in scope.

**Cause (measured against the built page and `src/app/trips/page.tsx`):** each row is about 130px tall with no members (about 165px with an avatar stack) against board A's 68px, because it stacks a pill line, a 22px display name, a 36px avatar row and a counts line with 8 / 10 / 10px spacers inside 18px padding; the separator is `divide-y` at ink 7% on white (about 1.14:1) running edge to edge of the card; section gaps (8px kicker to card, 20px between sections) differ from the board's (10px, 26px).

#### Row anatomy (target, from board A's "Your trips" card)

```
 +--------------------------------------------------------------+  card: rounded-card (22px), white, shadow-card,
 |  (4px)                                                        |  padding 4px 16px (px-4 py-1), no inner padding on rows
 |  +----+   Tahoe Ski Trip                       You owe $12.40 |  <- row: flex items-center gap-3 (12px), py-3.5 (14px)
 |  |icon|   Feb 14–17 · 6 people · $240.00                      |
 |  +----+                                                       |
 |  -------------------------------------------------------------|  <- divider, 1px, ink 15%, inset by the card padding
 |  +----+   Big Sur Camping                          [Locked] |
 |  |icon|   Jun 4–7 · 4 people · $812.00                        |
 |  +----+                                          Settled up    |
 |  (4px)                                                        |
 +--------------------------------------------------------------+
```

Each row is one `Link` (whole row is the hit area, at least 68px tall, full inner width). No hover or pressed fill is required; the global focus ring applies.

| Part | Exact value | Source |
|---|---|---|
| Card | `Card className="px-4 py-1"` (radius 22px, white, `shadow-card`, no border); replaces `p-0`. The board's 1px transparent border is not rebuilt (layout differs by 1px at most, allowed). | board A card `padding: 4px 16px` |
| Row | `flex items-center gap-3 py-3.5`: 14px above and below, 12px between icon and text | board A row `padding: 14px 0; gap: 12px` |
| Icon square | 40x40, `rounded-[14px]`, centred, `flex-none`, `aria-hidden`; glyph 20px, stroke 2 | board A 40px / radius 14 / svg 20 |
| Icon, ongoing | background `--color-accent-soft` (oklch(0.95 0.04 88)), glyph `--color-accent-ink` | board A `ch`, `mi` |
| Icon, completed (Locked) | background `bg-ink/[0.05]`, glyph `text-ink/[0.74]` | board A second row `tint`, `mu` |
| Icon glyph choice | The trip's first catalog type via the shared `iconForTripType(types[0])` (tent, house or globe), reading only the `types` column that `TRIP_LIST_COLUMNS` already selects; never `other_type`. A trip with no types (old trip, Other only, skipped picker) gets one neutral existing outline icon from `icons.tsx` that is not one of the three type icons (engineering picks one; if none exists, add a 20px, stroke 2 outline "map pin"). The icon carries no meaning that is not also in the text. | board A icons |
| Name | `block text-[15px] font-semibold` in the **body font (not `text-display`)**, line-height about 20px. Wraps (`[overflow-wrap:anywhere]`), never truncated (criterion 91). | board A 15px/600 |
| Subtitle | `block text-[12px] text-ink/[0.72]`, line-height about 15px, no spacer between name and subtitle (they are two stacked lines of one block) | board A 12px (`fa` .68; .72 is the app's caption rule, C8) |
| Row height | icon 40px is the tallest part: 14 + 40 + 14 = **68px** (plus the 1px divider = 69px pitch). A wrapped name or a third line (below) grows only that row. | board A |
| Divider | 1px, between rows only (none after the last row): `border-b border-ink/[0.15]` on each row except the last (or `divide-y divide-ink/[0.15]` on the padded card). It is **inset by the card's 16px padding** on both sides, like the board, so it never touches the card edge. | board A `border-bottom: 1px solid hr` |
| "Trip" pill | **Removed** (user decision). Nothing replaces it: the icon square already identifies the row. | user feedback |

**Divider contrast (user: "not clear").** Ink #231c12 over white: built 7% = about #F0EFEE, luminance ratio vs white **about 1.14:1**; board 8% = about 1.16:1; **target 15% = about #DEDDDB, about 1.35:1** (Y of 0.73 vs 1.0). That is roughly 2.5x the visible step of today while still a hairline that does not compete with text. At 2x device pixel ratio it renders 2 device pixels. This is a documented deviation from the board's 8% (section 7, deviation 12). If it still reads faint on a real phone, the next step is 20% (about 1.5:1); do not exceed 20%.

#### Which data each row shows (nothing the app shows today is dropped except the avatar stack)

Subtitle = the parts below joined with " · " (space, middle dot, space), skipping any part that is absent, so there is never a leading, trailing or doubled separator:

1. **Date range**, compact as on the board: "Feb 14–17", "Mar 5–9", "Dec 28 – Jan 2" when the months differ (en dash; no spaces around it when both ends are in the same month, spaces when the months differ). Absent when the trip has no dates (zero-date trip): the subtitle then starts with the people count. Engineering may add a compact mode for this call site; the shared `formatDateRange` used by other screens is not changed.
2. **People:** "6 people", "1 person", "0 people" (existing rule).
3. **Money:** the trip total, "$240.00", when the total is above zero; when it is zero, "No expenses yet" replaces the amount (so "$0.00" is no longer shown next to "No expenses yet").

**Your balance and Locked** (the right-hand side, `flex-none text-right`, `max-w-[45%]`):

| Trip state | Right-hand content |
|---|---|
| Ongoing, you owe | "You owe $12.40", 12.5px/600, `var(--color-terracotta)` (existing `BalanceLabel`) |
| Ongoing, you are owed | "You're owed $12.40", 12.5px/600, `oklch(0.38 0.08 80)` (existing) |
| Ongoing, settled | "Settled up", 12.5px normal, ink/72 (existing) |
| Ongoing, no expenses | Nothing on the right ("No expenses yet" is already in the subtitle) |
| Completed (Locked) | The Locked pill (11px/600, `px-[9px] py-1`, lock icon 10px stroke 2.6, `--color-terracotta-soft` fill, `--color-terracotta` text, existing), and, below it with 4px between, the balance label above if it is "You owe" / "You're owed" / "Settled up" (nothing if no expenses). The right-hand block may make that row up to 70px tall; allowed. |

`BalanceLabel` keeps its strings and colours; only its place changes.

**320px rule (below a 360px viewport width):** the right-hand balance label does not fit beside the text without crushing the name to about 60px (the card inner width is 248px at 320: 248 - 40 icon - 12 gap - 12 gap - about 130 for "You're owed $1,234.56"). Below 360px the balance label moves to a **third line inside the text block** (12.5px as above, `mt-0.5`), and only the Locked pill stays on the right (it is about 66px). Row height then is 14 + (20 + 15 + 2 + 16 = 53) + 14 = **81px** for a row with a balance, 68px without. Use one element per placement with `hidden min-[360px]:block` / `min-[360px]:hidden` so screen readers read it once.

**Avatars (decision, with reason; flagged in section 19).** The `AvatarStack` is **dropped from the rows.** Reasons: board A has none; it is 36px plus a 10px spacer on every row with members (the single largest source of the "too much space" feedback); the information it carries (who is on the trip) is already in the "6 people" count and is one tap away on the trip page header; the card is meant to scan trips, not people. `AvatarStack` stays in `ui.tsx` for the trip page. If the user wants faces back, the only acceptable form is a 20px overlapped stack of at most 3 on the right under the balance, which this design does not recommend.

**Section structure.** Keep the grouping (user did not revoke it): "Ongoing" then "Completed", each a `Kicker canvas className="px-1"`, 10px (`h-2.5`), then the padded `Card`. A section is omitted when it has no trips. No "Now" pill and no "3 to get" count (no data for them).

**Cases:**

| Case | Behavior |
|---|---|
| Locked / completed row | Muted icon square, Locked pill on the right (plus balance as above), name stays full ink (board keeps the name at full strength). Lives under the "Completed" kicker. |
| Long trip name ("Lisbon, Porto and the Algarve coast, September 2026") | Name wraps to as many lines as needed, subtitle below it, icon stays centred on the row, row grows; nothing is truncated or clipped; the right-hand block never wraps the name below 100px of text width (it wraps "You're owed / $1,234.56" onto two lines first, via `max-w-[45%]`). |
| Zero-date trip | Subtitle starts with "6 people"; no leading separator; no empty line or gap where the date was. |
| One person, no expenses | "1 person · No expenses yet". |
| Many trips | Pitch is 69px per row instead of about 130px (0 members) or about 165px (with avatars): about 45% shorter for the same trips. |
| 320px | Rules above: third-line balance, Locked pill on the right, name wraps, no horizontal scroll, row at least 68px. |

#### Vertical gaps down the whole `/trips` page (390px): built value vs target

"Built" values are from `src/app/trips/page.tsx` and `ui.tsx` as of this revision and the user-test screenshot; "board A" is `Main.dc.html`. Page left/right gutter is unchanged (20px).

| # | Gap | Built now | Target | Board A | Change |
|---|---|---|---|---|---|
| 1 | Top of screen to title (ScreenContent `pt-0.5` + TopBar `pt-5`) | 22px | 22px | n/a (device status bar) | none |
| 2 | Title block to "Start from a template" kicker | 22px spacer (+ TopBar bottom) so kicker is 62px below the h1 top | same | 24px | none (calibrated in Rev 3 QA) |
| 3 | Shelf kicker to tiles | 10px | 10px | 10px | none |
| 4 | Tiles to next section kicker | 26px | 26px | 26px | none |
| 5 | "Ongoing" kicker style | `Kicker` ink 70%, no line box | `Kicker canvas` (ink 74%, 13px line box) | 10.5px/0.1em, ink 74% | **change** |
| 6 | "Ongoing" / "Completed" kicker to its card | 8px (`h-2`) | **10px** (`h-2.5`) | 10px | **+2px** |
| 7 | Card top edge to first row content | 0 + 18px row padding = 18px | 4px card + 14px row = **18px** | 4 + 14 | same total, new structure |
| 8 | Row: top padding / bottom padding | 18px / 18px | **14px / 14px** | 14 / 14 | **-4px each** |
| 9 | Row: pill line (about 24px) + 8px spacer | 32px | **removed** | none | **-32px** |
| 10 | Row: name line | 22px display, about 28px line | 15px/600, about 20px | 15px/600 | **-8px** |
| 11 | Row: spacer name to avatars / avatar row (36px) / spacer to counts | 10 + 36 + 10 = 56px (0px when no members: 10 + 10 = 20px) | **removed** (avatars dropped; subtitle sits directly under the name) | none | **-20px to -56px** |
| 12 | Row: counts line | about 18px | about 15px subtitle | 12px | **-3px** |
| 13 | Row total height | about 130px (0 members), about 165px (with members) | **68px** (70px completed with balance; 81px at <360px with a balance) | 68px | **about -62px / -97px** |
| 14 | Divider | `ink/7%`, 1px, full card width, about 1.14:1 | `ink/15%`, 1px, inset 16px each side, about 1.35:1 | ink 8%, inset 16px | **clearer, inset** |
| 15 | Card bottom padding below last row | 0 + 18px = 18px | 4 + 14 = **18px** | 4 + 14 | same total |
| 16 | "Ongoing" card to "Completed" kicker | 20px (`h-5`) | **26px** (`h-[26px]`, same section gap as shelf to trips) | 26px | **+6px** |
| 17 | Last card to `LegalLinks` | `LegalLinks` `pt-6` = 24px | 24px (unchanged; within 2px of the section gap) | n/a | none |
| 18 | `LegalLinks` to bottom of scroll content | 52px spacer + 40px `pb-10` = 92px, pill top is 74px above the screen bottom, so 18px clearance | 92px (unchanged) | n/a | none |
| 19 | First-run card and error line (no trips) | per section 9.3 (26px after the shelf, 10px after kicker) | unchanged | L | none |

Expected effect on the user's screenshot data (8 ongoing + 1 completed trip, no members): rows go from about 1,170px to about 620px; "Ongoing" is about 560px tall instead of about 1,040px.

**Revision 4 build notes (measured in Chromium, 390 and 320).** Rows: 69px pitch for a one-line row (68 + 1px divider), the divider is ink 15% 1px and inset by the card padding, kicker to card 10px, Ongoing card to Completed kicker 26px. A completed row that also wraps its subtitle onto two lines is 78px (name 20 + two subtitle lines 30 + 28 padding), allowed by "a wrapped name or a third line grows only that row". At 320px the balance sits on a third line (rows 84 to 119px when the name wraps as well). Sticky root cause: `Screen glow/texture` was `overflow-hidden`, which makes the element a scroll container that never scrolls, so `position: sticky` bars stuck to it and rode with the content (reproduced on the pre-feature tree as well: bottom bar 708px below the viewport bottom at load, top bar scrolled away); fixed with `overflow-clip`. `html` gets `scroll-padding` 64px top / 104px bottom for focus and scrollIntoView. The focus move to the next "+" now waits until the add has finished (every "+" is disabled while one is in flight).

### 16.2 List tab: Suggested card below the list; floating notice; focus and scroll

**User decision:** the Suggested card moves below the list content.

**Order on the List tab (top to bottom):** the sr-only announcement; the race / action-error lines (unchanged, above the lists); "Your bag" (if any); "To get"; "Bought" (if any); **Suggested for this trip (if any)**. On an empty list: "Nothing on the list yet." then the card, alone.

```
 [ Your bag card ]            (if any; unchanged)
 (14px)
 TO GET                          tap a circle to grab it
 [ To get card ]
 (14px, only if Bought)
 BOUGHT
 [ Bought card ]
 (18px)                                  <- canvas C spacer, replaces the old 18px *after* the card
 SUGGESTED FOR THIS TRIP                       tap + to add
 (8px)
 [ dashed card: 6 rows, then "Show N more" ]
 (40px: ScreenContent pb-10)
 [ sticky bottom bar: Add an item ]
```

| Item | Specification |
|---|---|
| Spacing above | **18px** between the bottom of the last list card ("Your bag", "To get" or "Bought", whichever is last) and the card's header row; **18px** between "Nothing on the list yet." and the header row on an empty list (that paragraph keeps its `px-1`). The 14px between "To get" and "Bought" is unchanged. Header-to-card 8px unchanged. |
| Spacing below | Nothing after the card. The page's 40px bottom padding plus the bar's 12px top padding puts the last row or "Show N more" **at least 52px above the top of the "Add an item" button** at the end of the scroll. |
| Relation to the bar | The bar is `position: sticky` (16.3) and occupies the bottom 90px of the screen (12 + 54 + 24); content scrolls under its paper gradient. At the end of the scroll the card is fully visible above it and **never covered**. While scrolling, rows pass under the gradient exactly as the lists do today. Any focusable item (the "+" buttons, "Cancel", "Show N more", the widget's field) scrolls into view with a **bottom scroll margin of at least 104px** (bar 90 plus 14px) and a **top margin of at least 64px** (sticky top bar) so focus is never obscured. Engineering applies this at the document or `Screen` level (for example `scroll-padding`), not per component. |
| Empty list | New trip lists are always empty, so this is the main case: the page shows the trip summary card, the tabs, "Nothing on the list yet.", 18px, then the card. At 390x844 the header and about 4 rows are visible above the bar without scrolling; the rest scroll. No auto-scroll after landing. |
| "Show N more" | Stays the last element inside the dashed card, a 44px text button (unchanged copy: "Show N more" / "Show fewer"). On expand, the new rows appear directly below the sixth row and the toggle moves down to the end; scroll position is not changed and focus stays on the toggle (it keeps its `aria-expanded`). On "Show fewer", focus stays on the toggle and the toggle is scrolled into view (`block: "nearest"`, using the scroll margins above) so it does not vanish behind the bar. |
| Tap "+" and focus | Unchanged rule: focus moves to the next row's "+" (the previous one if it was last), so a thumb can tap repeatedly. Because the card is at the page bottom, the removed row simply shortens the page; the next "+" must stay visible and clear of the bar (scroll margins above). If the last suggestion is added, the card disappears and focus goes to the "To get" heading as today (it may scroll up; it must end visible below the sticky top bar). |
| Success notice | **Layout shift problem:** the old inline pill above the card would now push every row down 52px at the moment the user taps the next "+". **New:** a floating notice, `fixed`, centred, `max-w-md`, `px-5`, **16px above the top of the bar (`bottom` about 106px)**, `z-10` (under the top bar's `z-20`), ink 90% fill (the `fab` material), white 13px/500 text, `rounded-[14px]`, `px-3.5 py-2.5`, `pointer-events-none`, `aria-hidden` (the polite `role="status"` line already announces), wraps to two lines at 320, auto-clears after about 4s (reduced motion: no fade). Copy unchanged: "Added 'Tent' — everyone on the trip can see it." (deviation 13). |
| Error line | "Couldn't add 'Tent' — try again." stays inline, immediately above the card header (12px gap). It is rare and the only element that may move the card. |
| Unverified organizer | The widget is at the top of the page and the card is at the bottom. Tap "+": the page smooth-scrolls up to the widget (instant under reduced motion), the row shows its waiting state, and the widget's email field is focused (unchanged, 4.1). After verification and replay, scroll the card into view (`block: "nearest"`). "Cancel" stays on the waiting row. |
| Landing after Create | Unchanged (`?tab=list` when a catalog type was picked), with no auto-scroll. |

### 16.3 Sticky bottom bar on the trip page (and every `BottomBar` screen)

**User report:** "Add an expense" and "Add an item" (the tab-aware `TripBottomBarButton` inside `BottomBar`) are not sticky at the bottom.

**Likely cause (for engineering to confirm, not prescribed):** `Screen` with `glow` or `texture` adds `overflow-hidden` (`relative isolate ... overflow-hidden`). An `overflow: hidden` element becomes the scroll container for descendants, so `position: sticky; bottom: 0` on `BottomBar` (and `top-0` on the sticky `TopBar`) sticks to a box that never scrolls, i.e. it just sits at the end of the content. `FabBar` was built `fixed` to get around exactly this. A candidate fix is `overflow-clip` (clips without creating a scroll container); another is to move the clipping to the decorative layer wrapper. Implementation is left to engineering; **acceptance criteria only:**

1. **Stays at the bottom.** On the trip page, on the **Expenses**, **List** and **Details** tabs, with enough content to scroll, the bar (with "Add an expense" on Expenses and Details, "Add an item" on List, or the muted Locked button on a completed trip) stays at the bottom edge of the viewport while the page scrolls, at 390 and 320 wide, on a real mobile browser and in headless Chrome. With short content it is still at the bottom of the screen (as today).
2. **Over a content gradient.** It keeps today's look: paper-colour gradient `from-paper from-60% to-transparent`, `px-4 pt-3 pb-6`, the capsule button, content visibly passing under the gradient. The look of the bar and button does not change.
3. **Nothing hidden.** Content has bottom padding so the last item is fully visible above the bar at the end of the scroll: at least 40px (`ScreenContent pb-10`) between the last content and the bar, and at least 52px to the top of the button. Focusable elements are never obscured (scroll margin, 16.2).
4. **Top bar stays.** The sticky `TopBar` on the trip page (and `trip/new`, `settle-up`) stays pinned at the top, with its blur, while the page scrolls. If it is currently also failing for the same reason, the same fix must repair it.
5. **No visual regressions.** Glow blobs and paw texture are still clipped to the screen: no horizontal scroll, no extra page height from the blobs (checked at 320 and 390); every other `Screen glow texture` page renders the same.
6. **Other `BottomBar` screens** (New trip "Create trip", add-expense and add-item screens that use it, settle-up) get the same behavior for free and are included in the regression check. The `/trips` `FabBar` keeps working (it may stay `fixed`).
7. **Safe area.** The bar's bottom padding is `max(24px, env(safe-area-inset-bottom))` so the button clears a home indicator.
8. **Tab switching.** Switching tabs does not move the bar, and the label changes in place without a jump.

### 16.4 New trip: picker directly under the trip name

**User decision:** the "What kind of trip?" group (including the Other input) goes right below the trip name field, above Location, Dates and the rest.

New order and spacing (390px; all values re-derived from board B, whose only spacers are 6px, 22px and 10px, plus the app's existing 16px field rhythm):

```
 [x] New trip                               (sticky top bar)
 (16px)  h1 What are we / calling it?
 (18px)
 Trip name  [ Field ]
 (22px)    <- NEW: board B section gap between groups (was 16px to Location)
 WHAT KIND OF TRIP?                    Pick any, or none     px-1, kicker canvas
 (10px)
 [ tile ] [ tile ]
 (8px)
 [ tile ] [ tile ]
 (10px)
 helper sentence (aria-live, px-1)
 [Other block: label, Field, helper + counter, error]   <- only when Other is ticked
 (22px)    <- NEW: section gap after the picker (was 16px after it; 22px before it)
 Location (optional)  [ Field ]
 (16px)    unchanged
 DATES (kicker)
 (6px)     unchanged
 [ Dates card ]
 (16px)    unchanged (was 22px before the picker + 16px after it)
 [ planner note ]
 [ form error line ]
 --- sticky bottom bar: Create trip ---
```

| Gap | Built now | Target | Reason |
|---|---|---|---|
| h1 to Trip name | 18px | 18px | unchanged |
| Trip name to next block | 16px (to Location) | **22px** (to the picker header) | board B puts 22px between groups; the picker is a section, not a sibling field |
| Picker header to grid | 10px | 10px | board B (B9) |
| Tiles gap | 8px | 8px | board B |
| Grid to helper sentence | 10px | 10px | board B (B10) |
| Other block to the following block, or helper sentence to the following block when Other is not ticked | 16px (to the planner note) | **22px** (to Location) | same section gap as above the picker |
| Location to Dates kicker | 16px | 16px | unchanged |
| Dates kicker to card | 6px | 6px | unchanged |
| Dates card to planner note | 16px (after the picker) | **16px** (directly) | unchanged value; the picker no longer sits between them |
| Planner note to form error | 12px | 12px | unchanged |

Effects:

- **Adaptive sentence:** copy, live region and position under the grid are unchanged; it is now close to the top of the page, so the update is visible without scrolling at 390px (name field ends about 290px down; tiles and sentence about 340 to 560px). On a 320x568 phone the second tile row and the sentence sit partly below the fold; acceptable (the page scrolls, the bar does not hide them, 16.3).
- **Other reveal:** the block still appears under the helper sentence (not between tiles), focus stays on the Other checkbox, it is scrolled into view with `block: "nearest"` honoring the 104px bottom margin. Opening it now pushes Location, Dates and the note down (instead of only the note), which is expected. Unticking removes it and the 22px gap returns to following the helper sentence directly.
- **Pre-check from Home:** the tile that was tapped on the shelf is visible and checked right under the name without scrolling.
- **Validation focus:** page order is now name, then Other; a failed Create still focuses the first invalid field in that order. The "Give the trip a name first." line stays where it is (above the bar); with the name now at the top, engineering may also focus the name field on that failure (minor, not required).
- **Unchanged:** the picker's internals, tile values (section 11.1), copy, Other rules, validation, events and what is stored.

## 17. History: decisions superseded by Revision 4 (do not build these)

| Earlier decision (where it was) | Replaced by |
|---|---|
| Suggested card on top of the List tab, above "To get"; requirements and brief said above, board C drew it below (section 3.1 old text, former deviation 4 "Card placed above To get although canvas C draws it below") | Card at the end of the list content, after the lists (16.2). The deviation from board C is gone: the built position now matches board C. |
| The 18px gap was *after* the card (C12 old target `h-[18px]` before "To get"); "Empty list: card on top, then Nothing on the list yet" (3.5 old row) | 18px *above* the card; the empty state shows first, then the card (16.2, C12 new). |
| Inline success pill above the card (3.3 old step 3, "same style as `raceMessage`") | Floating notice above the bar (16.2, deviation 13). |
| Form order Trip name, Location, Dates, "What kind of trip?", note; 22px between Dates and the picker (section 1 old item 2, 2.1 old diagram, B12 old target) | Trip name, picker, Location, Dates, note; 22px name to picker and 22px picker to Location (16.4, B12 new). |
| `/trips` trip rows not restyled: "Ongoing / Completed ... unchanged"; deviation 9 "canvas A's single card ... is not built (A5, criterion 78)"; Rev 3 decision 6 "Avatar skipped, rows not restyled" (9.2 "Trips present", 11.3 A5, 15 decision 6) | Rows restyled to board A's row, "Trip" pill removed, avatars dropped, clearer divider, board gaps (16.1). Still true: the Ongoing / Completed grouping and the money summary; no profile avatar in the title bar. |
| Rev 3 checklist lines "Trip rows, kickers and cards are the existing ones (deviation A5), not canvas rows" and the 24px title gap (13, board A) | Section 18.1; the title gap stays 22px (Rev 3 QA follow-up). |
| `BottomBar` described as "unchanged" without a stickiness requirement (section 0 floating action row, 9.2a) | The bar must actually stick (16.3); its look is unchanged. |

**Accepted deviation (Revision 4 QA, 2026-10-14):** a completed row that shows both the Locked pill and a balance is about 80px at 390px and 320px (design 16.1 said 70px). The Locked pill and the balance stack on the right, which is taller than the 40px icon row. Ongoing rows with a balance are 69px at 390px and 81px at 320px (balance on a third line). Accepted by the PM as a documented trade-off.

## 18. Verification checklist addendum (QA, Revision 4)

Method: seed and open each case, measure in the browser inspector (bounding boxes and computed styles), compare with the numbers in section 16 and board A / B / C where cited, and attach a screenshot per case at **390 and 320 wide** to [qa-report.md](qa-report.md). Run each scroll check in a real mobile emulation (touch, address bar) and in desktop Chrome at the same width. Record any difference from a documented deviation as such.

### 18.1 `/trips` rows and spacing (board A)

Seed: 1 ongoing trip with 6 members, dates, expenses, you owe; 1 ongoing with no dates and no expenses; 1 ongoing with you owed and a 60-character name; 1 ongoing settled up; 1 completed (Locked) with a balance; 1 completed settled; 1 trip with 1 member.

At 390:
- [ ] No "Trip" pill on any row; no avatar stack on any row; no `text-display` 22px name.
- [ ] Row: `padding` 14px top and bottom; gap 12px; icon square 40x40, radius 14, glyph 20px; name 15px/600 in the body font; subtitle 12px ink/72; a one-line row measures **68px** (+1px divider); card padding 4px 16px, radius 22px.
- [ ] Icon: tent/house/globe for the trip's first type, neutral icon for no type; ongoing = accent-soft fill + accent-ink glyph; completed = ink 5% fill + ink 74% glyph.
- [ ] Subtitle strings: "Feb 14–17 · 6 people · $240.00"; zero-date trip "0 people · No expenses yet" with no leading "·"; "1 person · No expenses yet"; no "$0.00" anywhere.
- [ ] Balance: "You owe" terracotta 12.5/600, "You're owed" in oklch(0.38 0.08 80) 12.5/600, "Settled up" ink/72; none for no-expenses rows; right-aligned, vertically centred.
- [ ] Completed row: Locked pill on the right with the balance below it (nothing if no expenses); row height at most 70px; name at full ink.
- [ ] Divider: 1px, `ink/15%` (sample the pixel: about rgb(222, 221, 219) on white; luminance ratio about 1.35:1 versus white), starts 16px from the card's left edge and ends 16px from its right edge, none under the last row of each card. Compare against the old screenshot: the line must be plainly visible at arm's length.
- [ ] Gaps (measure each, tolerance 1px): title to shelf kicker (22px spacer, kicker 62px below the h1 top); shelf kicker to tiles 10px; tiles to "Ongoing" kicker 26px; "Ongoing" kicker to card 10px; card to "Completed" kicker 26px; "Completed" kicker to card 10px; card to Legal links 24px (`pt-6`); bottom clearance above the pill at the end of the scroll 18px or more.
- [ ] Kickers "Ongoing" / "Completed" use the canvas kicker (ink 74%, 13px line box, 4px inset).
- [ ] Long name (60 chars) wraps in full, nothing truncated, icon centred, balance wraps to two lines before the name drops below about 100px wide.
- [ ] 8 ongoing + 1 completed trips with no members: total list height is about 45% less than the build in the user's screenshot (about 620px vs about 1,170px).
- [ ] Tab through: each row is one focus stop with a visible ring; accessible name reads name, subtitle, balance, "Locked".
- [ ] First-run (0 trips) and error variants unchanged (section 13, board L).

At 320:
- [ ] No horizontal scroll; the row's balance label is on a third line (hidden beside the text below 360px) and the Locked pill stays on the right; a row with a balance measures about 81px, without 68px.
- [ ] Name wraps, never below about 100px of text width with the Locked pill present; nothing clipped; divider still inset 16px.
- [ ] The balance text exists once in the accessibility tree (no duplicate reading).

### 18.2 List tab, Suggested card below the list

Seed: (a) new empty trip with Airbnb + International; (b) trip with items in "Your bag", "To get" and "Bought" plus 18 suggestions; (c) same as (b) but unverified organizer; (d) completed trip; (e) a trip where only 3 suggestions remain.

At 390 and 320:
- [ ] Order is Your bag, To get, Bought, then the card; the card is the last block; on the empty trip the card follows "Nothing on the list yet." and nothing else.
- [ ] 18px between the last list card (or the empty paragraph) and the card header; 8px header to card; 14px between "To get" and "Bought" unchanged.
- [ ] Scroll to the very end: the last row (or "Show N more") is fully visible with at least 52px between it and the top of the "Add an item" button; the sticky bar never covers a row or the "Show N more" button.
- [ ] Tab (keyboard) through the "+" buttons, "Show N more" and "Cancel": the focused element is never hidden under the top bar (64px) or the bottom bar (104px margin).
- [ ] Tap "+" repeatedly: focus moves to the next "+", the next row stays under the thumb (no row moves when the notice appears), and the floating notice shows above the bar (16px gap), wraps without clipping at 320, disappears after about 4s, does not intercept taps.
- [ ] "Show 12 more": rows insert below the sixth row, scroll position is not changed, focus stays on the toggle; "Show fewer": the toggle ends visible above the bar.
- [ ] Adding the last suggestion: card gone, focus on the "To get" heading, visible below the top bar.
- [ ] (c) Tap "+" with an unverified organizer: the page scrolls up to the widget and focuses the email field; after verification the item is added and the card is brought back into view; Cancel restores the row.
- [ ] (d) Completed trip: no card.
- [ ] Error path: the "Couldn't add" line sits above the header and nothing else moves.

### 18.3 Sticky bottom bar

At 390 and 320, on the trip page:
- [ ] Expenses tab with 20+ expenses, scroll mid-way, to the end and back: the "Add an expense" bar stays at the viewport bottom throughout (measure `getBoundingClientRect().bottom` equals the viewport height minus 0; button bottom 24px above it).
- [ ] List tab with a long list: "Add an item" stays pinned; Details tab: its bar stays pinned; completed trip: the muted Locked button stays pinned.
- [ ] Short content (new trip): bar at the bottom of the screen (as before).
- [ ] The gradient is visible over scrolling content; bar height 90px (12 + 54 + 24); label and capsule look identical to before.
- [ ] End of scroll: nothing is hidden; 40px of content padding above the bar; no clipped last row.
- [ ] The trip page top bar stays pinned (blur visible) while scrolling.
- [ ] Switch tabs while scrolled: the bar does not move; the label changes in place.
- [ ] Glow and texture still render, no horizontal scroll, no page taller than before (compare `document.scrollHeight`).
- [ ] Regression: New trip "Create trip", add-expense, add-item and settle-up screens: bar sticky, same look; `/trips` pill unchanged; with a simulated bottom safe area the button clears it.

### 18.4 New trip order (board B)

At 390 and 320:
- [ ] DOM and visual order: Trip name, "What kind of trip?" group, Location, Dates, planner note, then the bar.
- [ ] Gaps (1px tolerance): h1 to name 18px; name field to picker header 22px; header to grid 10px; tile gap 8px; grid to helper sentence 10px; picker (helper sentence, or Other block when ticked) to Location 22px; Location to Dates kicker 16px; Dates card to planner note 16px.
- [ ] Tick Other: the input block appears under the helper sentence, focus stays on the checkbox, the block is fully visible above the sticky bar, Location and Dates move down by the block's height; untick: block gone, text discarded, 22px gap now follows the sentence directly.
- [ ] Adaptive sentence for 0, 1, 2 and 3 types updates in place with no layout jump above it.
- [ ] Arrive from a shelf tile: the tile is checked on the first paint, visible without scrolling at 390x844, one-type sentence shown.
- [ ] Failed Create with empty name and an empty Other: focus goes to the first invalid field in page order; Other error shows; no layout breakage.
- [ ] At 320 the Create bar does not hide the last field at the end of the scroll; no horizontal scroll.

## 19. Decisions still open for the user (Revision 4; defaults applied)

1. **Avatar stack removed from trip rows** (recommended; it is the largest contributor to the loose look and the count "6 people" remains). If you want faces, say so; the only option designed against the space budget is a small overlapped stack of at most three, which I do not recommend.
2. **Divider at 15% ink (about 1.35:1)** instead of the board's 8%. If it still looks faint on a phone the next step is 20%; I would not go further.
3. **Grouping kept** (Ongoing / Completed as two cards) rather than board A's single "Your trips" card with a "Now" pill. Keeping it avoids losing the Completed separation; say if you prefer the single card (the Locked pill would then mark completed trips).
4. **Neutral icon** for trips with no catalog type (old trips, Other only, skipped picker). Engineering picks an existing outline icon or adds a map pin; confirm you are happy with a generic glyph rather than initials.
5. **Suggested card goes after "Bought" too** (at the very end of the list content), not just after "To get" and "Your bag". Say if you want it directly after "To get", above "Bought".
6. **Floating success notice** replaces the inline pill (needed because the card is now at the bottom and an inline pill would shift rows under the thumb). It is a new small pattern (ink 90% toast above the bar); confirm.
7. **On an empty trip the card is below the trip summary and the tabs** and needs a scroll to reach more than about four rows at 390x844 (no auto-scroll after Create). If new organizers miss it, the follow-up is a one-line pointer near the top; not designed now.
8. **New trip: Location now comes after the picker**, so an organizer who skips the picker scrolls past it to reach Location and Dates (about 230px at 390 when no Other block is open). Per your decision; no change proposed.
