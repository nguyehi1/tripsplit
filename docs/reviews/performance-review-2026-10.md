# Performance review: October 2026

**Date:** October 2026. **Type:** record. A focused performance code review (not a feature), cross-checked against `perf-raw.log` and the `performance-scaling` feature. The current performance rules are in [Performance](../architecture/performance.md); open work is tracked in the [roadmap](../product/roadmap.md). This page preserves the review's findings and evidence and is not updated as the system changes.

Sources: [performance-scaling requirements, design and architecture](../features/performance-scaling/), [ADR 0010](../adr/0010-interim-per-call-timing-instrumentation.md), [ADR 0011](../adr/0011-forward-verified-user-id-header-for-trips-page.md).

A focused performance code review (not a new feature) was run against the
current codebase, cross-checked against `perf-raw.log`'s captured `[perf]`
log lines and the already-documented `performance-scaling` feature
(`docs/features/performance-scaling/{requirements,design,architecture}.md`,
[ADR 0010](../adr/0010-interim-per-call-timing-instrumentation.md),
[ADR 0011](../adr/0011-forward-verified-user-id-header-for-trips-page.md)).
That feature already covers most of what a performance pass would otherwise
flag (the `/trips` double-auth-round-trip, the `/trip/[id]` summary/view
sequencing, the invite/join preview's dependency chain) — this section
exists so later readers don't have to reconstruct what's shipped vs. still
open, and records what this review found that wasn't already written down.

**What's confirmed shipped** (read directly from the current code, not
assumed from the feature doc): `src/app/trips/page.tsx` already runs its own
`getUser()` concurrently with the `trips` select and passes the fetched rows
into `getMyTrips(supabase, user.id, tripsRowsResult.data ?? [])`
(`src/lib/data/trips.ts`'s optional `prefetchedTripRows` parameter); `/trip/[id]`
(`src/app/trip/[id]/page.tsx`) already runs `getUser()` and `getTripSummary()`
concurrently before conditionally awaiting `getTripView()`; and
`add-expense-sheet-content.tsx`'s submit handler already fetches the user
once and passes it into `requireVerifiedSession(supabase, user)` instead of
calling `supabase.auth.getUser()` twice. These are the Tier 1 fixes
[performance-scaling architecture](../features/performance-scaling/architecture.md) proposed; they're done.

**Still open, but the evidence is thinner than first reported**:
`add-expense-sheet-content.tsx`'s *mount-time* gating fetch (distinct from
the already-fixed submit-time call above) is still a client-side chain:
`getUser` -> (`trips` and `own_member_id` together) -> `claimed_items`.
`perf-raw.log` holds exactly **one** add-expense sample (2026-09-30), taken
before or around the Tier 1 reorder, so it shows the shape (~280 + ~270 +
~222 ms of client-to-Supabase round trips) but is not a baseline. The same
log shows server-side calls at ~105 ms against ~270 ms for client-side
calls of the same shape, which is the real argument for the designed fix
(pass `memberCount`/`locked`/`ownerGateBlocked` as props from the server
instead of a client `useEffect` fetch). **Not yet built**, because it moves
the owner/lock gate (fail-closed, security-relevant) and changes when the
intercepted sheet appears (the route would wait on server fetches before
opening), so it should go through the feature pipeline with QA and security
review, ideally after a real baseline exists.

**Instrumentation coverage gap (closed)**: `src/proxy.ts`'s own
`supabase.auth.getUser()` call (the first of `/trips`'s two sequential
Auth-server round trips) is now wrapped in `timeAsync("proxy", "getUser", ...)`,
so ADR 0011's gating number will appear in the logs after the next deploy.
ADR 0011 stays "proposed, not executed" until that number is read.

**`perf-raw.log` caveat**: `perf-raw.log` (git-ignored, local only) is a ~50-line,
single-session capture (all timestamps within about one minute of each
other), not the "aggregate over a representative window of real traffic"
baseline ADR 0010 and [performance-scaling architecture](../features/performance-scaling/architecture.md)
call for. It's useful as directional evidence (and is what confirms the
add-expense waterfall finding above), but nobody should read p50/p95 off of
it as if it were the real Phase 1 baseline — that aggregation step, per ADR
0010's own design, still needs to happen against actual production log
volume before any Phase 2 fix is declared to have hit requirements.md's
≥30% target.

**Indexing**: the one real finding was `trips`' select policy, whose cost
grew with total trips app-wide. It was fixed by migration 0023 (see the
`trips` data-model entry above for the measurements and why a plain
`created_by` index was not the fix). Every other table/query this review checked
(`expenses`, `trip_members`, `shopping_list_items`, and every per-trip read
in `src/lib/data/trips.ts`/`src/lib/data/shopping-list.ts`) is already
indexed on the column it's actually filtered by, and this app's per-trip
dataset sizes (a handful of members, a few dozen to a few hundred expenses
per trip) are far too small for a missing index on any of those to be a
real cost at today's traffic — nothing else here rises to a finding.

**Not findings, checked and ruled out**: client-side recompute
(`src/lib/settlement.ts`'s `computeBalances`/`simplifyDebts`) runs
server-side today (both `getMyTrips` and `getTripView` are called from
Server Components) over small per-trip arrays — negligible cost, and
duplicating the computation once per trip per `/trips` load is not worth
caching at this data size. The per-Supabase-call durations in
`perf-raw.log` (roughly 90-190ms per simple, already-indexed, single-table
query) look dominated by Vercel-function-to-Supabase network round-trip
time, not query execution — an infrastructure/region-colocation
consideration, not a code-level fix, and out of scope for a code review.
