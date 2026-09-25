# 0010. Interim per-call timing instrumentation for the performance-scaling baseline

Status: accepted
Date: 2026-09-20

## Context

`docs/features/performance-scaling/requirements.md` requires a documented p50/p95
latency baseline, broken down **per Supabase call** (not just a page-level total),
for three surfaces (`/trips`, `/trip/[id]`, invite/join, add/edit-expense) — before
any fix is allowed to be called "done." Today the app has no mechanism that produces
that granularity:

- `@vercel/analytics` (already shipped, `src/lib/tracking.ts`) collects page-level Web
  Vitals and fires named custom events (`trackEvent(eventName)`) with **no properties**
  — a deliberate privacy choice ("event names only, no custom data fields," per
  `docs/ARCHITECTURE.md`'s Analytics section) and a signature that has no room for a
  duration value even if the policy were relaxed.
- `@vercel/speed-insights` (already installed and mounted in `src/app/layout.tsx`,
  undocumented in `docs/ARCHITECTURE.md` until this feature) gives real-user, per-route
  Web Vitals (TTFB/LCP/etc.) — a useful page-level corroborating signal, but no
  per-Supabase-call attribution, so it can't alone satisfy the "which call cost what"
  requirement.
- `vercel-analytics` (the feature) and any future first-class APM are explicitly out of
  scope here — requirements.md is explicit this instrumentation "does not wait on
  vercel-analytics shipping" and "does not need to become permanent product-analytics
  infrastructure."
- The migration-0013 lesson means any instrumentation added *inside* a Postgres
  function body is itself a DB/RPC change requiring a new migration and live-Postgres
  verification, not something to add casually just to get a timing number.

## Decision

Add a small, temporary, two-part timing mechanism, scoped to this feature and easy to
remove afterward:

1. **`src/lib/perf/timing.ts`** (new module) — server-side `timeAsync(surface, call, fn)`
   wraps any awaited Supabase call (query, RPC, or `enforceRateLimit`), measures elapsed
   time with `performance.now()`, and emits one structured, greppable log line
   (`console.log` with a stable `[perf]` prefix and a JSON body: `{ surface, call,
   durationMs, ok, ts }` — numeric/boolean fields and fixed short strings only, no user
   data, no invite codes, no emails, matching `trackEvent`'s existing no-PII discipline).
   Vercel captures stdout from every function invocation automatically, so no new log
   infrastructure is needed — the "dashboard" for Phase 1 is exporting/grepping that
   existing log stream over a representative window and computing p50/p95 offline.
2. **A temporary client beacon**: `reportClientTiming(surface, call, durationMs)` (same
   module, client-safe) does a fire-and-forget `fetch("/api/perf-log", { method: "POST",
   keepalive: true, ... })`, wrapped in try/catch, never blocking or throwing — same
   silent-degrade discipline as `src/lib/remembered-email.ts`. The new
   `POST /api/perf-log` route (new, temporary) validates a minimal numeric/string shape
   and `console.log`s the same `[perf]`-tagged line server-side, so client-originated
   timings (add/edit-expense, which run entirely browser-side) land in the same log
   stream as the server-side ones and can be analyzed together.

**Call sites** (granularity requirements.md asks for):
- `renderTripDashboard`: wraps `getTripSummary` and `getTripView` individually; inside
  `getTripView`/`getMyTrips` (`src/lib/data/trips.ts`), each of the parallel `trips`/
  `trip_members`/`expenses` queries is wrapped individually (still run via the same
  `Promise.all`, so wrapping adds no additional sequencing).
- `src/app/api/trip-invite/[code]/route.ts` / `src/app/api/join/route.ts`: wrap
  `enforceRateLimit`, the RPC call (`getTripByInviteCode`/`joinTrip`), and (for join)
  `sendJoinedEmail`'s two calls, separately.
- `add-expense-sheet-content.tsx` / `edit/page.tsx`: wrap the mount-time gating fetch's
  individual queries and the submit-time `addExpense`/`updateExpense` calls via
  `reportClientTiming`, plus one span covering click-to-navigate for the client-
  perceived total.

**Deliberately not done**: no instrumentation inside `get_trip_by_invite_code`/
`join_trip`/`throttle_rpc`'s plpgsql bodies (migration 0013). App-level boundary timing
(time spent awaiting `supabase.rpc(...)` as one bucket) is the default granularity — it
already tells us whether the combined Postgres-side work (throttle write + query) is
the bottleneck without touching a function body that has already broken once from an
ambiguous-column edit. A Postgres-internal breakdown (throttle-write vs. actual select)
is deferred as an optional, explicitly live-Postgres-verified follow-up migration, only
if Phase 1's app-level numbers are ambiguous enough to need it — not built by default.

## Alternatives considered

- **Extend `trackEvent`/`@vercel/analytics` to carry a duration property.** Rejected:
  reverses an existing, deliberate privacy convention ("no custom data fields") as a
  side effect of a temporary need; that convention change, if ever wanted, deserves its
  own decision, not a rider on this feature.
- **Rely on `@vercel/speed-insights` alone.** Rejected as insufficient: page-level only,
  no per-call attribution — kept as a free, complementary corroborating signal, not a
  replacement.
- **Instrument inside the Postgres RPC bodies directly** (`raise notice` +
  `clock_timestamp()` deltas) for first-class throttle-vs-query attribution. Rejected as
  the default: requires a new migration and live-Postgres verification for
  observability-only value that app-level boundary timing already mostly provides;
  every RPC touched by migration 0013 is exactly the kind of function an ambiguous
  edit previously broke outright.
- **A real APM/tracing vendor (OpenTelemetry + a trace backend).** Rejected: new
  infrastructure, new cost, permanent in shape — contradicts requirements.md's explicit
  "does not need to become permanent product-analytics infrastructure" and "not a
  replacement for vercel-analytics" framing for a two-phase, time-boxed measurement
  pass.

## Consequences

- Adds `[perf]`-tagged log lines to production output during the measurement
  window(s) — negligible per-request overhead (a handful of `console.log` calls), but
  should be pruned or gated off once Phase 2 concludes so it doesn't become permanent
  log-volume noise; flag this for whoever closes the feature out.
- `POST /api/perf-log` is a new, unauthenticated route — deliberately, since it's a
  fire-and-forget client beacon, not a credential surface. It **is** rate-limited: a
  follow-up pass (prompted independently by security and compliance review) applied the
  same `enforceRateLimit` treatment other public routes get (30 req/60s, keyed the same
  way as the invite/join routes) plus a 100-character bound on the `surface`/`call`
  fields, which are meant to be fixed short literal identifiers, not arbitrary text. See
  `src/app/api/perf-log/route.ts`.
- `src/lib/perf/timing.ts` becomes the place to look for/extend interim latency
  instrumentation if a future feature needs the same treatment before general APM
  exists — it is not meant to become the app's permanent tracing layer.
