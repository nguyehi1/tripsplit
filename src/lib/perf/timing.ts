/**
 * Interim, temporary per-call timing instrumentation for the `performance-scaling` feature's
 * Phase 1 baseline — see docs/adr/0010-interim-per-call-timing-instrumentation.md for the full
 * decision. Every wrapped call emits one structured, greppable `[perf]`-tagged log line
 * (numeric/boolean fields and fixed short strings only — no user data, no invite codes, no
 * emails, no ids — matching `src/lib/tracking.ts`'s existing no-PII discipline). Vercel captures
 * stdout from every function invocation automatically, so this is the entire "dashboard" for
 * Phase 1: export/grep the log stream over a representative window and compute p50/p95 offline.
 *
 * This module (and every call site that imports it) is meant to be deleted once
 * `performance-scaling`'s Phase 1/2 conclude — see ADR 0010's consequences. It is not the app's
 * permanent tracing layer.
 */

type PerfLogEntry = {
  surface: string;
  call: string;
  durationMs: number;
  ok: boolean;
  ts: number;
};

function logPerf(entry: PerfLogEntry): void {
  // Single structured line, greppable via the `[perf]` prefix.
  console.log(`[perf] ${JSON.stringify(entry)}`);
}

/**
 * Server-side wrapper for any awaited Supabase call (query, RPC, or `enforceRateLimit`).
 * Measures elapsed wall time with `performance.now()`, logs one `[perf]` line, and rethrows
 * whatever `fn` throws, unmodified — timing must never change a call's success/failure behavior.
 *
 * `fn`'s return value is typed as `PromiseLike<T>` (not `Promise<T>`) so this can directly wrap a
 * Supabase query/RPC builder (e.g. `() => supabase.from("trips").select("*")`), which implements
 * `PromiseLike` but not the full `Promise` interface.
 */
export async function timeAsync<T>(surface: string, call: string, fn: () => PromiseLike<T>): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    logPerf({ surface, call, durationMs: performance.now() - start, ok: true, ts: Date.now() });
    return result;
  } catch (e) {
    logPerf({ surface, call, durationMs: performance.now() - start, ok: false, ts: Date.now() });
    throw e;
  }
}

/**
 * Client-side beacon for a duration already measured by the caller (e.g. a click-to-navigate
 * span). Fire-and-forget via `fetch(..., { keepalive: true })` so it survives a page navigation
 * that starts immediately after, wrapped in try/catch and never awaited by the caller — same
 * silent-degrade discipline as `src/lib/remembered-email.ts`. Must never block or throw.
 */
export function reportClientTiming(surface: string, call: string, durationMs: number, ok = true): void {
  try {
    fetch("/api/perf-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ surface, call, durationMs, ok }),
    }).catch(() => {
      // Fire-and-forget — a failed beacon must never affect the UI.
    });
  } catch {
    // Same silent-degrade discipline as above (e.g. `fetch` unavailable/blocked).
  }
}

/**
 * Convenience wrapper around `reportClientTiming` for the common case of timing a single
 * client-side async call (the client-side mirror of `timeAsync`, same rethrow contract).
 */
export async function timeClient<T>(surface: string, call: string, fn: () => PromiseLike<T>): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    reportClientTiming(surface, call, performance.now() - start, true);
    return result;
  } catch (e) {
    reportClientTiming(surface, call, performance.now() - start, false);
    throw e;
  }
}
