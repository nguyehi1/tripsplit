# Splitiful Analytics Reference Guide

Splitiful uses **Vercel Analytics** to measure app performance and track user behavior. This guide explains what data is collected, how to access it, and how it informs product decisions.

---

## Event Catalog

All events listed below are custom events tracked by Splitiful. Vercel Analytics automatically adds timestamp, route, and session ID to each event; we do not send personally identifiable information (PII) in any event.

### Trip Management

| Event | Trigger | Route/Component | Why Track | Payload Example |
|-------|---------|-----------------|-----------|-----------------|
| `trip_create_start` | User navigates to or clicks "Create a new trip" | `/trip/new` page load | Measure top-of-funnel traffic to trip creation | `{ event: "trip_create_start" }` |
| `trip_create_complete` | Trip successfully created in database | `src/app/trip/new/page.tsx` after `createTrip()` returns | Measure conversion rate; identify drop-off in creation flow | `{ event: "trip_create_complete" }` |
| `trip_join_start` | User lands on invite link or enters join code | `/join/[code]` page load | Measure invite link click-through rate | `{ event: "trip_join_start" }` |
| `trip_join_complete` | User successfully added to trip members after auth | `src/app/join/[code]/page.tsx` after `joinTrip()` returns | Measure join-flow conversion; identify auth/membership drop-off | `{ event: "trip_join_complete" }` |

### Expense Management

| Event | Trigger | Route/Component | Why Track | Payload Example |
|-------|---------|-----------------|-----------|-----------------|
| `expense_add_start` | User navigates to or lands on add-expense page | `/trip/[id]/add-expense` page load | Measure frequency of expense logging attempts | `{ event: "expense_add_start" }` |
| `expense_add_complete` | Expense successfully inserted into database | `src/app/trip/[id]/add-expense/page.tsx` after `addExpense()` returns | Measure expense logging success rate; identify form drop-off or validation issues | `{ event: "expense_add_complete" }` |
| `expense_edit_start` | User opens edit form for existing expense | `/trip/[id]/expense/[expenseId]/edit` page load | Measure data-correction behavior; indicates data quality concerns | `{ event: "expense_edit_start" }` |
| `expense_edit_complete` | Edited expense successfully saved to database | `src/app/trip/[id]/expense/[expenseId]/edit/page.tsx` after `updateExpense()` returns | Measure edit success rate; identify form drop-off | `{ event: "expense_edit_complete" }` |

### Member & Invite Management

| Event | Trigger | Route/Component | Why Track | Payload Example |
|-------|---------|-----------------|-----------|-----------------|
| `member_invite_send` | User clicks "Send invite(s)" and email(s) sent successfully | `src/app/trip/[id]/invite/page.tsx` after email send or RPC call | Measure how many people are invited (network effect breadth); engagement with invite feature | `{ event: "member_invite_send" }` |
| `member_email_invite_open` | Organizer taps Invite on "Invite by email" and the mail app is opened with the prefilled message (Splitiful sends nothing) | `src/app/trip/[id]/invite/page.tsx` in `handleInvite`, right before the `mailto:` opens | Measure adoption of the email-invite shortcut vs. copy/share link | `{ event: "member_email_invite_open" }` |
| `member_placeholder_add` | Organizer adds a placeholder member (name-only, no invite) | `src/app/trip/[id]/page.tsx` or invite component after `add_placeholder_member()` RPC returns | Measure adoption of placeholder feature; preference for adding names vs. sending invites | `{ event: "member_placeholder_add" }` |

### Authentication

| Event | Trigger | Route/Component | Why Track | Payload Example |
|-------|---------|-----------------|-----------|-----------------|
| `sign_in_start` | User submits email form to request OTP code | `src/app/page.tsx` after valid email form submission; before `signInWithOtp()` returns | Measure authentication flow entry; new user acquisition attempts | `{ event: "sign_in_start" }` |
| `sign_in_complete` | User successfully verifies OTP code and session is established | `src/app/check-email/page.tsx` after successful OTP verification; or root after redirect from auth callback | Measure successful authentication rate; identify friction in OTP verification step | `{ event: "sign_in_complete" }` |

### Settlement

| Event | Trigger | Route/Component | Why Track | Payload Example |
|-------|---------|-----------------|-----------|-----------------|
| `settlement_view` | User navigates to settlement/settle-up page | `/trip/[id]/settle-up` page load or settlement section viewed | Measure user engagement with settlement feature; how many people review who owes whom | `{ event: "settlement_view" }` |
| `settlement_complete` | Trip marked as settled/completed or payment marked as resolved | `src/app/trip/[id]/settle-up/page.tsx` or trip details after `complete_trip()` RPC or payment recorded | Measure actual settlement rate; identify trips that are abandoned vs. resolved | `{ event: "settlement_complete" }` |

---

## How to View Metrics in Vercel Dashboard

### Step 1: Access Vercel Analytics

1. Go to [https://vercel.com/dashboard](https://vercel.com/dashboard)
2. Select the Splitiful project
3. Navigate to **Analytics** tab (in the top navigation or sidebar)

### Step 2: View Web Vitals

- **By default**, the Analytics dashboard shows **Core Web Vitals**: LCP (Largest Contentful Paint), INP (Interaction to Next Paint), CLS (Cumulative Layout Shift)
- **View by page**: Click into a specific route (e.g., `/trip/[id]`) to see how that page performs
- **Time range**: Use the date picker (top right) to filter by day, week, month, etc.

### Step 3: View Custom Events

1. In the Analytics tab, scroll to or click the **"Events"** section (below Web Vitals)
2. You should see a list of custom events (e.g., `trip_create_start`, `expense_add_complete`)
3. Click on an event name to expand and see:
   - **Count**: Total number of times this event has fired
   - **Chart**: Count over time (hourly, daily, weekly bars)
   - **Routes**: Breakdown by page/route where the event fired

### Step 4: Filter & Drill Down

- **By time range**: Use the date picker to compare metrics across different periods (e.g., week-over-week growth)
- **By route**: Click "Routes" section to see which pages have the highest event traffic
- **By event**: Compare completion rates between events (e.g., `trip_create_start` vs. `trip_create_complete` to find drop-off)

### Step 5: Analyze Funnel / Conversion

To measure a conversion funnel (e.g., "how many people who start creating a trip actually complete it"):

1. Note the **count** for `trip_create_start`
2. Note the **count** for `trip_create_complete`
3. **Conversion rate** = `trip_create_complete` count ÷ `trip_create_start` count
4. Similarly, for join flow: `trip_join_complete` ÷ `trip_join_start`

### Example Queries

| Question | How to Answer |
|----------|---------------|
| How many trips were created this week? | Go to Analytics → Events → `trip_create_complete` → check count in time range |
| Which page has the slowest LCP? | Analytics → Web Vitals → scroll through pages, compare LCP median/p75 values |
| How many people clicked an invite link but didn't join? | `trip_join_start` count - `trip_join_complete` count = drop-off |
| Are we getting more sign-ins this month vs. last month? | Analytics → Events → `sign_in_complete` → compare two date ranges |
| What percentage of expenses are edited after being logged? | `expense_edit_complete` ÷ `expense_add_complete` |

---

## Privacy & Compliance

### What Data Is Collected

- **Event names** (e.g., `trip_create_complete`)
- **Timestamp** (when the event fired, UTC)
- **Page/route** (e.g., `/trip/[id]/add-expense`)
- **Session ID** (assigned by Vercel Analytics; not a user ID)

**What is NOT collected:**
- Email addresses
- User names
- Trip IDs or expense IDs
- Expense amounts
- Any other personally identifiable information (PII)

### Who Has Access

- **Vercel**: Stores analytics data in Vercel's infrastructure (included with Vercel deployment)
- **Splitiful team**: Can view aggregated metrics via Vercel project dashboard (requires Vercel project access)
- **Third parties**: Analytics data is NOT shared with other services (Vercel Analytics is first-party only)

### Data Retention

- Analytics events are **retained for 30+ days** in Vercel's dashboard (configurable in Vercel project settings)
- Events older than the retention period are automatically deleted
- No backups or archives are stored beyond the retention window

### User Opt-Out

Users cannot opt out of analytics collection at the app level (no in-app toggle). However:

- Users can **disable analytics at the browser level** (e.g., via privacy extensions or browser settings that block tracking)
- The **Splitiful team can disable analytics collection** by removing the `<Analytics />` component from `src/app/layout.tsx` or disabling it in Vercel project settings

If privacy regulations (GDPR, CCPA, etc.) require an explicit opt-in or opt-out mechanism, a future feature can add a cookie banner or analytics consent flow.

### Privacy Policy

Splitiful's privacy policy should mention:

> "We use Vercel Analytics to understand how the app is used and to improve performance. Vercel Analytics collects anonymized event data (e.g., when you create a trip, add an expense) but does not collect personally identifiable information such as your email or expense amounts. Data is retained for 30+ days and is not shared with third parties."

---

## For Developers

### When to Add a New Event

Add a custom event when:

- A **new user flow or feature** is added that should be measured (e.g., new "settle up" button or payment integration)
- **Key conversion points** in the flow should be tracked (entry, success, failure)
- The event is **discrete and user-initiated** (not ambient, background activity)

**Do NOT add an event for:**
- Every keystroke or mousemove (use Web Vitals for performance instead)
- Ambient session data (how long user is idle, etc.)
- Anything that could leak PII (even anonymized, we err on the side of caution)

### How to Implement

1. **Import the `track` function:**
   ```typescript
   import { track } from "@vercel/analytics";
   ```

2. **Call `track()` at the right moment:**
   ```typescript
   // On page load
   useEffect(() => {
     track("trip_create_start");
   }, []);

   // On successful form submission
   async function handleCreate() {
     try {
       const result = await createTrip(...);
       track("trip_create_complete");
     } catch (e) {
       // Don't fire track on error
     }
   }
   ```

3. **Event names must:**
   - Be snake_case (e.g., `trip_create_complete`, not `tripCreateComplete` or `Trip.Create.Complete`)
   - Be descriptive (e.g., `payment_processed` instead of `event_5`)
   - Be consistent (e.g., all trip events start with `trip_`, all expense events with `expense_`)

4. **Event payload (optional):**
   - Vercel Analytics automatically includes timestamp and route
   - **Do NOT send user ID, email, trip ID, or any PII**
   - If you need to send a dimension, keep it generic (e.g., event type count, error category name)

### Testing Events Locally

1. **Browser DevTools (Network tab):**
   - Open DevTools → Network tab
   - Filter by "api.vercel.com" or "analytics"
   - Perform user action (e.g., click "Create trip")
   - Look for POST request with event name in payload
   - Note: May batch events and send on delay (within a few seconds)

2. **Verify no PII:**
   - Inspect the request payload in DevTools
   - Confirm no email, name, ID, or amount is present
   - Only event name and generic metadata should be visible

3. **React DevTools (if inspecting state):**
   - Not required for analytics testing; just use Network tab

### Common Patterns

#### Pattern 1: Page Load Event (useEffect, top of page)

```typescript
"use client";

import { useEffect } from "react";
import { track } from "@vercel/analytics";

export default function SomePage() {
  useEffect(() => {
    track("page_visit_start"); // or feature-specific event
  }, []);

  return (
    // Page content
  );
}
```

#### Pattern 2: Form Submit Event (async handler, after success)

```typescript
"use client";

import { track } from "@vercel/analytics";

async function handleSubmit() {
  try {
    const result = await apiCall();
    track("action_complete"); // After success
    router.push("/next-page");
  } catch (e) {
    setError(e.message);
    // Don't track on error
  }
}
```

#### Pattern 3: Conditional Event (only if certain condition met)

```typescript
"use client";

import { track } from "@vercel/analytics";

async function handleConfirm() {
  if (!isValid) {
    setError("Invalid input");
    // Don't track if validation fails
    return;
  }

  try {
    await saveData();
    track("save_complete"); // Only if validation passed
  } catch (e) {
    setError(e.message);
  }
}
```

#### Pattern 4: Server Component + Client Leaf (event fires in client component)

```typescript
// src/app/trip/new/page.tsx (Server Component)
export default function NewTripPage() {
  return <NewTripForm />;
}

// src/app/trip/new/form.tsx (Client Component with "use client")
"use client";

import { track } from "@vercel/analytics";

export function NewTripForm() {
  useEffect(() => {
    track("trip_create_start");
  }, []);

  async function handleSubmit() {
    // ...
    track("trip_create_complete");
  }

  return (
    // Form JSX
  );
}
```

### Testing Best Practices

**Unit test:** Mock and verify event firing

```typescript
jest.mock("@vercel/analytics", () => ({
  track: jest.fn(),
}));

it("fires trip_create_complete after creating a trip", async () => {
  const { track } = require("@vercel/analytics");
  
  render(<NewTripForm />);
  
  // Simulate form submission
  fireEvent.click(screen.getByText("Create trip"));
  
  // Wait for async work
  await waitFor(() => {
    expect(track).toHaveBeenCalledWith("trip_create_complete");
  });
});
```

**Manual/E2E test:** Use Vercel dashboard after deploying to preview

1. Deploy branch to Vercel preview
2. Perform user actions (create trip, add expense, etc.)
3. Go to Vercel dashboard → Analytics → Events
4. Verify custom events appear with expected counts (may take 1–2 min)

---

## Analytics Checklist

Use this checklist when implementing or reviewing analytics:

- [ ] Event name follows snake_case convention
- [ ] Event fires at the correct moment (start on mount/nav, complete after success)
- [ ] Event does NOT fire on validation errors or network errors
- [ ] No PII (email, name, ID, amount) in event payload
- [ ] Event is tested locally via DevTools Network tab
- [ ] Event is verified in Vercel dashboard after deploy
- [ ] Related conversion funnels are defined (start → complete pairs)
- [ ] Documentation is updated with new event info (this file)

---

## Troubleshooting

### Events Not Appearing in Dashboard

- **Wait 1–2 minutes:** Vercel's ingestion can have slight delay
- **Check Network tab:** Confirm the POST request is being sent (not blocked by adblocker or browser)
- **Check retention:** Ensure retention is set to 30+ days in Vercel project settings (Settings → Analytics)
- **Verify event name:** Check that the event name matches what you're searching for (case-sensitive)

### PII Accidentally Sent

- **Immediate action:** Remove the data from the event payload and re-deploy
- **Post-incident:** Review Vercel data retention (events 30+ days old auto-delete) and consider if privacy policy update is needed
- **Prevention:** Always inspect Network tab during local development; add ESLint rule to catch common PII in analytics calls (future enhancement)

### Too Many Events / Noise

- **Filter by route:** Use Vercel dashboard's route filter to focus on a specific page
- **Batch/sample:** If events are too frequent, consider sampling (track 10% instead of 100%) — Vercel handles batching client-side automatically
- **Re-evaluate:** Confirm the event is actually useful for product decisions; consider removing if not actionable

---

## Related Docs

- **Feature requirements:** [`docs/features/vercel-analytics/requirements.md`](features/vercel-analytics/requirements.md)
- **Design & flow:** [`docs/features/vercel-analytics/design.md`](features/vercel-analytics/design.md)
- **Architecture:** [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)
- **Vercel Analytics docs:** [https://vercel.com/docs/analytics](https://vercel.com/docs/analytics)
