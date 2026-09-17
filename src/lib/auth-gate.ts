import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

/**
 * The client-side mutation gate for the simplified-onboarding feature (see
 * docs/features/simplified-onboarding/architecture.md, "the mutation gate"). Optimistic only —
 * mirrors RLS's `is_verified_trip_member` predicate, which is the real enforcement. A session
 * exists for every caller from the moment a trip is created or an invite is opened (anonymous or
 * permanent) — what this checks is whether it's been upgraded past the anonymous, pre-verification
 * tier, i.e. whether the organizer/invitee has completed the email/OTP step at least once.
 */
export async function requireVerifiedSession(supabase: Client): Promise<boolean> {
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
export function isUnverifiedOwner(
  user: { is_anonymous?: boolean | null } | null | undefined,
  isOwner: boolean,
): boolean {
  return user != null && user.is_anonymous === true && isOwner;
}
