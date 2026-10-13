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
- The trip invite/join link is a bearer secret. New features must not expose
  it to non-members, log it, or put it in analytics.

## Public and unauthenticated surface

- Any new RPC or endpoint callable without membership (anonymous or
  pre-join) is rate-limited via the `rpc_rate_limits` mechanism, and the
  limit is verified against a bypass (the `get_trip_by_invite_code` throttle
  bypass was found live; test the real path, not only the happy one).
- Anything that can trigger an outbound message or expensive work needs a
  per-user cap.
- Design the abuse case at requirements time: what does an attacker with a
  free anonymous account do with this?

## Data exposure

- Return only the columns the caller needs. No `select *` into responses.
- Error responses don't leak internals, SQL, or whether a trip/user exists
  beyond what the feature requires.
- No PII or free text in logs, analytics properties, or URLs.

## Input and injection

- Validate request bodies and params server-side; client validation is UX
  only.
- No string-built queries; no unsanitized input in email templates, redirects,
  file paths or shell commands.

## Secrets

- Nothing secret in the repo, logs, or client bundle. Watch `NEXT_PUBLIC_`
  and secrets used inside client components.

## Migrations

- New numbered migration, never edit a past one. It must apply against tables
  that already have rows, and every function/RPC column reference must still
  resolve unambiguously (migration 0013 broke in production on a shadowed
  column name).
- Schema and code deploys are not atomic: the change must be safe with old
  code + new schema and new code + old schema, or ship together by design.

## Dependencies

- Flag new dependencies that are unmaintained or have known CVEs
  (`npm audit`).
