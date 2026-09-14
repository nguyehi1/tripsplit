import { NextResponse } from "next/server";
import { joinTrip } from "@/lib/data/trips";
import { sendTripEmail } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";

/** Completes a trip join once the browser has an authenticated session from verifyOtp. */
export async function POST(request: Request) {
  const { inviteCode, displayName } = await request.json();
  if (!inviteCode || typeof inviteCode !== "string") {
    return NextResponse.json({ error: "Missing invite code." }, { status: 400 });
  }

  const supabase = await createClient();
  const { origin } = new URL(request.url);

  try {
    const tripId = await joinTrip(supabase, { inviteCode, displayName: displayName ?? "" });
    await sendJoinedEmail(supabase, tripId, origin);
    return NextResponse.json({ tripId });
  } catch (e) {
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
      supabase.auth.getUser(),
      supabase.from("trips").select("name").eq("id", tripId).single(),
    ]);
    const email = userData.user?.email;
    if (!email || !trip) return;
    await sendTripEmail({ to: email, tripName: trip.name, tripUrl: `${origin}/trip/${tripId}`, kind: "joined" });
  } catch (e) {
    console.error("Failed to send trip-joined email", e);
  }
}
