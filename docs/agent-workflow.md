# Agent workflow

This is the portable source of truth for Splitiful's agent roles and feature
delivery process. Tool-specific entry points should invoke these roles and
link here instead of maintaining their own version of the stage order or
approval rules. The current Claude adapters live in `.claude/agents/` and
`.claude/skills/feature/`; `AGENTS.md` and `CLAUDE.md` point contributors to
this document.

## Lanes

| Lane | Entry point | Use for | Owner stops |
|---|---|---|---|
| Feature | `/feature <description>` | New capability, behavior change, redesign | Direction, requirements, completion; the first two can be pre-approved by a brief for a small item |
| Fix | `/fix <bug report>` | A defect in shipped behavior, with no change in intended behavior | Completion only |

A task brief from the workspace orchestrator, or one the user writes, can
start either lane without an interactive session. See
[Task briefs and pre-approval](#task-briefs-and-pre-approval).

## Team roles

| Role | Owns | Does not own |
|---|---|---|
| Planning facilitator | Discovery, independent PM and strategy input, recommendation, unresolved user decisions | Final scope approval or requirements |
| Product strategist | Independent assessment of user value, opportunity cost, risk, and simpler options | Requirements or implementation |
| PM | Scope, acceptance criteria, risk surface, and roadmap entry | UX or technical design |
| Compliance reviewer | Privacy, retention, communications, financial-record, and consumer-claim review | Legal advice or feature redesign |
| Security reviewer | Threat review of requirements, design, and implementation | Implementation fixes |
| Architect | Data model, module boundaries, migration/API strategy, impact analysis, ADRs, and the current-state `architecture/` and `reference/` pages | Feature implementation |
| UX designer | User flows, states, copy, responsive behavior, and consistency with existing UI | Backend/data decisions |
| Engineer | Application and migration implementation against approved artifacts | Product decisions or final independent QA |
| QA | Acceptance, edge-case, and regression verification; QA report | Implementation fixes |
| Documentation engineer | README, guide, runbook and reference updates; changelog proposal; version recommendation; doc-page placement and checks per [Write documentation](guides/writing-docs.md) | Application logic or release action |
| PR prep reviewer | Final diff and project-check review; draft commit message | Commit, push, release, or PR creation |

Role-specific instructions may add detail, but should not contradict this
document's ownership boundaries or workflow gates.

## Pipeline diagram

```mermaid
flowchart TD
    Start([Feature idea]) --> Plan[Planning facilitator<br/>PM + product strategist debate]
    Plan --> C1{Checkpoint 1<br/>User chooses direction}
    C1 --> PM[PM writes requirements + roadmap]
    PM --> Risk{Any risk-surface item?}
    Risk -->|Yes| EarlyReview[Security + compliance<br/>requirements review in parallel]
    EarlyReview --> Fold[PM folds constraints into requirements]
    Risk -->|No: record why skipped| C2
    Fold --> C2{Checkpoint 2<br/>User approves requirements}
    C2 --> Design[Architect + UX designer<br/>work in parallel]
    Design --> DesignRisk{Early risk review ran?}
    DesignRisk -->|Yes| DesignReview[Security + compliance<br/>design review in parallel]
    DesignReview --> DesignGate{Blocking design gaps?}
    DesignGate -->|Yes| Design
    DesignGate -->|No| Engineer[Engineer implements]
    DesignRisk -->|No| Engineer
    Engineer --> QA[QA verifies acceptance + regressions]
    QA --> QAGate{QA passes?}
    QAGate -->|No, round 1 or 2| Engineer
    QAGate -->|No after round 2| Escalate([Stop: decision card to the user])
    QAGate -->|Yes| FinalReview[Security + compliance<br/>final review in parallel]
    FinalReview --> FinalGate{Blocking findings?}
    FinalGate -->|Yes| Engineer
    FinalGate -->|No| Docs[Docs engineer updates docs + changelog proposal]
    Docs --> Prep[PR prep reviews diff + checks]
    Prep --> C3{Checkpoint 3<br/>User reviews final result}
    C3 --> Done([Complete after approval])
```

The three checkpoints are required stops, except that a brief can
pre-approve the first two for a small item. QA or blocking final-review
findings send the work back through implementation and verification before
it advances. The QA loop back to the engineer runs at most two rounds.

## Feature delivery stages

1. **Plan.** The planning facilitator gathers independent PM and product
   strategy views, records the recommendation and unresolved decisions in
   `docs/features/<slug>/planning.md`.
2. **User checkpoint: direction.** Present the recommendation and open
   decisions. Wait for the user's explicit direction before writing formal
   requirements, unless a brief pre-approved the direction for a small item.
3. **Requirements.** PM writes acceptance criteria, non-goals, risk surface,
   and the roadmap entry in `docs/features/<slug>/requirements.md` and
   `docs/product/roadmap.md`.
4. **Early risk review.** If any risk-surface item is present, security and
   compliance review requirements. PM incorporates their constraints into
   acceptance criteria and non-goals. Record why this review was skipped
   when every risk item is `none`.
5. **User checkpoint: requirements.** Present the scope, risk surface, and
   constraints. Wait for explicit approval or revisions before design,
   unless a brief pre-approved the requirements for a small item and the
   PM found no risk-surface item.
6. **Architecture and UX.** Architect and UX designer produce their feature
   documents. Architect updates the matching `docs/architecture/` page and
   `docs/reference/data-model.md` or `code-map.md` when the system's
   current state changes (current state only, no "as of feature X"
   history), and records consequential decisions as ADRs with a row in
   the ADR index.
7. **Design risk review.** When early review ran, security and compliance
   check that their constraints appear in the architecture and design.
   Resolve blocking gaps before implementation.
8. **Implement and verify.** Engineer implements against approved
   requirements, architecture, design, and risk constraints. QA verifies
   acceptance criteria, relevant regressions, and project checks. Fix
   failures and repeat verification before continuing, for at most two
   rounds (see [Loop limits](#loop-limits)).
9. **Final security and compliance review.** Review the implementation and
   resolve blocking findings before documentation and PR preparation. A
   late blocking finding should identify the missed earlier check and
   propose a rule for the corresponding baseline.
10. **Documentation and PR preparation.** Documentation engineer updates
    relevant docs and proposes changelog/version changes. PR prep reports
    checks and diff findings.
11. **User checkpoint: completion.** Present review findings, proposed
    documentation/version changes, security/compliance results, baseline
    additions, and a draft commit message. Wait for approval. Do not commit,
    push, change the release version, or open a PR without authorization.

## Fix lane

The fix lane repairs a defect in shipped behavior. It does not change what
the product is meant to do. Its record is the regression test, the commit
message and the run report; it writes no `docs/features/` folder.

```mermaid
flowchart TD
    Bug([Bug report]) --> Repro[QA writes a failing test<br/>that reproduces the bug]
    Repro --> Fails{Fails for the<br/>reported reason?}
    Fails -->|No| NoRepro([Stop: decision card<br/>cannot reproduce])
    Fails -->|Yes| Eng[Engineer makes the<br/>minimal change]
    Eng --> Verify[QA: the test passes,<br/>full suite and checks pass]
    Verify --> VGate{Passes?}
    VGate -->|No, round 1 or 2| Eng
    VGate -->|No after round 2| Escalate([Stop: decision card])
    VGate -->|Yes| Risk{Risk surface<br/>touched?}
    Risk -->|Yes| Review[Security + compliance<br/>review the diff]
    Risk -->|No| CI
    Review --> CI[PR prep runs the CI checks]
    CI --> C3{Checkpoint: user<br/>reviews the fix}
    C3 --> Done([Complete after approval])
```

1. **Reproduce first.** QA writes a test that fails on the current code for
   the reason in the report, and confirms that it fails. No implementation
   change happens before this test exists. If the bug cannot be reproduced
   in a test, stop with a decision card that says what was tried and what
   information would help.
2. **Minimal change.** The engineer changes only what the failing test
   needs. No refactors, renames or unrelated cleanup; note those for later.
   If the fix needs a change in intended behavior, a new migration that
   changes data shape, or a design decision, stop and recommend the
   feature lane instead.
3. **Verify.** QA confirms the new test passes and runs the full suite and
   project checks. Failures go back to the engineer for at most two rounds.
4. **Risk review when needed.** If the diff touches the risk surface
   (authentication, row-level security or policies, personal data,
   financial records, email or other communications, retention or
   deletion), the security reviewer, and the compliance reviewer where
   privacy or records are affected, review the diff. Blocking findings go
   back to step 2 and count toward the two rounds.
5. **Run the CI checks.** PR prep runs what `.github/workflows/ci.yml` runs:
   `npm run lint`, `npx next typegen`, `npm run typecheck`, `npm test` and
   `npm run build`, plus `npm run docs:check` when docs changed and
   `supabase db reset --local` when a migration changed and the CLI is
   available. Every check passes before the completion checkpoint.
6. **User checkpoint: completion.** Present the bug, the failing test, the
   diff summary, check results, any review findings and a draft commit
   message. This stop cannot be pre-approved.

## Task briefs and pre-approval

A task brief is a short file that starts a lane without a live
conversation. The workspace orchestrator writes it, or the user does. It
holds:

- **Goal**: the feature or the bug, in the user's words.
- **Lane**: feature or fix.
- **Pre-approved stops**: none, `direction`, or `direction` and
  `requirements`. Only the feature lane uses this field.
- **Decisions already made**: answers to questions the planning stage would
  otherwise ask, such as scope limits or copy.
- **Git permission**: `none` (default) or `branch-and-draft-pr`, which
  allows committing to an `agent/<slug>` branch, pushing it and opening a
  draft pull request. Merging, releasing and changing the version always
  need the user.
- **Budget**: the spending cap for the run.

**Small item.** A brief can pre-approve the direction and requirements stops
only for a small item, which means all of the following hold:

- every risk-surface item in the requirements is `none`;
- no new migration, no new third-party service and no change to auth or
  policies;
- the change stays inside one existing feature area, with no new route or
  table.

**How pre-approval works.** The planning facilitator still writes
`planning.md` and records "Direction pre-approved by brief" with the brief's
decisions. The PM still writes `requirements.md`. If the PM finds any
risk-surface item, or the work fails the small-item test, the pre-approval
lapses and the run stops at the requirements checkpoint with a decision
card. The completion checkpoint is never pre-approved.

## Loop limits

- QA back to the engineer: at most **two rounds** per feature or fix. QA
  states the round number in its report. After a second failed round, stop
  and send a decision card; do not start a third round.
- A blocking final-review finding sent back to the engineer starts the same
  verification loop and counts toward the same two rounds.
- A brief's budget is a hard stop. When it runs out, stop and send a run
  report with status `needs_decision`.

## Run report

Every lane ends with this block, so the orchestrator can build the user's
digest without reading the whole conversation:

```text
status: done | needs_decision | failed
lane: feature | fix
slug: <slug>
stage_reached: <stage>
branch: <branch or none>
pr: <url or none>
checks: lint=<pass|fail> typecheck=<pass|fail> test=<pass|fail> build=<pass|fail> docs=<pass|fail|n/a>
qa_rounds: <n> of 2
decision_cards:
  - question: <what the user should decide>
    options: [<a>, <b>]
    recommendation: <a>
    default_if_no_answer: <what happens next if the user does not answer>
```

A decision card is how the pipeline waits for the user without blocking a
live session: the run stops, and the next run resumes from the card's
answer.

## Shared rules

- User decisions are hard gates. Do not infer approval from silence or
  continue past a checkpoint while its answer is pending. A brief's
  pre-approval is an explicit decision made in advance, not silence; it
  covers only the stops and the small items described in
  [Task briefs and pre-approval](#task-briefs-and-pre-approval).
- Surface product, UX, architecture, or legal decisions to the user instead
  of silently choosing when the decision materially changes scope or risk.
- Keep `docs/product/roadmap.md` as a concise status index and the
  `docs/architecture/` and `docs/reference/` pages as the current-state
  system reference. Keep feature-specific rationale, review evidence, and
  history in `docs/features/<slug>/` and review records, linked from those
  pages.
- Follow [Write documentation](guides/writing-docs.md) for every doc change:
  one page type per page, the shared template, current state only in
  concept, guide and reference pages, and `npm run docs:check` passing.
- ADRs preserve decisions and rationale; do not use them as a substitute
  for describing the system as it works today.
- Security and compliance constraints are implementation requirements.
  Blocking findings are gates, not advisory notes.
- When a review identifies a missing standing rule, update
  `docs/reviews/security-compliance/project/security-baseline.md` or `docs/reviews/security-compliance/project/compliance-baseline.md` with the fix.
- Keep handoffs concise: report what changed, what was verified, what failed
  or deviated, and what decision or action is next.

## Feature artifact map

Feature records are point-in-time evidence. Not every feature needs every
artifact, but any skipped risk review or stage should be explained in its
feature record.

```text
docs/features/<slug>/
  planning.md                 discovery and unresolved decisions
  requirements.md             approved scope and acceptance criteria
  architecture.md             technical design and consumer impact
  design.md                   user flows, states, and copy
  qa-report.md                 verification evidence
```

Security and compliance artifacts live separately under
`docs/reviews/security-compliance/features/<slug>/`:

```text
  security-constraints.md     early security requirements, when applicable
  compliance-constraints.md   early compliance requirements, when applicable
  security-report.md          final security review, when applicable
  compliance-report.md        final compliance review, when applicable
```

## Documentation map

Which role updates which page. The placement rules and page template are in
[Write documentation](guides/writing-docs.md).

| Page or area | Updated by | When |
|---|---|---|
| `docs/architecture/*.md` | Architect | A pattern, access rule or mechanism changes |
| `docs/reference/data-model.md`, `code-map.md` | Architect (design), documentation engineer (verify) | A table, policy, RPC, trigger or shared module changes |
| `docs/reference/analytics-events.md` | Documentation engineer | An event is added, renamed or removed |
| `docs/product/roadmap.md` | PM (entry), documentation engineer (status) | A feature is scoped, shipped or released |
| `docs/product/principles.md` | PM, with user approval | A product principle or non-goal changes |
| `docs/adr/` and its index | Architect | A decision has real alternatives |
| `docs/guides/`, `docs/runbooks/` | Documentation engineer | A procedure changes |
| `docs/features/<slug>/` | The stage's role | Per feature; point-in-time, not rewritten later |
| `docs/reviews/` | Security, compliance, QA | Dated; not rewritten later |
| `CHANGELOG.md` | Documentation engineer | Proposal at the docs stage |
