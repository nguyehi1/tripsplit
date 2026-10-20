# Telemetry

Splitiful collects product analytics and web vitals through Vercel, plus interim per-call timing logs. This page explains what each mechanism is for and the rules for using it. The event list is in the [analytics events reference](../reference/analytics-events.md).

## Mechanisms

| Mechanism | Measures | Granularity | Code |
|---|---|---|---|
| Vercel Analytics | Web Vitals (LCP, INP, CLS), custom events | Page and event name | `<Analytics />` in `src/app/layout.tsx`; `trackEvent` in `src/lib/tracking.ts` |
| Vercel Speed Insights | Real-user per-route vitals (TTFB, LCP) | Page only | `@vercel/speed-insights`, mounted beside `<Analytics />` |
| Timing logs | Duration of individual Supabase calls | Per call | `src/lib/perf/timing.ts` |

## Analytics events

- `trackEvent(eventName)` wraps Vercel's `track()` with client-only guards and silent failure. All custom events go through it.
- Events are name-only. There are no custom properties, to avoid PII risk.
- Tracking runs only in `"use client"` components. Events fire on mount (for `*_start` events) or in the success callback of a mutation (for `*_complete` events).
- An event name may encode a user choice only when it comes from a closed, code-defined set, such as the starter catalog's type codes or fixed names like `trip_type_selected_other`. User-typed text, its length or its presence is never an event name or property.

## Performance timing

`src/lib/perf/timing.ts` wraps individual Supabase calls with structured, greppable log lines tagged `[perf]`: `{ surface, call, durationMs, ok }`, with no PII.

| Function | Where it runs |
|---|---|
| `timeAsync` | Server |
| `reportClientTiming` | Client, posting to `POST /api/perf-log` |

This exists because neither `trackEvent` (no properties) nor Speed Insights (page-level only) can produce a per-call p50 and p95. It is interim by design, not a permanent tracing layer, and is removed once the performance baseline is read. No timing code goes inside a Postgres function body, to avoid an observability-only RPC edit. See [ADR 0010](../adr/0010-interim-per-call-timing-instrumentation.md).

## Why

Analytics answers "what do people do". Timing answers "where is the time going". They have different privacy budgets, so they stay separate.

## Related

- [Analytics events reference](../reference/analytics-events.md)
- [Add an analytics event](../guides/add-an-analytics-event.md)
- [Analytics privacy](../product/analytics-privacy.md)
- [Performance](performance.md)

Last verified: 2026-10-20 against 9a951bb
