# Architecture Decision Records

An ADR captures one architecturally significant decision, the context that
forced it, and why alternatives were rejected — at the moment it was made.

Rules:
- Numbered sequentially: `NNNN-short-title.md` (e.g. `0002-use-server-actions-for-mutations.md`).
- **Immutable once merged.** If a later feature reverses or replaces a
  decision, write a new ADR and mark the old one superseded — don't edit the
  old one's content.
- Status is one of: `proposed`, `accepted`, `superseded by NNNN`, `deprecated`.
- The `architect` agent writes these when a feature involves a real
  tradeoff (framework/library choice, data model shape, API contract
  strategy, breaking-change handling). Not every feature needs one —
  routine, non-controversial work doesn't.
- **Add a row to the [Index](#index) below** when you write an ADR. The architecture pages
  link to ADRs for their "Why"; they do not summarize the decision.

Template:

```markdown
# NNNN. <Title>

Status: accepted
Date: YYYY-MM-DD

## Context
What forced this decision? What constraints applied?

## Decision
What we're doing.

## Alternatives considered
What else was on the table and why it lost.

## Consequences
What this makes easier/harder going forward. What to watch for.
```

## Index

| ADR | Status | Summary |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Accepted | Record architecture decisions as ADRs |
| [0002](0002-restrict-expense-update-rls-to-payer.md) | Accepted | Restrict `expenses` UPDATE RLS to the paying member |
| [0003](0003-expense-date-column-sequencing.md) | Accepted | Sequencing the `expenses.date` migration for zero-downtime, and sourcing "today" from the app not the DB |
| [0004](0004-placeholder-member-nullable-user-id-and-identity-key.md) | Accepted | Nullable `user_id` for placeholder members, and keying member identity off `trip_members.id` |
| [0005](0005-ssr-page-conversion-pattern.md) | Accepted | Pattern for converting a client-fetched page to a Server Component (Server Component + `"use client"` leaves + `Link`-based navigation), and why the residual server-side `getUser()` round trip is… |
| [0006](0006-anonymous-auth-and-otp-linking-for-onboarding.md) | Accepted | Supabase anonymous auth for pre-verification trip ownership, and anonymous-to-permanent linking (`updateUser`/`email_change`) instead of `signInWithOtp` when verifying an anonymous session |
| [0007](0007-css-custom-property-tokens-for-themeable-restyle.md) | Accepted | CSS custom properties (extending the existing `globals.css` token set) as the mechanism for a themeable light-now/dark-later visual system |
| [0008](0008-add-expense-sheet-via-intercepting-parallel-routes.md) | Accepted | Add-expense as an intercepted/parallel-route overlay sheet |
| [0009](0009-throttle-invite-rpcs-inside-postgres.md) | Accepted | Throttle `get_trip_by_invite_code`/`join_trip` inside the `plpgsql` functions themselves (keyed by `x-forwarded-for`/`auth.uid()`) |
| [0010](0010-interim-per-call-timing-instrumentation.md) | Accepted | Structured server-log timing plus a temporary client beacon endpoint for the performance-scaling feature's Phase-1 latency baseline |
| [0011](0011-forward-verified-user-id-header-for-trips-page.md) | Proposed | Forward `proxy.ts`'s verified user id to `/trips` via a trusted request header to eliminate the page's duplicate `getUser()` call |
| [0012](0012-post-removal-detection-and-ghost-payer-rendering.md) | Accepted | Detecting "you were removed from this trip" on a later visit by reconstructing it from existing `expenses.paid_by` rows (no new column/table), and synthesizing an in-memory "ghost payer" for a… |
| [0013](0013-shopping-list-claim-release-trigger-on-member-removal.md) | Accepted | A `before delete` trigger on `trip_members` (the app's first trigger) to release an in-flight shopping-list claim and clear `added_by`/`claimed_by` when a member is removed |
| [0014](0014-email-invites-pending-member-rows-and-non-credential-tokens.md) | Superseded | Email invites as pending `trip_members` rows with a PII-free tombstone and signed opt-out links. Replaced by a `mailto:` with no stored emails. |
| [0014](0014-trip-types-column-checks-and-create-trip-overload.md) | Accepted | Trip types and the typed "Other" trip type stored as two `trips` columns validated by column CHECKs (inline, locale-independent code-point allowlist, no validator function), a seven-argument… |
| [0015](0015-in-memory-single-item-replay-after-inline-verification.md) | Accepted | A one-item in-memory pending slot (held in TripVerificationProvider, bound to the tapping user, 10-minute TTL) plus the inline verification widget to add the first tapped suggestion automatically… |
| [0016](0016-system-preference-dark-theme-via-data-theme-attribute.md) | Withdrawn | Drafted for `redesign-ui` while dark mode was in scope: a system-preference-driven `data-theme` attribute. Dark mode was descoped before it was acted on. |
| [0017](0017-expense-delete-soft-mark-then-erase.md) | Accepted | Expense delete as a database-clocked soft mark (hidden by RLS, unwritable by clients), Undo window 15 s, hard erase from 30 s by pg_cron plus an opportunistic in-RPC batch |

Status here is a summary; the ADR file itself is authoritative. Two files are numbered 0014.
