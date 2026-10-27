---
name: feature
description: Runs a feature idea through Splitiful's full delivery pipeline — planning, PM requirements, architecture + UX design, implementation, QA, security + compliance review, docs/changelog, and pre-push review — with approval checkpoints. Use when the user runs /feature <description>, or asks to build a new feature "the proper way" through the full team pipeline rather than jumping straight to code.
---

Use `docs/agent-workflow.md` as the canonical source for the feature stages,
approval checkpoints, risk reviews, handoffs, and feedback loop. Do not copy
those rules into this skill; update the canonical document when the shared
workflow changes.

For `/feature <description>`, start at its Planning stage and follow the
canonical workflow from start to finish. Invoke the role agents defined in
`.claude/agents/` for their assigned work. Keep tool-specific invocation
details here, and treat every user checkpoint as a required stop until the
user responds.

Documentation rules live in `docs/guides/writing-docs.md` and the
"Documentation map" in `docs/agent-workflow.md`. When invoking the architect
and docs-engineer, tell them to follow that guide. Living docs
(`docs/architecture/`, `docs/reference/`) describe current state only; feature
history goes in `docs/features/<slug>/` and ADRs. Before the completion
checkpoint, confirm `npm run docs:check` passes.

**Briefs and limits.** When a task brief starts the pipeline, follow
"Task briefs and pre-approval" in `docs/agent-workflow.md`: skip the
direction and requirements checkpoints only when the brief pre-approves
them and the item is small, and stop at requirements if the PM finds a
risk-surface item. Cap the QA loop back to the engineer at two rounds (see
"Loop limits"). Work on an `agent/<slug>` branch and open a draft pull
request only when the brief grants `branch-and-draft-pr`. End every run,
finished or stopped, with the "Run report" block from that document.
