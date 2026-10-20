# Design: expense-delete-and-polish

Stage: UX (stage 6). Date: 2026-10-19. Inputs: [requirements.md](requirements.md) (approved),
[planning.md](planning.md) (follow-up decisions D1 to D6 override earlier ones),
[compliance-constraints.md](../../reviews/security-compliance/features/expense-delete-and-polish/compliance-constraints.md),
[compliance baseline](../../reviews/security-compliance/project/compliance-baseline.md).
No mockup: every piece reuses an existing component, and the one new element (the Undo toast)
is a small extension of the floating notice already on the List tab. Exact classes and pixel
values below are the spec; engineering does not need a canvas.

No application code is written here. Words like "component" and "provider" name the shape
engineering should build, not the code.

## 0. Decisions (all decided 2026-10-19)

1. **No "Are you sure?" confirm step.** Tap "Delete expense" and it is gone at once, with the
   10-second Undo as the safety net. The caption under the button stays (section 2.1). Reasons:
   Undo-only was the earlier decision; the app's principle is "do first, undo after"; an
   expense is quick to re-enter. Accepted cost: a mistaken delete not noticed within 10 seconds
   is permanently gone.
2. **A new delete replaces the previous toast** (single toast). The older expense loses its
   on-screen Undo.
3. **The toast shows on the trip page only** (all three tabs). On Settle up, Invite and sheets
   it is hidden but keeps its deadline; leaving the trip or reloading drops Undo for good, and
   the delete stands.
4. **Invite: only the member and placeholder cards go to 11px.** The dashed action rows
   ("Waiting on everyone else", "Add a placeholder member", the cap row) stay at 14px.
5. **The locked-sheet sentence is unchanged** (no "or deleted").

Design-review rules also applied (section 2.3): one neutral delete error message for every
failure; Delete disabled while the request is in flight; locked and non-payer states come from
the loaded trip state, never from an error.

Already decided by the requirements: no notification, no "deleted by", no Recently deleted, no
re-claim message, feedback still returns to Trips.

## 1. Inventory and conventions this feature follows

Read in full: `src/components/ui.tsx` (this app's shared primitives live in one file, not a
`ui/` folder), `edit-expense-sheet-content.tsx`, `sheet-shell.tsx`, `trip/[id]/layout.tsx`,
`trip-tabs.tsx` (Expenses tab), `shopping-list-tab.tsx` (floating notice), `settle-up/page.tsx`,
`invite/page.tsx`, `you/page.tsx`, `trips/page.tsx`, `trip/[id]/page.tsx`, `feedback/page.tsx`,
`locked-trip-copy.ts`.

Checklist:

- Form fields and sheet content sit in `Card` with `Kicker` labels and `Divider`; sheets render
  inside `SheetShell` (no `Screen` wrapper).
- Locked state: `LockedNotice` plus `LOCKED_TRIP_COPY` (already shared; edit-expense uses
  `LOCKED_TRIP_COPY.editing.long`). No duplicated locked block was found, so nothing to extract
  here. Inline variant `LockedNoticeInline` exists for lists.
- Controls the user may not use are **hidden, not disabled** (Save is hidden on the read-only
  edit sheet; the pencil only shows on your own expenses). Delete follows this.
- Terracotta ghost buttons are the only destructive style in the app.
- Errors: one terracotta 13px line in the sheet's `error` slot, plain fixed text, "Couldn't ...
  try again." style. Never raw errors (criterion 13).
- Transient notices: the List tab's floating notice (fixed above the bottom bars, ink 90%,
  white 13px medium, `rounded-[14px]`, `px-3.5 py-2.5`), plus an `sr-only` `role="status"` line.
- Button labels are static ("Save changes" / "Saving..."), with a pending label while working.
- Instrumentation: edit-expense uses `timeClient("edit-expense", ...)` and
  `trackEvent("expense_edit_start" | "expense_edit_complete")`, names only. Delete and Undo
  follow it (section 11).
- Defect worth noting, not fixed here: the edit sheet hand-writes its load-error block instead
  of using `ScreenError`. Section 2.5 touches that block; the duplication is left as is and is
  a candidate for a later tidy.
- Unbuilt precedent: "Board G" (Undo toast after copy) is only in the external canvas and the
  starter-list brief (toast ink `#231c12`, Undo in the warm yellow `oklch(0.86 0.12 84)`,
  8 seconds). Nothing with Undo exists in `src/` yet. I could not open the canvas, so the toast
  below takes its colours from the brief and its geometry from the built floating notice. It
  is written as a general toast so the later copy-list feature reuses it.

## 2. Delete

### 2.1 Where the action lives

Entry: Expenses tab, tap your own expense row (pencil icon, existing), edit sheet opens
(existing). Delete exists **only** here. Not on the row, no swipe, no long press, no bulk.

Sheet layout, editable mode only (payer, open trip). User decision 2026-10-19: a compact trash icon
inside the edit card, no full-width button and no caption.

```
 [ Card:  AMOUNT                          [trash] ]   trash = 36px plain icon button, terracotta
 [        $ 52 ...                                ]
 [        What was it / Date                      ]
 (16px)  error line, only when present (terracotta 13px)
 (16px)
 [ Save changes ]                                 (unchanged, h-14 primary)
```

| Item | Spec |
|---|---|
| Control | Existing `IconButton variant="plain"` (36px, round) with `TrashIcon` (18px, stroke 2.2, new in `icons.tsx`) in terracotta, right-aligned on the Amount kicker row inside the card (`-my-1.5 -mr-1.5` so the row does not grow). `aria-label="Delete expense"` (pending: "Deleting…"). No visible text. |
| Why in the card, not in the top bar | The top bar's trailing slot holds only Close; a second icon next to it is one slip away from Close. In the card it is tied to the expense it removes. |
| Caption | None (user decision 2026-10-19). Undo is the safety net; no "can't be brought back" claim is shown. |
| Visible when | The loaded state says the viewer is the payer and the trip is open (mode `editable`). |
| Hidden when | Loaded state says: not the payer (read-only, caption "Only {payer} can edit this expense." unchanged); trip locked (read-only with `LockedNotice`, unchanged); expense not found (section 2.5); still loading. Hidden, not disabled, so there is never a dead destructive button. This is decided from the data the sheet already loads (expense `paid_by`, trip `completed_at`), never from a failed delete. |
| While deleting | **Delete and Save are both disabled for the whole time the request is in flight** (one shared submitting flag), the Delete icon button is disabled and its label becomes "Deleting…". A second tap cannot send a second request. Unsaved edits in the fields are discarded without a warning (the form has no unsaved-change warning anywhere today). |
| Unverified session | Same gate as Save: unverified user is sent to the verify step and returned to this sheet, nothing deleted. No draft needs saving. |
| On success | Sheet closes to `/trip/{id}` (same `router.push` plus `router.refresh()` as Save), the expense is gone from the list, the Undo toast appears (section 3). |

### 2.2 Confirm step: none (decided)

There is no confirm step (decision 1). The Undo toast and the caption are the safeguards.

### 2.3 Errors in the sheet: one neutral message

Every delete failure shares one error code, so the app cannot tell "not the payer", "locked",
"already deleted" or "unavailable" apart, and must not guess. Locked and non-payer are handled
before the tap (the Delete button is simply not there, section 2.1). If a delete still fails,
the sheet shows the one terracotta line in the same slot as Save's error:

> "Couldn't delete that expense. Please try again."

| Case | Behaviour |
|---|---|
| Any failure (refused, locked since load, already deleted, function missing, rate limited, server error) | The line above. The sheet stays as it was, the Delete button is enabled again, nothing else changes. No toast. |
| Offline (`navigator.onLine === false`) | Same line. No separate offline copy. |
| Never | No per-cause text, no raw error or code, no fallback to a direct delete (criterion 27). |

If the trip locked or the expense was deleted elsewhere, the next time the sheet loads it shows
the correct read-only or "isn't available" state from loaded data. No retry loop is invented.

### 2.4 What others see; the linked shopping-list item

No notification, no "deleted by", nothing in the list. On their next refresh the expense is
gone and balances change (criterion 10).

The linked item, as the user sees it:

- The member who bought the item: it leaves "Bought" and returns under "Your bag" as claimed,
  not bought. No message about it anywhere (decision D2). If that member had been removed from
  the trip, it returns to "To get" (open).
- Everyone else sees the same change on their next refresh.
- Undo: the item goes back to "Bought" and relinks only if still exactly as delete left it;
  otherwise it stays where it is, silently.
- The "Bought" row's link to the edit page is only on bought items, so a deleted expense's item
  no longer carries it. A stale tab with the old link lands on section 2.5.
- The sheet does not warn that a shopping item will be put back (extra read, and D2 asked for
  no special handling).

### 2.5 Opening a deleted or missing expense (criterion 11)

Today a failed read shows "Couldn't open that expense — try again." with "Try again", which
would loop on a deleted expense. Split the two cases using the error the read already returns
(zero rows = `PGRST116`, versus a network failure with no code):

| Case | Sheet shows |
|---|---|
| Expense deleted, erased or never existed (zero rows) | `TopBar` "Expense" with the Close button, then the plain paragraph "This expense isn't available anymore." (15px, ink/70, same as the load error), 12px, then a soft button "Back to trip" linking to `/trip/{id}` (`block={false}`, `px-5`). No contents, no "deleted" wording, no retry. |
| Network or other failure | Unchanged: "Couldn't open that expense — try again." with "Try again". |

A deleted row is indistinguishable from one that never existed.

## 3. The Undo toast

One element, shared by delete today and reusable for the later copy-list Undo.

### 3.1 Look and position

```
        ┌────────────────────────────────────────┐
        │  Expense deleted              Undo     │   ink 90%, white text
        └────────────────────────────────────────┘
        (16px gap)
 [ Add expense bar ]
 [ nav bar ]
```

| Item | Spec |
|---|---|
| Container | `fixed left-1/2 z-10 w-full max-w-md -translate-x-1/2 px-5`, same as the List tab notice, but **not** `aria-hidden` (it holds a button). The wrapper is `pointer-events-none` and only the pill is `pointer-events-auto`, as `FabBar` does. |
| Vertical position | 16px above the top of the stacked bottom bars on the trip page. The List tab's notice uses `bottom-[106px]`; engineering confirms that constant clears both bars and uses one shared constant for both notices. Never covers the bar, never moves any row. |
| Pill | `mx-auto flex w-fit max-w-full items-center gap-4 rounded-[14px] px-3.5 py-2.5 text-[13px] font-medium text-white`, background `color-mix(in srgb, var(--color-ink) 90%, transparent)` (identical to the List notice). |
| Message | "Expense deleted" in white. Never the expense name or amount. |
| Undo | A real `<button type="button">` labelled "Undo", `font-semibold`, colour `var(--glow-blob-1)` (= `oklch(0.86 0.12 84)`, an existing token). Hit area 44px tall: `-my-3 py-3 px-1` so the pill stays about 38px tall. Visible focus ring in white (2px, offset 2px). |
| Motion | None. |
| Dark mode | The app is light only; no variant. |

### 3.2 Timing

- Visible for **10 seconds** from the moment the delete succeeds. The timer does not pause on
  hover, focus or touch: the real window is decided by the database clock and cannot be
  extended by the screen.
- The server accepts Undo a little after the toast disappears, but the screen never offers it
  then.

### 3.3 Where it lives and what happens on navigation

- State lives in a small client provider mounted in `src/app/trip/[id]/layout.tsx`, next to
  `TripSheetChrome` and the sheet slot, **outside** the dimmed `children` subtree (the chrome
  dims that subtree with `transform` and `filter`, which would trap a `fixed` toast). That lets
  it survive the sheet closing and the refresh after a delete. It holds the expense id, the
  deadline (wall-clock time) and a status.
- It renders only when the path is exactly `/trip/{id}` (Expenses, Details and List tabs).
  While a sheet is open, or on Settle up, Invite or any other page, it is hidden but keeps its
  deadline; coming back inside the 10 seconds shows it again.
- Leaving the trip (Trips, You, a different trip), signing out, or a reload clears it. The
  delete stands and erase proceeds on the server. No warning on leaving.
- **A new delete replaces any current toast** (decision 2): single toast, the older expense
  loses its on-screen Undo and is erased after its window as normal.

### 3.4 Undo flow and states

| State | Pill content | Notes |
|---|---|---|
| Waiting | "Expense deleted" + "Undo" | 10 seconds, then the pill disappears with no message. |
| Undoing | "Restoring..." (no Undo button) | Starts on tap; the deadline is not extended while waiting; Undo cannot be tapped twice. |
| Restored | "Expense restored" (about 3 seconds, no button) | List refreshes (`router.refresh()`), the expense reappears in its date position with the same amount, description, date and payer, balances update. |
| Too late | "Couldn't undo — it's too late, or the trip was locked." (about 6 seconds, no button) | One message for window passed, already erased, and trip locked, because the server answers all three with the same fixed error (criteria 5, 17). Nothing changed. The list refreshes to confirm the real state. |
| Offline or request failed | "Couldn't undo — check your connection and try again." Undo stays visible if time remains; otherwise the pill goes after about 6 seconds | Used when the failure carries no fixed error code (network). |
| Undo unavailable (function missing) | "Undo isn't available right now." (about 6 seconds, no button) | Same rule as delete (criterion 27). |

Error pills may wrap to two lines at 320px (section 8); the pill grows upward from its bottom
edge, so it never moves toward the bar.

### 3.5 Accessibility

- A visually hidden `<div role="status" className="sr-only">` lives in the provider **always**
  (so the region exists before its text changes). Delete success sets "Expense deleted. Undo is
  available for a few seconds." Undo sets "Expense restored." or the matching error text. It
  clears about 10 seconds later.
- The visible pill is not `aria-hidden` and not `role="alert"`.
- The Undo button is in the normal tab order, placed after the page content and before the
  bottom bars in DOM order. Focus is **not** moved to it automatically.
- Timing note for review: the 10 seconds is a server rule and cannot be extended by the user.
- Touch target 44px. Contrast: white on ink 90% passes; Undo yellow on ink 90% is about 10:1.

## 4. Locked trips and non-payers

| Viewer | Edit sheet |
|---|---|
| Payer, trip open | Save and Delete (section 2.1). |
| Not the payer, trip open | Read-only, "Only {payer} can edit this expense." No Delete. Unchanged. |
| Anyone, trip locked | Read-only with `LockedNotice` using `LOCKED_TRIP_COPY.editing.long` (unchanged, decision 5). No Delete. |
| Expense of a departed or removed payer | Nobody can delete it (criterion 15, known limit). Today's read-only sheet. No special copy, no organizer override. |

Undo on a locked trip is refused; if the trip locks inside the 10 seconds, tapping Undo shows
the "Couldn't undo — it's too late, or the trip was locked." pill. List rows on a locked trip
are already non-tappable, unchanged.

## 5. Settle-up: locked footer (criterion 35)

Remove the muted "Trip completed" `Button` and the `h-2` spacer under it from the locked
branch's `BottomBar`. Keep: the accent "Trip completed" / "Locked" status card at the top, and
"Create a new trip" (`Button variant="accent"`, h-14, `router.push("/trip/new")`).

| | Before | After |
|---|---|---|
| Footer content | 50px muted button + 8px + 56px accent button | 56px accent button only |
| Bar height (390 and 320) | 10 + 50 + 8 + 56 + 16 = 140px | 10 + 56 + 16 = 82px (safe-area inset replaces the 16px when larger) |

Open-trip Settle-up is untouched (the "Trip complete" button label difference is deliberate and
not changed). The 24px clearance spacer in the content stays.

Adjacent note for PM, not in scope: this page's placeholder line says "settle up with them
directly, then mark it paid", but there is no in-app "mark paid". Compliance constraint M1
makes that wording worth a look in a later pass.

## 6. Invite rows (criterion 37; decision 4)

Change the vertical padding of the **member cards** only, from 14px to 11px: `p-[14px_18px]`
becomes `p-[11px_18px]` on both card sites: people on the trip (`realMembers.map`) and
placeholder people (`placeholders.map`). Horizontal 18px, the 10px gap between cards
(`mb-2.5`), avatars (34px), buttons (36px) and all text are unchanged. The in-place states in
the same Card (Leave/Remove confirm, rename input) also get 11px; the confirm buttons (38px)
and rename input (42px) fit.

| Row | Height change | Notes |
|---|---|---|
| Any member card | 6px shorter (3px off the top, 3px off the bottom) | Same at 390 and 320: horizontal padding unchanged, so no text rewraps. |
| Placeholder card with the organizer helper line | 6px shorter | The helper wraps exactly as before. |

A trip with six members is 36px shorter in total. **Unchanged at 14px:** the dashed rows
("Waiting on everyone else", "Add a placeholder member"), the "3/3 placeholders" cap row, the
"Add a placeholder" form Card, and `LockedNoticeInline`.

## 7. Send feedback

### 7.1 You (criterion 38)

Add a third row to the existing Privacy and Terms `Card` (`px-4 py-[3px]`), after Terms, with a
`<Divider className="bg-hairline" />` between them. Row markup is copied exactly from the Terms
row: `<Link href="/feedback" className="flex items-center gap-3 py-[11px]">`, 36px rounded-[11px]
tile in `--color-accent-soft` / `--color-accent-ink` holding the existing `MessageSquareIcon`
(size 17, stroke 2.2), label "Send feedback" (`text-[15px] font-semibold`), `ChevronRightIcon`.
The link has no query string and no trip or user data.

| | 390px | 320px |
|---|---|---|
| Screen gutter | 16px | 16px |
| Card width | 358px | 288px |
| Row height | 36 + 2 x 11 = 58px | 58px |
| Card height | was 123 (2 rows), now 3 x 58 + 2 x 1 + 6 = 182px | same |
| Label fit | row needs about 214px | fits in 288px; no wrap |

The existing 72px clearance spacer above the nav bar stays.

### 7.2 Where it appears (criteria 39 to 41)

| Screen | Feedback icon |
|---|---|
| You | New row (7.1). |
| Trip details (`/trip/[id]`, all three tabs) | Kept, unchanged (top bar trailing icon). |
| Trips/home | Removed. `TopBar` is rendered without `trailing`, so it takes the single-title branch. |

Home top-bar height: the wordmark is 42px tall and the removed icon button was 36px, so the bar
stays 42px and the existing 22px gap below it needs no change. Engineering measures that the
kicker still sits where it did at 390px and 320px; the code comment saying a "40px Feedback
button" makes the bar taller is stale and should be corrected.

### 7.3 Where `/feedback` returns

Unchanged (decision D4): the close X and a successful send both go to `/trips`, wherever the
user came from. From You, close lands on Trips, not back on You, and `/feedback` has no bottom
nav. Recorded because it may feel odd; changing it is a separate item.

## 8. Measurements and states at 390px and 320px

| Element | 390px | 320px |
|---|---|---|
| Sheet panel (`max-w-[416px]`, `w-full`) | 390px wide | 320px wide |
| Delete icon button | 36px x 36px, right end of the Amount row | same |
| Toast, normal | pill about 190px wide, 38px tall, centred, 16px above the bars | same, fits 280px max |
| Toast, error copy | up to 350px; one or two lines | wraps to two lines within 280px; about 54px tall, grows upward |
| Toast tap target | Undo 44px tall, at least 44px wide | same |
| Settle-up locked footer | 82px | 82px |
| Invite member card | 6px shorter than today | 6px shorter than today |
| You feedback row | 58px | 58px |

On short screens (320x568) Save, Delete and the caption add about 64px plus the caption, so the
sheet scrolls inside its own container (`overflow-y-auto`, already there).

## 9. Empty, loading, error summary

| State | Behaviour |
|---|---|
| Loading the sheet | "Loading expense..." (`ScreenLoading`, unchanged). |
| Expense gone | Section 2.5. |
| Last expense deleted | Expenses tab shows its existing "No expenses logged yet." with the toast above the bars; Undo brings the list back. |
| Delete or Undo while slow | "Deleting..." / "Restoring..."; nothing else changes until the response. |
| Offline | Delete: the neutral line (2.3). Undo: section 3.4 copy. |
| Rate limited (criterion 28) | Delete: the neutral line. Undo: the network-style line. Never reveals the limit. |

## 10. Copy table (exact strings)

| Where | String |
|---|---|
| Delete icon button (screen-reader label only) | "Delete expense" (pending: "Deleting…") |
| Toast | "Expense deleted" and "Undo" |
| Toast pending | "Restoring..." |
| Toast restored | "Expense restored" |
| Toast too late | "Couldn't undo — it's too late, or the trip was locked." |
| Toast network | "Couldn't undo — check your connection and try again." |
| Toast unavailable | "Undo isn't available right now." |
| Screen reader | "Expense deleted. Undo is available for a few seconds." / "Expense restored." |
| Sheet delete error (the only one) | "Couldn't delete that expense. Please try again." |
| Expense gone | "This expense isn't available anymore." and button "Back to trip" |
| You row | "Send feedback" |

Copy rules honoured (compliance C1, C2, criterion 32): the words are "deleted", "Undo",
"restored" and "can't be brought back"; none says "erased from all systems", "removed from
backups" or "only you can see it"; failure lines reveal nothing about the row; the "can't be
brought back" wording is used only because Undo really fails afterwards.

## 11. Constraints satisfied

| Constraint | Where |
|---|---|
| C1 copy: facts only, no backup or "erased from all systems" claim | Sections 2.1, 3.4, 10. |
| C2 Undo failure plain, no row content | Section 3.4 (one message for all three server refusals). |
| C3 / criterion 33 analytics: event name only | `trackEvent("expense_delete_complete")` after a successful delete and `trackEvent("expense_undo_complete")` after a successful Undo; no properties, no ids, amounts or text. No start events. Listed in `docs/ANALYTICS.md` by the docs stage. Timing: `timeClient("edit-expense", "deleteExpense", ...)` and `timeClient("trip", "undoDeleteExpense", ...)`, fixed labels with no ids. |
| Criterion 10 no notification, no "deleted by" | Section 2.4. |
| Criterion 7 locked: no delete control, existing locked wording, Undo refused | Sections 4 and 3.4. |
| Criterion 15 departed payer | Section 4. |
| Criterion 13 raw errors never shown | Sections 2.3, 3.4. |
| Criterion 11 deleted expense not openable | Section 2.5. |
| M1 (future mark-paid needs re-review) | Section 5 note; architecture notes carry the rule. |
| Public summary shows no descriptions | No UI, enforced in data layer. |
| No `/privacy` change | Nothing retained after the window; no copy here claims otherwise. |

## 12. Consistency with existing screens

Reused as is: `Card`, `Kicker`, `Divider` (sheet, You card); `Button` ghost with the terracotta
recipe from `ConfirmInlineAction` (Delete; `ConfirmInlineAction` itself is not used, no
confirm); `LockedNotice` and `LOCKED_TRIP_COPY`; `ScreenLoading`; the existing terracotta
error line slot; the List tab's floating notice geometry and sr-only `role="status"` pattern;
`MessageSquareIcon`, `ChevronRightIcon` and the You row recipe; `BottomBar`; `TopBar`
single-title branch.

Deliberate additions and deviations:

1. **Undo toast is the one new element.** An interactive variant of the floating notice (the
   existing one is `aria-hidden` and `pointer-events-none`, so it cannot hold a button).
   Undo is the only way back. Built generic so copy-list Undo reuses it.
2. **Layout-level state for the toast**, because the sheet unmounts and the page refreshes
   right after delete.
3. **No trash icon** and no confirm step (decision 1).
4. **Hidden, not disabled** for non-payer and locked, matching Save; decided from loaded state.
5. **One neutral delete error**, since failures share one code.
6. **Expense-gone state** differs from the generic load error because retrying cannot help.
7. Duplication noted, not repeated: the locked sentence is already shared; no locked block is
   added. The edit sheet's hand-written load-error block is left as it is.

## 13. Board and canvas coverage

| Board / item | Status | Note |
|---|---|---|
| Delete control in the edit sheet | Built in this design (new, no board) | Section 2.1. |
| Undo toast | Built in this design (new). Canvas board G not opened | Colours from the starter-list brief; geometry from the built floating notice. Board G stays "deferred" for copy-list. |
| Expense-gone state | New, no board | Section 2.5. |
| Settle-up locked footer | Built (small edit to redesign-ui 4.5) | Section 5. |
| Invite rows 11px (member and placeholder cards) | Built (small edit to redesign-ui 4.5) | Section 6; dashed rows stay 14px. |
| Board O (You) | Deviation: board does not show Send feedback | Canvas needs the third row; this doc is the spec until redrawn. |
| Board A (Home) | Deviation: board shows the Feedback icon | Canvas needs the icon removed; wordmark row keeps its height. |
| Board C (trip details) | Built unchanged | Feedback stays. |
| Shopping-list Bought/Bag views | Unchanged | Items move between sections using existing rows. |
| Recently deleted list, restore after the window, organizer override, notifications | Deferred / non-goals | Requirements non-goals. |

## 14. Engineer checklist (visible results to verify)

- [ ] Delete only appears for the payer on an open trip; hidden on read-only and locked sheets, decided from loaded data.
- [ ] While the delete request is in flight, Delete and Save are disabled; no second request can be sent.
- [ ] Any delete failure shows only "Couldn't delete that expense. Please try again."; the button re-enables.
- [ ] Tap Delete: sheet closes, expense gone, balances change, toast "Expense deleted / Undo".
- [ ] Undo inside 10 seconds restores the expense unchanged; toast says "Expense restored".
- [ ] After 10 seconds the pill disappears; a forced late Undo shows the too-late message and changes nothing.
- [ ] Open Settle up inside the window: toast hidden; back inside the window: shown again.
- [ ] Leave the trip and return: toast gone.
- [ ] Two deletes inside 10 seconds: only the newest toast.
- [ ] A direct link to a deleted expense shows "This expense isn't available anymore." with "Back to trip", no Try again.
- [ ] 320px: caption wraps, toast error wraps without clipping, Undo stays 44px tall.
- [ ] Settle-up locked: only "Create a new trip" in the footer, status card unchanged.
- [ ] Invite: member and placeholder cards 6px shorter; dashed rows unchanged.
- [ ] You: third row "Send feedback" under Terms; Trips: no feedback icon, kicker position unchanged; trip details: icon still there.

## Addendum: Expenses tab editable-row tint (user decision 2026-10-19)

Outside the original reviews; UI only, no data or database change. Rows the viewer can edit (own
expense, open trip) get a very light tint (`bg-ink/[0.035]`, edge to edge inside the card) and a
darker hover state (`hover:bg-ink/[0.08]`, user decision 2026-10-19: hover instead of press). The small pencil icon is removed, so every amount
now right-aligns the same on all rows. Other members' rows and all rows on a locked trip stay
plain. The card's 3px vertical padding moved onto the first and last rows so card height is
unchanged. The row's "Edit {description}, {amount}" label is unchanged. To check by eye at 390px
and 320px: tint corners at the card's rounded ends, and divider lines on tinted rows now run edge
to edge while plain rows keep inset dividers.
