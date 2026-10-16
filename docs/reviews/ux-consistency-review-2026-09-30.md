# UX Consistency Review — 2026-09-30

Standalone audit, not tied to a feature slug. Triggered by a review of
`add-item-sheet-content.tsx` vs. `add-expense-sheet-content.tsx` (both built
on the ADR 0008 sheet scaffold) that found four concrete diffs between just
those two files. This doc extends that pass across the whole app: every
screen under `src/app/`, plus the shared primitives in `src/components/ui.tsx`.

This is a design/audit document for engineering to act on later — no code
changes are proposed here, only findings and recommended direction.

## A. Shared vocabulary that already exists (`src/components/ui.tsx`)

`Screen`, `ScreenContent`, `TopBar` (with `leading`/`trailing`/`sticky`),
`BottomBar`, `IconButton`/`IconLinkButton`, `Button`/`LinkButton` (7
variants), `Card`, `Divider`, `Kicker`, `Field`, `Avatar`/`AvatarStack`,
`ProgressBar`, `TabSwitch`. This is a solid, well-used primitive set — the
inconsistencies below are almost entirely about *which combination* of these
primitives (or hand-rolled alternatives) a given screen reaches for, not
about the primitives themselves.

## A.1 Patterns that are used repeatedly but never named/extracted

These show up 3+ times with near-identical intent and structure, but each
call site re-derives its own markup instead of sharing a component:

1. **Locked-trip messaging** — a form/screen explaining that the trip is
   completed and this action is no longer available.
2. **Inline destructive-action confirm** — "Cancel"/soft vs. "Delete or
   Remove"/ghost-terracotta button pair replacing a row's normal content.
3. **Attempt-then-redirect-to-verify gate** — try a mutation, and if the
   caller isn't verified, push to `/check-email` with a contextual
   `?trigger=`.
4. **Scope-explaining subtitle** — a line under the screen's `TopBar`
   telling the user who this data is visible to / what the action affects.
5. **Fetch-on-mount loading/error state** — `"Loading X…"` / `"Couldn't
   load X"` shown while a client component's `useEffect` resolves.

None of these have a shared component today. Section B ranks the
inconsistencies this causes.

## B. Concrete inconsistencies, ranked by duplication/impact

### 1. Locked-trip state — 6 independent implementations, no shared component or copy

Highest-impact finding — touches every screen that can mutate a trip.

- `src/app/trip/[id]/add-expense-sheet-content.tsx:301-326` — full-screen
  `ScreenContent` + `TopBar` + 46px rounded terracotta icon block + paragraph:
  *"This trip is locked — the organizer already settled it up, so no more
  expenses can be added."*
- `src/app/trip/[id]/add-item-sheet-content.tsx:116-141` — **byte-identical
  JSX shape** to the above (confirmed in the original two-file diff), only
  the copy's tail differs: *"...so the list can't be changed anymore."*
- `src/app/trip/[id]/expense/[expenseId]/edit/page.tsx:203-216` — same
  icon-block-plus-paragraph shape a third time, inline within the form
  instead of as an early return, copy: *"...so expenses can no longer be
  edited."*
- `src/app/trip/[id]/invite/page.tsx:559-570` — a **different** treatment:
  no icon block, a single pill-shaped `LockIcon` + text row on a
  `terracotta-soft` background, inline among the placeholder-list controls
  rather than replacing the whole screen. Copy: *"...so the roster can't be
  changed."*
- `src/app/trip/[id]/settle-up/page.tsx` doesn't show a "locked" blocker at
  all (locking is the point of that screen) but *does* introduce a third
  visual treatment for a related concept (a large `terracotta-soft` rounded
  card, `LockIcon` on white, headline + paragraph) for the "not yet locked"
  state at lines 110-124 — worth a look for whether it should share
  language with the others even though its meaning is inverted.
- `src/app/trip/[id]/shopping-list-tab.tsx:19-21` has actually already
  extracted a `LOCKED_COPY` constant and a generic `UNEXPECTED_COPY`, but
  only *this one file* uses it, and only for inline claim/unclaim/delete
  error text, not for a screen-level blocker — it doesn't share the
  constant with the two sheets that need the exact same fact.
- `src/app/trip/[id]/trip-bottom-bar-button.tsx:16-40` adds a *fourth*
  wording pair for the same fact, this time as a disabled-button label:
  *"Trip is locked — the list is read-only"* vs. *"Trip is locked — no more
  expenses"* — different sentence structure from all of the above.

**Recommendation:** extract one `LockedNotice` (or similar) component for
the full-screen case (icon block + paragraph, used by add-expense,
add-item, edit-expense) and decide deliberately whether invite's inline
pill treatment is a justified second variant (it is inline in a list, not
a full-screen replace) or should also converge. Centralize the copy as a
single source of truth (a `LOCKED_TRIP_COPY` map keyed by what's blocked:
expenses / items / roster / editing) so `trip-bottom-bar-button.tsx` and
the sheets stop hand-writing separate sentences for the same fact.

### 2. Instrumentation (`trackEvent` / `timeClient`) applied inconsistently to comparable mutation flows

- `add-expense-sheet-content.tsx` — `trackEvent("expense_add_start")` on
  mount (line 65), `trackEvent("expense_add_complete")` on success (line
  279), and every gating query + the mutation itself wrapped in
  `timeClient(...)` (lines 98-176, 258-276).
- `expense/[expenseId]/edit/page.tsx` — same pattern:
  `expense_edit_start`/`expense_edit_complete` (lines 42, 144),
  `timeClient` around every gating query and the mutation (lines 49-57,
  135-142).
- `settle-up/page.tsx` — `trackEvent("settlement_view"/"settlement_complete")`
  (lines 22, 50) but **no `timeClient` anywhere**, despite doing comparable
  gated Supabase fetches.
- `trip/new/page.tsx` — `trackEvent("trip_create_start"/"trip_create_complete")`
  (lines 44, 81), no `timeClient`.
- `join/[code]/page.tsx` — `trackEvent("trip_join_start")` only (line 30) —
  no corresponding "complete" event tracked here (it may legitimately fire
  from `/api/join` instead, but that's not evident from this file alone and
  is worth confirming rather than assuming).
- **`add-item-sheet-content.tsx` has none of this at all** — no
  `trackEvent`, no `timeClient`, despite performing the identical
  gating-query shape as `add-expense-sheet-content.tsx` (compare lines
  29-64 to add-expense's lines 90-176) and being a real mutation funnel
  (adding shopping-list items). This means product has zero funnel/perf
  visibility into item-adding, while expense-adding is fully instrumented.
- `shopping-list-tab.tsx` claim/unclaim/delete/add actions — no
  `trackEvent` calls anywhere in the file, despite `member_placeholder_add`,
  `member_invite_send` etc. being tracked one file over in `invite/page.tsx`.
- `feedback/page.tsx` — no `trackEvent` on view or submit, unlike every
  other form-submission screen in the app.

**Recommendation:** this isn't a "make everything identical" fix — some of
these gaps may be deliberate (e.g. maybe shopping-list interactions are
considered too high-frequency to track individually). But right now there's
no documented rule for which actions get `trackEvent`/`timeClient` and
which don't, so each gap reads as an oversight rather than a decision.
**Flagging for a product decision**, not auto-fixing: at minimum,
`add-item-sheet-content.tsx` should either get the same
start/complete + `timeClient` wiring as its sibling `add-expense` sheet, or
someone should document why it's intentionally excluded.

### 3. Card/Kicker/Divider form-wrapping convention — the original two-file diff, confirmed broader

- `add-expense-sheet-content.tsx:397-441` and
  `expense/[expenseId]/edit/page.tsx:228-275` both wrap their fields in
  `<Card className="p-[18px]">` with `<Kicker>` labels and `<Divider>`
  between fields — this is the established "form card" convention, used
  consistently across the two expense forms.
- `add-item-sheet-content.tsx:156-177` doesn't use `Card`, `Kicker`, or
  `Divider` at all — each field is a bare `bg-white rounded-[18px]` row,
  visually flatter and with no section labels.
- `trip/new/page.tsx` partially follows the convention (`Field` for
  name/location, `Card` + `Divider` for the date picker at lines 137-174)
  but the `Field` component itself (from `ui.tsx`) is a *third* input
  treatment, distinct from both the Card-wrapped raw `<input>` pattern and
  add-item's bare-row pattern — three different visual textures for "a text
  input" across three screens the user moves through in sequence
  (new-trip → trip → add-expense/add-item).

**Recommendation:** since 2 of 3 comparable forms already agree, converge
`add-item-sheet-content.tsx` onto the Card/Kicker/Divider convention rather
than inventing a fourth pattern. Separately, decide whether `Field` (used
by new-trip, check-email, invite's rename input) and the raw Card-wrapped
`<input>` (used by add-expense/edit-expense) are two deliberately distinct
input styles (e.g. "structured form" vs. "big number entry") or should be
unified — right now nothing in the code or docs states the distinction.

### 4. Scope-explaining subtitle copy — inconsistent placement, not just inconsistent presence

- `add-expense-sheet-content.tsx:339-342` — a `<p>` under `TopBar`
  explaining "Splits equally across everyone... you only log what you
  paid for."
- `expense/[expenseId]/edit/page.tsx:217-224` — same subtitle-paragraph
  slot, three copy variants depending on `mode`.
- `add-item-sheet-content.tsx:152` — the equivalent fact ("everyone sees
  them") is placed in `TopBar`'s `trailing` slot instead — a small
  right-aligned caption next to the close button, not a paragraph below
  it. Same *kind* of information (who this affects / can see it), two
  different UI slots depending on which screen you're on.

**Recommendation:** standardize on the subtitle-paragraph pattern (already
used by 2 of 3 comparable screens) and move add-item's trailing-slot text
into that slot instead, for a consistent reading order (title → who this
affects → the form).

### 5. Inline destructive-action confirm — 3 instances, 3 different levels of explanatory copy, same button styling

- `shopping-list-tab.tsx:88-113` (`ToGetRow` delete confirm) — one-line
  question, no explanation of consequences: *"Delete "X"?"*
- `invite/page.tsx:361-397` (organizer removes a real member) — full
  explanatory paragraph on consequences (their access, the split
  recalculation, that the invite link still works for them).
- `invite/page.tsx:454-481` (organizer removes a placeholder) — a single
  merged sentence: *"Remove {name}? This changes everyone's split."*
- `invite/page.tsx:327-360` (member leaves themselves) — its own full
  paragraph, different wording from the "remove a member" paragraph next
  to it even though the practical consequences (lose access, expenses
  stay) largely overlap.

All four reuse the identical button pair (`variant="soft"`, `h-[38px]
flex-1`, "Cancel/Keep them/Stay" + `variant="ghost"` terracotta-colored,
same sizing, "Delete/Remove/Leave trip…"), so the *interaction* is already
consistent — only the amount of explanatory copy varies, seemingly by how
much the author of each screen happened to write, not by a stated rule
(e.g. "explain consequences only when the action affects other people's
data").

**Recommendation:** extract a shared `ConfirmInlineAction` component
(title, explanatory body, confirm/cancel labels, error slot, submitting
state) so the button styling stays guaranteed-consistent as new confirm
flows get added, and force a deliberate choice of explanation depth per
call site rather than an accidental one. Flagging for product: should
"delete a shopping-list item" (currently a bare one-liner) get the same
consequence-explaining treatment as "remove a member" — is losing a list
item really lower-stakes than losing a placeholder member, or was that
just not written yet?

### 6. Attempt-then-redirect-to-verify gate — duplicated 4 times, one already extracted

- `shopping-list-tab.tsx:27-36` — already pulled into a local
  `gateOrRedirect(router, tripId)` helper.
- `add-expense-sheet-content.tsx:244-249`, `add-item-sheet-content.tsx:90-94`,
  and `expense/[expenseId]/edit/page.tsx:128-133` each **inline** the same
  `requireVerifiedSession` → build `next`/`back` params → `router.push`
  to `/check-email?trigger=...` logic independently, with independently
  typed trigger strings (`invitee-expense`, `invitee-shopping-list`).

**Recommendation:** promote `gateOrRedirect`'s shape to a shared helper
(e.g. in `src/lib/auth-gate.ts`, where `requireVerifiedSession` already
lives) so there's one place that knows how to build the `/check-email`
redirect, rather than four call sites that must each remember the same
`encodeURIComponent`/`next`/`back`/`trigger` construction correctly.

### 7. Fetch-on-mount loading state — inconsistent use of `DelayedLoadingLine`, inconsistent copy

- `expense/[expenseId]/edit/page.tsx:182-191` and
  `join/[code]/page.tsx:96-105` show `<DelayedLoadingLine />` under a
  `"Loading X…"` line.
- `settle-up/page.tsx:78-86` and `invite/page.tsx:259-267` show the same
  kind of `"Loading…"` / `"Loading your trip…"` line with **no**
  `DelayedLoadingLine`, despite doing a comparable or larger fetch
  (`getTripView`, multiple joined tables).
- Copy varies with no evident pattern: `"Loading…"`, `"Loading your
  trip…"`, `"Loading expense…"`, `"Loading trip…"`.
- The two sheets' `ownerGateBlocked` case
  (`add-expense-sheet-content.tsx:293-299`,
  `add-item-sheet-content.tsx:108-114`) shows `"Redirecting…"` with no
  loading indicator at all, which is a third distinct treatment for "wait
  while a client effect resolves."

**Recommendation:** define the rule for when `DelayedLoadingLine` applies
(e.g. "any fetch expected to sometimes exceed ~1s") and apply it uniformly,
or fold both into one `<ScreenLoading label="..." />` primitive in
`ui.tsx` so future screens get the delayed-line behavior by default
instead of by remembering to import it.

### 8. Generic fetch-error state — inconsistent layout, and only one screen offers retry

- `settle-up/page.tsx:68-76` and `invite/page.tsx:249-257` both show
  `"Couldn't load this trip."` as a bare paragraph at `pt-14`, no retry.
- `trip/[id]/page.tsx:206-217` shows a different message for the same
  underlying condition: `"Couldn't load this trip — you may not be on
  it."`
- `expense/[expenseId]/edit/page.tsx:170-180` shows its error
  (`"Couldn't open that expense — try again."`) inside a full `TopBar` +
  `ScreenContent` shell instead of the bare `pt-14` paragraph the other
  three use.
- `join/[code]/page.tsx:78-94` is the **only** screen that gives the user
  a "Try again" retry button (`Button variant="soft"`, bumping a
  `reloadKey` to re-run the fetch) — every other fetch-on-mount screen
  above dead-ends the user with text and no recovery action, even though
  the failure (`"check your connection and try again"` is literally
  join's own copy) is exactly as likely to be transient on those screens.

**Recommendation:** share a `<ScreenError message retry?={fn} />`
primitive and decide, as a product call, whether retry should be
universal for these fetch-on-mount failures rather than exclusive to the
join flow — right now a user hitting a flaky connection gets a recovery
path on `/join/[code]` but is stuck re-navigating manually everywhere
else.

### 9. Submit-button label tense convention — one outlier worth a product call, not a pure bug

Every primary-CTA loading label in the app is the gerund of its idle
label's verb: *Add an expense → Adding…*, *Add N to list → Adding…*, *Save
changes → Saving…*, *Create trip → Creating…*, *Send feedback → Sending…*,
*Send me a sign-in code → Sending…*. `settle-up/page.tsx:161` breaks this:
idle label is **"Trip complete"** (not a verb phrase) but the loading label
is **"Locking…"** (lines 155-163) — a different verb entirely, not a
gerund of "complete." This is very likely intentional (marketing "Trip
complete" reads better than an imperative "Complete trip" button), but
it's the one CTA in the app where idle-label-verb and loading-label-verb
don't match, so it's worth a deliberate confirm-or-fix rather than leaving
it as a silent outlier.

### 10. Card internal padding — minor, low priority

`p-[18px]` (add-expense's amount card, feedback's two cards,
edit-expense's card, new-trip's date card) vs. `p-4` (settle-up's trip
summary card, join's summary card) vs. `p-[14px_18px]` (invite's
member/placeholder rows). Three different padding values doing the same
job with no apparent reason tied to content. Low-impact visually (the
difference is a few px) — noting for a future design-token pass rather
than recommending immediate action.

### 11. `TopBar`'s `sticky` prop — used by only 2 of 8+ comparable full-screen routes

`sticky` (blurred, translucent, scroll-under nav) is only set on
`trip/[id]/page.tsx:287` and `trip/new/page.tsx:103`. Every other
full-screen route pushed from the trip dashboard — `settle-up`, `invite`,
`feedback`, `expense/.../edit`, `check-email`, `join/[code]` — uses the
plain, non-sticky default. This may be a deliberate "only the two densest
scrolling screens get sticky nav" call, but nothing documents that
boundary, and `settle-up`/`invite` both have long enough scrolling content
(settlement lists, member rosters) that the same justification could
plausibly apply to them too.

## Summary ranking (by breadth of duplication / user-facing impact)

1. Locked-trip state (6 independent implementations, 4+ different copy strings) — highest impact, touches nearly every mutation screen.
2. Instrumentation gaps (add-item and shopping-list have none; everything else is ad hoc) — product-visibility risk, not just visual.
3. Card/Kicker/Divider form convention (the original reported diff, confirmed to be a 2-vs-1 split, not isolated).
4. Scope-explaining subtitle placement (TopBar trailing vs. subtitle paragraph).
5. Inline destructive-confirm copy depth (3 instances, same buttons, divergent explanation levels — flagged for product, not just eng).
6. Attempt-then-redirect gate duplication (4 call sites, 1 already-extracted helper to converge on).
7. Loading-state treatment (DelayedLoadingLine used inconsistently).
8. Error-state treatment (only one screen offers retry).
9. Settle-up's CTA label tense outlier (flagged, not necessarily a bug).
10. Card padding (cosmetic, low priority).
11. TopBar `sticky` boundary undocumented (low-medium priority).
