# Vercel Analytics – Architecture

## Overview

Splitiful uses **Vercel Analytics** (`@vercel/analytics/next`) to track:
- **Web Vitals** (LCP, INP, CLS) — collected automatically by the Analytics component in `src/app/layout.tsx`
- **Custom events** — user flow milestones (trip creation, joining, expenses, invites, sign-in, settlement)

## System design

### Analytics component (Web Vitals)

The Vercel Analytics component is already installed in the root layout at `src/app/layout.tsx`:

```tsx
import { Analytics } from "@vercel/analytics/next";
// …
<body>
  {children}
  <Analytics />
</body>
```

This automatically collects **Core Web Vitals** (LCP, INP, CLS) and other performance metrics. Data is visible in the Vercel Analytics dashboard under the "Analytics" tab, split by route and device/region.

### Custom event tracking

**Location**: `src/lib/tracking.ts` — a thin wrapper around `@vercel/analytics`'s `track()` function.

**Purpose**: Safely invoke Vercel's `track()` with client-only guards and consistent error handling (try/catch, silent failures). All event firing goes through this module.

**Signature**:
```tsx
export function trackEvent(eventName: string): void {
  // Safety: only call track() in Client Components
  // Error handling: silently fail if analytics is unavailable
  try {
    track(eventName);
  } catch (e) {
    // analytics unavailable, privacy settings, etc. — no-op
  }
}
```

**Placement**: Each page or component that fires events imports `trackEvent` and calls it at the appropriate moment (mount, user action, post-success redirect).

---

## Event tracking by flow

### Trip Management

#### `trip_create_start`
- **Fires**: when user lands on `/app/trip/new/page.tsx`
- **Location**: `src/app/trip/new/page.tsx` — `useEffect` on mount
- **Context**: user initiated the trip creation flow
- **Payload**: event name only

#### `trip_create_complete`
- **Fires**: in the success callback after `createTrip()` completes, before redirect to `/trip/{tripId}/invite`
- **Location**: `src/app/trip/new/page.tsx` — `handleCreate()` function, post-`createTrip()`
- **Context**: trip was successfully created in the database
- **Payload**: event name only
- **Note**: fired in the same component as `trip_create_start`; a single page tracks both opening and completion

#### `trip_join_start`
- **Fires**: when user lands on `/join/[code]/page.tsx`
- **Location**: `src/app/join/[code]/page.tsx` — `useEffect` on mount (in `JoinTripContent` function)
- **Context**: user viewed the join form with a valid invite code
- **Payload**: event name only

#### `trip_join_complete`
- **Fires**: when user lands on `/join/[code]/welcome/page.tsx` (after OTP verification and API call to `/api/join`)
- **Location**: `src/app/join/[code]/welcome/page.tsx` — `useEffect` on mount (in `JoinWelcomePage` component)
- **Context**: user successfully authenticated and was added to trip members
- **Payload**: event name only

### Expense Flows

#### `expense_add_start`
- **Fires**: when user lands on `/trip/[id]/add-expense/page.tsx`
- **Location**: `src/app/trip/[id]/add-expense/page.tsx` — `useEffect` on mount
- **Context**: user opened the expense form
- **Payload**: event name only

#### `expense_add_complete`
- **Fires**: in the success callback after `addExpense()` completes, before redirect to trip dashboard
- **Location**: `src/app/trip/[id]/add-expense/page.tsx` — `handleSubmit()` function, post-`addExpense()`
- **Context**: expense was successfully saved to the database
- **Payload**: event name only

#### `expense_edit_start`
- **Fires**: when user lands on `/trip/[id]/expense/[expenseId]/edit/page.tsx`
- **Location**: `src/app/trip/[id]/expense/[expenseId]/edit/page.tsx` — `useEffect` on mount
- **Context**: user opened the edit form for an existing expense
- **Payload**: event name only

#### `expense_edit_complete`
- **Fires**: in the success callback after `updateExpense()` completes, before redirect to trip dashboard
- **Location**: `src/app/trip/[id]/expense/[expenseId]/edit/page.tsx` — `handleSubmit()` function, post-`updateExpense()`
- **Context**: expense was successfully updated in the database
- **Payload**: event name only

### Member & Invite Flows

#### `member_invite_send`
- **Fires**: when user clicks "Copy link" or "Share link" button to share the invite
- **Location**: `src/app/trip/[id]/invite/page.tsx` — `copyLink()` or `shareLink()` function
- **Context**: user initiated an invite (clipboard copy or native share)
- **Payload**: event name only
- **Note**: fires on user action, not navigation; called from click handlers

#### `member_placeholder_add`
- **Fires**: in the success callback after `addPlaceholderMember()` RPC completes
- **Location**: `src/app/trip/[id]/invite/page.tsx` — `handleAdd()` function, post-RPC call
- **Context**: organizer successfully added a placeholder member
- **Payload**: event name only

#### `sign_in_start`
- **Fires**: when user submits the email form to request an OTP code
- **Location**: `src/app/page.tsx` (sign-in page) — `sendLink()` function, immediately before `supabase.auth.signInWithOtp()`
- **Context**: user initiated sign-in/OTP request
- **Payload**: event name only

#### `sign_in_complete`
- **Fires**: when user lands on the target page after OTP verification (typically `/trips` or the `?next=` redirect)
- **Location**: This happens *after* the OTP verification on `/check-email/page.tsx`, so tracking should fire in the *post-redirect* page (e.g., `src/app/trips/page.tsx` or the `?next` destination)
- **Context**: user successfully verified OTP and was authenticated
- **Payload**: event name only
- **Note**: Because the OTP verification redirects before we get control back, this event fires in the destination page's `useEffect` (if available). For most users this is `src/app/trips/page.tsx`; alternatively, a custom flag in URL params could signal the completion, but simpler to fire in the destination.

### Settlement Flow

#### `settlement_view`
- **Fires**: when user lands on `/trip/[id]/settle-up/page.tsx`
- **Location**: `src/app/trip/[id]/settle-up/page.tsx` — `useEffect` on mount
- **Context**: organizer viewed the settlement/settle-up page
- **Payload**: event name only

#### `settlement_complete`
- **Fires**: in the success callback after `completeTrip()` RPC completes
- **Location**: `src/app/trip/[id]/settle-up/page.tsx` — `handleComplete()` function, post-`completeTrip()`
- **Context**: organizer successfully locked/completed the trip
- **Payload**: event name only

---

## Event payload structure & PII safeguards

**Payload**: All events consist of a single parameter: the **event name** (string, snake_case). No custom data fields.

**Why**: Vercel Analytics automatically adds timestamp and session context. Custom data fields risk accidentally including PII (trip IDs, user emails, member names, expense amounts, etc.). Keeping payloads name-only ensures safety and simplicity.

**Example**:
```tsx
trackEvent("trip_create_start");  // Not: { tripId: "abc123", name: "Tahoe Trip" }
```

---

## Code organization

### Shared tracking module (`src/lib/tracking.ts`)

```tsx
// src/lib/tracking.ts
"use client";

import { track } from "@vercel/analytics";

/**
 * Safely track a custom analytics event.
 * - Runs only in Client Components.
 * - Silently fails if Vercel Analytics is unavailable (privacy settings, build issues, etc.).
 * - Event name only; no custom fields to avoid PII risks.
 */
export function trackEvent(eventName: string): void {
  try {
    track(eventName);
  } catch (e) {
    // Silently ignore: analytics unavailable, or other transient errors.
    // This should never throw in production, but we guard defensively.
  }
}
```

### Event placement: distributed, near the flow

Each event is triggered **as close as possible** to the user action or page navigation that causes it:

- **Page mount events** (`trip_create_start`, `trip_join_start`, `expense_add_start`, `settlement_view`, etc.):
  - Placed in a `useEffect` on the component that renders that page.
  - Fires once on mount (or when relevant dependencies change).

- **Action-completion events** (`trip_create_complete`, `expense_add_complete`, `member_invite_send`, etc.):
  - Placed immediately after the data mutation succeeds (after `createTrip()`, `addExpense()`, etc.).
  - Before navigation/redirect, so we capture the event even if the page transitions quickly.

- **User-interaction events** (`member_invite_send`):
  - Placed in click/change handlers.
  - Fires on user action (button click), not page load.

---

## Testing & verification

### Local testing (dev environment)

Vercel Analytics events sent from `localhost` or non-production domains will **not** be processed by Vercel's backend. To verify your tracking code is syntactically correct:

1. Check the browser console for any errors when calling `trackEvent()`.
2. Use `@vercel/analytics`'s debug mode or browser DevTools to inspect Network requests (the library may still attempt POST requests even if they're discarded).
3. **Full event verification requires deployment** to Vercel or a production domain.

### Production verification (Vercel Analytics dashboard)

1. Deploy the feature to Vercel.
2. Navigate to **Vercel project** → **Analytics** tab.
3. Perform the user flows (create trip, add expense, join, invite, sign-in, settle-up).
4. Verify that events appear in the **Analytics feed** (may have 1–2 minute latency).
5. Check that no email, name, or trip/expense IDs appear in event names or payloads.

### Event list for QA

| Event Name | Flow | Expected Payload |
|---|---|---|
| `trip_create_start` | User lands on `/trip/new` | Event name only |
| `trip_create_complete` | Trip created successfully | Event name only |
| `trip_join_start` | User lands on `/join/[code]` | Event name only |
| `trip_join_complete` | User joins trip via invite | Event name only |
| `expense_add_start` | User lands on `/trip/[id]/add-expense` | Event name only |
| `expense_add_complete` | Expense added to trip | Event name only |
| `expense_edit_start` | User lands on expense edit form | Event name only |
| `expense_edit_complete` | Expense edited successfully | Event name only |
| `member_invite_send` | User copies/shares invite link | Event name only |
| `member_placeholder_add` | Placeholder member added | Event name only |
| `sign_in_start` | User submits email for OTP | Event name only |
| `sign_in_complete` | User verifies OTP and authenticates | Event name only |
| `settlement_view` | User lands on settle-up page | Event name only |
| `settlement_complete` | Trip locked/completed | Event name only |

---

## Dependencies & compatibility

- **`@vercel/analytics`** (already in `package.json`): provides `track()` function and Web Vitals collection.
- **Next.js 16 App Router**: Analytics component is imported from `@vercel/analytics/next` and placed in root layout.
- **Client Components only**: `track()` must run in a Client Component. All event-firing code uses `"use client"` directive at the top of the file.
- **No server-side tracking**: Vercel Analytics events are client-only; no database logging or server-side event table.

---

## Privacy & compliance

1. **PII safeguards**: Event payloads contain only event names (snake_case strings). No email, user ID, trip ID, expense amount, or member name is sent.
2. **Vercel's data retention**: Vercel Analytics stores event/metric data for at least 30 days (configurable in Vercel project settings).
3. **First-party only**: No third-party analytics library (Mixpanel, Segment, Plausible) is integrated; Vercel is the sole data recipient.
4. **Privacy policy note**: The app's privacy policy should mention Vercel Analytics usage and data retention, or a note can be added to `docs/tracking.md` (to be written by the engineer as a companion to this architecture doc).

---

## Future considerations

- **Server-side event logging**: currently out of scope; events are not logged to Supabase. If future features need server-side analytics (e.g., for funnel analysis without Vercel Analytics), that would be a separate feature.
- **A/B testing**: Vercel Analytics collects event data; feature flags/experiments would require a separate tool or custom implementation.
- **Real-time alerts**: Vercel dashboard is manual; programmatic alerts would require a new integration (Vercel webhook, scheduled job, etc.).
- **Session replay**: out of scope; only event-based tracking is implemented.
