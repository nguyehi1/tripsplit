# Planning: "Improve performance and reduce latency to serve higher volume of users"

Date: 2026-09-19
Stage: planning (pre-requirements) — see [docs/v2-vision.md](../../v2-vision.md) and
[docs/ROADMAP.md](../../ROADMAP.md) for the context this discussion is grounded in.

## Raw idea (as given by the user)

> Improve performance and reduce latency to serve higher volume of users.

Intentionally broad — no specific surface, endpoint, metric, or volume target was named.
This doc exists to converge that vagueness into a concrete recommendation and a short list
of questions only the user can answer, per the planning stage's job.

## Orientation

- **docs/v2-vision.md** ("Simplicity is the feature") tests every feature against one bar:
  does it make logging an expense or seeing the final split *faster or clearer*, without
  adding a new concept, screen, or decision. Its recommended sequencing is (1) the still-open
  security/compliance items from the 2026-09-17 audit, (2) expense delete, (3) whatever
  friction real usage surfaces on the two core moments — evaluated case by case, not
  pre-planned as a roadmap of features — and (4) shopping-list-with-claiming, on hold behind
  1–3. **Performance/scaling as a named initiative does not appear anywhere in that
  sequencing.** This idea doesn't resemble something the vision doc explicitly debated and
  rejected (unlike OCR, itemization, payment rails, multi-currency); it's simply absent,
  which itself is informative — nothing in the product thesis calls for it right now.
- **docs/ROADMAP.md** "In progress": `invite-code-rpc-hardening`. The DB-side throttle
  (migration 0013, [ADR 0009](../../adr/0009-throttle-invite-rpcs-inside-postgres.md)) is
  shipped but has a pending live-deployment re-verification step — currently scoped only to
  confirming the `x-forwarded-for` trust assumption holds against a real Supabase/Vercel
  deployment, not to any latency question.
- **Already shipped**: `ssr-trip-pages` — a pure performance refactor
  ([ADR 0005](../../adr/0005-ssr-page-conversion-pattern.md)) that removed a client-side
  auth+fetch waterfall on `/trips` and `/trip/[id]`. This is the precedent for what a
  vision-aligned performance change looks like: narrow, tied to a specific reported problem
  (slow page loads), measured against unchanged UX, not a general "improve performance"
  initiative.
- **Planned, not yet shipped**: `vercel-analytics` (Web Vitals + custom event tracking).
  Notably, **there is currently no observability layer at all** — no real-world latency
  data, no traffic/volume baseline, no SLO, no monitoring/alerting. Any "performance" work
  right now would be scoped blind.
- **Recent git history** (background, not necessarily this idea's target): a fix forcing
  `/trips` to render dynamically to stop prerendering crashes without env vars (a
  correctness/build fix, not a proven latency fix — worth checking whether it's a latency
  regression, but that's a side question, not evidence of a volume problem); and the
  invite-code RPC throttle work (a security fix that happens to add a Postgres-side rate
  limiter — and an extra Upstash round trip — on a hot-ish path, `join`/invite-code preview).

## PM's initial take

Framed "performance" as at least four distinct problems wearing one label, each with
different fixes and urgency:
1. Page load latency (partially already addressed by `ssr-trip-pages`).
2. DB/RPC query performance (indexes, N+1s, RLS overhead on hot-path RPCs).
3. Read/write throughput under concurrent load (lock contention, Postgres connection limits).
4. Cost/infra efficiency (Vercel invocations, Supabase compute tier) — a different axis
   (cost, not latency) often conflated with "performance."

Key observation: **there is no measurement layer yet** (`vercel-analytics` is still
"planned"), so any performance initiative right now would be scoped without real data.
Also flagged migration 0013's live-Postgres bug (ambiguous column references broke both
invite-code RPCs, caught only by a live-Postgres QA pass, not CI) as a directly relevant
precedent: any DB-side performance work carries the same "CI green ≠ actually works"
blind spot and would need the same live-Postgres verification discipline.

Proposed options, small to large: (A) ship the already-planned `vercel-analytics` first to
get a real baseline; (B) fix one concretely-known slow path if one exists; (C) a bounded
DB query/index + RLS-overhead audit on hot-path RPCs; (D) general capacity work (pooling,
caching, read replicas) — flagged as premature without a measured bottleneck or stated
volume target. Flagged non-goals: no infra/rewrite migration absent a measured bottleneck,
no speculative caching (staleness risk directly conflicts with the vision's "final number
must never be ambiguous" bar), don't let this compete with or dilute the
already-sequenced-ahead security/compliance work, and keep cost optimization conceptually
separate from latency if the user cares about it.

## Product-strategist's independent view

Formed an independent assessment before engaging pm, then pushed on three points:

1. **Whether this warrants being tracked as a feature/roadmap item at all**, versus simply
   reprioritizing work already planned (`vercel-analytics`) — i.e., is "scope this down to
   a smaller feature" still the wrong frame, when the honest answer might be "no new feature
   needed at all right now."
2. **Whether part of "performance" is already in flight under a different name**: the
   invite-code RPC throttle (ADR 0009) added a Postgres-side rate limiter and an Upstash
   round trip on the join/invite-preview path, and that work already has a pending
   live-deployment re-verification step on the ROADMAP — but that re-verification is
   currently scoped only to the `x-forwarded-for` trust caveat, not to whether the added
   latency on that path is material. Folding a latency check into an already-scheduled
   re-verification is strictly cheaper than opening new scope for the same question.
3. **Whether there's a risk-based (not just data-based) argument for capacity/throttling
   work now**, independent of measured volume — e.g., "harden before you need it" as a
   defensive bet.

## Where they converged (no open disagreement between pm and product-strategist)

All three pushback points were accepted; pm and product-strategist reached full agreement,
not just a compromise:

1. **This resolves to zero new scope, not reduced scope** — say that plainly rather than
   dressing up "we're not doing much" as a scaled-down feature. No
   `docs/features/performance-scaling/requirements.md`-worthy initiative, no new ROADMAP
   entry beyond what's below. The one concrete action is **bumping the priority of the
   already-planned `vercel-analytics` work**, since it's cheap, already scoped, and is the
   prerequisite for ever scoping performance work with real data instead of guesses.
2. **Fold a latency/load sanity check into ADR 0009's already-pending re-verification**,
   rather than opening a new work item: when `invite-code-rpc-hardening`'s live-deployment
   re-verification happens (currently scoped to the `x-forwarded-for` header-trust
   assumption), its acceptance criteria should also confirm the Postgres-side throttle plus
   the added Upstash round trip haven't introduced a material latency regression on the
   join/invite-code path. Same feature, same session, same agents already assigned to that
   work — no new requirements cycle.
3. **No risk-based case for capacity/throttling work absent a measured growth signal.**
   Nothing currently indicates Splitiful's volume is anywhere near a capacity ceiling, and
   speculative capacity/caching work carries real risk of its own (staleness risk on the
   split total, engineering time diverted from the security/compliance items the vision
   already sequenced ahead of this). One adjacent axis was flagged, not scoped in: **cost**
   exposure (Vercel invocation volume, Supabase compute tier) is a different concern from
   latency/capacity headroom, and nothing today indicates it's a live problem either — worth
   naming so it isn't silently folded into "performance" later if it does become one.

## Recommended direction

No dedicated performance/scaling feature or roadmap entry. Concretely:

- Reprioritize (don't rescope) `vercel-analytics` — move it up in sequencing so Web Vitals
  and traffic data actually exist before any future performance conversation, this one or
  the next.
- Add "confirm no material latency regression on the join/invite-code path" to the
  acceptance criteria of `invite-code-rpc-hardening`'s already-pending live-deployment
  re-verification (docs/ROADMAP.md, "In progress"). No new pipeline stage needed for this —
  it's an addition to work already in flight.
- Do not start any DB/RLS audit, caching, pooling, or read-replica work now. Revisit only if
  the analytics baseline (once shipped) or an actual observed cost/capacity incident
  surfaces a concrete, named problem — at which point it re-enters planning as a narrow,
  evidence-backed feature the way `ssr-trip-pages` was, not as a general "performance"
  initiative.

## Open questions for the user

These are the judgment calls the planning stage doesn't get to resolve on its own:

1. **Is this a felt problem or a speculative one?** Is something actually slow today, or has
   a capacity incident happened — or is this forward-looking ("we expect growth and want to
   be ready")? The recommended direction above assumes no current incident; if you *do* have
   latency complaints, a traffic spike, or a specific slow screen in mind, name it and this
   gets rescoped as a targeted fix (pm's option B/C) instead of "no new scope."
2. **Do you have any volume/growth data or a target** (current users, expected growth curve,
   a concrete concurrency number) that would justify capacity work (pm's option D) ahead of
   having measured need? Absent that, the group recommends waiting.
3. **Are you comfortable with "zero new scope, reprioritize what's already planned" as the
   answer** to a request that was framed as wanting active performance work? If not — if you
   want visible progress on this even without a measured problem — say so and the group will
   scope a bounded, low-risk option (most likely pm's option C, a DB query/index and
   RLS-overhead audit on hot-path RPCs, tested against live Postgres per the migration 0013
   lesson) rather than nothing.
4. **Priority relative to the security/compliance items already ahead of this in
   `docs/v2-vision.md`'s sequencing** (the 2026-09-17 audit's remaining items) and
   `expense delete`: does anything about "serve higher volume" change your view that those
   should still go first? The group's default assumption is no.
5. **Cost, as a separate axis from latency**: do you want cost/infra efficiency (Vercel
   invocation volume, Supabase compute tier) tracked as its own future concern, or is that
   out of scope entirely for now? Nothing today indicates it's a live problem, but it's easy
   to conflate with "performance" later if it isn't named explicitly now.
