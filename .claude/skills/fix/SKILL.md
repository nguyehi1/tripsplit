---
name: fix
description: Runs a bug through Splitiful's fix lane: QA writes a failing test that reproduces it, the engineer makes the minimal change, QA verifies (at most two rounds), security and compliance review the diff when it touches the risk surface, and PR prep runs the CI checks, ending at the completion checkpoint. Use when the user runs /fix <bug report>, or asks to fix a defect in shipped behavior without changing what the product is meant to do.
---

Use the "Fix lane", "Task briefs and pre-approval", "Loop limits" and "Run
report" sections of `docs/agent-workflow.md` as the canonical rules. Do not
copy them here; update that document when the lane changes.

For `/fix <bug report>` (or a brief whose lane is `fix`):

1. Pick a short slug for the bug. Work on a branch named `agent/fix-<slug>`
   when the brief grants `branch-and-draft-pr`; otherwise leave git alone.
2. Invoke the `qa` agent in fix mode: write the failing regression test,
   run it, and confirm it fails for the reported reason. Do not invoke the
   engineer until this is confirmed.
3. Invoke the `engineer` agent in fix mode with the failing test's path and
   the bug report: the minimal change that makes the test pass.
4. Invoke `qa` to verify: the new test passes, and `npm test`, `npm run lint`
   and `npm run typecheck` pass. Count rounds; after a second failed round,
   stop with a decision card.
5. If the diff touches the risk surface listed in the canonical document,
   invoke `security`, and `compliance` where privacy or records are
   affected, on the diff.
6. Invoke `pr-prep` to run the CI checks and draft the commit message.
7. Stop at the completion checkpoint. With `branch-and-draft-pr`, commit to
   the branch, push it and open a draft pull request; never merge.
8. End with the run report block from the canonical document.

Stop early, with a decision card, when the bug cannot be reproduced, when
the fix needs a change in intended behavior or a design decision (recommend
`/feature`), or when the budget runs out.
