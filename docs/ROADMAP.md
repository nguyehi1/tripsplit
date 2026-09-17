# Roadmap

Single source of truth for what's planned, in progress, and shipped. The
`pm` agent appends to this file every time `/feature` runs — it should never
be replaced wholesale, so history of what was prioritized and why stays
visible in one place instead of scattered across per-feature docs.

Each entry links to its deep-dive in `docs/features/<slug>/requirements.md`.

## In progress

_(none yet)_

## Planned

### Vercel Analytics – Full Enable and Custom Event Tracking (vercel-analytics)
- Status: planned
- Requirements: [docs/features/vercel-analytics/requirements.md](features/vercel-analytics/requirements.md)
- Enable all Vercel Analytics capabilities (Web Vitals) and add custom event tracking for key user flows (trip creation, expenses, invites, settlement) to measure product engagement and performance; include privacy safeguards and dashboard-accessible documentation.

## Shipped

### Simplified onboarding (simplified-onboarding)
- Status: shipped
- Requirements: [docs/features/simplified-onboarding/requirements.md](features/simplified-onboarding/requirements.md)
- Replaces the mandatory email + sign-in-code screen a first-time visitor
  hit before with a welcome + "create your first trip" action they can use
  immediately, backed by a Supabase anonymous session (real, RLS-enforced
  ownership, not just client-side memory) — creation and viewing their own
  trip (summary and detail alike) are both free. On the organizer's own
  trip, every mutating entry point (add/edit/delete expense, settle up,
  invite/share, placeholder-member management) is hidden entirely while
  unverified and replaced by a persistent inline email + OTP
  confirmation on the trip page itself (no navigation to `/check-email`,
  no draft-and-resume step needed since nothing was reachable
  pre-verification) — this hide-and-reveal pattern is organizer-only.
  Invitees are unchanged: public zero-auth summary view, with the
  existing full-page attempt-then-redirect-then-resume OTP flow still
  triggered by viewing detailed expenses or attempting to add/edit one.
  Confirming upgrades the anonymous session to a permanent identity via
  Supabase's anonymous-to-permanent linking rather than a separate save
  step. Also fixes a pre-existing gap found during review: `complete_trip`
  (Settle up) had no anonymity guard in the database at all, unlike
  `join_trip`/placeholder RPCs already guarded by migration 0010 — closed
  with the same SQL guard pattern plus the hide-until-verified UI
  treatment. No unverified identity-claiming. An organizer who never
  confirms an email has no way back in if browser memory is lost — an
  accepted, self-evident consequence given that almost any real use
  forces confirmation anyway.

### Server-render trip pages (ssr-trip-pages)
- Status: shipped
- Requirements: [docs/features/ssr-trip-pages/requirements.md](features/ssr-trip-pages/requirements.md)
- Converts `/trips` and `/trip/[id]` from client-fetched pages (loading state → client `auth.getUser()` → data fetch) to Server Components that fetch data during SSR, removing the fetch waterfall reported as slow page loads. Pure performance refactor — no UX/visual change, aside from one documented accessibility delta (the editable expense row now activates on Enter but not Space, since it's a real link). `src/proxy.ts` also changed as part of this push, but as a separate, deliberate fix made ahead of this feature's pipeline (skips the Supabase auth round trip on non-protected paths) — not by this feature's implementation. Live-verified redirect behavior is unchanged; see the QA report for the trace.

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
- Prefills the sign-in form with the last-used email on a returning device so users don't retype it every time they request a new sign-in code (local storage only — not an extended-login-session feature).

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
