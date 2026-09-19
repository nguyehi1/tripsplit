# Vercel Analytics – Design Documentation

## Overview

Splitiful uses Vercel Analytics to track user behavior and app performance. This document describes how custom events are integrated into the product flow and how they maintain privacy and consistency throughout the user experience.

## Guiding Principles

1. **Event-driven, not session-driven**: We track discrete user actions (completing a form, viewing a page) rather than ambient session data. This gives us clear product flow visibility without surveillance overhead.

2. **No PII in events**: Event payloads include only anonymized, session-scoped identifiers. No email, name, trip ID, or expense amount is sent to Vercel. Vercel's own session ID (assigned by their analytics SDK) links events together.

3. **Timestamp and route are automatic**: Vercel Analytics adds `timestamp` and `route` metadata to every event. We only send the event name and, when relevant, an anonymized dimension (e.g., event type count, form error category).

4. **Placement matters**: Events fire at the right logical moment in the user flow — entry points fire on page load (`useEffect`) or mount, completion events fire after successful API response, error events fire on validation or server error.

## Event Flow: User Perspective

### Trip Creation Flow

**Happy path:**
1. User clicks "Create a new trip" on home page or navigates to `/trip/new` → `trip_create_start` fires
2. User fills form (name, dates, location, organizer name)
3. User clicks "Create trip" button
4. Form validates locally; if invalid, user sees error but no event fires
5. On submit, request sent to Supabase
6. Trip created successfully → `trip_create_complete` fires
7. Confirmation email sent (best-effort, doesn't block)
8. User redirected to `/trip/[id]/invite` (invite members page)

**Entry points:** Home page or direct URL navigation to `/trip/new`

**Why we track:**
- `trip_create_start` tells us how often the trip-creation entry point is clicked or accessed (traffic to feature)
- `trip_create_complete` tells us how many trips actually get created (conversion rate) and performance from creation initiation to completion

---

### Trip Join Flow

**Happy path:**
1. User receives invite link (email) with `/join/[code]` or enters code manually
2. User clicks link or navigates to `/join/[code]` → page loads → `trip_join_start` fires
3. Page fetches trip info by code (trip name, dates, member count)
4. User sees trip summary and is prompted to enter name and email
5. User fills form and clicks "Join trip"
6. Form validates; if invalid, user sees error but no event fires
7. Request sent to Supabase `join_trip` RPC
8. User authenticated (OTP sent/verified in a separate flow) and added to trip members
9. User marked as joined → `trip_join_complete` fires
10. User redirected to `/join/[code]/welcome` or trip dashboard

**Entry points:** Invite link from email, or manually entering join code on the invite dialog

**Why we track:**
- `trip_join_start` shows how many people click/access an invite link (top-of-funnel engagement)
- `trip_join_complete` shows how many join attempts result in actual membership (conversion and success rate), uncovers drop-off between seeing the invite and confirming

---

### Expense Flow (Add)

**Happy path:**
1. User navigates to `/trip/[id]/add-expense` or clicks "Add an expense" button → `expense_add_start` fires
2. Page loads; if trip is locked (organizer completed it), user sees "Trip is locked" message (locked state) and no form
3. If trip is open, user sees form with fields: Amount, Description, Date (optional, defaults to today)
4. Page shows live split calculation (amount / member count)
5. User fills form and clicks "Add an expense"
6. Form validates locally (amount > 0, description not empty, date <= today); if invalid, error shown but no event fires
7. Request sent to Supabase to insert expense
8. Expense inserted successfully → `expense_add_complete` fires
9. User redirected to trip dashboard `/trip/[id]`

**Entry points:** Trip dashboard detail page, navigation from trip tabs/menu

**Why we track:**
- `expense_add_start` shows how often users attempt to add expenses (frequency of logging behavior)
- `expense_add_complete` shows successful logging rate and latency from form open to completion

---

### Expense Flow (Edit)

**Happy path:**
1. User views trip dashboard and clicks "Edit" on an existing expense → `expense_edit_start` fires
2. Page navigates to `/trip/[id]/expense/[expenseId]/edit`
3. Form loads with current expense values (amount, description, date)
4. User edits one or more fields
5. User clicks "Save" or "Update"
6. Form validates; if invalid, error shown but no event fires
7. Request sent to Supabase to update expense
8. Expense updated successfully → `expense_edit_complete` fires
9. User redirected to trip dashboard

**Entry points:** Expense list or detail view on trip dashboard

**Why we track:**
- `expense_edit_start` shows how often users correct or adjust expense data (data quality, engagement)
- `expense_edit_complete` shows successful edit rate

---

### Member Invite Flow

**Context:** After creating a trip (or anytime from trip dashboard), organizer invites people.

**Happy path (send invite):**
1. User on trip dashboard clicks "Invite people" or "Add members" → lands on `/trip/[id]/invite`
2. User enters email address(es) of people to invite
3. User clicks "Send invite(s)"
4. Form validates email format; if invalid, error shown but no event fires
5. Request sent to send invite emails (via `/api/trip-email` or similar)
6. Email(s) sent successfully → `member_invite_send` fires
7. Confirm/toast shown to user

**Happy path (add placeholder):**
1. User on trip dashboard clicks "Add placeholder member" or similar
2. User enters name (e.g., "Sarah's partner")
3. User clicks "Add"
4. Form validates name not empty; if invalid, error shown but no event fires
5. Request sent to Supabase to insert placeholder member
6. Placeholder member added successfully → `member_placeholder_add` fires
7. Placeholder appears in member list on trip dashboard

**Entry points:** Trip invite page or member management UI

**Why we track:**
- `member_invite_send` shows how many people are invited to trips (network effect, collaboration breadth)
- `member_placeholder_add` shows adoption of the placeholder feature and preference for it vs. sending invites

---

### Sign-In Flow

**Happy path:**
1. User on home page (`/`) enters email address
2. User clicks "Send OTP" or "Sign in"
3. Form validates email not empty; if invalid, error shown but no event fires
4. Request sent to Supabase auth to send OTP email
5. OTP email sent successfully → `sign_in_start` fires
6. Page shows "Check your email" screen; user is redirected to `/check-email`
7. User checks email, clicks link or copy/pastes OTP code
8. User submits OTP code
9. Supabase verifies code, user session established → `sign_in_complete` fires
10. User redirected to `/trips` (trip list) or the `next` URL parameter if provided

**Entry points:** Home page sign-in form, or invite link requiring sign-in

**Why we track:**
- `sign_in_start` shows volume of sign-in attempts (new user acquisition attempts)
- `sign_in_complete` shows successful authentication rate and conversion through the OTP flow (onboarding friction)

---

### Settlement Flow

**Happy path (view):**
1. User navigates to trip dashboard and clicks "Settle up" or views settlement section → `settlement_view` fires
2. Page navigates to `/trip/[id]/settle-up`
3. Page loads settlement summary (who owes whom, total balances)
4. User reviews settlement, may mark debts as paid (if that UI exists), or manually track outside app

**Happy path (complete, if payment integration exists):**
1. User initiates payment or marks settlement as resolved (either via external payment tool or in-app completion button)
2. Settlement marked as complete in DB → `settlement_complete` fires
3. User sees confirmation; trip may transition to a "settled" state

**Entry points:** Trip dashboard settlement section or "Settle up" button

**Why we track:**
- `settlement_view` shows user engagement with settlement feature (how many users actually review who owes whom)
- `settlement_complete` shows actual resolution rate (trips that get settled vs. abandoned)

---

## Data: Empty, Loading, and Error States

### Empty State

- **Empty trip members list**: Trip just created, no one else invited yet. User sees prompt to invite first member.
  - No separate event fires; `trip_create_complete` already captured the trip existing.

- **Empty expenses list**: Trip created but no expenses logged.
  - User sees message "No expenses yet — add one to get started."
  - No separate event needed (we'll see a `trip_create_complete` with no `expense_add_complete` following).

- **Empty settlement**: Trip with expenses but all settled or no settlement yet.
  - Depends on settlement logic; no separate event needed for empty state.

### Loading State

- **Trip loading**: Page fetches trip data on mount.
  - No event fires during load; fire after mount (e.g., `trip_create_start` on page entry).
  - Use page's `loading.tsx` or Suspense boundary.

- **Invite email sending**: User clicks "Send invite," request in flight.
  - Button shows "Sending…" state; no event fires until success (to avoid double-counting retries).

- **Form submission in flight**: Any form sends data, button disabled, shows "Creating…", "Saving…", etc.
  - No event fires until success or error is received.

### Error State

- **Network/server error on expense add**:
  - Form submission fails; error message shown (red text, e.g., "Couldn't add that expense — try again.")
  - `expense_add_complete` does NOT fire (only fires on success).
  - User may retry; on successful retry, `expense_add_complete` fires once.

- **Validation error on sign-in**:
  - Email field is required.
  - Form shows error "Enter your email first."
  - `sign_in_start` does NOT fire (only fires on valid submission).

- **Trip locked error on expense add**:
  - User tries to add expense to a completed trip.
  - Page shows locked state UI (lock icon, message "Trip is locked") instead of form.
  - `expense_add_start` still fires (user navigated to the page); form is just hidden.
  - User cannot submit, so `expense_add_complete` never fires (correct behavior).

- **Invalid join code**:
  - User navigates to `/join/[invalid-code]`.
  - Page loads → `trip_join_start` fires.
  - Page fails to fetch trip info; error shown "This invite link doesn't match a trip anymore."
  - User cannot submit form, so `trip_join_complete` never fires.

---

## Copy & Messaging

### Success / Confirmation Messages

These are shown after events fire, as user feedback:

- **Trip created:** "Trip created! Copy and share the invite link, or add people below." (shown before redirect to invite page)
- **Trip joined:** "Welcome! You're now part of the trip." (shown before redirect to trip dashboard or welcome page)
- **Expense added:** Redirected to trip dashboard; new expense appears in list. Toast or visual feedback (not required).
- **Expense edited:** Redirected to trip dashboard; updated expense shows new values.
- **Invite sent:** "Invite sent to [email]" or "Invites sent to [N] people."
- **Placeholder added:** "[Name] added to trip members."
- **OTP sent:** "Check your email — we sent you a code." (redirected to `/check-email` screen)
- **Signed in:** Redirected to `/trips`; greeting or dashboard shown.

### Error Messages

Shown when user action fails; error does NOT fire an event (only success does):

- **Trip creation fails:** "Couldn't create the trip — try again." (generic) or specific Supabase error if available.
- **Trip join fails:** "Couldn't join the trip — try again."
- **Expense validation fails:** "Enter an amount, what it was for, and a valid date (today or earlier)." (specific) or "Couldn't add that expense — try again." (generic on server error).
- **Expense edit fails:** Similar to add.
- **Invite send fails:** "Couldn't send the invite — try again." or "Email invalid."
- **Placeholder add fails:** "Couldn't add that member — try again."
- **Sign-in validation fails:** "Enter your email first." or "Invalid email address."
- **Sign-in auth fails:** "Couldn't sign you in — try again." or specific Supabase auth error (e.g., "Too many attempts").
- **Trip locked:** "This trip is locked — the organizer already settled it up, so no more expenses can be added."

---

## Privacy & Data Handling

All custom events:
- Include only the event name, timestamp (automatic), and route/page (automatic).
- Do NOT include email, name, trip ID, expense ID, amount, or any user-identifying data.
- Are sent to Vercel Analytics infrastructure (first-party, no third-party trackers).
- Are retained for 30+ days in Vercel's dashboard (configurable per project).
- Can be viewed and filtered in Vercel Analytics dashboard (no direct API export in basic tier, but exports available via Vercel CLI or pro features).

Session linking across events is handled by Vercel's own session ID (not sent by us, auto-generated by their SDK). This allows funnel analysis without personal data.

---

## Testing & Validation

### Local Testing (Browser Dev Tools)

1. Open Browser DevTools → Network tab.
2. Filter by "analytics" or "vercel".
3. Perform user action (e.g., click "Create trip").
4. Look for POST request to `https://api.vercel.com/analytics/...` or similar Vercel endpoint.
5. Inspect request payload; confirm event name is present and no PII leaks.

Note: Vercel Analytics events may batch and send on a delay; check the Network tab within a few seconds or refresh after completing the action.

### Vercel Dashboard Validation

1. Push branch with analytics events integrated.
2. Deploy to Vercel (preview or production).
3. Visit the app and perform user actions (create trip, add expense, etc.).
4. Go to Vercel project dashboard → Analytics tab.
5. Wait 1–2 minutes for events to appear (slight ingestion delay).
6. View "Events" feed; confirm custom event names appear.
7. Click on an event name to see count, chart, and route/page breakdowns.

### Automated Testing

Unit tests for event firing should:
- Mock the Vercel Analytics `track()` function.
- Verify `track(eventName)` was called with correct event name at correct point in flow.
- NOT verify payload contents (Vercel SDK owns that); only the event name and call timing.

Example test pattern:
```typescript
jest.mock("@vercel/analytics", () => ({
  track: jest.fn(),
}));

it("fires trip_create_complete after successful trip creation", async () => {
  const { track } = require("@vercel/analytics");
  // ... simulate trip creation ...
  expect(track).toHaveBeenCalledWith("trip_create_complete");
});
```

---

## Implementation Checklist

- [ ] Vercel Analytics component (`<Analytics />`) is rendered in root layout (`src/app/layout.tsx`) — **already done**
- [ ] Custom event imports (e.g., `import { track } from "@vercel/analytics"`) added to relevant pages
- [ ] All 14 required events wired up (see requirements.md)
- [ ] No PII in any event payload
- [ ] Event names follow snake_case convention
- [ ] Events fire at correct logical moment (start on mount/navigation, complete after success)
- [ ] Error events do not fire (only success events fire, avoiding noise from retries)
- [ ] Vercel project dashboard retention set to 30+ days
- [ ] QA testing checklist completed (from requirements.md)
- [ ] Privacy policy or tracking documentation mentions Vercel Analytics

---

## Future Enhancements

- **Real-time alerts**: Set up Vercel dashboard rules to alert on anomalies (e.g., drop-off in `trip_create_complete` rate).
- **Cohort analysis**: Use Vercel Analytics' cohort builder to compare retention across user segments (e.g., new vs. returning).
- **A/B testing events**: If experimentation is added later, can layer A/B test variant identifiers as custom dimensions.
- **Server-side logging**: If finer-grained flow data is needed (e.g., exact error type), add server-side event logging to Supabase or other DB; Vercel Analytics will remain the performance/UX layer.
