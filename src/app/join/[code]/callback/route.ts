import { NextResponse } from "next/server";
import { joinTrip } from "@/lib/data/trips";
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
        return NextResponse.redirect(`${origin}/join/${inviteCode}/welcome?tripId=${tripId}`);
      } catch {
        return NextResponse.redirect(`${origin}/join/${inviteCode}?error=join`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/join/${inviteCode}?error=auth`);
}
