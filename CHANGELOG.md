# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/); versioning follows
[Semantic Versioning](https://semver.org/) (while pre-1.0, breaking changes
bump the minor version rather than major, per semver's 0.x convention).

The `docs-engineer` agent appends to `[Unreleased]` on every `/feature` run;
a release moves that section under a dated version heading.

## [Unreleased]

### Added

- **Remove a member from a trip's roster, and self-service "leave trip."**
  The trip organizer can now remove another real (non-placeholder) member
  from the roster (`/trip/[id]/invite`), and any non-organizer member can
  leave a trip themselves, from the same screen. Both require an explicit
  confirm step that discloses the removed/left member could still rejoin
  by reusing the same invite link — there's no invite-code rotation in this
  pass, and this is deliberately not framed as access revocation. Both
  hard-delete the `trip_members` row via two new `security definer` RPCs
  (`remove_trip_member`, `leave_trip`, `supabase/migrations/0014_remove_and_leave_trip_member.sql`),
  mirroring the existing `remove_placeholder_member` pattern, and are
  blocked once the trip is completed/locked. The organizer can't remove or
  leave a trip via this flow. Past expenses and `paid_by` history are
  never altered, reassigned, or deleted; remaining members' computed
  shares recompute live across the new, smaller member count, the same way
  they already do when someone joins mid-trip. A removed/left member sees
  an explicit "you're no longer on this trip" in-app state the next time
  they load the trip (bookmark, invite link, navigation) instead of the
  generic public summary a stranger would see — reconstructed from a new
  read-only `was_removed_from_trip` RPC using `expenses.paid_by` data that
  already exists, with no new stored fact and no audit table (see
  [ADR 0012](docs/adr/0012-post-removal-detection-and-ghost-payer-rendering.md)).
  **Disclosed, accepted gap**: a member removed/left before ever logging an
  expense on that trip has no such data to reconstruct from and instead
  sees the pre-existing generic "trip not found" view. As part of this
  feature, `getTripView` (`src/lib/data/trips.ts`) was also fixed to
  synthesize a placeholder "ghost payer" (`isRemoved: true`) for any
  expense whose payer is no longer a current member, since a former
  member's historical expenses would otherwise crash the expense list's
  render — this is a fix to a code path that was unreachable before this
  feature, not a change to any previously-possible behavior. No changes to
  `expenses` rows, `trip_members`/`expenses` RLS policies, or the existing
  `remove_placeholder_member`/`add_placeholder_member`/
  `rename_placeholder_member` placeholder-management RPCs.

### Added

- **"Warm paper" visual restyle of the welcome, create-a-trip, trip view, and
  add-expense screens**, plus a new mascot, Miso. Lit paper background with
  an ochre/terracotta ambient glow, a blurred sticky nav bar with content
  scrolling under it, primary actions rendered as a floating capsule instead
  of a full-width bar, and a faint paw-print texture — all driven by named
  CSS custom properties in `src/app/globals.css` (color, shadow, radius) so
  a future dark theme is a token-value swap rather than a component rewrite
  (see [ADR 0007](docs/adr/0007-css-custom-property-tokens-for-themeable-restyle.md)).
  Miso appears on the welcome screen using placeholder (cropped, AI-generated
  stopgap) art; final-resolution art is a tracked fast-follow, and the
  disclosure/IP status of AI-generated mascot art has a documented, tracked
  open follow-up before any real launch/marketing push (see
  `docs/ROADMAP.md`). No behavior, data, or copy change to welcome/
  create-a-trip/trip-view beyond appearance; form fields, validation, submit
  behavior, and existing hide-until-verified organizer gating are unchanged.
- **Add-expense converted from a standalone page to an overlay sheet** that
  springs up over a dimmed, blurred trip view, matching the new visual
  language's interaction pattern. `/trip/[id]/add-expense` remains a fully
  working, independently loadable/shareable URL — a direct hit, bookmark, or
  page refresh still opens the trip with the sheet already showing, not a
  blank or broken state — and the browser back button closes the sheet back
  to the plain trip view when it was opened via in-app navigation. Built on
  Next.js intercepting + parallel routes (see
  [ADR 0008](docs/adr/0008-add-expense-sheet-via-intercepting-parallel-routes.md));
  no change to add-expense's fields, validation, submit behavior, or owner
  gating — only the container changed. No Supabase schema, RLS, or API
  contract changes.
- **Vercel Analytics integration**: The app now tracks Web Vitals (performance metrics: LCP, INP, CLS)
  and 14 custom events across key user flows — trip creation/joining, expense logging/editing, member
  invites, sign-in, and settlement. Events are privacy-first (no PII, email, or IDs), automatic via
  Vercel Analytics, and visible in the Vercel dashboard for product insights. See
  [docs/ANALYTICS.md](docs/ANALYTICS.md) for the complete event catalog, access instructions, and
  developer guidance.

### Fixed

- `/trips` and `/trip/[id]` no longer render a "Loading your trip(s)…"
  placeholder that then swaps in data after a client-side
  `supabase.auth.getUser()` + fetch round trip; both pages are now Server
  Components that fetch data during SSR (via `src/lib/supabase/server.ts`),
  so the initial HTML response already contains real trip/expense content.
  This removes a full client-side auth-then-data waterfall diagnosed as a
  cause of slow page loads. `src/proxy.ts`'s auth-gating is unchanged; the
  pages' own `getUser()` call remains as a defensive fallback and to obtain
  `user.id`. Purely internal — no new user-facing capability, and markup/
  copy/empty-states/error-copy are unchanged, with one documented
  accessibility delta: the editable expense row is now a real link, so
  keyboard activation works via Enter but no longer via Space (see
  [ADR 0005](docs/adr/0005-ssr-page-conversion-pattern.md)).
- **Reduced round trips on the three surfaces reported as slow**
  (`/trips`, `/trip/[id]`, and the invite/join preview), plus a redundant
  auth call in add-expense. `/trip/[id]` now runs `getUser()` and
  `getTripSummary()` concurrently instead of sequentially before
  conditionally fetching `getTripView()`; `/trips` runs its own `getUser()`
  call concurrently with its `trips` select instead of sequentially
  (`getMyTrips` now accepts optional pre-fetched trip rows); the invite/join
  preview (`GET /api/trip-invite/[code]`) now returns the trip's public
  summary in the same server-side round trip as the invite lookup, so
  `/join/[code]` makes one fetch instead of one fetch plus a second,
  direct-to-Supabase call; and add-expense's submit handler no longer makes
  a second, redundant `supabase.auth.getUser()` call
  (`requireVerifiedSession` now accepts an optional pre-fetched user). A
  delayed "Taking a little longer than usual…" second line was added to the
  four existing blocking loading states so a genuinely slow load (e.g. a
  cold start) doesn't read as a silent hang. No access-control, RLS,
  invite-throttle, or split-calculation change on any surface — latency/
  round-trip reduction only, same behavior otherwise (see
  [ADR 0011](docs/adr/0011-forward-verified-user-id-header-for-trips-page.md)
  for a related, larger `/trips` change that was scoped but **not** shipped
  in this pass). Also ships temporary, interim per-call timing
  instrumentation (`src/lib/perf/timing.ts`, `POST /api/perf-log`,
  rate-limited and field-length-bounded) used to measure these surfaces
  going forward (see
  [ADR 0010](docs/adr/0010-interim-per-call-timing-instrumentation.md)).
  **Note**: this fix shipped on code-level bottleneck analysis rather than a
  measured baseline — the documented before/after p50/p95 measurement this
  work is meant to satisfy is deferred to post-deploy, since no live
  production traffic exists in this build environment (see
  `docs/ROADMAP.md`'s `performance-scaling` entry); this change is not yet a
  verified performance win.
- `src/lib/dates.ts` (`formatDate`, `formatDayDate`, `formatDateRange`) now
  parse and format dates against an explicit, fixed `UTC` zone instead of
  the runtime's implicit local timezone. This is a latent-bug fix required
  by the SSR conversion above — these calls previously only ever ran in the
  browser, where parse and format zone always matched by construction, but
  running server-side would otherwise have made the displayed date/weekday
  depend on the server's zone for visitors outside it. No visible change
  for any existing caller (verified across multiple timezones, including
  callers not touched by this change).

### Added

- `LinkButton`/`IconLinkButton` in `src/components/ui.tsx`: `next/link`-based
  siblings of `Button`/`IconButton` with identical styling, for navigation
  controls that don't need a client-component boundary. `Button`/
  `IconButton` are unchanged.

### Added

- **Simplified onboarding — create a trip with no email, no sign-in code.**
  Tapping "Create your first trip" now starts the trip instantly; there's
  nothing to type but the trip's own details, and the organizer can see
  their new trip right away. Email is only asked for once, the moment the
  organizer wants to add an expense, settle up, or invite others — and
  confirming it happens right on the trip page itself (an email field, then
  a 6-digit code, no navigating away and back) rather than on a separate
  screen. Once confirmed, every action is unlocked for good.
- **Invite links now open straight into a live trip summary — no sign-in at
  all.** Anyone with a link immediately sees the trip's totals and who owes
  who. Wanting to see the full itemized expense list, or to add or edit an
  expense, is what asks for an email and a one-time code — the same
  familiar sign-in step as before, just triggered at the moment it's
  actually needed instead of upfront.
- Signing in from a new device or browser (or after clearing site data) now
  lands on a trips list instead of a single trip, since one email address
  can now be tied to more than one trip.

### Fixed

- Closed three gaps where a person who had created or joined a trip but
  never confirmed their email could still join another trip, manage
  placeholder (name-only) members, or mark a trip as settled — actions that
  are supposed to require a confirmed email, like every other change to a
  trip. These were never exploited; they're closed proactively as part of
  building out the verified-email model above, not in response to any
  incident.

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
