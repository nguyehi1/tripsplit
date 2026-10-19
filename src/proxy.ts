import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { timeAsync } from "@/lib/perf/timing";
import { getSupabaseEnv } from "@/lib/supabase/env";

// Protected by an optimistic cookie check here; the real enforcement is Postgres RLS
// (see supabase/migrations/0001_init.sql and, as of simplified-onboarding,
// 0009_simplified_onboarding.sql) via the Supabase clients each route/RPC uses.
//
// /trip/new and /trip/[id]* no longer require a session at all — an anonymous session is
// created client-side by the pages themselves (trip creation) or is simply absent (a
// summary-only invitee view). /trips still requires *some* session (anonymous or permanent)
// since "your trips" is meaningless with none. See
// docs/features/simplified-onboarding/architecture.md's "Route/page changes" section.
// /you (redesign-ui board O) gated the same way as /trips — "your account" is meaningless with
// no session at all (architecture.md §2.3/§3.4).
const SESSION_REQUIRED_PATTERNS = [/^\/trips/, /^\/feedback/, /^\/you/];

function requiresSession(pathname: string) {
  return SESSION_REQUIRED_PATTERNS.some((pattern) => pattern.test(pathname));
}

export async function proxy(request: NextRequest) {
  // Only paths that require a session need the auth check below, which costs a network round
  // trip to Supabase's Auth server on every request — skip it for the rest (public pages,
  // including the sign-in flow itself, and now /trip/new and /trip/[id]*) so they aren't
  // slowed down by a check they don't need.
  if (!requiresSession(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const env = getSupabaseEnv();
  if (!env) {
    // Supabase isn't configured yet (no .env.local) — let requests through unauthenticated
    // rather than 500ing every route while the project is being set up.
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Timed so ADR 0011's decision (forward this verified id to /trips instead of re-checking there)
  // has the proxy-side round-trip cost it is gated on. Interim, removed with src/lib/perf/timing.ts.
  const {
    data: { user },
  } = await timeAsync("proxy", "getUser", () => supabase.auth.getUser());

  if (!user) {
    const signInUrl = new URL("/", request.url);
    signInUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
