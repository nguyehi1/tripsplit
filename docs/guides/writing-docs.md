# Write documentation

Every page in `docs/` has one job and one reader. This guide defines the page types, where content belongs, and the template every concept, guide and reference page follows. Agents and humans use the same rules.

## Page types

| Type | Answers | Lives in | Tense and tone |
|---|---|---|---|
| **Concept** | How does the system work, and why? | `architecture/` | Present tense, current state only |
| **Guide** | How do I do X? | `guides/` | Imperative, numbered steps |
| **Reference** | What exactly is Y? | `reference/` | Tables and lists, no narrative |
| **Runbook** | What do I do when Z happens in production? | `runbooks/` | Imperative, copy-pasteable commands |
| **Product** | What are we building, and what is its status? | `product/` | Status and direction |
| **Record** | What happened, and what did we decide then? | `adr/`, `features/`, `reviews/`, `research/` | Past tense, dated, never rewritten |
| **Learning** | What does this concept mean? | `learn/` | Teaching tone, may lag the code |

A page is exactly one type. If a draft needs two, split it.

## Where does this content go?

| You are writing about… | Put it in |
|---|---|
| How a pattern works today (mutations, rendering, auth) | `architecture/<topic>.md` |
| A table, column, policy or RPC | `reference/data-model.md` |
| A shared module or file and who uses it | `reference/code-map.md` |
| An analytics event | `reference/analytics-events.md` |
| Steps a developer follows to get something done | `guides/<verb-phrase>.md` |
| A production procedure or operator command | `runbooks/<procedure>.md` |
| What is shipped, awaiting release, or open | `product/roadmap.md` |
| A product principle or non-goal | `product/principles.md` |
| Why a durable technical decision was made | `adr/NNNN-<title>.md` |
| Scope, design or QA for one feature | `features/<slug>/` |
| A dated audit, review or measurement | `reviews/` (closed findings only; see [Keep private material out](#keep-private-material-out)) |
| An unresolved security finding, or counsel correspondence | `private/` (git-ignored), never the public repo |
| Dated market or user research | `research/` |
| A release note | `CHANGELOG.md` |

## Page template

Concept, guide and reference pages use this shape:

```markdown
# Title

One paragraph: what this page covers and who needs it.

## Section
Short sections. Tables for rules, code blocks for examples.

## Why
One or two sentences and an ADR link (concept pages only).

## Related
- 3 to 5 links

Last verified: YYYY-MM-DD against <short commit hash>
```

## Rules

1. **Current state only.** Concept, guide and reference pages describe how things work now. Never write "as of the X feature", "previously", "no longer" or "was added by". History belongs in an ADR, a feature record, a review or `CHANGELOG.md`; link to it from **Why** or **Related**.
2. **One page, one job.** Do not mix a concept, a how-to and a lookup table on one page.
3. **Keep pages short.** Aim for 250 lines or fewer. Reference tables are the exception. Split a page that grows past that.
4. **Lead with the answer.** The first paragraph says what the page covers. The first lines of each section state the rule before the explanation.
5. **Prefer tables and code to paragraphs.** A rule with three attributes is a table row. A command is a code block with a language tag.
6. **Name pages with lowercase kebab-case.** Concepts and references use nouns (`auth.md`), guides use verb phrases (`add-an-analytics-event.md`). `README.md` is the only uppercase exception, by convention.
7. **Link, don't copy.** State a rule in one place and link to it. Use relative links to files and anchors.
8. **Dated content is a record.** If a page has a date in its meaning (an audit, a measurement, research), it goes in `reviews/` or `research/` with the date in its filename.
9. **Update "Last verified"** whenever you check or change a page against the code.
10. **Move, don't delete.** When a page is renamed or removed, add a row to the "Moved pages" table in [docs/README.md](../README.md).

## Keep private material out

This repository is public. Never commit:

- **Secrets:** keys, tokens, `.env*` files, service-role keys, connection strings.
- **Live identifiers:** production project refs and URLs, real user or trip ids, real email addresses. Use `<project>`, `<uid>` or `@example.invalid`.
- **Unresolved findings:** a security or compliance finding that is still exploitable or still a legal gap. Keep it in `private/` (git-ignored) until it is fixed, then move the closed report to `docs/reviews/`.
- **Counsel correspondence:** legal review requests and advice. Publishing them can waive privilege.
- **Local machine detail:** absolute paths, usernames, `.claude/settings.local.json`. `.claude/settings.json` holds only portable rules.

A fixed weakness is fine to document. An open one is a to-do list for an attacker. If a living page must mention a known gap, state the accepted limit without the steps to exploit it.

GitHub secret scanning and push protection are enabled on this repository as a backstop; they don't catch the other categories above.

## Who updates what

| Change | Update |
|---|---|
| System pattern, auth tier, rendering or mutation rule | The matching `architecture/` page |
| Table, column, RLS policy, RPC or trigger | `reference/data-model.md` |
| New shared module or a changed contract | `reference/code-map.md` |
| New, renamed or removed analytics event | `reference/analytics-events.md` |
| Shipped, in-flight or open work | `product/roadmap.md` |
| A tradeoff with real alternatives | A new ADR, and a row in the [ADR index](../adr/README.md) |
| Operator procedure | The matching `runbooks/` page |
| User-visible release note | `CHANGELOG.md` |

Roles and pipeline stages are in [Agent workflow](../agent-workflow.md).

## Check your links

Run `npm run docs:check` before committing documentation. It fails on any relative link or anchor that does not resolve.

## Related

- [Documentation index](../README.md)
- [Agent workflow](../agent-workflow.md)
- [ADR rules and template](../adr/README.md)

Last verified: 2026-10-20 against 9a951bb
