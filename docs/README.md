# Documentation index

Use this page to find the right document. Current behavior and historical
design records are intentionally separated: the README describes the product,
the roadmap records delivery status, and feature folders preserve the work and
decisions behind individual changes.

## Current project references

- [Product overview](../README.md) — shipped capabilities, stack, setup, and deployment.
- [Roadmap](ROADMAP.md) — what is shipped, awaiting release, or still open.
- [Architecture](ARCHITECTURE.md) — current system design and data-access patterns.
- [Agent workflow](agent-workflow.md) — shared team roles, stages, and review gates.
- [Analytics](ANALYTICS.md) — tracked events and dashboard guidance.

## Product direction

- [Product principles](ROADMAP.md#product-principles-and-scope) — current product thesis,
  priorities, and non-goals.
- [Market research](market-research.md) — historical competitive research dated 2026-09-09; not a
  current market or roadmap source.
- [UX consistency review](reviews/ux-consistency-review-2026-09-30.md) — dated review findings.
- [User flow](user-flow.html) — auth and navigation flow diagram.

## Engineering decisions and feature records

- [ADRs](adr/README.md) — durable technical decisions and their status. Superseded ADRs are
  retained as decision history.
- [Feature records](features/README.md) — point-in-time planning, requirements, architecture,
  design, and QA records. These documents can preserve earlier or rejected
  proposals; use the roadmap for current delivery status and code for exact behavior.

## Security, compliance, and operations

- [Security baseline](reviews/security-compliance/project/security-baseline.md) and
  [compliance baseline](reviews/security-compliance/project/compliance-baseline.md) —
  standing rules for new work.
- [Account deletion and export runbook](runbooks/account-deletion-and-export.md) — operational
  procedures and release checks.
- [Security and compliance reviews](reviews/security-compliance/README.md) — dated project audits
  and feature reviews, preserved as evidence rather than current status trackers.

## Learning reference

- [System design guide](knowledge.md) — a long-form educational guide using Splitiful as its
  example; useful for learning, not a concise project reference.

## Supporting design material

Some feature folders include design imports, screenshots, or working notes. These support the
feature record and are not separate product specifications. In particular,
[`features/ux-revamp/design-import/`](features/ux-revamp/design-import/) contains imported design
source material.

## Keep, archive, or remove?

The dated feature specifications, reviews, and ADRs are useful as project history and generally
should not be deleted after a feature ships. If a document is no longer current, mark it as
historical or superseded and link to its replacement. The repository currently has two ADR files
numbered `0014`; their contents are different. Keep the superseded email-invite decision, and
renumber the current trip-types ADR in a coordinated link update to resolve the numbering
collision.
