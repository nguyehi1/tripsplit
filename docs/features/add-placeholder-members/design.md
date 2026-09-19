# Placeholder members — design

Companion to `docs/features/add-placeholder-members/requirements.md` (locked). This doc does not
re-litigate any acceptance criterion — where the current codebase doesn't line up cleanly with a
locked AC, or where a locked AC leaves a real product question open, it's called out explicitly
in **Open questions for product/architecture** rather than silently guessed at.

No visual mockup was produced — every screen here is a small extension of an existing list/card
pattern already in the app (roster cards on `invite/page.tsx`, inline forms on `add-expense`), so
prose + the exact copy is clearer than a static image would be.

---

## 0. Orientation notes (why the flow is shaped this way)

A few things found while reading the existing app that directly shaped this design:

1. **`/trip/[id]/invite` has no persistent nav entry point today.** It's only ever reached once,
   right after `createTrip` redirects to it. The trip dashboard's icon row (All trips / New trip /
   Settle up / Feedback) has no link back to it. Since placeholder management needs to be usable
   at *any* point in the trip (not just at creation), this design adds a persistent entry point —
   see §1. Flagged as a scope note in **Open questions**, since it's new nav surface, not just new
   content on an existing screen.
2. **There is no payer picker anywhere in the app today.** `add-expense` and the expense edit page
   both hard-code `paid_by` to the signed-in user (`paidBy: user.id`); RLS enforces "insert as
   yourself." AC #7/#8 ("the add-expense and edit-expense payer pickers must exclude every
   placeholder") describes UI that doesn't exist yet. See **Open questions** — this doc designs
   for the app as it exists today and flags the gap rather than inventing a payer-picker feature
   that isn't in this feature's scope.
3. **The invite/roster page silently swallows load errors** (`.catch(() => {})`, leaving the page
   stuck on nothing). Since this page is being upgraded into a page members return to repeatedly,
   this design brings its error/loading states in line with the dashboard's existing convention
   (§7).
4. **No modal/dialog component exists in the UI kit.** Confirm-on-delete (§5) is designed as an
   inline two-step affordance using existing primitives, not a new modal.

---

## 1. Where "add placeholder" lives

**Home screen:** `/trip/[id]/invite` — renamed in spirit (not necessarily in route) from a
one-time "invite" screen to the trip's ongoing **roster** screen. It already lists every member
under "On the trip"; this feature adds a second section, **Placeholders**, below it.

**Entry point:** add a `PeopleIcon` (new icon asset) to the trip dashboard's icon row
(`src/app/trip/[id]/page.tsx`), alongside Settle up / Feedback, `title="Trip roster"`, routing to
`/trip/[id]/invite`. Visible to every member (the page itself already has no organizer gate on
viewing — it's just that the add/rename/remove affordances inside it are organizer-only).

### Roster section layout (on `/trip/[id]/invite`)

```
On the trip                                    4 people
[existing member cards — unchanged]

Placeholders                                   2/20        ← organizer sees "/20"; others see count only
┌─────────────────────────────────────────────┐
│ Dad (placeholder)                      ✏️  ✕ │   ← ✏️ ✕ organizer-only
│ Placeholder                                  │
│ Remove this once Dad joins for real —        │
│ Splitiful won't do it automatically.         │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│ Jordan (placeholder)                   ✏️  ✕ │
│ ...                                          │
└─────────────────────────────────────────────┘

+ Add a placeholder member                          ← organizer-only, dashed-border row,
                                                        same visual language as the existing
                                                        "Waiting on everyone else" dashed box
```

- Non-organizer members: section only renders if `placeholders.length > 0`; no pencil/✕, no "add"
  row, no cap fraction, and no "remove this once they join" note (that note is an instruction to
  the person who can act on it — showing it to people who can't creates confusion, not clarity).
- Organizer: section always renders, even at 0 placeholders, so the cap and the add affordance are
  discoverable without having to already know the feature exists.

### Add flow (inline, not a new full-screen route)

A single-field form doesn't warrant a full-page navigation like `add-expense`'s multi-field form
does — and an organizer plausibly wants to add several names back-to-back (whole family, several
friends), so collapsing back to a static page after every add would be worse, not more consistent.

**Collapsed (default) state** — dashed row, `+ Add a placeholder member`.

**Tapped → expands inline:**
```
Name
[___________________________]        Add
```
- Text input, `autoFocus`, placeholder `"e.g. Dad, Aunt Lin, Jordan"`, `enterKeyHint="done"` so
  the mobile keyboard's return key submits.
- **Empty name:** `Add` button disabled (same `disabled:opacity-60` treatment used everywhere
  else in the app — e.g. `add-expense`'s submit button).
- **Name entered:** `Add` enabled. Submitting trims whitespace; if trimmed value is empty, no
  request is sent and the input just clears (matches "name-only, no other validation" from the
  requirements — no error copy needed for whitespace-only input, since nothing was really
  attempted).
- **Success:** new row appears immediately at the bottom of the Placeholders list as
  `"{name} (placeholder)"`; the input clears and **stays open and focused** so the organizer can
  immediately type the next name — no re-tapping "+ Add a placeholder member" for each person.
  No toast — the new card appearing *is* the confirmation, consistent with how `add-expense`
  confirms by navigating back to a dashboard that now shows the new expense, and how the invite
  page confirms a copy with a 1.5s "Copied!" label swap rather than a toast.
- **Error (insert fails):** inline text under the input, in the app's existing error style
  (`text-[13px] text-terracotta`): `"Couldn't add that — try again."` Input keeps the typed name so
  nothing is lost.

**Cap reached (20/20):** once the 20th placeholder exists, the dashed "+ Add a placeholder member"
row is replaced — not disabled-but-visible, replaced — with a muted, non-interactive row (same
visual treatment as the "Trip is locked" muted button on `add-expense`):

```
20/20 placeholders — remove one to add another
```

This is proactive: the organizer never gets to tap "add" and then get rejected at 20. If a race
condition somehow lets a 21st insert attempt reach the backend (e.g. two tabs open), the backend
rejection surfaces as: `"This trip already has 20 placeholders — the most this feature supports.
Remove one first."`

---

## 2. Display everywhere a name appears

Per AC #5, every member-facing surface renders a placeholder as `"{name} (placeholder)"`. Visual
treatment: keep the name at normal weight/color and render the `" (placeholder)"` suffix at
reduced opacity (`text-ink/60` or similar, matching how e.g. the "— optional, defaults to today"
hint text is de-emphasized against its label elsewhere in the app) — same string, better scannability.

| Surface | Change |
|---|---|
| Roster (`invite` page) | Name shows `"{name} (placeholder)"`. Role subtitle (currently "Organizer" / "Member") shows **"Placeholder"** instead of "Member" for these rows — recommended addition beyond the literal AC, flagged below, since a placeholder row saying "Member" directly under a name that says "(placeholder)" reads as contradictory. |
| Trip dashboard → Details tab | `member.displayName` → `"{name} (placeholder)"`. No other change needed — `paidCents` is already 0 and `netCents` is already negative for a zero-expense member, so the existing "Down $X" red-tinted styling and empty progress bar render correctly with no new code path. |
| Settle-up / Summary | `s.from.displayName` / `s.to.displayName` → `"{name} (placeholder)"`. A placeholder can only ever appear as the `from` side of a transfer (they never paid anything, so nothing is ever owed *to* them) — this falls out of the settlement math already, nothing new to build. See note on "X pays Y" phrasing in §6. |
| Add-expense / edit-expense payer picker | No picker exists today (§0.2) — nothing to change in this pass. Flagged for architecture/PM. |
| Member roster (top-of-dashboard `AvatarStack`, `X people` count) | Placeholders count toward the number (per AC #9, they're an ordinary member row), and their avatar appears in the stack. Optional (not required) visual nicety: render a placeholder's avatar ring as dashed instead of solid, so even in a compact avatar stack a placeholder reads as distinct at a glance. Flagged as optional in **Open questions** — needs a new `Avatar` prop, not just copy. |

---

## 3. Rename flow

Inline edit-in-place, not a separate screen (same single-field reasoning as Add). Precedent for
"how this codebase edits a thing" is the expense edit page, but that pattern (full screen, TopBar,
Card, Save button) is built for a multi-field entity — overkill for one string.

- Organizer taps the pencil icon next to a placeholder's name.
- The static name text is replaced in place by a text input, pre-filled with the current name,
  autofocused with the cursor at the end. The pencil icon is replaced by a checkmark (save) and an
  ✕ (cancel) — explicit tap targets, not blur-to-save, so there's no ambiguity about whether
  tapping away discards or commits (the app doesn't use blur-to-save anywhere else, so introducing
  it here would be a new, inconsistent pattern).
- **Empty after trim:** Save (✓) disabled; inline microcopy under the input: `"Name can't be
  empty."`
- **Success:** collapses back to static text, now reading `"{name} (placeholder)"`, immediately
  correct everywhere else per AC #10 (nothing to refetch — it's the same `display_name` column
  every view already reads).
- **Error:** `"Couldn't save that name — try again."`, input stays open with the edited value so
  the organizer doesn't lose their edit.

---

## 4. Remove flow

**Recommendation: lightweight inline confirm, not a silent one-tap delete.** The prompt explicitly
asked me to weigh this, so here's the reasoning rather than a guess: the delete itself is
data-lossless (AC #12), but it is **not** consequence-free — it immediately and visibly changes
every other member's share the next time they open Details or Summary (AC #13), with no undo
except manually re-adding the exact same name. On a phone, on a bumpy trip, a mis-tap on a small ✕
next to a densely-packed roster row is a realistic accident. A full alert-dialog would be
overkill (and there's no dialog component in this codebase to reuse — see §0.4), but zero
confirmation for an action that silently changes everyone else's bill feels wrong for a
money-splitting app. Landed on a **two-tap inline confirm**, no new component required:

1. Organizer taps ✕ on a placeholder row.
2. Row content swaps in place (no navigation, no overlay) to:
   ```
   Remove Dad (placeholder)? This changes everyone's split.
   [ Keep them ]        [ Remove ]
   ```
   `Remove` styled destructive (terracotta text, matching the app's existing terracotta =
   warning/locked color), `Keep them` styled as the default/soft cancel.
3. Tapping `Keep them` (or navigating away) reverts the row to normal.
4. Tapping `Remove` deletes immediately — button disables itself for the duration of the request
   (fast, local operation; no spinner needed) — and the row is removed from the list.
5. **Error:** `"Couldn't remove {name} — try again."`, row reverts to the confirm state so they
   can retry without re-tapping ✕.

This is flagged in **Open questions** as a product call, not assumed silently — "plain, no
confirmation-heavy flow" in the requirements could also be read as "no confirm at all," and that's
a one-line change if product prefers it.

---

## 5. No-auto-claim messaging

Per AC #14/#15 this is accepted, documented behavior, not a bug — but the organizer is the one who
gets blindsided if they forget, so the reminder needs to live exactly where the forgetting and the
fix both happen: the roster screen, next to the placeholder itself, every time they look.

Static microcopy under every placeholder row (organizer view only — see §1):

> **Remove this once {name} joins for real — Splitiful won't do it automatically.**

Deliberately **not**:
- A toast/snackbar (seen once, then gone — exactly the failure mode being designed against).
- A push notification, badge, or triggered nudge when a real member joins — the requirements'
  non-goals explicitly rule out "any placeholder-specific notification, reminder, or 'convert to
  real member' prompt." A static line of copy that's always present isn't a notification or a
  triggered reminder (nothing fires, nothing pings, nothing counts unread) — but it's a fine
  enough line that it's worth confirming this reading with product rather than assuming it. Flagged.

---

## 6. Empty / error states

| Scenario | Behavior |
|---|---|
| 21st placeholder attempted | Prevented proactively in the UI at 20 (§1); backend rejection message if bypassed: `"This trip already has 20 placeholders — the most this feature supports. Remove one first."` |
| Add-expense form with zero eligible non-placeholder payers | **Confirmed not reachable.** There is no payer picker today — the payer is always the signed-in user submitting the form, who is by definition a real, authenticated member. This scenario can only exist once/if a payer picker is built (see **Open questions**). |
| Roster page fails to load | Currently swallowed silently (`.catch(() => {})`) — recommend bringing this in line with the dashboard/settle-up convention: `"Couldn't load this trip."` Flagged as a small pre-existing gap this feature's expanded use of the page makes worth fixing now rather than later. |
| Roster page loading | `"Loading your trip…"` (existing dashboard copy, reused for consistency). |
| Settle-up transfer where `from` is a placeholder | Copy still reads `"{name} (placeholder)"`. Because "X pays Y" literally can't happen for a placeholder (no account, no way to interact with the app), recommend one small addition **on the settle-up screen only, only when the trip has ≥1 placeholder**, directly under the transfer list: `"'(placeholder)' members can't pay in-app — settle up with them directly, then mark it paid."` This reuses the existing "Mark paid" manual toggle (which is already just a manual tracking checkbox for every transfer today, real or placeholder — no code change to that mechanism, just a copy addition explaining it once). Flagged as a recommended (not required) addition. |

---

## 7. Trip-locked interaction — gap not covered by requirements.md

`trips.completed_at` locking freezes expenses (`add-expense` and edit both show a "locked" state
and RLS blocks writes) specifically so the final settle-up numbers stop moving once the organizer
calls it done. But `trip_members` isn't an expense — nothing in the requirements or the schema
note says placeholder add/rename/remove is blocked once a trip is completed. Left as-is, an
organizer could add or remove a placeholder **after** locking the trip and silently change the
"final" numbers everyone already saw and settled against, which undermines the entire point of
locking.

**Confirmed — build it this way:** hide the add/rename/remove affordances once `trip.isCompleted`,
reusing the exact locked-state pattern already used on `add-expense`/edit (`LockIcon`,
terracotta-soft background, same tone of copy):

> This trip is locked — the organizer already settled it up, so the roster can't be changed.

Requirements.md now codifies this as AC #17/#18. Server-side, the three RPCs additionally reject
with a clear error if called on a completed trip (see architecture.md) — the UI lock is not the
only enforcement.

---

## 8. Mobile considerations

- Everything above reuses the app's existing single-column, `max-w-md`, mobile-first shell — no
  new breakpoints needed.
- Inline add/rename inputs should call `scrollIntoView` on focus so the on-screen keyboard doesn't
  cover the field being edited, especially for placeholders further down a long roster.
- All new tap targets (pencil, ✕, Add, Remove/Keep them) use the existing `IconButton` (36px) or
  `Button` (56px height) sizing — already touch-appropriate, no custom smaller controls introduced.
- The "add several placeholders in a row" flow (input stays open + focused after each add,
  `enterKeyHint="done"`) is specifically designed for one-handed rapid entry on a phone, since the
  realistic moment an organizer does this is finalizing a group chat's headcount on the go, not at
  a desk.

---

## Resolved product decisions

1. **Payer-picker mismatch (§0.2, §2, §6) — resolved.** No payer picker exists and none is built as
   part of this feature; AC #7/#8 are forward-looking/backend-only for this pass (see
   requirements.md AC #7 and Non-goals). Nothing in §2/§6 that referenced a picker needs building.
4. **Placeholders vs. a locked/completed trip (§7) — resolved, see above.** Blocking confirmed;
   requirements.md AC #17/#18 now codify it.

## Accepted defaults (low-risk recommendations, proceeding as designed)

Not explicitly re-confirmed by product, but low-risk enough to build as recommended rather than
block the pipeline on; revisit if QA or later review disagrees:

2. **New persistent nav entry point (§1)** — roster icon added to the dashboard header, since
   `/trip/[id]/invite` otherwise has no way back in after trip creation.
3. **Confirm-on-delete (§4)** — two-tap inline confirm ("Remove {name}? This changes everyone's
   split." → Keep them / Remove), since deletion silently changes everyone's split total.
5. **"Placeholder" role subtitle + dashed avatar ring (§2)** — ship both; keeps a placeholder row
   from reading as contradictory ("Member" subtitle under a "(placeholder)" name).
6. **Settle-up clarifying line for placeholder transfers (§6)** — ship it; consistent with the
   requirements' own intent that the no-claim/double-counting behavior should be visible, not
   silent.
