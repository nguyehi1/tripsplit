# Roadmap

Single source of truth for what's planned, in progress, and shipped. The
`pm` agent appends to this file every time `/feature` runs — it should never
be replaced wholesale, so history of what was prioritized and why stays
visible in one place instead of scattered across per-feature docs.

Each entry links to its deep-dive in `docs/features/<slug>/requirements.md`.

## In progress

_(none yet)_

## Planned

_(none yet)_

## Shipped

### Placeholder members (add-placeholder-members)
- Status: shipped
- Requirements: [docs/features/add-placeholder-members/requirements.md](features/add-placeholder-members/requirements.md)
- Lets the organizer add a name-only "placeholder" member (no invite, no account) so people who won't use the app still count in the equal split; organizer-only add/remove/rename, placeholders can never be a payer, no auto-merge with a real member who joins later.

### Expense date (expense-date-month)
- Status: shipped
- Requirements: [docs/features/expense-date-month/requirements.md](features/expense-date-month/requirements.md)
- Lets a member record the actual date an expense happened (separate from the log-entry timestamp), shown inline per expense (e.g. "Mon, 9/14") in place of today's weekday-only label. No month grouping/headers.

### Remember sign-in email (remember-signin-email)
- Status: shipped
- Requirements: [docs/features/remember-signin-email/requirements.md](features/remember-signin-email/requirements.md)
- Prefills the sign-in form with the last-used email on a returning device so users don't retype it every time they request a new magic link (local storage only — not an extended-login-session feature).

### Edit own expense (edit-own-expense)
- Status: shipped
- Requirements: [docs/features/edit-own-expense/requirements.md](features/edit-own-expense/requirements.md)
- Lets the member who paid for an expense correct its amount/description after creation, so a typo doesn't corrupt everyone's settlement math.

<!--
Entry format:

### <Feature name> (<slug>)
- Status: planned | in progress | shipped
- Requirements: [docs/features/<slug>/requirements.md](features/<slug>/requirements.md)
- One-line why this exists
-->
