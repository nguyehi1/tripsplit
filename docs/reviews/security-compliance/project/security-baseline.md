# Security baseline

Standing rules every feature is designed against **from the start**. The
planning, pm, architect and ux-designer agents read this before they work; the
`security` agent reviews against it at three points (requirements, design,
final code).

**Maintenance rule:** when any security review finds something late (after
requirements were approved), or a vulnerability is found in production, the
same PR adds the rule that would have caught it to this file. See
`.claude/skills/feature/SKILL.md`, "Feedback loop".

## Access control

- Every route handler and server action verifies the session server-side.
  Never trust a client-supplied user id or trip id; check the caller belongs
  to the trip.
- Every table has RLS enabled, with policies matching the real access rule
  (members see only their trips' rows). The service-role key is never
  reachable from a client path.
- Add a column CHECK, not only RPC validation, when a direct-write RLS policy
  exists (anonymous sessions use the `authenticated` role).
- Pending-action replay after an auth gate: closed-set identifier only, memory
  by default, bound to the tapping user id and a short TTL, cleared on
  use/unmount/sign-out, re-authorized server-side and re-validated against
  current data; never in URLs or logs. Storage needs its own review.
- The trip invite/join link is a bearer secret. New features must not expose
  it to non-members, log it, or put it in analytics.
- A column that drives a lifecycle or irreversible action (a hide mark, a
  status, an erase timestamp) must not be writable through the direct-write
  path: revoke table-level UPDATE and grant UPDATE only on the columns clients
  may change (column-level grants), or write it only from a definer function.
  A policy `with check` alone is not enough. Test as the `authenticated` role,
  including an anonymous session and a back-dated value.
- Hard delete of a record is reachable only through a reviewed definer path:
  drop the DELETE policy **and** revoke the DELETE privilege from anon and
  authenticated. Do not gate it with a BEFORE DELETE trigger when cascades and
  account purges must keep working; test those still work.
- Hiding a row (soft delete, hide mark) is enforced in the table's read
  policy, not by adding a filter to each query, so a missed query fails closed.
  Any definer function or view that reads the table bypasses RLS and must
  filter the mark itself. A static guard test fails when a new, unreviewed
  query or migration touches that table.

## Public and unauthenticated surface

- Any new RPC or endpoint callable without membership (anonymous or
  pre-join) is rate-limited via the `rpc_rate_limits` mechanism, and the
  limit is verified against a bypass (the `get_trip_by_invite_code` throttle
  bypass was found live; test the real path, not only the happy one).
- Anything that can trigger an outbound message or expensive work needs a
  per-user cap.
- Design the abuse case at requirements time: what does an attacker with a
  free anonymous account do with this?
- A throttle on one RPC entry point is not a limit when a direct-write policy
  or a second overload exists.

## Data exposure

- Return only the columns the caller needs. No `select *` into responses.
- Adding a column that must not reach other members: audit every `select("*")`,
  `t.*` and `returns setof <table>`, and state read access accurately (RLS is
  row-level, so a member can read any column of a row they can see).
- A Postgres constraint-violation `details` contains the whole failing row;
  never log, forward or display raw write errors. Wrap them in a code-only
  error.
- Error responses don't leak internals, SQL, or whether a trip/user exists
  beyond what the feature requires.
- No PII or free text in logs, analytics properties, or URLs.

## Input and injection

- Validate request bodies and params server-side; client validation is UX
  only.
- No string-built queries; no unsanitized input in email templates, redirects,
  file paths or shell commands.
- User free text in a stored column: charset and length CHECK with a code-point
  allowlist (not collation-dependent classes); reject control, bidi, zero-width
  and format characters including U+034F; decide emoji explicitly; test live
  including NFD; share the class string with the client and keep a drift test.
- A query parameter that selects UI state must be validated server-side against
  a fixed set (exact, case-sensitive, single string; arrays and unknown values
  ignored, never "first element"), passed to client components only as the
  validated typed value, never echoed, never used as a redirect target, and
  never copied into the proxy's `next` redirect (the proxy sets `next` to the
  pathname only).
- Analytics event names built from a code must go through a helper that
  returns `undefined` for anything outside the closed set, and the code must
  come from the bundled config, never from the URL or DOM. `trackEvent` stays
  name-only.
- Splitting a client page into server wrapper plus client form: do not pass raw
  `searchParams` or request data to the client; pass only validated typed
  props.
- A page that turns a query parameter into UI state must have a test that sends
  the real encoded URL (including malformed percent-encoding and repeated keys)
  and checks the response body, including the framework payload, for the raw
  value, not only a unit test of the parser.

## Secrets

- Nothing secret in the repo, logs, or client bundle. Watch `NEXT_PUBLIC_`
  and secrets used inside client components.

## Migrations

- New numbered migration, never edit a past one. It must apply against tables
  that already have rows, and every function/RPC column reference must still
  resolve unambiguously (migration 0013 broke in production on a shadowed
  column name).
- When a migration replaces an RLS policy, drop it by its **live** name (the
  latest migration that created it, not the original) and add a test that
  lists `pg_policies` for the table and asserts the exact expected set.
  Permissive policies are OR-ed, so a stale policy left beside the new one
  silently defeats the change (`drop policy if exists` on a wrong name is a
  no-op).
- Schema and code deploys are not atomic: the change must be safe with old
  code + new schema and new code + old schema, or ship together by design.
- Function overloads: no defaults on new parameters; give the new signature its
  own revoke from public/anon and grant to authenticated; keep the old
  signature; fall back to it only on function-not-found codes (PGRST202,
  42883), never on constraint errors.
- CHECK constraints must be exercised on a real Postgres (single-element,
  empty, boundary and invalid cases) before QA passes; NULL IS DISTINCT FROM
  NULL is false, so padding comparisons with NULL slots silently reject short
  arrays. Text-shape tests of the SQL do not catch this.
- A scheduled job that is part of a control (erase, purge) is registered in a
  guarded, idempotent block that cannot fail the migration, and `pg_cron` is
  optional here, so a control must not depend on it alone: add a second layer,
  state the maximum delay, and give the operator a check query. An internal
  function meant only for the scheduler or other definer functions is revoked
  from public, anon and authenticated explicitly (Supabase grants execute by
  default).

## Design documents

- Design documents must not specify behaviour an ADR rejected for security
  reasons. Cross-check before the engineer starts.

## Dependencies

- Flag new dependencies that are unmaintained or have known CVEs
  (`npm audit`).
