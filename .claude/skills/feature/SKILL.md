---
name: feature
description: Runs a feature idea through TripSplit's full delivery pipeline — PM requirements, architecture + UX design, implementation, QA, docs/changelog, and pre-push review — with approval checkpoints. Use when the user runs /feature <description>, or asks to build a new feature "the proper way" through the full team pipeline rather than jumping straight to code.
---

You are orchestrating TripSplit's multi-role feature pipeline. The user
gave a feature description as `args`. Run the stages below **in this
session**, using the Agent tool to invoke each named subagent — do not
skip stages, and do not silently continue past a checkpoint.

## Stages

1. **PM** — invoke the `pm` agent with the feature description. It writes
   `docs/features/<slug>/requirements.md` and appends to
   `docs/ROADMAP.md`.

2. **Checkpoint 1 (required stop)** — present the requirements summary to
   the user and wait for explicit approval or change requests before
   continuing. Do not proceed to design/architecture on your own judgment
   — this is a hard gate, not a formality to narrate past.

3. **Architecture + UX** — once approved, invoke the `architect` and
   `ux-designer` agents (they only depend on requirements.md, so you may
   run them in parallel via two Agent tool calls in the same turn). They
   write `architecture.md` / `design.md` and the architect amends
   `docs/ARCHITECTURE.md` (and an ADR, if warranted).

4. **Engineer** — invoke the `engineer` agent to implement against the
   three docs above.

5. **QA** — invoke the `qa` agent. If it reports failures, go back to
   step 4 (re-invoke `engineer` with the specific failures) rather than
   proceeding — do not let a failing QA report pass through silently.
   Repeat 4→5 until QA passes.

6. **Docs** — invoke the `docs-engineer` agent to update docs/README and
   propose a changelog entry + version bump.

7. **Review** — invoke the built-in `pr-prep` agent (lint/typecheck/
   test/build + diff review + draft commit message).

8. **Checkpoint 2 (required stop)** — present pr-prep's findings together
   with the docs-engineer's proposed changelog entry and version bump.
   Wait for explicit user approval before treating this as done. Never
   commit, push, bump the version in `package.json`, or open a PR
   yourself — hand back the draft commit message and proposed version for
   the user to act on.

## Ground rules

- Each stage's agent already knows how to read the previous stages' docs
  from `docs/features/<slug>/` — you don't need to re-explain the feature
  to it, just point it at the slug/description.
- If a stage's agent flags something that needs a product or user
  decision (ambiguous requirement, a UX tradeoff, a breaking-change
  policy call), surface it to the user immediately rather than guessing
  on their behalf, even mid-pipeline.
- Keep your own narration between stages short — one or two sentences on
  what just happened and what's next. The detail lives in each stage's
  report and the docs it wrote.
