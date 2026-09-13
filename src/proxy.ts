import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

// Protected by an optimistic cookie check here; the real enforcement is Postgres RLS
// (see supabase/migrations/0001_init.sql) via the Supabase clients each route/RPC uses.
const PROTECTED_PATTERNS = [/^\/trips/, /^\/trip\/new/, /^\/trip\/[^/]+/];

function isProtectedPath(pathname: string) {
  return PROTECTED_PATTERNS.some((pattern) => pattern.test(pathname));
}

export async function proxy(request: NextRequest) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    const signInUrl = new URL("/", request.url);
    signInUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
