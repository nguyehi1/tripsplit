# TripSplit

Split trip/event expenses with a friend group. Join a trip by link (no upfront account needed
beyond a magic-link email), log expenses as you go, and see who owes who.

## Status

Core v1 flow is implemented: Supabase schema/auth/RLS, invite-link join, trip dashboard
(expenses + settle-up), add-expense, and feedback. Pre-production hardening still pending.

## Docs

- [docs/market-research.md](./docs/market-research.md) — competitive landscape and positioning.
- [docs/user-flow.html](./docs/user-flow.html) — auth + navigation flow from invite link to
  Trip Home (open in a browser).
- Build plan: `~/.claude/plans/gentle-tumbling-floyd.md` — locked product decisions, schema, auth
  flow, app structure, settlement algorithm, and milestone sequence for v1.

## Stack

- **Frontend**: Next.js (App Router, TypeScript) + Tailwind CSS, deployed on Vercel.
- **Backend**: Supabase — Postgres, Auth (email magic link), Storage (receipt photos, v2).

## v1 scope

- Whole-trip equal split (total ÷ member count), computed live.
- Manual expense entry (amount + description).
- Two views: Summary (settle-up transactions) and Details (per-person paid/share table).
- Displays amounts owed; no payment integration yet.

Receipt photo upload (alongside OCR parsing), per-expense subset splits, and Venmo/PayPal links
are deferred to v2. The `receipts` storage bucket and `receipt_photo_url` column already exist
in the schema but are unused by the app until then.

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

## Deployment

Deployed on Vercel from this repo:

1. Import the repo in Vercel; the Next.js App Router build is detected automatically (no
   `vercel.json` needed).
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in Project Settings →
   Environment Variables for Production (and Preview, if previews should hit Supabase too).
3. Confirm Project Settings → Node.js Version is set to 22.x, matching `engines.node` in
   `package.json` — `@supabase/supabase-js` drops support for older Node versions.
4. Push migrations to the linked Supabase project (`supabase db push`) before or alongside the
   deploy — the app assumes the schema in `supabase/migrations` is already applied.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests, and a production build on every push
and pull request to `main`.
