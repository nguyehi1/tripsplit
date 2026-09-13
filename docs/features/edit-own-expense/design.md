# Edit own expense — design

## Grounding

Read against the current implementation:
- `src/app/trip/[id]/page.tsx` — trip dashboard, expenses list (static rows: avatar,
  description, payer + day, amount), locked-trip badge, `BottomBar` swap to a muted
  "Trip is locked" button when `trip.isCompleted`.
- `src/app/trip/[id]/add-expense/page.tsx` — the only existing "write" form. Full-screen
  route (not a modal or inline editor), `TopBar` with a `CloseIcon` back affordance, hero
  dollar-amount input, single description input, a live "Splits N ways / $X each" preview
  pill, one primary `Button` at the bottom, inline `text-terracotta` validation error, and a
  distinct full-screen locked-trip state (icon badge + explanatory paragraph) shown instead
  of the form when the trip is completed.
- `src/components/ui.tsx` — there is no `Modal`/`Sheet`/`Dialog` primitive anywhere in this
  app. Every write flow (add expense, invite, feedback, settle-up) is its own route built
  from `Screen`/`ScreenContent`/`TopBar`. Loading and error states elsewhere are plain text,
  no skeletons.

This app has one established idiom for "make a change": a dedicated full-screen form that
looks like the create form. Editing should reuse that idiom, not invent a second one
(inline row-editing or a modal would be the bolted-on choice here).

## Entry point and affordance

On the trip dashboard's **Expenses** tab, each row currently renders avatar, description,
payer + day, and amount, with no interactivity. That changes only for rows the signed-in
user paid for, on a trip that is not locked:

- The row becomes tappable (full row as the hit target, not just a small icon — this is a
  money app used one-handed on the go, and the row is already ~50px tall, comfortably above
  a 44px touch target).
- A small pencil glyph appears at the trailing edge of the amount (`ink/40`, matching the
  weight of the existing `ink/[0.72]` metadata text) purely as a visual signal that the row
  is interactive — nothing else in this list has ever been tappable, so an unlabeled tap
  target would be missed. Give the row `role="button"` and an `aria-label` of
  `"Edit {description}, {amount}"`.
- Rows paid by anyone else: no pencil, not tappable, no hover/press state — identical to
  today. This is a hide, not a disable: per requirements AC1, another member's expense must
  not expose an affordance at all, so there's no "tap it and get told no" moment for the
  ownership case.
- **Locked trip**: no row gets the pencil or the tap affordance, for anyone, including the
  payer. This mirrors the existing precedent in this exact file — the `BottomBar` doesn't
  grey out "Add an expense," it's replaced outright by the "Trip is locked" message. Editing
  follows the same rule for consistency: the whole list reverts to its current fully static
  presentation once `trip.isCompleted`.

## Happy path

1. User taps their own expense row on the (unlocked) trip dashboard.
2. Navigates to an **Edit expense** screen — same visual construction as Add Expense:
   `TopBar` titled "Edit expense" with a leading `CloseIcon`, hero `$` amount input
   pre-filled with the current amount (e.g. `42.50`), a divider, a description input
   pre-filled with the current text, and the live split-preview pill below the card.
3. A one-line helper under the `TopBar`, in the same `ink/[0.73]` tone as add-expense's
   helper line, replaces add-expense's copy (which explains the *concept* of splitting) with
   one that explains *this is a correction*:
   > "Same equal split across everyone on the trip — just update what changed."
4. User edits amount and/or description. The split-preview pill (`Splits N ways` /
   `$X each`) recalculates live from the in-progress amount, exactly as it does in
   add-expense.
5. User taps **"Save changes"** (primary button, replacing add-expense's "Add an expense").
6. Client validates with the identical rule and message as add-expense (amount > 0,
   description non-empty after trim): invalid input never reaches the server.
7. On success: navigate back to the trip dashboard. The row already reads live from
   `expenses`, so the new amount/description appear immediately with no extra fetch or
   cache-bust needed (per AC3 — worth a QA spot-check on settle-up and My Trips too, since
   both also read live).
8. On failure: stay on the edit screen, keep the user's in-progress edits in the fields
   (never revert them silently), show an inline error, let them retry.

## Cancel

Tapping the `CloseIcon` in the `TopBar` navigates back to the trip dashboard immediately,
with no confirmation dialog — no save call is ever made, so the original row is
untouched by construction (AC4 falls out of "cancel just means never submit," not out of any
explicit rollback logic). This matches add-expense's close behavior today, which also
discards a half-filled form with no prompt.

**Flagged for product**: add-expense gets away with a silent discard because a blank form
has nothing to lose. Here, the user is discarding an edit to a *number that determines what
their trip mates owe*. If they fat-finger the close icon after changing $42.50 to $420, they
lose that correction silently and won't know it didn't save. I'd default to shipping without
a confirmation (consistency with the rest of the app, and it's a low-frequency mistake with
low cost — the original expense is unchanged, not lost), but a "Discard changes?" prompt when
the fields differ from the loaded values is a reasonable ask if you want a safety net. Calling
it out rather than deciding it silently.

## States

**Loading** (fetching the expense on screen open):
Plain text, matching the trip dashboard's own loading convention exactly:
> "Loading expense…"

**Load error** — expense not found, or the RLS policy rejects the read (stale link, not the
payer, expense deleted out from under them — none of these should normally be reachable
since the affordance is hidden, but a shared link or a stale cached page can still get here):
> "Couldn't load this expense."

Keep the `TopBar`/close affordance visible even in this state (unlike the trip dashboard's
bare error text, which has no way back) — this is a sub-page one navigation level deeper, so
stranding the user here with no exit would be worse.

**Locked trip** (race: someone completes the trip between the user opening the row and the
edit screen loading, or a stale back-forward-cached page): reuse the exact visual pattern
from add-expense's locked state (terracotta `LockIcon` badge + explanatory paragraph, form
replaced entirely, not just disabled):
> "This trip is locked — the organizer already settled it up, so expenses can no longer be
> edited."

**Validation error** (invalid amount or empty description), inline below the split-preview
pill, identical copy to add-expense for consistency (same rule, same words):
> "Enter an amount and what it was for."

**Save error** (network failure, or a server-side rejection that slips past the hidden
affordance — e.g. someone else's RLS-blocked attempt via direct API/DB access per AC5):
- Generic failure: "Couldn't save those changes — try again."
- Specific ownership rejection, if it's ever surfaced to a UI (shouldn't happen through
  normal navigation, but the API itself must still enforce it per AC5): "You can only edit
  expenses you paid for." Worth being specific here rather than generic, since anyone who
  actually reaches this message got there through a stale UI state or a hand-crafted
  request, not a normal misclick — a vague error would just leave them confused about why an
  edit that looked available a moment ago suddenly isn't.

## Copy summary

| Element | Copy |
|---|---|
| Screen title | Edit expense |
| Helper line | Same equal split across everyone on the trip — just update what changed. |
| Save button (idle) | Save changes |
| Save button (submitting) | Saving… |
| Validation error | Enter an amount and what it was for. |
| Save/network error | Couldn't save those changes — try again. |
| Ownership rejection (defensive) | You can only edit expenses you paid for. |
| Loading | Loading expense… |
| Load error | Couldn't load this expense. |
| Locked trip | This trip is locked — the organizer already settled it up, so expenses can no longer be edited. |
| Row aria-label (own, editable expense) | Edit {description}, {amount} |

No field, screen, or copy references `paid_by` as editable — the edit screen never shows a
payer selector (add-expense doesn't either; payer is always "whoever is signed in," and that
stays true and immutable here per AC7).

## Mobile considerations

Nothing new is needed beyond what add-expense already does well, which this screen inherits
by construction: numeric hero input with `inputMode="decimal"` for the native numeric
keypad, full-width primary button, generous vertical spacing. The one addition is the
row-as-tap-target on the dashboard list, sized well above the 44px guideline already.

## Flagged for product (not resolved here)

1. **Discard confirmation on cancel** (above) — shipping with none, matching existing
   precedent, but flagging since this form edits money someone already relied on.
2. **Silent recompute, no notice to other members.** Editing an amount changes what every
   other trip member owes, and nothing in this feature (or its requirements) notifies them —
   the next time they open the trip, their balance has just changed with no explanation of
   why. That's consistent with how the app already works today (any member can already edit
   any expense with zero notice, per the requirements doc's note on current RLS), so this
   isn't a regression — but narrowing edits to "only the payer" is a good moment to ask
   whether a lightweight "edited" signal (even just the acceptance-criteria-excluded audit
   trail, or something smaller) is wanted before or after this ships. Raising it since it's
   explicitly a non-goal in requirements.md and I want that exclusion to be a conscious
   call, not an oversight.
3. **"Payer name vs. 'You'" on your own rows** — small, optional: the list currently shows
   `{payer.displayName} · {day}` for every row, including your own, so your own editable rows
   read your own name back to you rather than "You." Not required for this feature, but
   pairing the new pencil affordance with a "You · {day}" label on your own rows would
   reinforce *why* that row looks tappable. Flagging as a nice-to-have, not blocking.

No mockup was produced — this is a small, form-reuse feature where the target state (add-
expense, pre-filled) is fully specified by prose above and by an existing screen in the
codebase; a static image would add less than pointing at `add-expense/page.tsx` directly.
