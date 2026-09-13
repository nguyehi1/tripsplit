import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Generic magic-link session exchange for sign-in that didn't start from an invite link. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/trips";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    // Temporary: exposes the real reason (e.g. "both auth code and code
    // verifier should be non-empty" means the PKCE cookie wasn't found —
    // check server logs / Vercel function logs for this line, then remove it.
    console.error("[auth/callback] exchangeCodeForSession failed:", error.status, error.code, error.message);
  } else {
    console.error("[auth/callback] no code param on request:", request.url);
  }

  return NextResponse.redirect(`${origin}/link-expired?next=${encodeURIComponent(next)}`);
}
