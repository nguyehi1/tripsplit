# Documentation

Find the right page by what you want to do. Pages are grouped by type: concepts explain, guides walk through a task, references are for lookup, runbooks cover production operations, and records preserve history. The rules are in [Write documentation](guides/writing-docs.md).

## Understand the system

| Page | Read it for |
|---|---|
| [Architecture overview](architecture/overview.md) | Stack, request flow, and the five patterns. Start here. |
| [Mutations](architecture/mutations.md) | How writes, locking and expense deletion work |
| [Rendering](architecture/rendering.md) | Server Components, sheet routes, design tokens |
| [Auth](architecture/auth.md) | Anonymous sessions, the three access tiers, the proxy |
| [Telemetry](architecture/telemetry.md) | Analytics events and timing logs |
| [Performance](architecture/performance.md) | Rules for fast reads, RLS and indexing |
| [User flow diagram](architecture/user-flow.html) | Auth and navigation flow (open in a browser) |

## Look something up

| Page | Contents |
|---|---|
| [Data model](reference/data-model.md) | Tables, RLS policies, functions, triggers, scheduled jobs |
| [Code map](reference/code-map.md) | Shared modules and the rule for extending each |
| [Analytics events](reference/analytics-events.md) | Every custom event |

## Get something done

| Guide | Use it to |
|---|---|
| [Write documentation](guides/writing-docs.md) | Choose a page type and follow the template |
| [Apply a schema change](guides/apply-a-schema-change.md) | Ship a migration safely |
| [Add an analytics event](guides/add-an-analytics-event.md) | Track a new action |
| [View analytics in Vercel](guides/view-analytics-in-vercel.md) | Read vitals and event counts |
| [Agent workflow](agent-workflow.md) | See the team roles, stages and review gates for a feature |

## Operate production

See [Runbooks](runbooks/README.md) for privacy requests (export and delete), anonymous-account retention, the expense erase job, and migration release checklists.

## Product

| Page | Contents |
|---|---|
| [Roadmap](product/roadmap.md) | What is shipped, awaiting release, or open |
| [Principles](product/principles.md) | Thesis, design principles, non-goals |
| [Analytics privacy](product/analytics-privacy.md) | What analytics collects and how long it is kept |

## Security and compliance

- [Security baseline](reviews/security-compliance/project/security-baseline.md) and [compliance baseline](reviews/security-compliance/project/compliance-baseline.md): standing rules for new work.
- [Security and compliance reviews](reviews/security-compliance/README.md): dated audits and feature reviews, preserved as evidence.

## Learn

- [System design knowledge base](learn/knowledge.md): a long-form guide that uses Splitiful as its example. Educational, may lag the code.

## History

These are records. They preserve what was decided or found at the time and are not rewritten. For current behavior, use the pages above and the code.

| Records | Contents |
|---|---|
| [ADRs](adr/README.md) | Durable technical decisions and the [decision index](adr/README.md#index). Superseded ADRs stay as history. |
| [Feature records](features/README.md) | Planning, requirements, architecture, design and QA for each feature |
| [Reviews](reviews/performance-review-2026-10.md) | [Performance review](reviews/performance-review-2026-10.md), [security and compliance](reviews/security-compliance/README.md) |
| [Market research](research/market-research-2026-09.md) | Competitive research dated 2026-09-09. Not a current market source. |

## Moved pages

| Old path | New path |
|---|---|
| `docs/ARCHITECTURE.md` | [architecture/](architecture/overview.md), [reference/data-model.md](reference/data-model.md), [reference/code-map.md](reference/code-map.md) |
| `docs/ARCHITECTURE.md` "Performance review notes" | [reviews/performance-review-2026-10.md](reviews/performance-review-2026-10.md) |
| `docs/ARCHITECTURE.md` "ADR index" | [adr/README.md](adr/README.md#index) |
| `docs/ANALYTICS.md` | [reference/analytics-events.md](reference/analytics-events.md), [guides/add-an-analytics-event.md](guides/add-an-analytics-event.md), [guides/view-analytics-in-vercel.md](guides/view-analytics-in-vercel.md), [product/analytics-privacy.md](product/analytics-privacy.md) |
| `docs/ROADMAP.md` | [product/roadmap.md](product/roadmap.md), [product/principles.md](product/principles.md) |
| `docs/knowledge.md` | [learn/knowledge.md](learn/knowledge.md) |
| `docs/market-research.md` | [research/market-research-2026-09.md](research/market-research-2026-09.md) |
| `docs/user-flow.html` | [architecture/user-flow.html](architecture/user-flow.html) |
| `docs/runbooks/account-deletion-and-export.md` | [runbooks/](runbooks/README.md): [export](runbooks/export-user-data.md), [delete](runbooks/delete-an-account.md), [retention](runbooks/anonymous-account-retention.md), [erase job](runbooks/monitor-expense-erase.md), [release 0022](runbooks/releases/0022-trip-types.md), [release 0024](runbooks/releases/0024-expense-delete.md) |
| `docs/reviews/ux-consistency-review-2026-09-30.md` | Removed as out of date (2026-10-21). Re-run the review when needed; the old text is in git history. |

Applied migrations and released `CHANGELOG.md` entries are immutable and still cite the old paths. Use this table to find them.

Two ADR files are both numbered `0014`; their contents differ. Keep both. Renumbering requires a coordinated link update.
