# Expense date — UX design

Grounded in the existing add-expense/edit-expense forms
(`src/app/trip/[id]/add-expense/page.tsx`,
`src/app/trip/[id]/expense/[expenseId]/edit/page.tsx`), the trip dashboard
list (`src/app/trip/[id]/page.tsx`), and the one other native date input
already in the app (start/end date pickers on `src/app/trip/new/page.tsx`).
Reuses those patterns rather than inventing a new date-picker style.

## 1. Add-expense form

### Placement

Add a third section to the existing single `Card` (Amount → divider → What
was it → **divider → Date**), matching how "What was it" already follows
"Amount" with a `Divider` between. This keeps the form one visual block,
consistent with today's two-field card, rather than introducing a second
card or a modal date picker.

```
┌─ Card ─────────────────────────────┐
│ AMOUNT                             │
│ $ 0.00                             │
│ ─────────────────────────────────  │
│ WHAT WAS IT                        │
│ Cabin, lift tickets, groceries…    │
│ ─────────────────────────────────  │
│ DATE — optional, defaults to today │
│ 📅  Today                    ⌄     │  ← native date input
└─────────────────────────────────────┘
```

### Communicating "optional, defaults to today"

Reuse the `Field` component's existing hint convention — e.g. `<Field
label="Location" hint="optional" />` on the trip-creation form already
renders `Location — optional` in lowercase, non-bold trailing text. Apply
the same suffix to the `Kicker` label here:

- Kicker text: **`Date`** with a trailing hint span, same visual treatment
  as `Field`'s hint: `Date — optional, defaults to today`.

Below the label, the date input itself starts **pre-filled with today's
date**, not blank. This does double duty: it shows the actual default
value (not just a placeholder claiming one), and it means most users — who
are logging same-day — never have to touch the field at all. If they
clear/change it, it behaves like any other filled input.

- Use a native `<input type="date">` styled like the two date fields on
  `trip/new` (`text-display`, large text, transparent background, a small
  calendar-icon chip on the trailing side) rather than a custom calendar
  widget — this matches the one existing date-input precedent in the app
  and avoids introducing a new interaction pattern for one field.
- No separate "Today" quick-select chip/button — since the field already
  defaults to today, a shortcut back to today would be redundant. (Native
  date inputs also let the user clear the field via their OS picker, which
  should simply re-default to today on blur/submit — see validation below.)

### Copy

- Kicker label: `Date — optional, defaults to today`
- No placeholder text needed (field is pre-filled, not empty).

## 2. Edit-expense form

Same placement and component as add-expense: a third `Kicker`/input pair
appended after "What was it," under the existing `Divider` pattern. On
load, pre-fill with the expense's actual stored date (not today), the same
way `amount` and `description` are pre-filled from the loaded row today.

- Kicker label here does **not** need the "optional, defaults to today"
  hint — that messaging is about the *add* flow's default behavior. On
  edit, the field is never blank (a date already exists on the row), so
  just: **`Date`**.
- Governed by the same existing payer-only / open-trip rules already
  enforced for amount and description (`edit-own-expense`) — no new
  permission surface, no new UI for who can see vs. edit it. The existing
  locked-trip block screen (lock icon + "This trip is locked…") and the
  existing "Couldn't load this expense" / "You can only edit expenses you
  paid for" errors cover the date field automatically since it's just
  another attribute on the same form/row.

## 3. Validation & error states

Validation rule (per requirements): must be a real calendar date, cannot
be in the future. Both forms currently show a single inline error line
below the split-summary pill (`text-terracotta`, e.g. "Enter an amount and
what it was for."). Extend that same mechanism rather than adding
per-field inline errors, to stay consistent with how amount/description
errors are shown today:

- **Native picker already blocks most future dates.** Set `max={today}`
  on the `<input type="date">` (mirroring how `trip/new` already sets
  `min={startsOn}` on the end-date field) — this stops the OS/browser date
  picker UI from letting someone *pick* a future date in the first place.
- **Still validate on submit**, because a user can type a date directly
  into some browsers' date inputs bypassing the picker, or the field could
  theoretically be empty/malformed:
  - Empty date on **add** → treat as "today" (per requirement 1), not an
    error.
  - Empty date on **edit** → treat as an error, since an existing expense
    always has a date; shouldn't silently vanish. Reuses the same combined
    message pattern below.
  - Invalid/future date on either form → block submit, same inline
    `text-terracotta` message pattern, combined with the existing
    amount/description check so there's still just one error line:
    - **Copy:** `Enter an amount, what it was for, and a valid date (today or earlier).`
  - This keeps `isValidExpenseInput`'s existing one-line failure UX (a
    single combined message, not a checklist) rather than introducing
    field-by-field error text, since that's not a pattern this app uses
    elsewhere.
- No separate loading/empty state needed for the date field itself beyond
  what the forms already have (the existing "Loading expense…" screen on
  edit covers the fetch that populates it).

## 4. Expense list row (trip dashboard)

Requirement 5 replaces today's weekday-only label
(`expense.day`, e.g. `Mon`) with a weekday **+ date** label (e.g. `Mon,
9/14`), in the same position, same line, same styling — no layout change:

```
[Avatar]  Cabin rental                           $210.00  ✎
          Alex · Mon, 9/14
```

- Row markup, sizing (`text-[12px] text-ink/[0.72]`), and separator (` · `
  between payer name and date) are unchanged — only the string that
  currently reads `Mon` becomes `Mon, 9/14`.
- Format: `{weekday short}, {M/D}` — e.g. `Mon, 9/14`, `Sat, 12/6`. No
  leading zeros (matches `toLocaleDateString` default numeric-day/month
  behavior), no year (consistent with `formatDate` in `src/lib/dates.ts`,
  which already omits year for the trip-date-range display — dates within
  a single trip are assumed same-year).
- No month header/grouping/divider is added to the list, per the
  requirements' explicit non-goal — every row simply carries its own full
  date label; the list's existing newest-first ordering and single
  scrollable `Card` block of rows are otherwise untouched.
- Empty-list state (`No expenses logged yet.`) is unaffected — there's
  nothing to date when there's nothing to show.

## 5. Mobile considerations

- Native `<input type="date">` is used specifically because it delegates
  to the OS's own date picker UI on mobile (iOS/Android), which is
  already touch-optimized, rather than shipping a custom JS calendar
  component — consistent with why `trip/new` already uses native date
  inputs for start/end dates.
- The date field sits in the same scrollable card as amount/description,
  so no new scroll/viewport behavior is introduced; on-screen keyboard
  interactions are unaffected since date inputs use the OS picker rather
  than the text keyboard.
- List row date label (`Mon, 9/14`) is short enough not to cause wrapping
  or truncation pressure against the existing `truncate` description line
  above it, even on narrow (320px-class) phone widths.

## Flags for product/PM

1. **Empty date on edit treated as an error, not a re-default-to-today.**
   I chose to *block* submission rather than silently reinterpret a
   cleared edit-form date as "today," because on edit the user is
   consciously changing a value that already existed — silently
   substituting today's date could mask a mistake (e.g. an accidental
   clear). If clearing-and-defaulting is preferred instead (matching
   add-expense's leniency exactly), that's a one-line copy/behavior change
   away, but it means "clear the date field on edit" becomes a way to
   quietly retroactively change an expense's date to today, which seems
   more likely to surprise someone than help them.
2. **No confirmation when changing an expense's date on edit.** Amount and
   description edits today have no separate confirmation either, so this
   follows suit — but changing the *date* has a different flavor (it can
   move an expense across which "day" it's attributed to on the list).
   Flagging in case product wants a lighter touch here (e.g. nothing
   extra needed) vs. wants edits to change-worthy fields like date to be
   more visible/confirmed later — not designing that now since it's out
   of this feature's explicit scope.
