import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

/**
 * Per-IP rate limiting for the invite-code endpoints flagged in
 * docs/security-review-2026-09-17.md finding #1 (`get_trip_by_invite_code` and `join_trip` were
 * reachable, unthrottled, straight from the browser). Backed by Upstash's REST Redis, since
 * that's the only rate-limit store that works from Vercel's serverless/edge functions without
 * a persistent connection.
 *
 * Fail-closed by design: if `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` aren't set in a
 * production build, `enforceRateLimit` rejects with 503 rather than silently letting every
 * request through unthrottled — this repo has no rate limiting anywhere else (proxy.ts only
 * checks session existence), so an unset env var here must not quietly ship as "no protection."
 * In non-production (no `NODE_ENV=production`, e.g. local dev or `next dev`), it's skipped with
 * a console warning instead, so contributors don't need Upstash credentials to run the app
 * locally.
 */

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = upstashUrl && upstashToken ? new Redis({ url: upstashUrl, token: upstashToken }) : null;

if (!redis) {
  const reason = "UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN are not set.";
  if (process.env.NODE_ENV === "production") {
    console.error(`[rate-limit] ${reason} Rate-limited routes will reject requests with 503 until this is configured.`);
  } else {
    console.warn(`[rate-limit] ${reason} Skipping rate limiting for this non-production run.`);
  }
}

const limiters = new Map<string, Ratelimit>();

function getLimiter(key: string, limit: number, windowSeconds: number) {
  if (!redis) return null;
  const cacheKey = `${key}:${limit}:${windowSeconds}`;
  const existing = limiters.get(cacheKey);
  if (existing) return existing;

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    analytics: false,
    prefix: `splitiful:ratelimit:${key}`,
  });
  limiters.set(cacheKey, limiter);
  return limiter;
}

/**
 * Best-effort client IP for rate-limit keying. Vercel's edge network reliably populates
 * `x-forwarded-for` on every request that reaches this app (the header the underlying platform
 * sets can't be spoofed by the caller once it's behind Vercel), so this is trusted as-is rather
 * than re-validated. Falls back to a constant so requests without the header (e.g. local dev
 * without a proxy in front) still share one bucket instead of throwing.
 */
function clientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const first = forwardedFor?.split(",")[0]?.trim();
  return first || "unknown";
}

/**
 * Enforces a per-IP sliding-window rate limit for a route. Returns a `NextResponse` to
 * short-circuit the caller with, or `null` if the request should proceed.
 *
 * - Over limit: generic 429 with a `Retry-After` header — deliberately doesn't distinguish
 *   "too many guesses" from any other throttle reason in the response body.
 * - Rate limiter unavailable in production: 503 (the service isn't available, not the caller's
 *   fault) — see module-level comment for why this fails closed instead of open.
 */
export async function enforceRateLimit(
  request: Request,
  options: { key: string; limit: number; windowSeconds: number },
): Promise<NextResponse | null> {
  const limiter = getLimiter(options.key, options.limit, options.windowSeconds);
  if (!limiter) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
    }
    return null;
  }

  const identifier = `${options.key}:${clientIp(request)}`;
  const { success, reset } = await limiter.limit(identifier);
  if (!success) {
    const retryAfterSeconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  return null;
}
