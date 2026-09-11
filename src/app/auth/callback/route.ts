import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Generic magic-link session exchange for sign-in that didn't start from an invite link. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/trip/new";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/link-expired`);
}
