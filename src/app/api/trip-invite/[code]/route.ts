import { NextResponse } from "next/server";
import { getTripByInviteCode, getTripSummary } from "@/lib/data/trips";
import { timeAsync } from "@/lib/perf/timing";
import { dbRateLimitResponse, enforceRateLimit, isDbRateLimitError } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";
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
 *
 * `getTripByInviteCode` now calls through a service-role client (migration 0017), not the normal
 * session-bound one: a live test confirmed the Postgres-side throttle on `get_trip_by_invite_code`
 * is trivially bypassed by a direct-to-Supabase caller who spoofs a different `x-forwarded-for`
 * on every request (Supabase's API layer, unlike Vercel's edge, never overwrites that header with
 * the real connecting IP). The public anon/authenticated grant on that function is revoked, so
 * this route's own `enforceRateLimit` above — keyed on Vercel's actually-trustworthy IP — is now
 * the only gate left, and it's the real one. `getTripSummary` below is untouched (still on the
 * normal client, still separately anon-callable, still a separately tracked gap).
 *
 * Also returns the trip's public summary tier (`summary`, additive — performance-scaling
 * architecture.md's "Invite/join preview" fix): `/join/[code]/page.tsx` used to make a second,
 * direct-to-Supabase `getTripSummary` call once it had `tripId` from this route's response —
 * moving that fetch server-side collapses the page's two sequential browser round trips into one.
 * `getTripSummary` genuinely needs `invite.tripId` (this route's own lookup result), so the two
 * calls can't run concurrently despite both accepting a plain `SupabaseClient<Database>` — this
 * is a real dependency chain, not a Promise.all-able pair. Side effect worth flagging (not a
 * violation, see architecture.md): this incidentally routes `get_trip_summary` through this
 * route's own Upstash limit for this one code path, since it now runs after `enforceRateLimit`
 * has already passed — `get_trip_summary` itself is untouched and still unthrottled everywhere
 * else (e.g. `/trip/[id]`).
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const rateLimited = await timeAsync("invite-lookup", "enforceRateLimit", () =>
    enforceRateLimit(request, { key: "trip-invite-lookup", limit: 10, windowSeconds: 60 }),
  );
  if (rateLimited) return rateLimited;

  const { code } = await params;
  if (!code) {
    return NextResponse.json({ error: "Missing invite code." }, { status: 400 });
  }

  const supabase = await createClient();
  const serviceClient = createServiceClient();

  try {
    const invite = await timeAsync("invite-lookup", "getTripByInviteCode", () =>
      getTripByInviteCode(serviceClient, code),
    );
    if (!invite) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const summary = await timeAsync("invite-lookup", "getTripSummary", () =>
      getTripSummary(supabase, invite.tripId),
    );
    return NextResponse.json({ ...invite, summary });
  } catch (e) {
    // 60 must match the `_window_seconds` argument in migration 0013's
    // `perform public.throttle_rpc('invite-lookup:' || _ip, 20, 60);`.
    if (isDbRateLimitError(e)) return dbRateLimitResponse(60);
    console.error("Failed to look up invite code", e);
    return NextResponse.json({ error: "Couldn't load this trip." }, { status: 500 });
  }
}
