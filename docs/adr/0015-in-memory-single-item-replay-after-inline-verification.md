# 0015. In-memory single-item replay after inline verification (Suggested "+")

Status: accepted
Date: 2026-10-13 (amended after design review, same day: slot lifted into the provider, bound to the tapper's uid, replay re-checked against fresh data)

## Context

A new trip's organizer holds an anonymous, unverified session. They can open the List tab (the shopping-list read policy admits the owner on any session) but every write requires `is_verified_trip_member`. The Suggested card puts a "+" in front of exactly that user on their first visit. The shopping-list feature decided not to add a resume mechanism for one-tap mutations (ARCHITECTURE.md, `pending-action.ts` entry) because resumption cost was low. For the first "+", losing the tap is the very first impression, so the cost is higher, and the requirements ask for the tapped item to be added automatically if feasible within strict bounds (criterion 26).

The organizer's verification is not a navigation: on their own trip it is the inline widget on the same page (`InlineVerifyWidget`, hide-and-reveal), and `router.refresh()` preserves client state.

The inline widget headline names the pending item and offers a Cancel, so the widget (a sibling of the tabs) must be able to read and clear the slot. That rules out a ref inside `ShoppingListTab`.

## Decision

- **The slot lives in `TripVerificationProvider`** (`verify-inline.tsx`), not in `ShoppingListTab`. The provider does not unmount on a tab switch, so it clears the slot explicitly. Shape: `{ name, tappedAt, userId }` and nothing else (no trip id, member id, invite code or Other text). Context additions, all optional-safe for test mocks: `pendingItem` (name only, for the widget headline and the waiting row), `setPendingItem(name)`, `cancelPendingItem()`, `takePendingItem()`, `requestVerification()`.
- Unverified tap: no database call, no redirect. `ShoppingListTab` calls `setPendingItem(name)` (which records `tappedAt = Date.now()` and `userId` from the current session user) and then `requestVerification()`, which scrolls to and focuses the inline widget.
- **Bounds, all enforced in the provider:** cleared on use (`takePendingItem` reads and clears in one step), on Cancel, on leaving the List tab (the tab calls `cancelPendingItem` from its unmount cleanup and from the tab-change handler), and on `SIGNED_OUT` from `onAuthStateChange`. The 10-minute TTL is enforced **on read**: `pendingItem` and `takePendingItem` return nothing once `Date.now() - tappedAt > 10 min`, and a timer/rerender at the TTL boundary clears the slot so the waiting row stops saying "Adds after you confirm your email" and the widget headline reverts. A second tap replaces the slot.
- **Bound to the tapper (S2).** `userId` is `session.user.id` at tap time. At replay `getUser().id` must equal it, otherwise the slot is dropped. This closes the "email already belongs to another account" path, where a plain sign-in swaps the session without emitting `SIGNED_OUT`. Anonymous to verified through `updateUser` keeps the same uid, so the happy path is unaffected.
- **Replay when `verified` flips true** (an effect keyed on `verified`): `takePendingItem()` first (runs once, including under StrictMode); drop if expired or the trip is completed; `const fresh = await onRefresh()` and require `fresh?.yourMemberId`; `getUser()`, require the uid to equal the slot's `userId` and `requireVerifiedSession`; **re-derive (S3):** insert only if the name is still in `deriveSuggestions(types, fresh items)`, so a duplicate added meanwhile by another member or tab is skipped and the inserted text is always a current catalog name; then the existing `addShoppingListItems` with one description, `suggestion_add_complete`, `onRefresh()` and `router.refresh()` (to avoid the earlier `markVerified` refresh overwriting the post-insert state). Every drop is silent.
- The slot never goes to a URL, storage or log, is re-authorized by the unchanged RLS insert policy, and `pending-action.ts` and the full-page `/check-email` flow are not used and not extended.

## Alternatives considered

- **Slot as a ref/state inside `ShoppingListTab`** (the first draft). Cannot feed the widget headline or Cancel, and is lost on tab switch without any UI telling the user. Replaced by the provider slot above.
- **Reuse `gateOrRedirect` plus a sessionStorage pending action.** Navigates away, needs persistence that must then be cleared on sign-out, and a URL-carried return path; more surface for the same outcome. Rejected.
- **Land back on the card and make the user tap again.** Simplest and acceptable under criterion 15; kept as the documented fallback if replay proves flaky.
- **Allow anonymous organizers to insert into their own new trip's list.** Loosens RLS; explicitly out of bounds.
- **Hide the card until verification.** Fails the "visible read-only to a guest" decision and removes the main motivation for verifying early.

## Consequences

- A tab switch, Cancel, reload, navigation, sign-out or TTL expiry between tap and verification drops the pending add. Intended.
- If the person verifies with an email that already belongs to a different account, the uid differs and the add is dropped. Intended, even if that account is also a member of the trip.
- The organizer-only fact (an unverified user who can see the List tab is always the trip's organizer) is what makes the inline widget the right gate. If a future change lets unverified non-owners see lists, this design needs revisiting.
- `TripVerificationContext` grows five optional members; test mocks of `useTripVerification` should include them, and every call is optional-safe.
- Provider state is shared UI state, so it needs tests for expiry display, Cancel and uid mismatch (architecture.md section 12).
