import { NextResponse } from "next/server";
import { sendTripEmail } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";

/**
 * Sends the "you created a trip" confirmation email. Called from the client right after
 * `createTrip` succeeds (the "joined" case is sent server-side from the join callback route,
 * which already has an authenticated session).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const tripId = typeof body?.tripId === "string" ? body.tripId : null;
  if (!tripId) {
    return NextResponse.json({ error: "Missing tripId" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // RLS scopes this select to trips the caller belongs to, so a stranger's tripId 404s here.
  const { data: trip, error } = await supabase.from("trips").select("name").eq("id", tripId).single();
  if (error || !trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  try {
    await sendTripEmail({
      to: user.email,
      tripName: trip.name,
      tripUrl: `${new URL(request.url).origin}/trip/${tripId}`,
      kind: "created",
    });
  } catch (e) {
    console.error("Failed to send trip-created email", e);
    return NextResponse.json({ error: "Email failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
