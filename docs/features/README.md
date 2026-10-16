# Feature docs

Each feature built through the `/feature` pipeline gets its own folder here,
named with a short slug (e.g. `split-by-percentage/`):

```
docs/features/<slug>/
  requirements.md   # written by the pm agent — scope, acceptance criteria, semver classification
  architecture.md   # written by the architect agent — design, data model, impact/consumer analysis
  design.md          # written by the ux-designer agent — flows, states, copy
  qa-report.md       # written by the qa agent — what was tested, pass/fail, regressions found
```

Security and compliance constraints and review reports are stored in
[`../reviews/security-compliance/features/`](../reviews/security-compliance/features/),
under the matching feature slug. Standing review policies remain at
[`../reviews/security-compliance/project/security-baseline.md`](../reviews/security-compliance/project/security-baseline.md) and
[`../reviews/security-compliance/project/compliance-baseline.md`](../reviews/security-compliance/project/compliance-baseline.md).

These are point-in-time records for one feature. Planning and requirements
may preserve proposals that changed or were dropped; a status line inside an
older feature document is not necessarily current. For shipped behavior and
open release work, use [`../ROADMAP.md`](../ROADMAP.md). For the current
technical design, use [`../ARCHITECTURE.md`](../ARCHITECTURE.md) and the code.
Architecture decisions that outlive a single feature belong in
[`../adr/`](../adr/); a superseded ADR is decision history, not current policy.
