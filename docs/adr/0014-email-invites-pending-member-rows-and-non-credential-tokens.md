# 0014. Email invites: pending `trip_members` rows, a PII-free invite tombstone with a non-credential token, and stateless signed opt-out links

Status: superseded (2026-10-12) — the Splitiful-sent design was abandoned; email invites are now a mailto: with no stored emails (docs/features/email-invites/requirements.md)
Date: 2026-10-10

## Context

The email-invites feature (`docs/features/email-invites/requirements.md`)
lets a verified organizer type an address, have Splitiful email that person
a link, and show a **Pending** row on the roster right away. That row has to
count in the equal split like a placeholder (0008). It also converts into the
joiner's own member row when someone verifies with the invited address, on
any join route, including the shared `/join/[code]` link.

Several constraints pull against each other:

- The link must **not** be a sign-in credential. Joining still needs a
  verified session or an email OTP (planning.md, round 2).
- The link must keep working after the stored email is deleted. Auto-removal
  happens 30 days after the latest send, and the link then falls back to a
  normal join. It only dead-ends after a manual Remove or once the trip is
  completed.
- "Resend" must re-send **the same** link.
- The stored email is kept at most 30 days, and is deleted earlier on join,
  Remove or lock. The optional invitee name goes with the row.
- "Don't email me again" must work without signing in, and must keep working
  after the invite's email is gone.
- The settled split must not change when a trip is locked.
- Only the organizer sees the email. The roster is readable by every
  verified member (`is_owner_or_verified_member`).

## Decision

1. **A pending invitee is a `trip_members` row of a third kind.** It gets a
   new `is_pending boolean not null default false` column, and the
   placeholder check constraint is generalised to "`user_id is null` iff
   (`is_placeholder` or `is_pending`), never both". Because it is a real
   member row, every existing split path counts it with no change:
   `get_trip_summary`, `computeBalances` through `getTripView`/`getMyTrips`,
   and the cent-remainder ordering by `joined_at`. It can never be a payer,
   for the same reason a placeholder can't (`user_id` is null). Conversion
   is an in-place `UPDATE` of that row: it sets `user_id`, clears
   `is_pending`, and keeps `id` and `joined_at`. Keeping `joined_at` matters
   because the remainder-cent rule orders by it, so nobody's share shifts by
   a cent on conversion (criterion 27).

2. **The email and token live in a separate `trip_invites` table, and the
   row outlives the email as a PII-free tombstone.** Columns: `token`,
   `status` (`pending|accepted|removed|expired|closed`), `member_id`,
   timestamps, and `email`/`email_normalized`. The email columns are
   non-null only while `status = 'pending'`, and a check constraint enforces
   this. The table has no grants and has RLS with no policies, the
   `rpc_rate_limits` pattern. All access goes through `security definer`
   RPCs, which is how "organizer sees the email, others don't" is enforced.
   No column-level RLS is needed on `trip_members`, because the email is
   never on it. The tombstone is what lets an expired invite's link still
   resolve to its trip, and lets a removed invite's link dead-end, with no
   email stored.

3. **The token is a high-entropy bearer value for "this trip's join page"
   only, the same capability class as `trips.invite_code`.** It is stored in
   plaintext, so Resend can re-send the same link, and generated in Postgres
   from two `gen_random_uuid()` values (about 244 random bits). It never
   creates or selects a session. Joining through it calls a new
   `join_trip_by_invite` RPC with the same anonymity guard and `auth.uid()`
   throttle as `join_trip`/`join_trip_by_id`. Because the token can't be
   guessed, its read-only landing RPC is callable by `anon`. ADR 0009 and
   migration 0017 don't apply here: they exist because the 8-hex
   `invite_code` *is* guessable.

4. **Pending-row conversion happens in one internal helper that all three
   join RPCs call.** The helper matches the caller's `auth.users.email`
   (verified, non-anonymous) against the trip's `pending` invites and
   converts in place. Otherwise it falls through to the existing insert. This
   is the only way to satisfy "on any route, including `/join/[code]`"
   without changing the client contracts of `join_trip`/`join_trip_by_id`.

5. **"Don't email me again" uses a stateless HMAC-signed link, and the
   suppression list stores only a hash of the address.** The link is
   `?e=<sha256(normalized email)>&m=<masked address>&s=<HMAC(secret, e|m)>`.
   The signed masked address only exists so the opt-out page can say which
   address it is acting on. The link keeps working forever, with no lookup
   through the (possibly already-deleted) invite row. Bounce and complaint
   webhooks from Resend add to the same hashed list.

6. **On lock, pending rows become name-only placeholders.** The emails are
   deleted and the tombstones are set to `closed`. On 30-day auto-removal,
   pending rows are deleted and the tombstones are set to `expired`. On
   manual Remove, pending rows are deleted and the tombstones are set to
   `removed`.

7. **The kill switch and caps are a single-row DB settings table** that the
   RPCs read, and they are toggled from the Supabase SQL editor. A Vercel
   env var was rejected because changing one requires a redeploy.

## Alternatives considered

- **Pending as `is_placeholder = true` plus an invite link.** This needs no
  new column, but the existing placeholder RPCs
  (`rename_placeholder_member`, `remove_placeholder_member`) and the
  placeholder 20-cap would then silently apply to invites. A Remove through
  the placeholder path would skip the tombstone's `removed` state, so the
  link would fall back to a normal join instead of dead-ending. The cap
  would also be shared by two different features. Rejected.
- **Email column on `trip_members`.** This needs column-level privacy
  inside a table every verified member can `select`, and RLS is
  row-level. It would need column grants plus RPCs anyway. It also makes the
  email's lifetime depend on the member row, which breaks "row converts to
  placeholder at lock, email deleted". Rejected.
- **Hash-only token storage, with a new token on each Resend.** This is
  better hygiene against a DB leak, but it violates "Resend re-sends the
  same still-valid link", and old emails would silently stop working. The
  token grants no more than `invite_code`, which is already stored in
  plaintext. Rejected.
- **Deleting the invite row together with the email.** The link could then
  no longer tell "auto-removed, fall back to join" from "manually removed,
  dead-end" from "garbage token". Criteria 18 and 19 need that
  distinction. Rejected.
- **An opt-out link keyed by invite token.** After the email is deleted the
  token no longer maps to an address, so a late click couldn't suppress
  anything. Keeping a permanent per-invite hash instead would add retained
  data to every invite rather than only to people who opt out. Rejected.
- **A service-role-only invite RPC called from the route with an explicit
  organizer id.** This would make "the email is actually sent" a DB-level
  guarantee, but it re-derives caller identity server-side, the trust-model
  change ADR 0009 rejected for `join_trip`. An organizer who calls
  `create_trip_invite` directly only gets a Pending row and a link they
  could share themselves, within the same caps and the same 30-day bound.
  No mail is sent except through the route. Rejected.
- **A trigger on `trips.completed_at` for lock-time conversion.** That path
  is guaranteed, but ADR 0013 asks that triggers stay a narrow escape
  hatch, and `complete_trip` is the only writer of `completed_at`. Rejected
  for now. If a second lock path is ever added, it must call
  `close_pending_trip_invites` too.

## Consequences

- `trip_members` now has three row kinds. Any code that splits "real
  members" from "placeholders" with `!isPlaceholder` will misclassify
  pending rows as real. `src/app/trip/[id]/invite/page.tsx` does this today
  and must be updated in the same PR. `remove_trip_member` is patched to
  exclude pending rows (`and not m.is_pending`).
- `join_trip`/`join_trip_by_id` gain a side effect (conversion) but keep
  their signatures and grants. `complete_trip` gains a side effect
  (pending to placeholder, emails deleted).
- `trip_invites` rows live as long as their trip, but hold no personal data
  once they leave `pending`. The suppression list holds unsalted SHA-256
  hashes of email addresses. Anyone with a candidate address can test a hash
  against it, which is accepted as "the minimum needed to honour opt-outs".
- `rpc_rate_limits` now carries 1-day windows. Migration 0019's purge
  deletes buckets whose `window_start` is more than 1 day old, which is
  exactly when a 1-day window expires. **No throttle window may exceed
  86400 seconds** unless 0019's threshold is raised with it.
- The landing RPC is `anon`-callable only because the token is
  unguessable. If token length is ever reduced, this decision must be
  revisited under ADR 0009 and 0017.
