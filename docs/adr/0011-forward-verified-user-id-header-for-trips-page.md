# 0011. Forward proxy.ts's verified user id to /trips via a trusted request header

Status: proposed — contingent on Phase 1 baseline data from `performance-scaling`;
not executed by this ADR alone. See "Decision" below for the trigger condition.
Date: 2026-09-20

## Context

[ADR 0005](0005-ssr-page-conversion-pattern.md) accepted, as a known and deliberate
tradeoff, that `/trips` pays **two** sequential Supabase-Auth-server round trips per
request: one inside `src/proxy.ts`'s session-existence gate (`SESSION_REQUIRED_PATTERNS`
matches `/trips`), and a second, independent `supabase.auth.getUser()` call inside
`src/app/trips/page.tsx` itself, needed to obtain `currentUserId` for `getMyTrips`.
ADR 0005 explicitly declined to eliminate the second call in that pass, flagging it as
"worth revisiting... if this shows up as a real cost later" and noting the fix "needs
its own requirements/architecture pass since it touches `proxy.ts`."

`docs/features/performance-scaling/requirements.md`'s Phase 1 baseline is exactly the
trigger ADR 0005 named: a documented, per-call latency measurement for `/trips`, taken
from real traffic. This ADR exists so that if Phase 1 finds this specific chain
material, the fix doesn't have to be re-derived from scratch, and so the (real) trust-
boundary tradeoff it involves is recorded and reviewable before anyone builds it.

**Not applicable to `/trip/[id]`**: as of the simplified-onboarding feature, `proxy.ts`
no longer gates `/trip/[id]*` at all (see `docs/ARCHITECTURE.md`'s auth-model section),
so that page already makes only one `getUser()` call. This ADR is `/trips`-only.

## Decision

**Conditional — do this only if both hold:**
1. Phase 1's baseline shows `/trips`' sequential chain (proxy `getUser` → page
   `getUser` → `trips` select → `trip_members`/`expenses` in parallel) is a material
   contributor to `/trips`' p95, and
2. the lower-risk, no-new-trust-boundary Phase 2 fixes already scoped in
   `docs/features/performance-scaling/architecture.md` (parallelizing the page's own
   `getUser()` with the `trips` select) aren't enough on their own to hit the ≥30% p95
   target.

If both hold: have `proxy.ts`, immediately after its own successful `getUser()` call
for a `/trips` request, attach the verified `user.id` as a first-party request header
(e.g. `x-splitiful-verified-user-id`) using the same `NextResponse.next({ request: ...
})` header-mutation primitive it already uses for cookies — **explicitly constructing
that header's value itself and discarding/overwriting any client-supplied value of the
same name first**, never conditionally trusting "the header was already present."
`src/app/trips/page.tsx` reads it via the standard `headers()` API instead of calling
`supabase.auth.getUser()` a second time, falling back to calling `getUser()` itself
if the header is absent (local dev without the middleware path, Supabase env unset,
or any other reason the header didn't arrive) — so the page degrades to today's exact
behavior rather than failing. Exact `headers()`/middleware request-mutation semantics
should be confirmed against `node_modules/next/dist/docs/` at implementation time, per
this repo's existing precedent (ADR 0005 cites the same source for adjacent facts about
this Next.js version).

## Alternatives considered

(Restated from ADR 0005, which already evaluated these for the same question.)

- **Keep both `getUser()` calls (status quo).** Correct default unless Phase 1 shows a
  real cost — see the trigger condition above.
- **Switch the page to `getSession()`/`getClaims()`** to skip the Auth-server round
  trip. Rejected, same reasoning as ADR 0005: `@supabase/auth-js`'s own docs call
  `getSession()` "insecure on the server," and every other server-side call site in
  this codebase follows `getUser()`. Introducing the one exception here risks a future
  change copying it into an actually security-sensitive spot.
- **Header-forwarding from `proxy.ts`** (this ADR's decision). The only option that
  actually removes the round trip rather than just avoiding re-verifying it insecurely.

## Consequences

- Introduces a first-party trust boundary between middleware and page that does not
  exist anywhere else in the codebase today. **This must be live-verified, not just
  code-reviewed**, that a client-supplied header of the same name is never honored —
  only a value `proxy.ts` itself set ever reaches the page — the same discipline
  already applied to the `x-forwarded-for` trust assumption in `src/lib/rate-limit.ts`
  and migration 0013. Recommend routing this specific change through a security-agent
  pass before shipping, independent of the normal engineer/QA cycle, given it changes
  how identity flows into a page rather than just how fast a query runs.
- **Failure mode if this trust boundary is ever broken (spoofed/misforwarded header)**:
  `currentUserId` would resolve to the wrong id, and `getMyTrips` would misattribute a
  trip's `yourNetCents`/membership labeling to the wrong (but still authenticated)
  viewer — a correctness/mislabeling bug, not a new data-exposure vector, since RLS
  still independently scopes which `trips`/`trip_members`/`expenses` rows the
  underlying Supabase calls can return, based on the request's real cookies, regardless
  of what this header claims. Still a real bug worth the live-verification bar above,
  not a hypothetical.
- Does not touch RLS, the invite-code throttle, or split-calculation semantics — this
  is purely about how `currentUserId` is obtained for display purposes on `/trips`.
- If Phase 1 doesn't show this chain as material, this ADR stays `proposed` and
  unexecuted — recorded so ADR 0005's deferred thread isn't rediscovered from scratch
  by a future feature.
