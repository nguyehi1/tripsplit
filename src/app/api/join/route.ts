import { NextResponse } from "next/server";
import { joinTrip } from "@/lib/data/trips";
import { sendTripEmail } from "@/lib/email";
import { timeAsync } from "@/lib/perf/timing";
import { dbRateLimitResponse, enforceRateLimit, isDbRateLimitError } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Completes a trip join once the browser has an authenticated session from verifyOtp.
 * Rate-limited per docs/security-review-2026-09-17.md finding #1 — `join_trip` consumes the
 * same low-entropy invite code as the invite-preview lookup, and was otherwise reachable as
 * fast as an attacker's anonymous-session + OTP round trip could go.
 *
 * That app-level limit doesn't cover a caller who skips this route and calls `join_trip`
 * directly against Supabase with an authenticated JWT (docs/security-review-2026-09-17-followup.md
 * finding #1) — `join_trip` now also throttles itself from inside Postgres, keyed by `auth.uid()`
 * (migration 0013), so `isDbRateLimitError` below catches that path's rejection too.
 */
export async function POST(request: Request) {
  const rateLimited = await timeAsync("join-trip", "enforceRateLimit", () =>
    enforceRateLimit(request, { key: "join-trip", limit: 10, windowSeconds: 60 }),
  );
  if (rateLimited) return rateLimited;

  const { inviteCode, displayName } = await request.json();
  if (!inviteCode || typeof inviteCode !== "string") {
    return NextResponse.json({ error: "Missing invite code." }, { status: 400 });
  }

  const supabase = await createClient();
  const { origin } = new URL(request.url);

  try {
    const tripId = await timeAsync("join-trip", "joinTrip", () =>
      joinTrip(supabase, { inviteCode, displayName: displayName ?? "" }),
    );
    await sendJoinedEmail(supabase, tripId, origin);
    return NextResponse.json({ tripId });
  } catch (e) {
    // 60 must match the `_window_seconds` argument in migration 0013's
    // `perform public.throttle_rpc('join-trip:' || auth.uid()::text, 10, 60);`.
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
