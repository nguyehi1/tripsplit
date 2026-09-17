/**
 * Carries an in-progress expense draft across the redirect-to-check-email-and-back round trip
 * triggered by `requireVerifiedSession` (see `src/lib/auth-gate.ts`). This remains load-bearing
 * for the invitee's unchanged attempt-then-redirect-then-resume flow on
 * `src/app/trip/[id]/add-expense/page.tsx` and
 * `src/app/trip/[id]/expense/[expenseId]/edit/page.tsx` (requirements.md AC 11/12).
 *
 * The organizer's own equivalent mechanism (`PendingInviteAction`/`PendingPlaceholderAction`,
 * once also exported from this file) was removed under Decision 12: the organizer's own trip
 * switched from "attempt the mutation, then redirect-and-resume" to "hide the entry point until
 * verified," so there is no longer an in-progress invite/share or placeholder-member action to
 * resume for that caller — the action was never reachable to begin with. See
 * docs/features/simplified-onboarding/architecture.md's "Update: hide-and-reveal replaces
 * attempt-then-redirect for the organizer" for the full rationale.
 *
 * `sessionStorage` (not `localStorage`) is deliberate: this state is only ever relevant for the
 * current tab's in-progress flow, not something that should persist across browser sessions the
 * way `remembered-email.ts`'s remembered address does. Keyed by trip/expense id, same
 * try/catch-wrapped pattern as `remembered-email.ts` so a blocked/unavailable storage degrades to
 * "start over," not an error.
 */

const EXPENSE_DRAFT_PREFIX = "splitiful:pending-expense:";

export type PendingExpenseDraft = {
  amount: string;
  description: string;
  date: string;
};

/**
 * `key` is the trip id for the add-expense screen, or the expense id for the edit-expense
 * screen — either way, just a unique-enough scope so two concurrent drafts (unlikely, but
 * possible with multiple tabs) don't clobber each other.
 */
export function savePendingExpenseDraft(key: string, draft: PendingExpenseDraft): void {
  try {
    window.sessionStorage.setItem(EXPENSE_DRAFT_PREFIX + key, JSON.stringify(draft));
  } catch {
    // storage unavailable/blocked — the organizer just has to retype after confirming.
  }
}

/** Reads and clears in one step — a resumed draft is only ever replayed once. */
export function takePendingExpenseDraft(key: string): PendingExpenseDraft | null {
  try {
    const raw = window.sessionStorage.getItem(EXPENSE_DRAFT_PREFIX + key);
    if (!raw) return null;
    window.sessionStorage.removeItem(EXPENSE_DRAFT_PREFIX + key);
    return JSON.parse(raw) as PendingExpenseDraft;
  } catch {
    return null;
  }
}

