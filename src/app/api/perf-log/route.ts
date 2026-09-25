import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Temporary beacon for client-originated `[perf]` timings (see
 * docs/adr/0010-interim-per-call-timing-instrumentation.md and `src/lib/perf/timing.ts`'s
 * `reportClientTiming`/`timeClient`). Lands the payload in the same `console.log`/Vercel log
 * stream as the server-side timings so both can be aggregated together for the
 * `performance-scaling` Phase 1 baseline.
 *
 * Unauthenticated by design (it's a fire-and-forget client beacon, not a credential surface), but
 * per ADR 0010's own stated fallback for keeping this route longer-term, it now gets the same
 * `enforceRateLimit` treatment other public routes get, plus a bound on the two free-text fields
 * (`surface`/`call` are meant to be fixed short literal identifiers like "trip-dashboard"/
 * "getTripSummary", not arbitrary text) — flagged independently by security and compliance review
 * as a cheap should-fix worth doing now rather than deferring to when/if this route is kept
 * long-term.
 */
const MAX_FIELD_LENGTH = 100;

function isValidField(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_FIELD_LENGTH;
}

export async function POST(request: Request) {
  const rateLimited = await enforceRateLimit(request, { key: "perf-log", limit: 30, windowSeconds: 60 });
  if (rateLimited) return rateLimited;

  try {
    const body = await request.json();
    const surface = isValidField(body?.surface) ? body.surface : null;
    const call = isValidField(body?.call) ? body.call : null;
    const durationMs = typeof body?.durationMs === "number" ? body.durationMs : null;
    const ok = typeof body?.ok === "boolean" ? body.ok : true;
    if (!surface || !call || durationMs === null) {
      return NextResponse.json({ error: "Invalid perf-log payload." }, { status: 400 });
    }
    console.log(`[perf] ${JSON.stringify({ surface, call, durationMs, ok, ts: Date.now() })}`);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid perf-log payload." }, { status: 400 });
  }
}
