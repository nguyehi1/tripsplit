import { NextResponse } from "next/server";
import { joinTrip } from "@/lib/data/trips";
import { sendTripEmail } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";

/** Session exchange for someone who signed in from an invite link, then joins the trip. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: inviteCode } = await params;
  const { searchParams, origin } = new URL(request.url);
  const authCode = searchParams.get("code");
  const displayName = searchParams.get("name") ?? "";

  if (authCode) {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(authCode);
    if (!exchangeError) {
      try {
        const tripId = await joinTrip(supabase, { inviteCode, displayName });
        await sendJoinedEmail(supabase, tripId, origin);
        return NextResponse.redirect(`${origin}/join/${inviteCode}/welcome?tripId=${tripId}`);
      } catch {
        return NextResponse.redirect(`${origin}/join/${inviteCode}?error=join`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/join/${inviteCode}?error=auth`);
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
