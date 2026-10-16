import { NextResponse } from "next/server";
import { joinTrip, joinTripById } from "@/lib/data/trips";
import { sendTripEmail } from "@/lib/email";
import { timeAsync } from "@/lib/perf/timing";
import { dbRateLimitResponse, enforceRateLimit, isDbRateLimitError } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Completes a trip join once the browser has an authenticated session from verifyOtp.
 * Rate-limited per docs/reviews/security-compliance/project/security-review-2026-09-17.md finding #1 — `join_trip` consumes the
 * same low-entropy invite code as the invite-preview lookup, and was otherwise reachable as
 * fast as an attacker's anonymous-session + OTP round trip could go.
 *
 * That app-level limit doesn't cover a caller who skips this route and calls `join_trip`
 * directly against Supabase with an authenticated JWT (docs/reviews/security-compliance/project/security-review-2026-09-17-followup.md
 * finding #1) — `join_trip` now also throttles itself from inside Postgres, keyed by `auth.uid()`
 * (migration 0013), so `isDbRateLimitError` below catches that path's rejection too.
 *
 * Accepts either `inviteCode` (the `/join/[code]` flow) or `tripId` (migration 0016's
 * `join_trip_by_id` — `TripSummaryOnly`/`RemovedFromTripScreen` in `src/app/trip/[id]/page.tsx`,
 * which only ever have the trip's UUID, not its invite code, and shouldn't need to learn it just
 * to join). Exactly one of the two must be present.
 */
export async function POST(request: Request) {
  const rateLimited = await timeAsync("join-trip", "enforceRateLimit", () =>
    enforceRateLimit(request, { key: "join-trip", limit: 10, windowSeconds: 60 }),
  );
  if (rateLimited) return rateLimited;

  const { inviteCode, tripId: joinTripId, displayName } = await request.json();
  const hasInviteCode = typeof inviteCode === "string" && inviteCode.length > 0;
  const hasTripId = typeof joinTripId === "string" && joinTripId.length > 0;
  if (!hasInviteCode && !hasTripId) {
    return NextResponse.json({ error: "Missing invite code or trip id." }, { status: 400 });
  }

  const supabase = await createClient();
  const { origin } = new URL(request.url);

  try {
    const tripId = await timeAsync("join-trip", "joinTrip", () =>
      hasTripId
        ? joinTripById(supabase, { tripId: joinTripId, displayName: displayName ?? "" })
        : joinTrip(supabase, { inviteCode, displayName: displayName ?? "" }),
    );
    await sendJoinedEmail(supabase, tripId, origin);
    return NextResponse.json({ tripId });
  } catch (e) {
    // 60 must match the `_window_seconds` argument in migration 0013's/0016's
    // `perform public.throttle_rpc('join-trip:' || auth.uid()::text, 10, 60);` (and
    // `'join-trip-by-id:' || ...`, same window).
    if (isDbRateLimitError(e)) return dbRateLimitResponse(60);
    console.error("Failed to join trip", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't join the trip." }, { status: 500 });
  }
}

/** Best-effort — a failed confirmation email shouldn't stop someone from joining their trip. */
async function sendJoinedEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  origin: string,
) {
  try {
    const [{ data: userData }, { data: trip }] = await Promise.all([
      timeAsync("join-trip", "sendJoinedEmail.getUser", () => supabase.auth.getUser()),
      timeAsync("join-trip", "sendJoinedEmail.trips", () =>
        supabase.from("trips").select("name").eq("id", tripId).single(),
      ),
    ]);
    const email = userData.user?.email;
    if (!email || !trip) return;
    await sendTripEmail({ to: email, tripName: trip.name, tripUrl: `${origin}/trip/${tripId}`, kind: "joined" });
  } catch (e) {
    console.error("Failed to send trip-joined email", e);
  }
}
