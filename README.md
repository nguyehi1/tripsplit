# Splitiful

Split trip and event expenses with a friend group. Organizers can create and view a trip without
entering email up front; invitees can see its public summary from a shared link. Email verification
unlocks invitees' itemized ledger and changes, and unlocks changes for organizers.

## Current state

The core app and roster, expense, invite, and shared-list features are implemented. Trip types,
starter suggestions, and the home template shelf are implemented in this repository; their release
checklist is still open. [The roadmap](./docs/product/roadmap.md) is the current status source for shipped
work and outstanding release actions.

### Shipped capabilities

- **Trips and onboarding:** anonymous-first trip creation, public trip summaries, email-code
  verification for details and changes, remembered sign-in email, and one display name per account.
- **Expense splitting:** equal trip-wide split, expense dates, edit-own-expense, and settle-up
  summaries. The payer can delete their own expense on an open trip, with a short Undo (implemented,
  awaiting release; see the roadmap). No payment integration.
- **Roster:** name-only placeholder members, organizer removal of a real member, and member
  self-service leave. Removing a member does not rotate the invite link; see [ADR 0012](./docs/adr/0012-post-removal-detection-and-ghost-payer-rendering.md).
- **Shared list:** members can add and claim items; claimed items can be logged as expenses.
- **Invites:** organizers can open their own mail app with a prefilled shared invite link. Splitiful
  does not send or store invitee email addresses.
- **Interface:** warm-paper visual theme and route-backed add-expense/add-item sheets.

Feature requirements and QA records are linked from the [roadmap](./docs/product/roadmap.md). The trip
workflow and onboarding details are in
[docs/features/simplified-onboarding/requirements.md](./docs/features/simplified-onboarding/requirements.md).

## Project docs

Start at the [documentation index](./docs/README.md). The most useful pages:

| To… | Read |
|---|---|
| Understand how the system works | [Architecture overview](./docs/architecture/overview.md) |
| Look up a table, policy or RPC | [Data model](./docs/reference/data-model.md) |
| See what is shipped or open | [Roadmap](./docs/product/roadmap.md) |
| Ship a migration | [Apply a schema change](./docs/guides/apply-a-schema-change.md) |
| Track a new user action | [Add an analytics event](./docs/guides/add-an-analytics-event.md) |
| Operate production | [Runbooks](./docs/runbooks/README.md) |
| Understand a past decision | [ADRs](./docs/adr/README.md) and [feature records](./docs/features/README.md) |
| Work as an agent on a feature | [Agent workflow](./docs/agent-workflow.md) |
| Write or change docs | [Write documentation](./docs/guides/writing-docs.md) |

Feature planning and requirements files are point-in-time records; they may describe proposals that
were later changed or dropped. Use the roadmap for delivery status and the current code for exact
behavior.

## Stack

- **Frontend:** Next.js App Router, TypeScript, Tailwind CSS; deployed on Vercel.
- **Backend:** Supabase Postgres with row-level security and Supabase Auth (anonymous sessions and
  six-digit email OTP).

Receipt photo upload/OCR, per-expense subset splits, and payment links remain outside the current
release scope. The `receipts` storage bucket and `receipt_photo_url` column exist but are unused by
the app.

## Development

```bash
npm install
npm run dev
```

Requires a `.env.local` (copy `.env.local.example`) with:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Apply database migrations to your Supabase project with the Supabase CLI:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Pull requests also start a clean local Supabase stack and apply every migration with
`supabase db reset --local`. To run the same migration check locally, start Docker and run
`supabase start` followed by `supabase db reset --local`. This resets only the local Supabase
database; it does not target the linked remote project.

Two Supabase dashboard settings (not expressible as a SQL migration) are required for the
onboarding flow to work:

1. **Auth → Settings → enable Anonymous Sign-ins** — required for trip creation to start an
   anonymous session.
2. **Auth → Email Templates** — the "Confirm signup"/"Change Email Address" template (used when
   linking an anonymous session to a confirmed email) should be edited to match the "Magic
   Link"/OTP template's 6-digit-code wording, so the sign-in screen's "we sent you a code" copy
   is accurate regardless of which flow sent it. See
   [ADR 0006](./docs/adr/0006-anonymous-auth-and-otp-linking-for-onboarding.md) for why these two
   flows exist.

## Analytics

Splitiful uses **Vercel Analytics** to measure performance and understand user behavior. The app automatically tracks:

- **Web Vitals** — page performance metrics (Largest Contentful Paint, Interaction to Next Paint, Cumulative Layout Shift)
- **Custom events** — name-only key user actions (trip creation, trip types, expense logging, member invites, sign-in, settlement, suggestions)

All events are privacy-first: no personally identifiable information (names, emails, trip IDs, amounts) is collected. Data is retained for 30+ days on Vercel and is not shared with third parties.

See the [analytics events reference](./docs/reference/analytics-events.md) for the complete event catalog, [View analytics in Vercel](./docs/guides/view-analytics-in-vercel.md) for the dashboard, and [Add an analytics event](./docs/guides/add-an-analytics-event.md) for developer guidance.

## Deployment

Deployed on Vercel from this repo:

1. Import the repo in Vercel; the Next.js App Router build is detected automatically (no
   `vercel.json` needed).
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in Project Settings →
   Environment Variables for Production (and Preview, if previews should hit Supabase too).
3. Confirm Project Settings → Node.js Version is set to 22.x, matching `engines.node` in
   `package.json` — `@supabase/supabase-js` drops support for older Node versions.
4. Push migrations to the linked Supabase project (`supabase db push`) before or alongside the
   deploy — the app assumes the schema in `supabase/migrations` is already applied. For migration
   0022 this is a hard ordering: apply it **before** deploying, then run the live checks in the
   [release checklist](./docs/runbooks/releases/0022-trip-types.md).

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests, a production build, and a separate
clean-database migration replay on every push and pull request to `main`.

## License

Copyright (c) 2026 Hien Nguyen. All rights reserved. The repository is public for viewing; see
[LICENSE](./LICENSE). The Miso mascot art, logo and Splitiful name are not licensed for reuse.
