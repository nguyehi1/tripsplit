# Roadmap

**Last reviewed: 2026-10-16.** 
This page is the status source of truth; feature documents are dated records of decisions and review evidence, and may contain earlier proposals or superseded status notes. “Shipped” means the change is on `main`; manual release checks and production deployment are listed separately when still open.

## Release work and follow-ups

| Work | Current state | Remaining action | Record |
|---|---|---|---|
| Trip types, starter suggestions, and home templates (`starter-list-exploration`) | Implemented in this repository; release not yet marked complete | Apply migration 0022, run live QA and SQL verification, test the new-trip flows, deploy, complete counsel review, and resolve product-copy question X1. Follow [the ordered checklist](features/starter-list-exploration/release-checklist.md). | [Requirements](features/starter-list-exploration/requirements.md) · [Changelog proposal](../CHANGELOG.md) |
| Performance and latency (`performance-scaling`) | Code and QA complete; live before/after measurement was explicitly deferred until after deployment | Capture per-surface p50/p95 from production logs, report whether the 30% target was met and whether invite throttling regressed, then remove temporary timing instrumentation as specified in ADR 0010. | [Requirements](features/performance-scaling/requirements.md) · [ADR 0010](adr/0010-interim-per-call-timing-instrumentation.md) |
| Vercel Analytics | Implemented and user-confirmed; dashboard event verification remains open | Confirm the expected events appear in the Vercel dashboard. | [Feature record](features/vercel-analytics/requirements.md) · [Analytics guide](ANALYTICS.md) |
| Invite by email (`email-invites`) | Shipped to `main`; mailto design sends and stores no invitee address | Counsel review of the Terms invite clause and anti-spam position. | [Requirements](features/email-invites/requirements.md) · [Counsel review](reviews/security-compliance/features/email-invites/counsel-review.md) |
| Invite-code RPC hardening | **Closed:** migrations 0017 and 0021 were applied live and production smoke checks passed, user-confirmed 2026-10-13 | Account-deletion self-service and counsel sign-off remain separate privacy/legal follow-ups; they are not open defects in the RPC hardening work. | [Security review](reviews/security-compliance/project/security-review-2026-09-17.md) · [Follow-up](reviews/security-compliance/project/security-review-2026-09-17-followup.md) · [Deletion/export runbook](runbooks/account-deletion-and-export.md) · [ADR 0009](adr/0009-throttle-invite-rpcs-inside-postgres.md) |
| Expense delete/undo | Backlog only; not scoped or implemented | Product and architecture work required before scheduling. It would also enable undoing a shopping-list item already logged as bought. | [Product principles](ROADMAP.md#product-principles-and-scope) |
| UI redesign — tokens, spacing, nav bar, brand, boards T/A/L/B/C/O (`redesign-ui`) | Requirements scoped; Welcome headline resolved (keep "Miso does the math"); dark mode explicitly deferred to its own future feature, light-mode-only this pass (both user decisions, 2026-10-16); architecture and UX design in progress | One blocking open item before engineering starts: source an SVG vector logo master from design. **Build first** among the three split redesign features since the other two consume its tokens/spacing. | [Requirements](features/redesign-ui/requirements.md) · [Engineering handoff](features/Splitiful%20UX%20redesign%20engineering%20handoff.md) |
| Copy list from a past trip (`copy-list-from-past-trip`) | Requirements scoped; Open question 1 resolved (user decision 2026-10-16): copy item names only, as new open rows — no bought/claimed status, no expenses, no members; treated as a reusable, user-customized template. Not yet designed or built | **Build second**, after `redesign-ui` (inherits its empty-state base styling). Mandatory early compliance/security review (user-generated free text moves between trips) before design proceeds. | [Requirements](features/copy-list-from-past-trip/requirements.md) |
| Share list with other (`share-list-with-other`) | Requirements scoped; **parked on hold (user decision 2026-10-16) — nice-to-have, not scheduled.** | No current action. When picked back up: confirm the permissions recommendation (open questions 1-3), run the early compliance/security review (new unauthenticated endpoint + newly-exposed free text), then architecture/UX/build. | [Requirements](features/share-list-with-other/requirements.md) |
| Deferred design follow-ups | Not part of current release | Review Miso art disclosure/IP before launch promotion — the new redesign drops Miso from every screen except reference-only boards, so re-check whether this is still needed; dark-mode shopping-list treatment remains deferred. | [UX roadmap](features/ux-revamp/design.md) · [Shopping-list requirements](features/shopping-list/requirements.md) |

## Product principles and scope

### Product thesis

Splitiful helps a group record who paid for shared expenses and see a clear,
trusted balance at the end. The two core moments are quick expense entry and
seeing an understandable settle-up result. Use these principles when evaluating new
product work; this section records direction, while the tables above remain
the source for delivery status.

### Design principles

- Keep expense entry quick. The default equal split should remain easy to use
  without requiring groups to configure how they divide every purchase.
- Make the final balance easy to understand without asking users to reconcile
  a ledger or interpret charts.
- Avoid features that require the whole group to negotiate new settings or
  decisions unless they clearly improve the core experience.
- Prefer correctness and clear data handling over automation that can silently
  produce a wrong amount.
- Keep optional features optional. The shared shopping list is shipped as a
  convenience before logging an expense; skipping it must not change the core
  expense flow. It is a pre-purchase checklist with description-only prefill,
  not post-hoc itemization of a bill.

### Current priorities and non-goals

- Expense deletion and undo remain backlog items. Scope them only after the
  product and architecture decisions are made; deletion must account for
  shopping-list items linked to an expense.
- After current release work is complete, prioritize friction observed in
  real use of expense entry and settle-up rather than pre-planning a large new
  feature set.
- Receipt capture and OCR, post-hoc per-bill itemization, payment-rail
  integrations, multi-currency accounting, spending charts, AI categorization,
  and social feeds are not current product plans. Reconsider them only through
  an explicit product decision that addresses added complexity and correctness
  risks. A simple external payment link could be considered separately if a
  concrete need emerges.

The shared shopping list was previously a proposed follow-up; it is now
implemented and listed under shipped capabilities. The older vision document's
sequencing and security-audit status were point-in-time notes and are superseded
by the current release table above.

### Historical priority snapshot (September 2026)

The former vision document prioritized security/compliance closeout, then
expense deletion, then improvements informed by real use, and then the shared
shopping list. The invite-code RPC hardening is now closed, the shopping list
has shipped, and expense deletion remains backlog. This snapshot explains the
ordering discussed in dated feature-planning records; use the current release
table above for today's status and sequencing.

## Shipped capabilities

These feature records describe work on `main`. Their status here takes precedence over older status
text inside planning or requirements documents.

| Capability | Feature record |
|---|---|
| Anonymous-first onboarding and email verification | [Simplified onboarding](features/simplified-onboarding/requirements.md) |
| Server-rendered trip pages | [SSR trip pages](features/ssr-trip-pages/requirements.md) |
| Expense dates and editing the payer's own expense | [Expense dates](features/expense-date-month/requirements.md) · [Edit own expense](features/edit-own-expense/requirements.md) |
| Placeholder members and remove/leave trip | [Placeholder members](features/add-placeholder-members/requirements.md) · [Remove member access](features/remove-member-access/requirements.md) |
| Shared shopping list and expense logging | [Shopping list](features/shopping-list/requirements.md) |
| One display name per account and mailto invites | [Email invites](features/email-invites/requirements.md) |
| UX restyle and remembered sign-in email | [UX revamp](features/ux-revamp/design.md) · [Remember email](features/remember-signin-email/requirements.md) |

## Reading project history

- Use this page to answer **what is shipped, what is awaiting release, and what remains open**.
- Use the README for a concise description of current product behavior and `docs/ARCHITECTURE.md` for
  the detailed system design.
- Use `docs/features/<slug>/` for the requirements, design, and verification record of an individual
  effort. Planning documents and earlier revisions preserve context; they are not current scope.
- Use ADRs for durable technical decisions. An ADR marked `superseded` records history, not current
  implementation policy.
- Use `CHANGELOG.md` for release notes. An entry under `[Unreleased]` is implemented work proposed
  for a future release, not proof that it has been deployed.
