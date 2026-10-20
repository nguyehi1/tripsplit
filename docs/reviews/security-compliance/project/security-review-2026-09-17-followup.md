# Security follow-up review — 2026-09-17

Re-verifying the fix for the blocking finding in `docs/reviews/security-compliance/project/security-review-2026-09-17.md`
("Invite codes are low-entropy and every RPC that consumes them is completely
unthrottled"). Scope: the uncommitted diff only (`git diff` at time of review —
`src/app/api/trip-invite/[code]/route.ts`, `src/lib/rate-limit.ts`,
`src/app/api/join/route.ts`, `src/app/join/[code]/page.tsx`,
`src/lib/data/trips.ts`, `package.json`, `.env.local.example`). Everything the
task marked out of scope (invite-code length/format itself, receipt-storage
RLS, `get_trip_summary` leaking `invite_code`, the `/check-email` open
redirect, ADR-0006 linking) is **not** re-litigated here.

## Blocking

### 1. The fix gates the app's own frontend, not the vulnerable RPCs themselves — the original brute-force/unauthorized-join path is still fully open via direct Supabase calls

- `supabase/migrations/0001_init.sql:131` and `0002_fix_function_grants.sql:9`
  — `get_trip_by_invite_code(text)` is still `grant`ed to `anon` and was
  **not touched** by this diff (confirmed: `git diff` touches no
  `supabase/migrations/*` files).
- **Verified live**, not inferred: calling Supabase's own PostgREST endpoint
  directly with the project's public key —
  ```
  POST https://<project>.supabase.co/rest/v1/rpc/get_trip_by_invite_code
  {"_code":"aaaaaaaa"}
  ```
  — returns `HTTP 200 []` (empty match), i.e. the exact same unauthenticated,
  ungated, guessable RPC call the original report described, working
  identically today. This completely bypasses `src/app/api/trip-invite/[code]/route.ts`
  and `src/lib/rate-limit.ts` — neither is in the request path at all when Supabase
  is called directly, because they're Next.js/Vercel constructs that only apply
  to traffic that goes through *this app's own* `/api/*` routes.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` are
  public by design (`NEXT_PUBLIC_*`, shipped in every page's JS bundle) — an
  attacker doesn't need to inspect this repo to get them, just the browser
  Network tab on `splitiful.app`. Nothing about "route it through our own
  `/api` handler first" stops a scripted attacker from skipping
  `splitiful.app` entirely and talking to `<project>.supabase.co`
  directly, at whatever rate they like.
- The same architectural gap applies to `join_trip`: it's `grant`ed to
  `authenticated` (`0002_fix_function_grants.sql:15`, reaffirmed
  `0010_gate_join_and_placeholder_mutations.sql:53`), and `authenticated`
  status is obtainable directly against Supabase's Auth API via
  `supabase.auth.signInAnonymously()` — a real, actively used flow in this
  app (`src/lib/use-otp-flow.ts:88`, `src/app/trip/new/page.tsx:71`) — again
  with zero dependency on `splitiful.app`'s own frontend/API. I did not
  execute this end-to-end against the live project to avoid creating
  persistent anonymous-user/trip-membership rows in what appears to be a
  real, shared Supabase project, but the grant/architecture is identical to
  the `get_trip_by_invite_code` case I did verify live, and the original
  report's own attack narrative (anon sign-in + OTP, both client-callable
  with the public key, "trivially obtained") already established this path
  works without needing this app's `/api/join` at all.

**Why this matters concretely**: the task's check #1 ("is the browser-direct
guessing path actually closed?") is satisfied in the narrow sense that
`src/app/join/[code]/page.tsx` no longer calls
`supabase.rpc("get_trip_by_invite_code", ...)` — grepped, confirmed, only
reference left is a code comment. But that was never the only door. The
actual vulnerable surface named in the original report — the RPCs themselves,
callable by anyone with the public anon/publishable key — is untouched. This
fix adds a second, better-behaved front door (rate-limited) while leaving the
original front door (Supabase's own REST/RPC endpoint, ungated) wide open and
fully load-bearing, since it's what the client SDK talks to for every other
feature in the app and can't be revoked wholesale. **The original blocking
finding is not resolved**: a script targeting
`POST https://<project>.supabase.co/rest/v1/rpc/get_trip_by_invite_code`
directly today gets exactly the same unthrottled trip-discovery oracle it did
before this diff, with no code changes required to route around the fix —
just don't call `splitiful.app` at all.

**What would actually close this**: either (a) revoke `anon`'s (and, for
`join_trip`, `authenticated`'s) direct execute grant on these RPCs and have
them invoked only from server-side code using a privileged/service-role path
that the public key can't reach — making the Next.js route genuinely the only
door — or (b) implement the throttle inside Postgres itself (e.g. a
table-backed per-code/per-identity attempt counter enforced inside the
`plpgsql` function, as the original report's "fix direction" suggested as an
alternative to edge-based limiting), since that's the one layer every call
path — app-routed or direct — actually passes through. A Vercel-edge-only
rate limiter structurally cannot cover a publicly-callable Postgres RPC.

## Should-fix

### 2. Even ignoring finding #1, 10 req/60s/IP does not make brute force "impractical" against this keyspace — it only forces trivial IP rotation

- `invite_code` keyspace is unchanged (out of scope here, per the task, but
  the math is needed to judge whether the *rate limit* is meaningful): 8 hex
  chars from `substr(md5(random()::text), 1, 8)` ≈ 32 bits, and this is a
  birthday-style search (any live trip is a win, not a specific one), so
  expected requests to find a hit is `keyspace / live_trip_count`, not 2^32.
- 10 requests/60s per IP, applied only on the path that goes through this
  app's own route (see finding #1 for why that's already a partial mitigation
  at best), caps a *single, header-honest, non-rotating* IP at 14,400
  requests/day. That is "slower," not "impractical," against a keyspace where
  even a few hundred live trips puts the birthday-search expectation well
  within that budget over a few days — and rotating source IP is one of the
  cheapest things to do at scripting scale (residential/mobile proxy pools,
  serverless-function fan-out, or literally retrying from N cheap VPS
  instances). The design does nothing to raise the cost of IP rotation itself
  (no CAPTCHA, no per-account/session-independent signal, no anomaly
  detection across IPs hitting the same route in a burst).
- Combined with finding #1, this is somewhat moot for the actual worst-case
  path (direct-to-Supabase has no rate limit of any kind), but it's worth
  stating plainly so "we added rate limiting" isn't read as "brute force is
  now impractical" even for the path it does cover.

### 3. `clientIp()`'s trust assumption in `src/lib/rate-limit.ts:54-64` is asserted, not verified — and I could not verify it either

- The comment claims Vercel's edge reliably sets `x-forwarded-for` such that
  it "can't be spoofed by the caller once it's behind Vercel," and the code
  takes `forwardedFor?.split(",")[0]` as the trusted client IP.
- I attempted to verify this against the live deployment
  (`https://www.splitiful.app`) by sending a forged `X-Forwarded-For` header
  to what would be the new route, but **this diff is not yet deployed to
  production** — `curl https://www.splitiful.app/api/trip-invite/<code>`
  returns the site's generic Next.js `404` with `x-matched-path: /404`,
  confirming the currently-live build predates this change. I could not
  safely substitute a proxy for this verification without the actual route
  live.
- I could not confirm from here whether Vercel's edge *overwrites* an
  inbound client-supplied `X-Forwarded-For` value (which would make the
  code's assumption correct) or *appends* the true IP to the end of
  whatever the client already sent (which would make `.split(",")[0]`
  return the attacker-controlled value, letting a caller land in a fresh
  bucket every request just by sending a random fake first hop — no proxy
  infrastructure needed at all, cheaper even than #2's IP-rotation concern).
  This is genuinely load-bearing for whether the rate limiter does anything
  at all against a non-naive attacker, and it's currently sitting on an
  unverified assumption in a comment.
- Recommend either: confirming this explicitly (Vercel's own docs/support,
  or empirically once deployed: send a distinct forged `X-Forwarded-For` on
  every request and confirm the limiter still triggers after N requests), or
  side-stepping the question entirely by using `@vercel/functions`'
  `ipAddress()` helper (Vercel's own maintained, documented-safe accessor —
  `@vercel/analytics`/`@vercel/speed-insights` are already dependencies, so
  this is a small, natural addition) instead of hand-parsing the header.
- Separately, the `"unknown"` fallback bucket (`rate-limit.ts:63`) means any
  request Vercel ever forwards without the header shares one global bucket
  across every caller. On Vercel this should be rare-to-never for genuine
  traffic, but there's no logging/alerting if it's hit, so a platform change
  or edge case here would fail silently into either a shared-bucket DoS
  (legitimate users start seeing 429s from each other) or, if it's ever
  externally reachable, a bypass. Worth a log line at minimum.

## Notes

- Fail-closed logic (`src/lib/rate-limit.ts:26-33`, `80-85`) is sound as
  written: `redis` is `null` whenever the Upstash env vars are unset, and
  `enforceRateLimit` returns a `503` for every call in that state when
  `NODE_ENV === "production"`, with no path that falls through to `null`
  (pass-through) in production. `NODE_ENV` is reliably `"production"` for
  both Vercel Production and Preview deployments (`next build` sets it
  regardless of `VERCEL_ENV`), so this check gates what it claims to. I
  can't verify from this repo that the Upstash env vars are actually
  present in Vercel's *dashboard* project settings (as opposed to
  `.env.local`, which I did confirm has real-looking values) — worth a
  quick manual check in Vercel's project settings for both Production and
  Preview environments before relying on this.
- `npm audit` — 0 vulnerabilities with `@upstash/ratelimit@^2.1.0` and
  `@upstash/redis@^1.38.4` added. Both are official, actively maintained
  Upstash packages; no concern.
- `/api/trip-invite/[code]/route.ts` doesn't leak more than the RPC already
  did on an invalid code (generic `404`, matching the prior client-side
  "not found" behavior) and doesn't introduce an obvious timing
  side-channel beyond what already existed.
- One line for the compliance side, not mine to size: this fix introduces a
  new place unauthenticated callers' IP addresses are persisted (Upstash
  Redis, as rate-limit keys prefixed `splitiful:ratelimit:*`, per
  `src/lib/rate-limit.ts:47`) — a new third-party data processor and a new
  category of stored PII (IP address) that didn't exist before this diff,
  worth a retention/DPA check.

## Summary for the pipeline

**Does not resolve the original blocking finding.** The diff closes the
narrow "does `/join/[code]`'s own page still call the RPC from the browser"
gap, but the substantive vulnerability — `get_trip_by_invite_code` (and, by
the same architecture, `join_trip`) being callable directly against
Supabase's own public REST/RPC and Auth endpoints with no throttle — is
untouched and **verified live** to still work exactly as before
(`POST .../rest/v1/rpc/get_trip_by_invite_code` → `200`, no rate limit,
straight past both new routes). A rate limiter placed only in front of this
app's own `/api/*` handlers cannot, by construction, protect a Postgres RPC
that's independently reachable with the public anon/publishable key. This
should loop back to the engineer: either revoke the public grants on these
RPCs and force all access through a server-only path, or push the throttle
into Postgres itself, before this is considered closed. The `x-forwarded-for`
trust assumption (finding #3) is a second, independent question worth
resolving before relying on the limiter even for the traffic it does cover,
and should be re-verified once the route is actually deployed.
