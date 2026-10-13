---
name: feature
description: Runs a feature idea through Splitiful's full delivery pipeline — planning, PM requirements, architecture + UX design, implementation, QA, security + compliance review, docs/changelog, and pre-push review — with approval checkpoints. Use when the user runs /feature <description>, or asks to build a new feature "the proper way" through the full team pipeline rather than jumping straight to code.
---

You are orchestrating Splitiful's multi-role feature pipeline. The user
gave a feature description as `args`. Run the stages below **in this
session**, using the Agent tool to invoke each named subagent — do not
skip stages, and do not silently continue past a checkpoint.

## Stages

1. **Planning** — invoke the `planning` agent with the feature description.
   It convenes the `pm` and `product-strategist` agents to debate scope and
   strategic value, and writes `docs/features/<slug>/planning.md` with a
   recommended direction and the open questions only the user can answer.

2. **Checkpoint 1 (required stop)** — present the planning synthesis (and
   its open questions) to the user and have a real discussion; wait for an
   explicit direction before continuing. Do not proceed to formal
   requirements on your own judgment — this is a hard gate.

3. **PM** — invoke the `pm` agent with the feature description and the
   agreed direction from planning.md. It writes
   `docs/features/<slug>/requirements.md` and appends to
   `docs/ROADMAP.md`.

4. **Early risk review** — read the "Risk surface" section of
   requirements.md. If any item is not "none", invoke the `compliance` and
   `security` agents in **requirements** mode in parallel (two Agent calls,
   one turn). They write `compliance-constraints.md` /
   `security-constraints.md`. Then re-invoke `pm` to fold every constraint
   into the acceptance criteria and non-goals. If all items are "none", note
   that you skipped it and why. A **stop** from either agent is surfaced to
   the user at Checkpoint 2 as a decision, with the compliant alternative.

5. **Checkpoint 2 (required stop)** — present the requirements summary,
   including the risk surface and the constraints that were added, and wait
   for explicit approval or change requests before continuing. Do not
   proceed to design/architecture on your own judgment — this is a hard
   gate, not a formality to narrate past.

6. **Architecture + UX** — once approved, invoke the `architect` and
   `ux-designer` agents (they only depend on requirements.md, so you may
   run them in parallel via two Agent tool calls in the same turn). They
   write `architecture.md` / `design.md` and the architect amends
   `docs/ARCHITECTURE.md` (and an ADR, if warranted).

7. **Design risk review** — if the early review ran, invoke `compliance` and
   `security` in **design** mode in parallel. They check that each
   constraint is actually carried into `architecture.md` and `design.md`
   (data flow, RLS, throttles, consent/disclosure copy). Blocking gaps go
   back to `architect` / `ux-designer` before any code is written.

8. **Engineer** — invoke the `engineer` agent to implement against the
   three docs above plus any `compliance-constraints.md` /
   `security-constraints.md`.

9. **QA** — invoke the `qa` agent. If it reports failures, go back to
   step 8 (re-invoke `engineer` with the specific failures) rather than
   proceeding — do not let a failing QA report pass through silently.
   Repeat 8→9 until QA passes.

10. **Security + Compliance** — once QA passes, invoke the `security` and
   `compliance` agents in **final** mode (they depend on the implemented code and the
   docs above, so run them in parallel via two Agent tool calls in the same
   turn). If either reports a blocking finding, go back to step 8
   (re-invoke `engineer` with the specific findings) rather than
   proceeding — treat a blocking security or compliance finding exactly
   like a QA failure. A new blocking finding here means an earlier stage
   missed it: note that in the report and apply the feedback loop below.
   Repeat 8→10 until both pass.

11. **Docs** — invoke the `docs-engineer` agent to update docs/README and
   propose a changelog entry + version bump.

12. **Review** — invoke the built-in `pr-prep` agent (lint/typecheck/
    test/build + diff review + draft commit message).

13. **Checkpoint 3 (required stop)** — present pr-prep's findings together
    with the docs-engineer's proposed changelog entry, version bump, and
    the security/compliance reports, and any proposed baseline additions
    (see Feedback loop). Wait for explicit user approval before
    treating this as done. Never commit, push, bump the version in
    `package.json`, or open a PR yourself — hand back the draft commit
    message and proposed version for the user to act on.

## Ground rules

- Each stage's agent already knows how to read the previous stages' docs
  from `docs/features/<slug>/` — you don't need to re-explain the feature
  to it, just point it at the slug/description.
- If a stage's agent flags something that needs a product or user
  decision (ambiguous requirement, a UX tradeoff, a breaking-change
  policy call, a legal question needing sign-off), surface it to the user
  immediately rather than guessing on their behalf, even mid-pipeline.
- A blocking finding from `security` or `compliance` is a hard gate, same
  as a QA failure — do not let it pass through to docs/PR with just a
  mention.
- Keep your own narration between stages short — one or two sentences on
  what just happened and what's next. The detail lives in each stage's
  report and the docs it wrote.

## Feedback loop (baselines)

`docs/compliance-baseline.md` and `docs/security-baseline.md` hold the
standing rules the early stages design against. Whenever a compliance or
security review (any mode) reports a "baseline gap", or finds a blocking
issue after requirements were approved, the fix PR must also add the rule
that would have caught it to the relevant baseline. At Checkpoint 3, list
the baseline additions alongside the changelog entry; a late finding with no
proposed baseline addition is not done.
