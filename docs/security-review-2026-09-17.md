# Security review — 2026-09-17

Whole-project audit (not tied to a single `docs/features/<slug>/`), focused on
the two recent security-sensitive changes: the simplified-onboarding
anonymous-auth/OTP-linking rework (ADR 0006, migrations 0009–0012) and the
Gmail SMTP → Resend email switch. Scope: `src/app/api/`, all migrations under
`supabase/migrations/`, `docs/ARCHITECTURE.md`'s stated auth model vs. actual
RLS/RPC code, secret handling, and email templating.

`npm audit` — 0 vulnerabilities. No service-role key found anywhere under
`src/`; all Supabase access from client-reachable code paths uses the anon/
publishable key, consistent with the RLS-first design in
`docs/ARCHITECTURE.md`.

## Blocking

### 1. Invite codes are low-entropy and every invite RPC is unthrottled — brute-forceable trip discovery and unauthorized join

- `supabase/migrations/0001_init.sql:14` — `invite_code text not null unique default substr(md5(random()::text), 1, 8)`. This yields at most 32 bits of keyspace (8 hex chars), and in practice less, since it's derived from a single Postgres `random()` call rather than a CSPRNG.
- `supabase/migrations/0002_fix_function_grants.sql:8-9` / `0003_fix_function_grants_anon.sql:12-13` — `get_trip_by_invite_code(text)` is explicitly granted to `anon` (by design, for the unauthenticated invite preview) with **no argument validation, no attempt counter, no lockout**.
- `join_trip` (`supabase/migrations/0010_gate_join_and_placeholder_mutations.sql:31-53`) is reachable by any non-anonymous `authenticated` session — trivially obtained via `supabase.auth.signInAnonymously()` + a disposable-email OTP round trip, both client-callable with the public anon key.
- No rate limiting exists anywhere in the app: `src/proxy.ts` only checks session *existence* for `/trips`, and does nothing for API routes or RPC calls; there is no middleware, no Vercel `vercel.json` rate-limit config, and no rate-limit library in `package.json`. Grepped for `rate*limit` — nothing found.

**Attack scenario**: an attacker with only the public anon key (baked into every client bundle by design) scripts repeated calls to `POST /rest/v1/rpc/get_trip_by_invite_code` with random 8-hex-character strings. This is a birthday-style search — the attacker doesn't need a *specific* trip, any hit is a win — so the expected number of requests to find a live trip is `keyspace / (number of live trips)`, not the full 2^32. Once a code is found, the attacker immediately gets that trip's name/dates/location/organizer name with zero auth (`get_trip_by_invite_code`), and can go further: sign in anonymously, verify a throwaway email via OTP (no CAPTCHA/anti-automation anywhere in this flow), then call `join_trip` with the discovered code to become a real `trip_members` row — gaining full read access to every member's name and every expense line item, and write access to add/edit/delete expenses on a trip that isn't theirs. None of this requires bypassing RLS; it's all through the intended public API with a guessable secret and no throttle.

**Fix direction** (not prescriptive, but the gap to close): lengthen/strengthen `invite_code` (e.g. a proper CSPRNG-backed value with materially more entropy) and add rate limiting in front of `get_trip_by_invite_code`, `get_trip_summary`, and `join_trip` — at the very least a per-IP/per-session throttle, ideally enforced at the edge (Vercel) or via a Postgres-side attempt counter, since none exists today at any layer this repo controls.

## Should-fix

### 2. `get_trip_summary` now returns the invite code from just a trip UUID, collapsing the "view-only link" vs. "join credential" distinction

- `supabase/migrations/0012_add_invite_code_to_trip_summary.sql:22-61` — `get_trip_summary(_trip_id uuid)` is public (`grant ... to anon, authenticated`) and, as of this migration, its return row includes `invite_code`, looked up straight from `public.trips` with no membership check.
- Before this migration, knowing a trip's UUID (e.g. from a bookmarked `/trip/<uuid>` link, or the `tripUrl` embedded in the "trip created/joined" confirmation emails sent by `src/lib/email.ts`) only exposed the aggregated summary (names + paid/share amounts — already sensitive, but read-only and already an accepted/documented tradeoff per `docs/ARCHITECTURE.md`'s three-tier model). After this migration, the same zero-auth call also hands back the credential needed to *join* the trip.
- The migration's own comment (`0012_add_invite_code_to_trip_summary.sql:13-15`) reasons "invite_code is not new exposure ... already exposed in the reverse direction by `get_trip_by_invite_code`" — but that reasoning only holds if the two identifiers (trip UUID and invite code) are equally hard to obtain. They aren't: the trip UUID is the one that ends up in the browser URL bar and in emails sent to the trip's own members, i.e., the one much more likely to be casually forwarded/screenshotted/leaked via Referer headers than the invite code, which the product otherwise treats as the actual "who's allowed to join" gate.

**Attack scenario**: an organizer shares their trip's `/trip/<uuid>` link with someone casually (e.g. "here's the trip page, just to see the total"), reasonably expecting that link to be read-only per the documented public-summary tier. That recipient can now call `get_trip_summary` themselves, extract `invite_code` from the response, verify their own throwaway email via the existing OTP flow, and call `join_trip` — becoming a full member with expense-editing rights, despite never having been actually invited.

Rate-limiting fix #1 mitigates the blind-brute-force angle on this too, but doesn't address the design collapse itself — recommend reconsidering whether `get_trip_summary` should return `invite_code` at all, or whether the `/trip/<uuid>` → "see full details" flow should be re-solved a different way (e.g., a distinct, separately-rotatable "preview" token that isn't also the join credential).

### 3. Open redirect via `next`/`back` on `/check-email`

- `src/app/check-email/page.tsx:45-46` reads `next`/`back` straight from `useSearchParams()` with no validation that they're relative, in-app paths.
- `src/app/check-email/page.tsx:110` — `router.push(next)` is called unconditionally on successful OTP confirmation.

**Scenario**: a crafted link to the real domain, `https://<app>/check-email?next=https://attacker-lookalike.tld/...`, sent to a victim. The victim completes a completely legitimate OTP sign-in (real email, real code from the real app), and is then navigated to the attacker's URL immediately after — a classic post-auth open-redirect phishing setup that benefits from the victim's justified trust in having just authenticated on the real site. Validate `next`/`back` are same-origin relative paths (e.g. reject anything containing `://` or not starting with `/`) before navigating.

### 4. Anonymous-to-permanent linking behavior is explicitly unverified against a live Supabase project

- `docs/adr/0006-anonymous-auth-and-otp-linking-for-onboarding.md`'s Decision 3 and `src/lib/use-otp-flow.ts:139-146` both flag, in the team's own words, that `updateUser({ email }) + verifyOtp({ type: "email_change" })` preserving `auth.uid()` (rather than issuing a new identity, or behaving unexpectedly when the email already belongs to an existing permanent account) has **not been exercised against a real Supabase instance**.
- This isn't something I can verify further from static review (no staging project reachable from this environment), but it's load-bearing for every RLS ownership check added in migration `0009_simplified_onboarding.sql` (`is_verified_trip_member`, `is_owner_or_verified_member` both assume `auth.uid()` is stable across linking). If it doesn't hold as documented, an organizer could silently lose ownership of their own trip partway through verification, or (worse, if Supabase's linking behaves permissively toward already-registered emails) two different sessions could end up contending for the same identity.

**Recommendation**: this should be confirmed against a real (non-prod) Supabase project before or immediately after this ships, exactly as the ADR itself calls for — flagging here so it isn't lost as a "someday" item.

### 5. Receipt storage RLS wasn't updated for the three-tier verification model

- `supabase/migrations/0001_init.sql:203-212` — the `storage.objects` policies for the `receipts` bucket still use bare `is_trip_member(...)`, unchanged since before migration `0009_simplified_onboarding.sql` introduced `is_verified_trip_member`/`is_owner_or_verified_member`.
- Because `create_trip` inserts the organizer into `trip_members` immediately (even while their session is still anonymous/unverified), `is_trip_member` is `true` for an unverified organizer — meaning they can upload/read receipt photos to their own trip's storage folder before ever completing OTP verification, even though `docs/ARCHITECTURE.md` states writes require the verified tier.
- Impact is limited (scoped to the organizer's own trip; no cross-member exposure), but it's a real inconsistency with the documented rule and worth closing for consistency, and because a future feature that reads receipts might reasonably assume the tier-3 write gate already covers this path.

### 6. Trip name is unescaped in the email subject line, with no length/character validation anywhere

- `src/lib/email.ts:36-37` — `subject = ... "Your trip \"${input.tripName}\" is ready" ...` uses the raw, un-escaped `input.tripName` (the HTML body correctly escapes it via `escapeHtml` at line 34, but the subject does not use that escaped value).
- `trips.name` (`supabase/migrations/0001_init.sql:9`) is `text not null` with no length cap or character check, and no server-side validation exists in `create_trip` (`supabase/migrations/0001_init.sql:135-154`) or `createTrip` (`src/lib/data/trips.ts:10-25`).
- Low real-world exploitability since Resend's HTTP API (not raw SMTP) likely doesn't allow literal CRLF header injection the way a hand-rolled SMTP client would, and the recipient is always the caller's own account email — but there's no defense-in-depth here (no newline stripping, no length cap), and it costs little to add.

## Notes

- `src/app/api/join/route.ts:14` and `src/app/api/trip-email/route.ts:42` build the email's `tripUrl` from `new URL(request.url).origin` (i.e., derived from the request's Host header) rather than a fixed, env-configured canonical origin. Impact is minimal today since the email always goes to the caller's own address (self-phishing at worst), but a configured `NEXT_PUBLIC_SITE_URL`-style constant would be more robust than trusting the inbound Host on every request.
- `src/app/api/join/route.ts:20-23` returns RPC error text (`e.message`) with an HTTP 500 for what are really client-input errors (e.g. "invalid invite code" should be a 400, not a 500). Not a vulnerability today since the message is already a deliberately generic string the RPC raises, but relying on RPC error text verbatim in a client-facing response is worth tightening before those messages might someday become more detailed.
- Dependencies are current and `npm audit` is clean (`resend@^6.28.1`, `@supabase/supabase-js@^2.116.0`, `@supabase/ssr@^0.12.7`, `next@16.3.4`) — no action needed here.
- No `NEXT_PUBLIC_`-exposed secrets found; `RESEND_API_KEY` is only read in `src/lib/email.ts`, a server-only module invoked exclusively from `src/app/api/*` route handlers. Good.
- No string-built/concatenated SQL anywhere in the migrations — all RPCs use parameterized `plpgsql`/`sql` functions. Good.

## Summary for the pipeline

**One blocking finding**: invite codes (`supabase/migrations/0001_init.sql:14`) are low-entropy and every RPC that consumes them (`get_trip_by_invite_code`, `join_trip`, and now indirectly `get_trip_summary` via migration 0012) is completely unthrottled anywhere in the stack (`src/proxy.ts` and the rest of `src/` have no rate limiting at all). This is exploitable today, live, by an unauthenticated script — it should loop back to the engineer before this ships further. The should-fix items (#2 the invite-code-via-summary design collapse, #3 the open redirect) compound the same underlying weakness and are worth fixing in the same pass even though they're not, on their own, blocking.
