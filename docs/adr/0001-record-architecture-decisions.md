# 0001. Record architecture decisions as ADRs

Status: accepted
Date: 2026-09-12

## Context

As TripSplit grows past a single-contributor, single-sitting codebase, past
design decisions (why Supabase RLS over app-layer auth checks, why a given
API contract shape, why a migration was structured a certain way) need to
survive being forgotten or silently re-litigated. A single `ARCHITECTURE.md`
that's continuously edited in place loses this history — later edits
overwrite the "why" behind earlier choices.

## Decision

Architecturally significant decisions are recorded as immutable, numbered
ADRs under `docs/adr/`. `docs/ARCHITECTURE.md` stays a current-state summary
that indexes and links to the relevant ADRs, rather than being the only
record of *why* things are the way they are.

## Alternatives considered

- **Only `ARCHITECTURE.md`, kept up to date**: simpler, but loses reasoning
  behind superseded decisions and invites re-litigating settled tradeoffs.
- **Decisions only in PR descriptions**: not discoverable later without
  digging through git history; easy to lose track of as PR volume grows.

## Consequences

Every feature doesn't need an ADR — only ones with a real tradeoff. The
`architect` agent is responsible for deciding when one is warranted and for
never editing a past ADR's content once merged (a reversal gets its own new
ADR that marks the old one superseded).
