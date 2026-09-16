# Vercel Analytics – Full Enable and Custom Event Tracking

## Problem Statement

TripSplit has Vercel Analytics installed and the component is included in the root layout, but analytics capabilities are only partially enabled. We currently collect Web Vitals (performance metrics) but lack visibility into key product flows (trip creation, expense management, member invites, settlement). This leaves product and business questions unanswered: Which user flows are most common? Where do users drop off? How does the app perform across different regions and devices?

## Acceptance Criteria

### Web Vitals & Performance Metrics
- [ ] Core Web Vitals (LCP, FID/INP, CLS) are collected and visible in Vercel Analytics dashboard
- [ ] Custom metrics can be verified in the Vercel Analytics dashboard under "Analytics" tab
- [ ] Performance data is split by page/route so we can identify which pages are slow

### Custom Event Tracking
The following user flow events **must** be tracked when they occur:

#### Trip Management
- [ ] `trip_create_start` fires when user clicks "Create a new trip" or lands on `/trip/new`
- [ ] `trip_create_complete` fires when trip is successfully created (organizer can see the trip confirmation page or has been redirected to trip details)
- [ ] `trip_join_start` fires when user enters a trip join code or clicks an invite link (lands on `/join/[code]`)
- [ ] `trip_join_complete` fires when user successfully joins a trip (authenticated and in the trip members list)

#### Expense Flows
- [ ] `expense_add_start` fires when user lands on `/trip/[id]/add-expense`
- [ ] `expense_add_complete` fires when expense is successfully saved to the database
- [ ] `expense_edit_start` fires when user opens edit form for an existing expense
- [ ] `expense_edit_complete` fires when edited expense is successfully saved

#### Member & Invite Flows
- [ ] `member_invite_send` fires when user clicks "Send invite" or equivalent to invite a member to the trip
- [ ] `member_placeholder_add` fires when organizer adds a placeholder member (no invite sent)
- [ ] `sign_in_start` fires when user submits the email form to request an OTP code
- [ ] `sign_in_complete` fires after user successfully verifies OTP and is authenticated

#### Settlement Flow
- [ ] `settlement_view` fires when user navigates to settlement/settle-up page
- [ ] `settlement_complete` fires if/when payment or settlement is marked as resolved (manually or via integration)

### Implementation Details
- [ ] All events include the event name and timestamp (Vercel Analytics handles these automatically)
- [ ] Events **must not** include personally identifiable information (PII), email addresses, or account IDs; only anonymized user/session identifiers
- [ ] Custom events use the `@vercel/analytics` SDK's `track()` function with descriptive event names (snake_case)
- [ ] Event tracking is placed in the correct component/route layer (Server Components for actions, Client Components for user interactions)

### Documentation & Observability
- [ ] A document is added to `docs/` that lists:
  - All tracked events and what user action triggers them
  - Where in the codebase each event is tracked (file paths)
  - How to view events and metrics in the Vercel Analytics dashboard
  - Privacy considerations and PII safeguards
- [ ] Vercel Analytics project settings are configured to store metrics for at least 30 days (check Vercel project dashboard)

### Privacy & Compliance
- [ ] Verify that no PII (email, name, trip IDs, expense details) is sent in custom events
- [ ] Confirm the privacy policy mentions Vercel Analytics usage and data retention (or document the approach in the tracking doc)
- [ ] Events are only sent to Vercel (first-party analytics, no third-party trackers added)

## Non-Goals

- **Third-party analytics integration** (Mixpanel, Segment, Plausible, etc.) — this feature is Vercel Analytics only
- **Server-side event logging** to Supabase or another database — Vercel Analytics is the single source of truth
- **A/B testing framework** — analytics collection only; experimentation setup is separate
- **Real-time alerts or anomaly detection** — focus is on dashboard visibility; alerts would be a follow-up
- **User session replay** — out of scope; only event-based tracking
- **Cohort analysis or funnel builder UI** — Vercel Analytics has these in the dashboard; this feature just sends the events

## Semver Classification

**Feature** (backward-compatible). Existing users and integrations are unaffected. Analytics is an additive measurement layer with no client-facing API or data model changes. Users can opt out of Vercel Analytics at the infrastructure level (Vercel project settings) if desired, but the app itself sends no breaking changes.

## Checklist for QA

- [ ] Navigate to Vercel Analytics dashboard; confirm Web Vitals data is populated
- [ ] Create a new trip; verify `trip_create_start` and `trip_create_complete` events appear in the analytics feed (may have 1–2 minute delay)
- [ ] Add an expense to a trip; verify `expense_add_start` and `expense_add_complete` fire
- [ ] Join a trip via code; verify `trip_join_start` and `trip_join_complete` fire
- [ ] Send a member invite; verify `member_invite_send` fires
- [ ] Add a placeholder member; verify `member_placeholder_add` fires
- [ ] Verify no email, name, or sensitive trip/expense data appears in event payloads
- [ ] View the tracking documentation (in `docs/`) and confirm all listed events match the code
