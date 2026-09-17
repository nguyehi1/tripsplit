# 0006. Supabase anonymous auth + anonymous-to-permanent linking for onboarding

Status: accepted

Date: 2026-09-16

## Context

The simplified-onboarding feature
(`docs/features/simplified-onboarding/requirements.md`) requires a
first-time visitor to create and fully view a trip with zero email/login
step, while still ending up with real, server-enforced (RLS) ownership of
that trip from the moment of creation — not a client-only flag that a
later "claim this trip" step would have to reconcile against the database.
It further requires that when the organizer (or an invitee) later confirms
their email via the existing OTP code flow, that confirmation carries the
existing session's authorization forward with **no separate reassignment or
migration step** (decision 4).

Two mechanisms were on the table to satisfy the first half (pre-auth
ownership): a client-generated random id stored in `localStorage` and sent
alongside every request, checked against `trips.created_by`-equivalent
column server-side; or Supabase's built-in anonymous authentication
(`supabase.auth.signInAnonymously()`), which issues a real `auth.users` row
and a real session/JWT (with an `is_anonymous` claim) indistinguishable
from a permanent session as far as `auth.uid()` and RLS are concerned.

For the second half (verification carrying ownership forward), Supabase
separately documents an "anonymous sign-in linking" mechanism:
`supabase.auth.updateUser({ email })`, called while an anonymous session is
active, updates that user's row in place (setting `email`, clearing
`is_anonymous`) rather than performing a fresh sign-in. This is distinct
from `signInWithOtp` + `verifyOtp({ type: 'email' })` — the exact pair this
app's existing `check-email` screen already uses for returning-visitor
sign-in — which authenticates as whatever user that email resolves to,
independent of whatever session was active beforehand.

## Decision

1. **Use Supabase anonymous auth (`signInAnonymously()`), not a
   client-side-only identifier, to back pre-verification trip ownership.**
   `trips.created_by = auth.uid()` and RLS policies built on `auth.uid()`
   work identically whether that uid belongs to an anonymous or permanent
   user — this is what makes "real, server-backed authorization... not a
   client-only flag" (decision 1) achievable without inventing a parallel
   identity system.

2. **Use Supabase's anonymous-to-permanent linking (`updateUser({ email
   })` + `verifyOtp({ type: 'email_change' })`) for the verification step,
   not `signInWithOtp`/`verifyOtp({ type: 'email' })`, whenever an
   anonymous session is the one being verified.** The existing
   `signInWithOtp` pair is kept, unmodified, for the case where no
   anonymous session is active (a returning visitor with no browser memory
   signing back in, AC 15/16) — it is not replaced, only no longer the
   universal path. `src/app/check-email/page.tsx`'s UI, cooldown, and
   `remember-signin-email` integration are shared across both branches
   unchanged; only the two Supabase Auth calls underneath its handlers
   branch on `user?.is_anonymous`.

3. **This is accepted with an explicitly flagged, not-yet-verified risk**:
   this ADR is written from Supabase's documented *shape* of the
   anonymous-linking mechanism, not from having exercised it against this
   project's exact `@supabase/supabase-js` version (`^2.116.0`) or its
   Auth server's mailer/template configuration. A pre-implementation spike
   should confirm, against a real project: the exact `verifyOtp` `type`
   value `updateUser({ email })`'s confirmation code expects; which email
   template fires (and whether it needs reconfiguring to match the
   existing 6-digit-code copy, not a magic-link URL); and that linking
   actually preserves `auth.uid()` (rather than, say, issuing a new user id
   and migrating identities server-side, which would be a materially
   different mechanism than assumed here). If any of these don't hold as
   documented, this ADR is superseded rather than silently reinterpreted.

## Alternatives considered

- **Client-side anonymous id (`localStorage` UUID sent as a header/param,
  checked server-side).** Rejected outright — decision 1 explicitly calls
  for "real, server-backed authorization... not a client-only
  `localStorage` flag," and this approach can't produce an RLS-checkable
  `auth.uid()` at all; every "ownership" check would have to live in
  application code instead of the database, reopening exactly the
  boundary this codebase's existing RLS-first pattern
  (`docs/ARCHITECTURE.md`'s "RLS as the authorization boundary") was built
  to avoid.
- **A parallel "claim trip" migration step**: let the organizer's
  anonymous ownership be a separate row/flag, and on OTP success, run a
  server-side reassignment (`update trips set created_by = ... where ...`)
  to the newly-permanent user id. Rejected because decision 4 explicitly
  locks out "a separate 'save' event... reassignment step... parallel
  record to reconcile" — and because Supabase's linking mechanism, if it
  behaves as documented, makes this unnecessary: `auth.uid()` for the
  session doesn't change across linking, so there is nothing to reassign.
- **Skip anonymous auth; require OTP verification upfront for the
  organizer, same as today.** This is the status quo the feature exists to
  remove — rejected by the requirements themselves, not re-litigated here.

## Consequences

- RLS gains a real, server-enforced notion of "verified" (non-anonymous)
  vs. "anonymous" session, expressed as one new predicate
  (`is_verified_trip_member`, see
  `docs/features/simplified-onboarding/architecture.md`) that every
  detail-read and write policy on `expenses`/`trip_members` is rebuilt on.
  Any *future* feature adding a new trip-scoped table must remember this
  three-tier model exists and pick the right predicate
  (`is_trip_member` alone is no longer sufficient for anything meant to be
  gated behind verification).
- Anonymous sessions must be enabled in the Supabase project's Auth
  settings — a dashboard config change with no local migration file to
  represent it; anyone re-provisioning a Supabase project for this app
  needs to know to flip it on (see architecture doc's "Supabase project
  configuration" section).
- If the spike in Decision 3 finds the linking mechanism doesn't behave as
  documented (wrong `verifyOtp` type, or an actual new-identity-plus-
  migration under the hood), the "no reassignment" guarantee in decision 4
  may not be achievable as cleanly as assumed, and requirements' locked
  decision 4 would need revisiting at a checkpoint rather than worked
  around silently in code.
- `auth.users` accumulates a permanent row for every anonymous session ever
  created, including ones that never convert (an organizer who never adds
  an expense or invites anyone, decision 10's "permanently inaccessible by
  design" case). No cleanup/expiry job exists for these; if abandoned
  anonymous users become an operational concern (row growth, unclear cost
  implications for the Supabase plan tier), that's a follow-up, not solved
  here.
