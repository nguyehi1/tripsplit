import type { SupabaseClient } from "@supabase/supabase-js";
import type { useRouter } from "next/navigation";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;
type Router = ReturnType<typeof useRouter>;

/**
 * The client-side mutation gate for the simplified-onboarding feature (see
 * docs/features/simplified-onboarding/architecture.md, "the mutation gate"). Optimistic only —
 * mirrors RLS's `is_verified_trip_member` predicate, which is the real enforcement. A session
 * exists for every caller from the moment a trip is created or an invite is opened (anonymous or
 * permanent) — what this checks is whether it's been upgraded past the anonymous, pre-verification
 * tier, i.e. whether the organizer/invitee has completed the email/OTP step at least once.
 *
 * `prefetchedUser` (performance-scaling architecture.md's "Add/edit-expense" fix (1)) is an
 * optional already-fetched user object — when supplied, this skips its own `getUser()` call
 * entirely and checks `prefetchedUser.is_anonymous` directly, so a caller that already needs the
 * user object for another reason (e.g. `add-expense-sheet-content.tsx` needing `user.id` for
 * `paidBy`) doesn't also pay for a second, identical round trip. Omitted (every other call site
 * today), behavior is byte-for-byte unchanged: this fetches the user itself, same as before.
 */
export async function requireVerifiedSession(
  supabase: Client,
  prefetchedUser?: { is_anonymous?: boolean | null } | null,
): Promise<boolean> {
  if (prefetchedUser !== undefined) {
    return prefetchedUser != null && prefetchedUser.is_anonymous !== true;
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user != null && user.is_anonymous !== true;
}

/**
 * The same "unverified owner" signal `src/app/trip/[id]/page.tsx` derives (there, from
 * `user.is_anonymous === true` plus `getTripView` having resolved at all — which per the
 * three-tier RLS model only happens for the trip's owner or a verified member) to decide whether
 * to hide the mutation entry points and show the inline verify CTA instead (see
 * `src/app/trip/[id]/verify-inline.tsx` and design.md section 4.0). Exposed here so pages that
 * are themselves one of those hidden entry points (add-expense, invite) can check the exact same
 * condition to guard against a direct URL hit, rather than re-deriving an approximation of it.
 *
 * `isOwner` is left for the caller to compute however it already has the data on hand (e.g.
 * `view.you?.isOrganizer` from `getTripView`, or comparing a fetched `trips.created_by` to the
 * session's own id) — this only combines it with the anonymity check.
 */
/**
 * The attempt-then-redirect-to-verify gate's redirect step (UX consistency review 2026-09-30,
 * finding #6) — previously each call site independently rebuilt the same `next`/`back`/`trigger`
 * `/check-email` URL. Callers still run `requireVerifiedSession` themselves first (they often need
 * the fetched `user` afterward, e.g. for `paidBy`, or need to save a pending draft before
 * redirecting) — this only centralizes the URL construction and the `router.push` once a caller
 * has decided a redirect is needed.
 */
export function redirectToVerify(router: Router, trigger: string, path: string): void {
  const next = encodeURIComponent(path);
  router.push(`/check-email?trigger=${trigger}&next=${next}&back=${next}`);
}

export function isUnverifiedOwner(
  user: { is_anonymous?: boolean | null } | null | undefined,
  isOwner: boolean,
): boolean {
  return user != null && user.is_anonymous === true && isOwner;
}
