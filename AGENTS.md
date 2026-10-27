<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Shared agent workflow

Follow [`docs/agent-workflow.md`](docs/agent-workflow.md) for the portable
team roles, the feature lane (`/feature`) and fix lane (`/fix`), task
briefs and pre-approval, loop limits, review gates, and documentation
ownership. Tool-
specific files (such as `CLAUDE.md` and `.claude/skills/feature/`) are entry
points; keep shared workflow policy in that document rather than duplicating it.

# Documentation

Follow [`docs/guides/writing-docs.md`](docs/guides/writing-docs.md) for any
doc change: one page type per page, current state only in `architecture/`,
`reference/`, `guides/` and `runbooks/`, history in ADRs, features and
reviews. Run `npm run docs:check` before committing docs.
