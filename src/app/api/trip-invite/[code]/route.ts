import { NextResponse } from "next/server";
import { getTripByInviteCode } from "@/lib/data/trips";
import { dbRateLimitResponse, enforceRateLimit, isDbRateLimitError } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side chokepoint for the invite preview shown at /join/[code] (design.md's
 * simplified-onboarding zero-auth summary tier). `/join/[code]/page.tsx` used to call
 * `get_trip_by_invite_code` straight from the browser via `supabase.rpc(...)`, which goes
 * directly to Supabase's PostgREST endpoint with the public anon key — completely outside
 * Next.js/Vercel's reach, so no rate limiting here could ever protect it. Routing the lookup
 * through this route instead means `enforceRateLimit` actually sits in front of every request
 * for it. See docs/security-review-2026-09-17.md finding #1.
 *
 * That alone doesn't stop a caller who skips this route and hits Supabase's PostgREST endpoint
 * directly (docs/security-review-2026-09-17-followup.md finding #1) — `get_trip_by_invite_code`
 * now also throttles itself from inside Postgres (migration 0013), so `isDbRateLimitError` below
 * catches that path's rejection too, not just this route's own `enforceRateLimit`.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const rateLimited = await enforceRateLimit(request, {
    key: "trip-invite-lookup",
    limit: 10,
    windowSeconds: 60,
  });
  if (rateLimited) return rateLimited;

  const { code } = await params;
  if (!code) {
    return NextResponse.json({ error: "Missing invite code." }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    const invite = await getTripByInviteCode(supabase, code);
    if (!invite) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json(invite);
  } catch (e) {
    // 60 must match the `_window_seconds` argument in migration 0013's
    // `perform public.throttle_rpc('invite-lookup:' || _ip, 20, 60);`.
    if (isDbRateLimitError(e)) return dbRateLimitResponse(60);
    console.error("Failed to look up invite code", e);
    return NextResponse.json({ error: "Couldn't load this trip." }, { status: 500 });
  }
}
