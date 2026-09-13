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
