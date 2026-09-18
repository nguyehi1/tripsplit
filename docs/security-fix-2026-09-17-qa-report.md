# QA report — security fix for docs/security-review-2026-09-17.md finding #1

**Scope**: standalone security fix (no `docs/features/<slug>/`), verifying the engineer's
uncommitted changes: `src/app/api/trip-invite/[code]/route.ts`, `src/lib/rate-limit.ts`, and the
edits to `src/app/api/join/route.ts`, `src/app/join/[code]/page.tsx`, `src/lib/data/trips.ts`.

**Verdict: FAIL — the fix does not close the blocking gap.** It adds real, working, correctly-
tested rate limiting in front of the *app's own* two call sites, but the underlying Postgres RPCs
(`get_trip_by_invite_code`, `join_trip`) are still directly, unauthenticatedly, and completely
unthrottled-ly callable via Supabase's PostgREST endpoint with nothing but the public anon key —
which is exactly the attack the security review describes, and it is empirically still open today
(see "4. Does the fix close the reported gap?" below). Items 1–3 below all pass; item 4 fails and
should gate this back to the engineer.

## 1. Functional correctness of the new route — PASS

Wrote `src/app/api/trip-invite/[code]/route.test.ts` (6 tests, follows the
`src/app/api/join/route.test.ts` pattern: mocks `getTripByInviteCode`, `enforceRateLimit`,
`createClient`):

- Valid code → 200 with the exact `InviteInfo` shape (`tripId`, `name`, `location`, `startsOn`,
  `endsOn`, `isCompleted`, `organizerName`).
- Unknown code (`getTripByInviteCode` resolves `null`) → 404.
- Empty/missing `code` param → 400, `getTripByInviteCode` never called.
- `getTripByInviteCode` throwing (e.g. malformed input rejected by the RPC) → 500 with a generic
  message, error logged server-side.
- `enforceRateLimit` returning a response → that response is returned verbatim and
  `getTripByInviteCode` is never called (rate limiting short-circuits before the DB call).
- `enforceRateLimit` is called with the right `{ key: "trip-invite-lookup", limit: 10,
  windowSeconds: 60 }`.

Also wrote `src/app/join/[code]/page.qa.test.tsx` (8 tests, React-DOM-direct render, following the
`src/app/check-email/page.auth-branching.qa.test.tsx` pattern) to verify the page correctly
consumes the new route instead of Supabase directly:

- Loading state shown before the fetch resolves.
- Success: renders the trip summary, calls `fetch("/api/trip-invite/<code>")` (not
  `supabase.rpc`), and passes the returned `tripId` into `getTripSummary`.
- 404 → "This invite link doesn't match a trip anymore." with **no** retry button (dead-end,
  matches intent — a bad code won't become good on retry).
- 429 and 503 → "Too many attempts — wait a moment and try again." with a retry button.
- Network/other 5xx failure → generic error with a retry button; clicking retry re-fetches and
  recovers (`reloadKey` bump works).
- `?error=join` query param still surfaces the join-failure banner alongside a successfully
  loaded summary (this is unrelated to the invite-lookup fetch and confirms it wasn't broken by
  the rework).

All 14 of these tests pass. (Minor, non-blocking: this new page test file emits some benign
React "not wrapped in act(...)" console warnings on a few of its cases — a test-harness timing
artifact from manually driving `react-dom/client` without React Testing Library, not a page bug;
every assertion passes deterministically across repeated runs.)

## 2. Rate-limit behavior — PASS

`src/lib/rate-limit.test.ts` exercises the **real** Upstash-backed sliding window (credentials
loaded from `.env.local`, confirmed present and used — vitest does not auto-load `.env.local` into
`process.env`, so the test parses it manually and asserts credentials are actually there rather
than silently falling back to the skip path):

- Allows exactly `limit` requests, then the next request returns 429 with a `Retry-After` header
  that's a positive integer ≤ the window length; a further request in the same window is still
  429. (Verified against real Upstash, not mocked.)
- Rate limiting is keyed per-IP: a second, distinct IP under the same `key`/limit is *not* blocked
  by the first IP's exhausted bucket.
- Rate limiting is keyed per rate-limit `key`: the same IP under a different feature `key` has its
  own independent bucket (so `trip-invite-lookup` and `join-trip` don't share/interfere).
- Fail-closed: with no Upstash credentials and `NODE_ENV=production`, returns 503.
- Skip-with-warning: with no Upstash credentials and non-production `NODE_ENV`, returns `null`
  (doesn't block).

All 5 pass against the live Upstash instance, and the full suite was run twice in a row with no
flakiness (unique per-test keys avoid cross-run bucket collisions).

## 3. Regression check — PASS

- `src/app/api/join/route.ts`: existing `src/app/api/join/route.test.ts` (9 tests) still passes
  unmodified — the new `enforceRateLimit` call doesn't change any of its existing behavior in
  tests (it hits the "no credentials in this env → skip" branch there, same as before this fix,
  since vitest doesn't load `.env.local`).
- `src/lib/data/trips.ts`: the new exported `InviteInfo` type is consumed only by
  `src/app/join/[code]/page.tsx` and (implicitly, via return shape) the new route — grepped for
  all consumers, no other call sites to regress.
- `src/app/join/[code]/page.tsx`: covered in section 1 above — loading/success/error/retry states
  all behave correctly post-rework.
- No new DB migration was added by this fix (confirmed via `git status`/`ls supabase/migrations`),
  so there's nothing to check for migration reversibility here.
- Full suite: `npm test` → **173/173 passed, 25 files** (run twice for stability, both green).
- `npm run lint` → **clean**, no errors/warnings.
- `npm run typecheck` → **clean** (one issue found and fixed in my own test file — Next.js types
  `NODE_ENV` as `readonly`; worked around with a locally-typed mutable view rather than loosening
  anything in application code).

## 4. Does the fix actually close the reported gap? — **FAIL**

`src/app/join/[code]/page.tsx` no longer imports or calls `supabase.rpc("get_trip_by_invite_code",
...)` — confirmed by grep; that specific call site is genuinely gone, replaced by
`fetch("/api/trip-invite/<code>")`. **But that was never the actual vulnerability.** The security
review's attack scenario is explicit: *"an attacker with only the public anon key... scripts
repeated calls to `POST /rest/v1/rpc/get_trip_by_invite_code`"* — i.e., hitting Supabase's
PostgREST endpoint directly, not going through the Splitiful web app at all. Rate-limiting the
app's own Next.js route does nothing to stop that, because a script bypassing the app entirely
never touches `enforceRateLimit`.

I confirmed both halves of this empirically/statically:

- **The grants are unchanged.** `supabase/migrations/0002_fix_function_grants.sql:9` still grants
  `execute on function public.get_trip_by_invite_code(text) to anon, authenticated` and
  `0010_gate_join_and_placeholder_mutations.sql:53` still grants `join_trip(text, text) to
  authenticated`. No migration in this fix revokes or narrows either grant.
- **It's still live and unthrottled.** I sent 15 back-to-back direct `POST` requests to
  `<SUPABASE_URL>/rest/v1/rpc/get_trip_by_invite_code` using only the public anon key from
  `.env.local` (the same key that ships in every client bundle) and random 8-char codes — all 15
  returned `200` with no throttling of any kind. This is the exact same birthday-attack surface
  described as "Blocking" in the security review, completely unaffected by this fix. `join_trip`
  is one step of friction higher (needs an authenticated, even anonymous, session) but is grantwise
  identical and I'd expect the same result; I didn't execute it directly against the live project
  to avoid mutating real `trip_members` rows.
- Invite-code entropy is also unchanged (`supabase/migrations/0001_init.sql:14`, still
  `substr(md5(random()::text), 1, 8)`), so the keyspace this attack searches is exactly as small as
  before.

**What this fix actually achieves**: it's a real, correctly-implemented improvement for traffic
that goes through the app's own UI — a user mashing the join-trip page in a browser, or a
same-origin script hitting `/api/trip-invite/[code]`/`/api/join`, now genuinely gets throttled.
That's not nothing. But it does not mitigate the specific "blocking" finding from the security
review, which is about direct-to-Supabase requests that never touch this app's server at all. The
review's own "Fix direction" called for exactly this gap: *"add rate limiting in front of
`get_trip_by_invite_code`... and `join_trip`... ideally enforced at the edge (Vercel) or via a
Postgres-side attempt counter, since none exists today at any layer this repo controls"* — the
Postgres/PostgREST layer specifically remains uncovered by this fix.

**Recommendation back to the engineer**: this needs one of (or both, per the review's original
suggestion) — (a) a Postgres-side throttle/lockout on these two RPCs (e.g. an attempt-counter
table checked inside the `plpgsql` function itself, so it applies regardless of which HTTP surface
the caller uses), or (b) revoke the direct `anon`/`authenticated` grants on
`get_trip_by_invite_code`/`join_trip` and route all access exclusively through the new Next.js
routes using a privileged (service-role) server-side Supabase client that isn't reachable from the
browser — at which point this app-layer rate limiting would actually be the only door. Simply
adding a nicer app-layer route in front of a still-directly-callable RPC leaves the original attack
fully intact.

**Corroboration**: `docs/security-review-2026-09-17-followup.md` (a security-agent re-review that
appeared in the working tree alongside this QA pass, independently arrived at the same
conclusion) verified the identical live `200`-with-no-throttle result against the same RPC and
flags this as its own "Blocking" finding #1, in the same terms. Two independent checks landing on
the same live-verified result should remove any doubt this is a real, currently-open gap.

That follow-up review also raises a point worth folding into this report's section 2: `clientIp()`
in `src/lib/rate-limit.ts` trusts the first value in `x-forwarded-for` as unspoofable, but that's
asserted in a comment, not verified against this app's actual Vercel deployment. My rate-limit
tests (section 2) prove `enforceRateLimit`'s sliding-window logic itself is correct given a
specific IP value — they do not prove that value can't be attacker-chosen in production. If
Vercel appends the true client IP after a client-supplied `x-forwarded-for` value (rather than
overwriting it), `clientIp()`'s `.split(",")[0]` would return the attacker's own forged first hop,
letting a script land in a fresh rate-limit bucket on every single request for free — no proxy
rotation needed. This should be confirmed against the real deployment before relying on this
limiter's per-IP keying even for the traffic path it does cover.

## Files touched by this QA pass

- `src/app/api/trip-invite/[code]/route.test.ts` (new)
- `src/lib/rate-limit.test.ts` (new)
- `src/app/join/[code]/page.qa.test.tsx` (new)
- `docs/security-fix-2026-09-17-qa-report.md` (this report)

No implementation files were modified.
