# Architecture: performance-scaling

Reads on top of `requirements.md` (scope, hard constraints, acceptance criteria) and
`design.md` (UX guardrails — no skeletons/spinners, no user-facing p95-miss indicator,
and the explicit warning against Suspense/streaming on `/trip/[id]`'s two tiers).
This doc covers Phase 1's instrumentation mechanism (required, unconditional) and the
Phase 2 fix architecture the actual code most likely needs (contingent on Phase 1's
findings, per requirements.md's "measure, then fix only what's found slow" discipline).

## Orientation: what's already there, so nothing here duplicates it

- **`@vercel/speed-insights`** is already installed and mounted (`src/app/layout.tsx`)
  — real-user, per-route Web Vitals, not yet mentioned in `docs/ARCHITECTURE.md` (fixed
  below). This is a free, page-level corroborating signal for the three page-load
  surfaces, but gives no per-Supabase-call breakdown, so it can't alone satisfy Phase
  1's "broken down by call" acceptance criterion — it's complementary to, not a
  replacement for, the new instrumentation below.
- **`@vercel/analytics`/`src/lib/tracking.ts`** (`trackEvent(eventName)`) is the
  existing event-tracking pattern — deliberately no properties/duration, to avoid PII
  risk. Not extended for this feature (see ADR 0010) rather than quietly repurposed.
- **`requirements.md`'s claim that vercel-analytics is "planned but not shipped" is
  stale** — it has shipped (see `docs/ARCHITECTURE.md`'s Analytics section and
  `docs/features/vercel-analytics/`). This doesn't change this feature's scope: Web
  Vitals + unlabeled custom events still can't produce a per-call latency breakdown,
  so the interim mechanism in ADR 0010 is still necessary. Flagging the doc drift for
  whoever next touches requirements.md, not re-litigating scope here.
- **Grounding-in-current-code section of requirements.md is directionally right but
  under-specifies the actual bottleneck shapes.** Reading the code directly surfaced
  several concrete, specific candidates requirements.md didn't name (a genuinely
  redundant double `auth.getUser()` call inside add-expense's submit handler; `/trips`
  actually has *two* sequential auth round trips today via `proxy.ts` + the page, not
  one; `/join/[code]`'s two fetches are a real dependency chain, not an avoidable
  reorder). Each is called out below with its own file/line grounding.

## Data model impact

**None required by the default (Tier 1) fixes below** — every Tier 1 fix is a
call-ordering or route-response-shape change in application code, not a schema, RPC,
or RLS change. No new migration is proposed by default.

Two heavier, non-default options are discussed later (a joined summary RPC for
`/trips`, and extending `get_trip_summary`) — both would need a new migration and are
explicitly flagged with migration-0013-style verification requirements if ever pursued.
Neither is recommended unless Phase 1 shows the lighter fixes insufficient.

## Phase 1: instrumentation architecture

See [ADR 0010](../../adr/0010-interim-per-call-timing-instrumentation.md) for the full
decision and alternatives considered. Summary of the module boundaries:

- **`src/lib/perf/timing.ts`** (new) — `timeAsync(surface, call, fn)` for server-side
  wrapping of any awaited Supabase call; `reportClientTiming(surface, call, durationMs)`
  for client-originated timings, fire-and-forget via `fetch(..., { keepalive: true })`
  to...
- **`src/app/api/perf-log/route.ts`** (new, temporary) — `POST` endpoint that
  `console.log`s a structured `[perf]` line for client-reported timings, so they land
  in the same Vercel log stream as server-side timings.
- Both are additive, net-new files with no existing consumers to break, and are
  designed to be deleted (along with their call sites) once Phase 1/2 conclude — see
  ADR 0010's consequences.

**Call sites** (exact functions, matching requirements.md's granularity ask):
- `renderTripDashboard` (`src/app/trip/[id]/page.tsx`): `getTripSummary`, `getTripView`.
- `getTripView`/`getMyTrips` (`src/lib/data/trips.ts`): each of the three
  `trips`/`trip_members`/`expenses` queries, wrapped individually inside the existing
  `Promise.all`s (wrapping adds no new sequencing).
- `src/app/api/trip-invite/[code]/route.ts`: `enforceRateLimit`, `getTripByInviteCode`.
- `src/app/api/join/route.ts`: `enforceRateLimit`, `joinTrip`, `sendJoinedEmail`'s two
  calls.
- `add-expense-sheet-content.tsx`/`edit/page.tsx`: the mount-time gating fetch's
  queries, the submit-time `addExpense`/`updateExpense` calls, and a click-to-navigate
  span for the client-perceived total.

**Deliberately excluded**: instrumentation inside the plpgsql bodies of
`get_trip_by_invite_code`/`join_trip`/`throttle_rpc` (migration 0013). App-level
boundary timing (time spent awaiting `supabase.rpc(...)`) is the default granularity —
sufficient to tell whether Postgres-side work (throttle + query combined) is the
bottleneck, without editing a function body that has already broken production once
from an ambiguous-column edit. See ADR 0010 for the fallback plan if this proves
insufficient.

**Baseline capture**: aggregate the `[perf]`-tagged log lines from Vercel's existing
log stream over a representative window of real traffic (not one manual load per
requirements.md AC), computing p50/p95 per `{surface, call}` offline. No new dashboard
is built — this is explicitly interim per requirements.md.

## Phase 2: candidate fix architecture, per surface

Everything below is contingent on Phase 1 confirming the surface/call is genuinely
slow (requirements.md item 6) — presented here so the engineer stage has a concrete,
code-grounded design to execute against rather than starting from the requirements
doc's higher-level hints.

### `/trip/[id]` — parallelize `getTripSummary`/`getTripView`

**Current** (`renderTripDashboard`, `src/app/trip/[id]/page.tsx`): three fully
sequential round trips — `supabase.auth.getUser()`, then `getTripSummary(supabase,
id)`, then (only if a session exists) `getTripView(supabase, id, user.id)`. Neither
`getTripSummary` nor the decision to call `getTripView` depends on the other's
*result* — `getTripSummary` doesn't use `user` at all, and `getTripView` only needs
`user.id`, not `summary`.

**Fix shape**: run `getUser()` and `getTripSummary()` concurrently (`Promise.all`),
then conditionally run `getTripView()` once `user` is known — collapsing three
sequential stages to two. Same atomic "nothing, then everything" render as today (no
partial reveal — this is also `design.md`'s explicit recommendation and its rejection
of a Suspense/streaming alternative, which would flash the unverified-visitor upsell
copy at an already-verified member mid-load). Same error handling, same fallback
branch order, same visibility tiering — pure control-flow reordering, no caching, no
RLS change, no split-calc change.

**Minor tradeoff to note**: an invalid/not-found trip id would now also incur
`getTripView`'s (RLS-denied or not-found) query cost, since both are kicked off before
either result is known, versus today's short-circuit before attempting `getTripView`
at all. Negligible for the common case (a real trip id), worth a one-line callout in
the PR, not a design blocker.

### `/trips` — two tiers

**Current** (`src/app/trips/page.tsx` + `getMyTrips`): **four** sequential stages, not
one — `proxy.ts`'s own `getUser()` (session-existence gate, matches `/trips` via
`SESSION_REQUIRED_PATTERNS`), then the page's own second `getUser()` call, then
`getMyTrips`'s `trips` select, then its `trip_members`/`expenses` `Promise.all`. This
matches [ADR 0005](../../adr/0005-ssr-page-conversion-pattern.md)'s already-documented,
deliberately-accepted tradeoff — it flagged exactly this as "not the theoretical
minimum" and named the header-forwarding fix as the next step "if this shows up as a
real cost later."

**Tier 1 (default, low risk, no new trust boundary)**: the page's own `getUser()` call
and `getMyTrips`'s `trips` select don't depend on each other — `currentUserId` is only
consumed at the end, to compute each trip's `yourNetCents`, not to filter the `trips`
query. Restructure so the page kicks off `getUser()` and the `trips` select
concurrently, passing the already-fetched trip rows into a `getMyTrips` that no longer
does its own `trips` select when rows are supplied. This is a signature-widening
change to `getMyTrips` (an optional pre-fetched-rows parameter, defaulting to today's
own-fetch behavior so no other caller needs to change) — same shape of change as
`requireVerifiedSession` below.

**Tier 2 (contingent, higher risk, needs security sign-off)**: eliminate the page's
`getUser()` call entirely by having `proxy.ts` forward its own already-verified
`user.id` via a request header. See
[ADR 0011](../../adr/0011-forward-verified-user-id-header-for-trips-page.md) for the
full design, trigger condition, and required live-verification/security-review bar —
this is proposed, not decided, and should only be pursued if Tier 1 plus the summary/
view fix above aren't enough to hit the ≥30% target on `/trips` specifically.

### Invite/join preview (`/join/[code]`)

**Current** (`src/app/join/[code]/page.tsx`): a genuine two-step dependency chain, not
an avoidable reorder — `fetch("/api/trip-invite/[code]")` returns `tripId`, which
`getTripSummary(supabase, tripId)` (called directly from the browser) then needs. Both
calls originate in the browser, each a full browser-to-network hop; the second one
(`get_trip_summary`) is not proxied through any app route today and has no throttle of
either kind (Postgres or Upstash) — a different exposure class than
`get_trip_by_invite_code`'s guessable-invite-code risk, since it requires an already-
resolved trip UUID, not a low-entropy code guess (not proposing to add throttling here
— out of non-goals — just noting why it's structured differently today).

**Fix shape**: move `getTripSummary` server-side, into `GET
/api/trip-invite/[code]/route.ts`, calling it in parallel with the existing
`getTripByInviteCode` (`Promise.all`, both already accept a generic
`SupabaseClient<Database>`, no signature change needed to either). The route returns a
combined shape (`InviteInfo & { summary: TripSummary | null }`); `/join/[code]/page.tsx`
makes one `fetch` instead of one `fetch` + one direct-to-Supabase RPC call. Same atomic
render on the page (still waits for one resolved payload before showing the invite
card — no new partial-reveal pattern, matching `design.md`'s explicit flag on this
point).

**Route contract impact (see full analysis below)**: additive-only, single consumer,
same-PR/same-deploy — no versioning needed.

**Side effect worth flagging, not a violation**: this incidentally routes the
previously-unthrottled `get_trip_summary` call, for this one code path only, behind
the invite-lookup route's existing Upstash limit (10 req/60s) — because it now runs
inside a route that already calls `enforceRateLimit` before doing anything.
`get_trip_summary` itself is not touched, still callable unthrottled from anywhere
else (e.g. `/trip/[id]`), and no throttle *limit* changes — but this is still a real,
if minor, behavior change adjacent to the throttle system, so it's called out
explicitly for reviewer sign-off rather than treated as a pure no-op.

### `join_trip` (`POST /api/join`)

No architecture change recommended by default — likely instrumentation-only for Phase
1, per requirements.md's own framing (this route already carries the necessary
security-motivated overhead, not clearly a code-structure problem).

**Considered and rejected**: racing `enforceRateLimit` against the `joinTrip`/
`getTripByInviteCode` RPC call (kick off both concurrently, discard the RPC result if
the Upstash check fails) to remove the sequential dependency between them. **Rejected**
outright, not just deprioritized: this would call the Postgres-side RPC (and therefore
`throttle_rpc`'s counter, migration 0013) even for requests the app-level limiter was
about to reject, changing how quickly the *DB-side* throttle's bucket fills relative to
today (where a request blocked by Upstash never reaches Postgres at all) — a real,
if subtle, change to when the Postgres throttle actually triggers, which
`requirements.md`'s hard constraint ("no changes to... throttle limits") is read here
to also cover in effect, not just in the numeric limit values. Documented here so a
future pass doesn't rediscover and ship this as a tempting-looking latency win.

If Phase 1 finds the Postgres-side throttle write itself (the `rpc_rate_limits` upsert
inside every call, not just over-limit calls) is a measurable per-call cost even for
allowed requests, that's a finding to report, not a change to make under this
feature — altering `throttle_rpc`'s write pattern is exactly the class of RPC-body
change that needs its own live-Postgres-verified pass, and touches the security-owned
mechanism from ADR 0009.

### Add/edit-expense

Two independent findings, different confidence levels:

**(1) A genuine, zero-tradeoff redundant round trip — safe to fix regardless of Phase 1's
magnitude finding.** `add-expense-sheet-content.tsx`'s `handleSubmit` calls
`requireVerifiedSession(supabase)` (which internally calls `supabase.auth.getUser()`),
and then, immediately after, calls `supabase.auth.getUser()` again just to read
`user.id` for `paidBy` — two identical, back-to-back client-to-Supabase-Auth round
trips doing the same lookup. (`edit/page.tsx`'s equivalent handler doesn't have this —
`updateExpense` never needs `paidBy`, since it's immutable post-insert — so this is
scoped to add-expense only.)

**Fix shape**: widen `requireVerifiedSession` (`src/lib/auth-gate.ts`) with an optional
second parameter for an already-fetched user object:
`requireVerifiedSession(supabase, prefetchedUser?)` — when supplied, skip the internal
`getUser()` call and check `prefetchedUser.is_anonymous` directly; when omitted
(today's every other call site), behavior is byte-for-byte unchanged. Only
`add-expense-sheet-content.tsx` changes its call site: fetch `user` once, pass it into
`requireVerifiedSession`, reuse `user.id` for `paidBy`. See Impact analysis below for
every other consumer of this helper (unaffected).

**(2) Mount-time gating-fetch waterfall — larger, contingent change.**
`add-expense-sheet-content.tsx`'s mount effect independently re-fetches, entirely
client-side, three things the *server* already knows by the time this sheet can even
open: member count, trip lock state, and ownership — all already computed by
`renderTripDashboard` (`members.length`, `trip.isCompleted`, `you?.isOrganizer`) for
the page underneath. The hard-navigation fallback route
(`src/app/trip/[id]/add-expense/page.tsx`) already calls `renderTripDashboard` and
could pass this data down as props today, at zero extra cost. The **intercepted**
route (`src/app/trip/[id]/@sheet/(.)add-expense/page.tsx`), used for the common
in-app case, does not — it's a separate parallel-route Server Component that only
awaits `params`, with no server-side channel to the already-rendered trip page's data
(parallel route slots don't share fetched data by construction in this app's routing).

**Fix shape, if Phase 1 confirms this mount-time fetch is material**: make both
`add-expense/page.tsx` and `@sheet/(.)add-expense/page.tsx` do this lookup
server-side and pass it as props to `AddExpenseSheetContent`, removing its `useEffect`
gating fetch entirely (`memberCount`/`locked`/`ownerGateBlocked` become props, not
client-fetched state). The hard-nav route needs no new query (data already in scope
from `renderTripDashboard`); the intercepted route needs a small new server-side
lookup (member count + trip lock/ownership — a lean, targeted fetch, not a new RPC).
This is a real UI-data-flow refactor (bigger than (1)), and `design.md`'s explicit
warning applies: preserve each screen's exact current racy/non-racy behavior (add-
expense currently *can* show the fillable form before the lock-state fetch resolves;
edit-expense currently blocks until it resolves) — don't let a round-trip reduction
accidentally change which one races.

**Explicitly not recommended** (per `design.md`, restated for completeness): no
optimistic UI, no skeleton/spinner, no partial reveal — any Phase 2 fix here keeps the
existing submit-then-wait-then-navigate shape and the existing plain-text loading
copy; it should only get faster, not change what it looks like while loading.

## Impact analysis

**Route contract**: `GET /api/trip-invite/[code]` gains a `summary` field
(`InviteInfo & { summary: TripSummary | null }`). Consumers, found via search:
`src/app/join/[code]/page.tsx` (the only production caller — reads `InviteInfo`
fields directly, unaffected by an added field), `src/app/api/trip-invite/[code]/route.test.ts`,
`src/app/join/[code]/page.qa.test.tsx` (both need updating to expect/exercise the new
field, an engineer/QA task, not an architecture concern). This is **backward
compatible**: additive-only field, single in-repo consumer, deployed atomically in the
same Vercel deployment as the route change — no split-deploy window risk (unlike a DB
migration vs. app-code deploy) and no versioning (`/api/v2/...`) needed.

**Shared-helper signature changes** — both additive/optional, no existing call site
needs to change:
- `requireVerifiedSession(supabase, prefetchedUser?)` — existing consumers
  `src/app/trip/[id]/expense/[expenseId]/edit/page.tsx` and
  `src/app/trip/[id]/invite/page.tsx` keep calling it with one argument, unaffected.
  Only `add-expense-sheet-content.tsx` adopts the new second argument.
- `getMyTrips(supabase, currentUserId, prefetchedTripRows?)` — its only production
  caller is `src/app/trips/page.tsx`; test consumers
  (`src/app/trips/page.qa.test.ts`, and any shared fixtures) should be checked by
  engineer/QA that they still pass with the parameter omitted (default = today's
  behavior).

**`src/proxy.ts`** — only touched if ADR 0011's Tier 2 is executed (contingent, not
default). If executed: blast radius is every route matched by `proxy.ts`'s matcher
(effectively the whole app), even though the new header logic only activates for
`/trips`; the live-verification and security-review bar in ADR 0011 exists precisely
because a mistake here isn't scoped to one page the way the other fixes in this doc
are. Not touched by any Tier 1 fix.

**New, no existing consumers to break**: `src/lib/perf/timing.ts`,
`src/app/api/perf-log/route.ts` (Phase 1 only).

**Unchanged by every fix in this doc** (explicitly verified, not assumed): `expenses`/
`trip_members`/`trips` RLS policies, `is_trip_member`/`is_verified_trip_member`/
`is_owner_or_verified_member`, invite-code format/entropy, the Upstash and Postgres
throttle limits/thresholds (migration 0013), `join_trip`'s anonymous-verification
guard (migration 0010), `src/lib/settlement.ts`'s split-calculation logic, and the
summary-vs-detail visibility tiering on `/trip/[id]`/`/trips`. None of the Tier 1 fixes
require a new migration; none introduce a caching layer (no staleness question
applies — every fetch above is still a fresh, per-request read, just fewer or more
parallel round trips to get there).

**If a heavier, non-default option is ever pursued** (a joined summary/detail RPC
replacing `/trips`' three separate queries, or extending `get_trip_summary` to also
carry `/trip[id]`-only fields needed elsewhere): that requires a new migration, and
must be live-Postgres-verified per the migration-0013 lesson before merge — in
particular, explicit column qualification in any new joined query/RPC body (the exact
class of bug that broke both invite RPCs: an unqualified column name that's ambiguous
once two joined/upserted relations share it), a check that RLS still enforces the same
visibility tiers post-change, and a byte-for-byte comparison of computed
totals/balances against the existing TS-side `computeBalances`/`simplifyDebts` for a
fixed dataset. Not proposed as a default in this doc; only flagged so it isn't
attempted casually if it comes up later.

## Coordination with `invite-code-rpc-hardening`

Per requirements.md: that ROADMAP item's pending live-deployment re-verification
should report whether the Postgres throttle + added Upstash round trip introduced a
material latency regression on the join/invite path. This feature's Phase 1
instrumentation (`enforceRateLimit`/RPC-call timing on both invite routes) directly
produces the data that re-verification needs — the two should cross-link once that
data exists, per requirements.md's explicit instruction not to duplicate or silently
fold one into the other.

## Verification requirements

None of the default (Tier 1) fixes in this doc touch a DB schema, RPC, or RLS policy,
so none require live-Postgres verification by the migration-0013 standard — they're
application-code call-ordering and route-response-shape changes, verifiable by the
normal test/QA cycle plus a manual side-by-side comparison of rendered output
(`design.md`'s "no visible behavior change" bar). The one contingent option that would
require it (a heavier joined RPC, see above) is explicitly not part of the default
plan. ADR 0011's Tier 2 (header forwarding) requires its own live-verification and
security-review bar, described in that ADR, independent of the DB-migration standard
(it's an app-level trust-boundary risk, not a SQL-correctness one).
