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

These are point-in-time deep-dives for one feature. For the current
system-wide picture, see [`../ARCHITECTURE.md`](../ARCHITECTURE.md) and
[`../ROADMAP.md`](../ROADMAP.md), which get updated (not replaced) as each
feature ships. Architecture decisions that outlive a single feature belong in
[`../adr/`](../adr/), not here.
