# Auth

Not every session is a verified identity. An organizer can create and view a trip on an anonymous session, and verifies by email only to change anything. Trip data has three access tiers, enforced in RLS and RPCs. This page explains the tiers, how verification is requested, and what the proxy does.

## Sessions

`supabase.auth.signInAnonymously()` creates a real `auth.users` row and session, so `auth.uid()` is never null for an anonymous session. Only `auth.jwt() ->> 'is_anonymous'` tells it apart from a permanent one. Ownership (`trips.created_by = auth.uid()`) therefore works the same for both from the moment a trip exists, with no client-only ownership flag.

Verification uses two different call pairs:

| Situation | Calls |
|---|---|
| An anonymous session confirms an email (carries ownership forward) | `updateUser({ email })` then `verifyOtp({ type: 'email_change' })` |
| A returning visitor with no active anonymous session | `signInWithOtp` then `verifyOtp({ type: 'email' })` |

Two Supabase dashboard settings are required. See [Development setup](../../README.md#development).

## Access tiers

Checked in RLS and RPCs, not in `src/proxy.ts`.

| Tier | Grants | Gate |
|---|---|---|
| 1. Summary | Aggregated totals and who owes whom, no line items | None. `get_trip_summary` is a `security definer` RPC callable with no session. |
| 2. Detail | Expense line items, member roster, shopping list | `is_owner_or_verified_member(trip_id)`: the trip's owner on any session, or a non-anonymous member |
| 3. Write | Expenses, invites, placeholder members, shopping-list changes, settle-up | `is_verified_trip_member(trip_id)`: a non-anonymous owner or member. This excludes the pre-verification owner. |

Viewing your own trip is free, but changing it always requires completing the OTP flow once. `complete_trip` uses an equivalent standalone `is_anonymous = false` guard.

Both predicates are `security definer` functions built on `is_trip_member`. New trip-scoped tables and policies that distinguish verified from merely a member compose these functions. See [ADR 0006](../adr/0006-anonymous-auth-and-otp-linking-for-onboarding.md).

## Requesting verification

The client mechanisms are conveniences. Neither is the security boundary; RLS and RPCs are.

| Who | Behavior | Code |
|---|---|---|
| **Invitee** | Attempt-then-redirect. Viewing detail or writing sends the user to the full-page `/check-email` OTP flow and resumes the action on success. | `src/lib/auth-gate.ts` (`requireVerifiedSession`), `src/lib/pending-action.ts` |
| **Organizer, own trip** | Hide-and-reveal. The trip page hides Add expense, Settle up and Invite while unverified and shows an inline email and code widget in their place. No navigation. | `verify-inline.tsx`, `TripVerificationContext` |

Details:

- `requireVerifiedSession(supabase, prefetchedUser?)` accepts an already-fetched user so a caller that needs the user anyway avoids a second `getUser()` round trip.
- `pending-action.ts` saves and restores a multi-field expense draft across the redirect (`sessionStorage`). Single-tap shopping-list mutations (claim, unclaim, add, delete) redirect to `/check-email` with the `"invitee-shopping-list"` trigger but are **not** resumed. Losing one is an accepted tradeoff.
- One exception: the Suggested card's "+" on the List tab does not redirect. It parks that one item name in an in-memory slot, focuses the inline widget (`requestVerification`), and adds the item once `verified` flips true. The slot is memory only (never URL or storage), bound to the tapping user, has a 10-minute TTL, and is cleared on use, unmount and sign-out. See [ADR 0015](../adr/0015-in-memory-single-item-replay-after-inline-verification.md).

## The proxy

`src/proxy.ts` checks only that a session exists. It gates `/trips`, `/feedback` and `/you`, redirecting to `/?next=...` when there is none (`SESSION_REQUIRED_PATTERNS`).

`/trip/new` and `/trip/[id]*` are not gated, because both must work with no session or an anonymous one. Page code under `/trip/*` must not assume the proxy guaranteed a session. It performs its own `getUser()` calls and tiered fetches: summary through `getTripSummary` always, detail through `getTripView` only when entitled.

The proxy's own `getUser()` call is timed (`timeAsync("proxy", "getUser", ...)`). [ADR 0011](../adr/0011-forward-verified-user-id-header-for-trips-page.md) proposes forwarding its verified id to `/trips` and is not executed.

## Removed members

A hard-deleted member has no row left, so the app reconstructs "you were removed from this trip" from existing `expenses.paid_by` rows and renders a synthetic ghost payer for their historical expenses. See [ADR 0012](../adr/0012-post-removal-detection-and-ghost-payer-rendering.md).

## Why

Anonymous-first removes the sign-up wall from the first trip, and the tiers keep sensitive line items behind a verified identity.

## Related

- [Mutations](mutations.md)
- [Data model](../reference/data-model.md)
- [ADR 0006](../adr/0006-anonymous-auth-and-otp-linking-for-onboarding.md)
- [Security baseline](../reviews/security-compliance/project/security-baseline.md)

Last verified: 2026-10-20 against 9a951bb
