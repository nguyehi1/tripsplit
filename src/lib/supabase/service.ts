import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Service-role Supabase client — bypasses RLS and, per Supabase's default role setup, isn't
 * subject to the per-function `EXECUTE` grants that gate `anon`/`authenticated` (every other
 * migration in this repo relies on that same assumption implicitly by never granting
 * `service_role` explicitly).
 *
 * Server-only, and deliberately not the default client for anything: `SUPABASE_SERVICE_ROLE_KEY`
 * must never reach the browser (no `NEXT_PUBLIC_` prefix, never imported from a `"use client"`
 * file) and must never be used for anything that depends on the caller's own identity — it has
 * none, it's not a session. Introduced for exactly one call site
 * (`src/app/api/trip-invite/[code]/route.ts`'s `getTripByInviteCode`, migration 0017) after a
 * live-confirmed bypass: `get_trip_by_invite_code`'s Postgres-side throttle (migration 0013) keys
 * on `x-forwarded-for`, which Supabase's own API layer — unlike Vercel's edge in front of this
 * app's own routes — doesn't overwrite with the real connecting IP, so a direct-to-Supabase
 * caller could spoof a fresh one on every request and bypass it entirely. Migration 0017 revokes
 * the public grant on that function; this client is how the one legitimate caller still reaches
 * it, now from behind this app's own (Vercel-IP-keyed, actually trustworthy) rate limiter.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Service-role Supabase client isn't configured — set SUPABASE_SERVICE_ROLE_KEY " +
        "in .env.local (server-only, never NEXT_PUBLIC_) from your Supabase project's " +
        "Settings → API page.",
    );
  }
  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
