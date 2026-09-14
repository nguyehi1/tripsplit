# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/); versioning follows
[Semantic Versioning](https://semver.org/) (while pre-1.0, breaking changes
bump the minor version rather than major, per semver's 0.x convention).

The `docs-engineer` agent appends to `[Unreleased]` on every `/feature` run;
a release moves that section under a dated version heading.

## [Unreleased]

### Changed

- Trip create/join confirmation emails now send via Gmail SMTP (`nodemailer`)
  instead of Resend — set `GMAIL_USER` and `GMAIL_APP_PASSWORD` in
  `.env.local` (see `.env.local.example`).

## [0.2.1] - 2026-09-12

### Added

- Sign-in screen now remembers the last email used on a given browser/device
  and prefills it on return visits (`src/lib/remembered-email.ts`, backed by
  namespaced `localStorage`), with a "Not you? Clear" affordance to remove
  it. Storage is local-only, best-effort (fails silently if unavailable,
  e.g. private browsing), and independent of sign-out. The email field also
  now sets `name="email"`/`autoComplete="email"` so native browser autofill
  works as a baseline alongside this.

## [0.2.0] - 2026-09-12

### Added

- The member who paid for an expense can now edit its amount and/or description after the fact,
  on trips that aren't yet completed, via a new edit page reachable from the trip dashboard's
  expense list. Reuses the same amount/description validation as add-expense (now extracted into
  a shared `src/lib/validation/expense.ts` helper). `paid_by` and `trip_id` are immutable on
  edit.
- Trip creation and joining now send a confirmation email via Resend
  (`src/lib/email.ts`, `src/app/api/trip-email/`) — best-effort, so a delivery failure never
  blocks creating or joining a trip.
- New "My Trips" page listing every trip the signed-in user belongs to.
- Clearer, friendlier error messages on the sign-in/sign-up screens
  (`src/lib/auth-errors.ts`).

### Changed

- **RLS tightened**: the `expenses` table's `update` policy was narrowed from "any trip member
  may edit any expense" to "only the member who paid for it, on an open trip"
  (`supabase/migrations/0006_restrict_expense_update_to_payer.sql`). No shipped app behavior
  relied on the wider grant, but this is a real narrowing of previously-permitted database
  access, not just a UI-level change — see
  [ADR 0002](docs/adr/0002-restrict-expense-update-rls-to-payer.md) for details. The `expenses`
  `delete` policy is unchanged and is now intentionally more permissive than `update` (any
  member, any expense) until a delete feature revisits it.

### Fixed
