# Compliance baseline

Standing rules every feature is designed against **from the start**. The
planning, pm, architect and ux-designer agents read this before they work, so
legal constraints shape the feature instead of reversing it after it's built.
The `compliance` agent reviews against it at three points (requirements,
design, final code).

This is not legal advice. Rules marked **(counsel)** are positions we hold
pending counsel sign-off.

**Maintenance rule:** when any compliance review finds something late (after
requirements were approved), the same PR adds the rule that would have caught
it to this file. See `.claude/skills/feature/SKILL.md`, "Feedback loop".

## Personal data

- Collect only what the feature needs. Prefer not receiving data at all
  (e.g. the invite-by-email address stays in the browser and goes to the
  user's own mail app; the server never sees it).
- Any new place personal data lives must be covered by the export query and
  deletion cases in `docs/runbooks/account-deletion-and-export.md`. Update the
  runbook in the same PR.
- Any new personal data needs a retention rule (how long, what deletes it).
  Existing jobs: abandoned anonymous accounts, hourly purge of
  `rpc_rate_limits`.
- Special-category data (health, religion, precise location, etc.) is a stop:
  raise it to the user before designing.

## Processors and analytics

- Current processors: Supabase (auth/DB), Resend (email), Vercel
  (hosting/analytics). A new vendor that receives personal data needs a
  privacy-policy disclosure and a processing agreement check **before**
  architecture is approved.
- Analytics events carry the event name only, never PII or free text. Every
  event is listed in `docs/ANALYTICS.md`.

## Outbound communications (anti-spam)

Applies to anything that causes a message to reach a person: email, SMS,
push, share sheets, prefilled `mailto:`/`sms:` links, notifications.

- Name who sends it. A message sent **by Splitiful** (Resend) is Splitiful's
  commercial-or-transactional message and is subject to CAN-SPAM, CASL and
  PECR / GDPR ePrivacy. A message the **user sends from their own account**
  (mailto, share sheet) is the user's, with the Terms clause as mitigation
  **(counsel)**.
- Splitiful-sent messages to someone who has not signed up (invitees,
  placeholders) are a stop: they need a consent / lawful-basis answer, sender
  identity, a physical address and an opt-out, decided at planning, not at
  review. The server-sent invite design was dropped for this reason.
- Strictly transactional messages to existing account holders (auth links,
  receipts they triggered) must carry no promotional content.
- No bulk or unbounded sends. Any send path is rate-limited and capped per
  user.

## Money records

- A settled or locked amount is never silently edited. Changes that affect
  what someone owes need an audit trail or an explicit user action.
- Labels (names) may change without touching the money record, but say so in
  the policy if past trips are rewritten.

## Consumer-facing claims

- Copy must be literally true ("not stored", "encrypted", "never shared").
  Each such claim is tied to a code fact; if code could break the claim
  (logging, analytics properties, a server call), name the test that guards it.
- Any change to data handling updates `/privacy` and `/terms` and bumps
  `LEGAL_LAST_UPDATED` in the same PR.

## Open positions awaiting counsel

- Prefilled invite opened in the user's own mail app: is it the user's
  personal message? Terms clause is the mitigation.
- Account-wide display name rewritten on past trips.
- Erasure for a person who exists only as an organizer-typed placeholder.
- Retention of feedback free text after erasure.
