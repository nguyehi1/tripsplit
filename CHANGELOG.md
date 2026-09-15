# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/); versioning follows
[Semantic Versioning](https://semver.org/) (while pre-1.0, breaking changes
bump the minor version rather than major, per semver's 0.x convention).

The `docs-engineer` agent appends to `[Unreleased]` on every `/feature` run;
a release moves that section under a dated version heading.

## [Unreleased]

## [0.3.0] - 2026-09-15

### Added

- Expenses now have their own `date` (separate from the `created_at` log
  timestamp): optional when adding an expense (defaults to today if left
  blank), required when editing (must be a real, non-future calendar date).
  The expense list now shows each row's actual date inline, e.g. "Mon,
  9/14", instead of just the weekday. Existing expenses were backfilled
  from their `created_at` date (`supabase/migrations/0007_add_expense_date.sql`).
  No month grouping/headers and no trip-date-range constraint in this pass;
  settlement math is unaffected.
- The trip organizer can now add a name-only "placeholder" member — no
  account or invite needed — so someone who won't use the app is still
  counted in the trip's equal split. Placeholders display as "<name>
  (placeholder)" everywhere a member's name appears (payer line, Details
  table, Summary/settle-up, roster), count as an ordinary member for split
  math (full share, $0 paid), and the organizer can rename or remove them
  from the trip's roster screen (`/trip/[id]/invite`). A trip may have at
  most 20 placeholders; duplicate names are allowed (same as real members
  today). A placeholder can never be selected or recorded as an expense's
  payer. Removing a placeholder is always a plain, lossless delete since no
  expense can ever reference one, and it immediately recomputes everyone
  else's live-computed share — there's no auto-claim/merge, so if the
  person a placeholder represents later joins for real, the organizer must
  manually remove the stale placeholder or that person is double-counted
  (accepted, documented behavior, not a bug). All three actions (add/rename/
  remove) are blocked once a trip is completed, matching the existing
  expense lock.
  **Schema change**: `trip_members.user_id` is now **nullable** (was `not
  null`), with a new `is_placeholder boolean not null default false` column
  and a check constraint tying the two together — a real member row is
  never a placeholder, and a placeholder row is never anything else. This
  is an additive loosening, not a breaking change: no existing row or flow
  is affected, and `create_trip`/`join_trip` are untouched and still always
  insert a real, non-null `user_id`. Placeholders are created/renamed/
  removed exclusively through three new `security definer` RPCs
  (`add_placeholder_member`, `rename_placeholder_member`,
  `remove_placeholder_member`,
  `supabase/migrations/0008_add_placeholder_members.sql`), following the
  existing "RPC is the only write path for `trip_members`" pattern — no
  `trip_members`/`expenses` RLS policy was added or changed.

### Changed

- Trip create/join confirmation emails now send via Gmail SMTP (`nodemailer`)
  instead of Resend — set `GMAIL_USER` and `GMAIL_APP_PASSWORD` in
  `.env.local` (see `.env.local.example`).

### Fixed

- Member identity in `src/lib/data/trips.ts` (`getTripView`, `getMyTrips`)
  is now keyed off `trip_members.id` instead of `user_id`. This fixes a
  latent bug — not previously reachable, since only one real member per
  `user_id` ever existed — that would have collided multiple placeholders
  (which all share `user_id = null`) into a single balance/lookup entry
  once more than one existed on the same trip.

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
