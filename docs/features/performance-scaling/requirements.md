# Performance & latency fix — three core surfaces

## Status of this doc

Supersedes [planning.md](planning.md)'s "zero new scope" recommendation. That
recommendation was conditioned on this being a speculative, forward-looking
ask with no felt problem — the user has since confirmed, via direct Q&A at
Checkpoint 1, that the opposite is true:

1. This is a **felt problem today**, not a growth bet — real reported
   slowness, not "we expect more users."
2. **All three of the app's core interaction paths** feel slow: (a) trip/
   expense page loads (`/trips`, `/trip/[id]`), (b) the invite-code join/
   preview flow, (c) adding/editing an expense.
3. **No volume/growth/concurrency data or target exists.** This is
   explicitly not a case for speculative capacity work (pm's option D from
   planning.md — pooling, caching, read replicas) — there's no measured
   ceiling to provision against. The ask is to fix known latency on known
   paths, not to prepare for scale.

This doc scopes that fix. It does not reopen the debate in planning.md about
*whether* to do performance work — the user already settled that.

## Problem statement

Splitiful's whole pitch (the product principles in the roadmap) rests on two moments being
fast: logging an expense, and seeing the final split. Users are currently
experiencing the opposite on exactly those moments, plus the join flow that
gets them into a trip in the first place:

- Opening `/trips` or a trip's dashboard (`/trip/[id]`) feels slow.
- Opening an invite link / joining a trip via invite code feels slow.
- Adding or editing an expense feels slow.

There is currently **no observability layer** in the app (`vercel-analytics`
is planned but not shipped — see `docs/features/vercel-analytics/requirements.md`),
so today nobody can say *how* slow, *where* the time goes, or whether a fix
actually helped. Fixing blind risks shipping a change that "feels" faster
without evidence, or missing the actual bottleneck. This feature is
therefore two things, not one: **measure the three named surfaces, then fix
whatever the measurement finds** — not a general performance audit, and not
capacity/scale work.

## Grounding in current code (for scoping, not prescribing the fix)

- `/trip/[id]` (`src/app/trip/[id]/page.tsx`, `renderTripDashboard`) does a
  server-side `getTripSummary` RPC call, and — only if a session exists — a
  *second*, sequential `getTripView` call (three parallel queries under the
  hood: `trips`, `trip_members`, `expenses`, via
  `src/lib/data/trips.ts`). That's a minimum of two sequential Postgres
  round trips before the page can render for a signed-in member.
- `/trips` (`src/app/trips/page.tsx`, `getMyTrips`) is `force-dynamic` (never
  statically generated) and issues one query for `trips` then two more in
  parallel for `trip_members`/`expenses` across all of the user's trips.
- The invite-code path (`src/app/api/trip-invite/[code]/route.ts`,
  `src/app/api/join/route.ts`) now carries, on top of the original RPC call,
  an app-level Upstash rate-limit check (`src/lib/rate-limit.ts`) *and* a
  Postgres-side throttle inside the RPC itself
  (`supabase/migrations/0013_throttle_invite_rpcs_in_postgres.sql`, ADR
  0009) — extra round trips/work added for a real security fix, whose
  latency impact has never been measured.
- Add/edit-expense (`addExpense`/`updateExpense` in `src/lib/data/trips.ts`
  and their callers) are simple single-row insert/update calls today — if
  these feel slow, the cause is more likely client-side (sheet/route
  transition, revalidation) than the DB call itself, but that's exactly
  what needs measuring rather than assuming.

None of the above is a diagnosis. It's the starting point for
instrumentation — the actual bottleneck on each surface may be different
from what this list suggests.

## Scope

Two phases, both required — a fix without a baseline can't be verified, and
a baseline without a fix doesn't solve the reported problem.

### Phase 1 — Instrument and measure (blocking; must exist before any fix is called "done")

1. Lightweight, targeted timing instrumentation is added around the actual
   data-fetch/mutation code paths for all three surfaces — enough
   granularity to see time spent per Supabase call, not just a single
   page-level total:
   - `/trip/[id]`: `getTripSummary` and `getTripView` (and, if `getTripView`
     is reached, its three underlying queries) in `renderTripDashboard`.
   - `/trips`: `getMyTrips`'s three queries.
   - Invite/join: `/api/trip-invite/[code]` and `/api/join`, broken out by
     the Upstash check, the RPC call itself, and (where visible) the
     in-Postgres throttle.
   - Add/edit expense: `addExpense`/`updateExpense` and the route/action
     that calls them, plus whatever client-side transition follows.
   This does **not** wait on `vercel-analytics` shipping — use whatever
   lightweight interim mechanism is cheapest (structured server logs,
   timing wrappers, etc.); it can be informal/temporary as long as it
   produces real numbers, and does not need to become permanent
   product-analytics infrastructure.
2. A documented "before" baseline exists for each of the three surfaces,
   captured from a representative sample of real requests (not one manual
   page load) — at minimum p50 and p95 latency, plus the per-call
   breakdown from (1).
3. The baseline identifies, per surface, where the time actually goes
   (e.g., a specific slow query, an avoidable sequential round trip, a
   cold Vercel function start, network/edge overhead, client-side
   transition cost) with enough specificity that Phase 2 targets a named
   cause, not a guess.

### Phase 2 — Fix what's actually measured slow

4. For each surface where Phase 1 finds a real, addressable bottleneck, a
   targeted fix ships. The mechanism (query/index change, removing a
   sequential round trip, reducing RLS overhead, etc.) is for the
   architect/engineer stages to determine — this doc does not prescribe it.
5. A documented "after" measurement, using the same method as (2), shows a
   measurable improvement on each fixed surface. **Target: at least a 30%
   reduction in p95 latency on each surface that gets a fix**, proposed as
   a starting bar rather than derived from data (none exists yet) — flagged
   below as adjustable once the baseline is in hand.
6. If Phase 1 finds a surface is *not* meaningfully slow relative to the
   other two (e.g., add/edit-expense turns out fine), no fix is required
   for it — this is a measure-then-fix pass, not a mandate to change all
   three regardless of findings.
7. Any DB/RPC-level change (query, index, RLS policy, function body) is
   verified against a live Postgres instance before being called done — not
   CI-green alone. This is the direct lesson from migration 0013 (an
   ambiguous-column bug that broke both invite RPCs outright, caught only
   by a live-Postgres QA pass, not by `npm test`/lint/typecheck/build).
   Verification must also confirm no behavioral regression: RLS access
   still enforces the same visibility rules, invite throttling still
   triggers at the same thresholds, and split totals are byte-for-byte
   unchanged for a fixed dataset.
8. No new caching layer is introduced unless it comes with an explicit,
   verified invalidation guarantee that a viewer can never see a stale
   total/balance/expense list. If no such guarantee can be made, caching is
   not an acceptable fix for that surface, full stop — this is a hard
   constraint from the product principles in the roadmap ("the final answer should never
   require interpretation"), not a preference.
9. Add/edit-expense fix (if any) does not change split-calculation
   semantics, validation, or the existing payer-only-edit rule
   (`edit-own-expense`) — latency only, same behavior.
10. `/trips`/`/trip/[id]` fix (if any) does not regress the tiered
    summary/detail visibility behavior from `ssr-trip-pages` and
    `simplified-onboarding` (unverified visitors still see summary-only,
    members see full detail) — same access-control outcomes, just faster.
11. Invite/join fix (if any) does not change invite-code entropy/format,
    the Upstash or Postgres throttle's rate limits, or `join_trip`'s
    anonymous-session verification requirement (migration 0010) — those are
    separate, already-settled security decisions (ADR 0009) this feature
    must not silently alter while chasing speed.

### Coordination with `invite-code-rpc-hardening` (avoid duplicate work)

That ROADMAP item already has a pending live-deployment re-verification
step, currently scoped only to confirming the `x-forwarded-for` trust
assumption behind the Postgres-side throttle (ADR 0009). Per the
pm/product-strategist's earlier (still-valid) agreement in planning.md, that
re-verification's acceptance criteria should also confirm whether the
throttle + added Upstash round trip introduced a material latency
regression — that measurement is folded into the existing item, not
duplicated here.

**What's new given the felt-problem clarification**: if that
re-verification finds a real, material regression (not just "confirm the
header-trust caveat holds"), the *fix* for it is delivered under this
feature (`performance-scaling`), cross-referenced from both ROADMAP entries
— not by reopening ADR 0009's already-settled remediation choice (throttle
inside Postgres, chosen over revoking grants) or expanding that item's scope
indefinitely. The two entries should link to each other once this is known.

## Acceptance criteria (summary, testable)

**2026-09-21 status note**: QA (2026-09-20) confirmed the code-level items
below are met. The four baseline/measurement items are **deferred to
post-deploy**, per explicit user decision on 2026-09-21 — this build
environment has no live production traffic to measure against, so Phase 2's
fixes shipped on the architect's code-level bottleneck analysis rather than
measured evidence. This is a knowing exception to this doc's own
measure-then-fix framing, not an oversight; see the `performance-scaling`
ROADMAP entry's 2026-09-21 addition for the required follow-up and its
own tracking. The instrumentation needed to actually capture this data
(`src/lib/perf/timing.ts`, `POST /api/perf-log`) is shipped and in place.

- [ ] ~~Baseline p50/p95 latency measurements exist and are documented for:
      `/trips`, `/trip/[id]` (signed-in, full-detail render), invite-code
      preview (`/join/[code]`), `join_trip` (actually joining), add-expense,
      edit-expense.~~ Deferred to post-deploy (see note above).
- [ ] ~~Each baseline is broken down by call (which Supabase query/RPC/round
      trip contributes what share of total time), not just a single
      number.~~ Deferred to post-deploy (see note above).
- [ ] ~~For each surface where a fix ships, an "after" measurement using the
      same method shows a documented improvement (default target: ≥30% p95
      reduction, adjustable once baseline data exists — see open
      questions).~~ Deferred to post-deploy (see note above).
- [ ] ~~For each surface where no fix ships, the baseline data and reasoning
      for "not a real bottleneck" is recorded, not silently dropped.~~ N/A —
      this pass shipped a fix candidate for all three surfaces rather than
      excluding any based on measurement (no measurement existed to exclude
      one); revisit once post-deploy data exists.
- [ ] Any DB/RPC change is live-Postgres-verified (not CI-only) per the
      migration-0013 lesson, including a check for behavioral regressions
      (RLS visibility, invite throttle thresholds, split-total correctness).
- [ ] No new caching is introduced without a verified no-staleness guarantee
      on split totals/balances.
- [ ] Invite-code entropy/format, throttle rate limits, and
      `join_trip`'s anonymous-verification requirement are unchanged.
- [ ] Edit/add-expense validation, split semantics, and payer-only-edit
      rules are unchanged.
- [ ] `/trips`/`/trip/[id]`'s tiered summary-vs-detail visibility is
      unchanged.
- [ ] The `invite-code-rpc-hardening` ROADMAP item's pending re-verification
      explicitly reports whether a material latency regression exists on
      that path (even if this feature doesn't end up fixing it), and if a
      fix is needed, it's tracked here with a cross-link, not silently
      folded into or left dangling off the security item.

## Non-goals

- **No speculative capacity/concurrency work** — DB connection pooling,
  read replicas, general caching for scale, or any fix motivated by "this
  will help at higher volume" rather than a measured bottleneck on one of
  the three named surfaces today. There is no volume/growth data to justify
  this (per the user's explicit clarification), and planning.md's pm/
  product-strategist debate already rejected it on that basis.
- **No general performance audit** of the whole app, or of RPCs/pages
  outside the three named surfaces.
- **No new caching layer that risks split-total/balance staleness or
  ambiguity** — a hard constraint from the product principles in the roadmap, not just a
  preference to weigh against speed.
- **No change to invite-code length/entropy**, rate-limit thresholds, or the
  RLS/anonymous-verification trust model — those are separately-settled
  security decisions (ADR 0009, migration 0010).
- **Not a replacement for `vercel-analytics`** — that rollout still ships on
  its own timeline as the general product-analytics/Web-Vitals layer; this
  feature's instrumentation is narrow and surface-specific, built because
  waiting for the general rollout would mean fixing blind on a problem
  users are reporting today.
- **No cost/infra-efficiency work** (Vercel invocation volume, Supabase
  compute tier) — a separate axis from latency per planning.md; not touched
  here.
- **Does not itself reprioritize** the security/compliance items or expense
  delete that were sequenced ahead of this in the September 2026 priority snapshot — see open
  question 2 below; the default assumption is this still comes after them.

## Open questions (need a user/product decision — not guessed here)

1. **Priority order across the three surfaces.** All three are reported
   slow; this doc scopes measuring and fixing all three, but doesn't assume
   they're built in parallel by the same engineer at the same time. Is
   there a preferred order (e.g., add/edit-expense first since it's the
   single most frequent action in the roadmap's two core moments), or
   should sequencing be left to whoever picks this up based on what Phase 1
   finds?
2. **Does this change the security/compliance-first, then-expense-delete
   sequencing** in the September 2026 priority snapshot? This doc's default assumption,
   consistent with the historical priority snapshot in the roadmap (item 3: "whatever
   friction real usage surfaces on the two core moments"), is **no** —
   performance work happens after those, in its already-designated slot —
   but the user should confirm given this is now a confirmed felt problem
   rather than a hypothetical.
3. **The ≥30% p95 improvement target in AC5 is a proposed default, not
   derived from data** (none exists pre-baseline). Confirm it's an
   acceptable bar, or state a different one once real baseline numbers are
   in hand.
4. **Scope of the invite-code latency fix, if the re-verification finds one
   is needed**: confirmed default above is "track under `performance-scaling`,
   cross-referenced from `invite-code-rpc-hardening`" — flag if a different
   split is preferred (e.g., folding it fully into the security item
   instead).

## Semver classification

**Fix.** No new user-facing capability and no behavioral/contract change
from the user's perspective on any of the three surfaces — this addresses
reported slowness on existing features, the same class of change as the
already-shipped `ssr-trip-pages` (also classified `Fix`). Flagging for the
reviewer to confirm before the version bump, same as that precedent, since
it touches core paths and (potentially) RPC/DB internals even though the
external contract doesn't change.
