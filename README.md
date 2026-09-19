# Splitiful

Split trip/event expenses with a friend group. Create a trip in seconds — no account or email
required — add expenses as you go, and see who owes who. Anyone with an invite link can see a
trip's running totals with zero sign-up; an email is only ever asked for at the moment someone
wants the itemized expense list or wants to add/edit an expense.

## Status

Core v1 flow is implemented: Supabase schema/auth/RLS, trip dashboard (expenses + settle-up),
add-expense, edit-own-expense, and feedback. The trip organizer can also add name-only
"placeholder" members — no account or invite needed — for people who won't use the app, so the
equal split still accounts for everyone on the trip; the organizer can rename or remove them
later.

**Onboarding** is a two-track model (see
[docs/features/simplified-onboarding/requirements.md](./docs/features/simplified-onboarding/requirements.md)
for the full spec):

- **Organizer**: tapping "Create your first trip" creates the trip immediately behind an
  anonymous Supabase session on that browser — no email, no code. The organizer can fully view
  their own trip right away, but Add expense, Settle up, and Invite/roster-management are
  hidden from the trip page until they confirm an email via an inline "email → 6-digit code"
  prompt on the trip page itself (no navigation to another screen). Confirming upgrades that
  same session to a permanent identity and reveals all three actions, fully unlocked — nothing
  to redo.
- **Invitee**: opening an invite link shows the trip's public summary (totals, who-owes-who)
  with zero auth. The moment someone tries to view the itemized expense list, or add/edit an
  expense, that's what triggers the existing email + 6-digit-code sign-in flow — confirming
  unlocks both viewing detail and writing in one step.

A returning visitor on the same browser/device goes straight back into their trip(s); signing in
from a new device (or after clearing storage) uses the same email + code flow and lands on a
trips list page, since one email can be tied to multiple trips. Sign-in remembers the last email
used on a device (local-only, with an easy "clear" option) so returning users don't have to
retype it.

**Visual design**: the welcome, create-a-trip, trip view, and add-expense screens use a "warm
paper" theme — lit paper background with an ochre/terracotta ambient glow, a blurred sticky nav,
floating capsule primary actions, a faint paw-print texture, and a mascot named Miso (currently
placeholder art on the welcome screen; final-resolution art is a tracked fast-follow, see
[docs/ROADMAP.md](./docs/ROADMAP.md)). Colors, shadows, and radii are all named CSS custom
properties in `src/app/globals.css` so a future dark theme is a token swap, not a rebuild — see
[ADR 0007](./docs/adr/0007-css-custom-property-tokens-for-themeable-restyle.md). Add-expense opens
as a spring-up overlay sheet over the (dimmed) trip view rather than a separate page, but its URL
(`/trip/[id]/add-expense`) still works as a direct link or on refresh, and the browser back button
closes it — see [ADR 0008](./docs/adr/0008-add-expense-sheet-via-intercepting-parallel-routes.md).
Full spec: [docs/features/ux-revamp/design.md](./docs/features/ux-revamp/design.md).

Pre-production hardening still pending.

## Docs

- [docs/market-research.md](./docs/market-research.md) — competitive landscape and positioning.
- [docs/user-flow.html](./docs/user-flow.html) — auth + navigation flow from invite link to
  Trip Home (open in a browser).
- Build plan: `~/.claude/plans/gentle-tumbling-floyd.md` — locked product decisions, schema, auth
  flow, app structure, settlement algorithm, and milestone sequence for v1.

## Stack

- **Frontend**: Next.js (App Router, TypeScript) + Tailwind CSS, deployed on Vercel.
- **Backend**: Supabase — Postgres with row-level security, Auth (anonymous sessions +
  6-digit email OTP sign-in), Storage (receipt photos, v2).

## v1 scope

- Whole-trip equal split (total ÷ member count), computed live.
- Manual expense entry (amount + description + date — date is optional and defaults to today
  when left blank).
- The member who paid for an expense can edit its amount/description/date afterward, until the
  trip is completed (date is required on edit); editing another member's expense is rejected
  server-side (RLS), not just hidden in the UI.
- The expense list shows each expense's actual date (e.g. "Mon, 9/14"), not just the log-entry
  weekday.
- The organizer can add name-only "placeholder" members (no invite or account needed) to the
  trip's roster (`/trip/[id]/invite`) so someone who won't use the app still counts in the equal
  split; a placeholder always displays as "<name> (placeholder)", counts as a full member with
  $0 paid, and can never be an expense's payer. The organizer can rename or remove a placeholder
  at any time (up to 20 per trip); there's no auto-claim/merge, so once the real person joins
  for real, the organizer must manually remove the stale placeholder or that person is
  double-counted. Add/rename/remove are all locked once the trip is completed.
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
- **Custom events** — 14 key user actions (trip creation, expense logging, member invites, sign-in, settlement)

All events are privacy-first: no personally identifiable information (names, emails, trip IDs, amounts) is collected. Data is retained for 30+ days on Vercel and is not shared with third parties.

See [docs/ANALYTICS.md](./docs/ANALYTICS.md) for the complete event catalog, how to view metrics in the Vercel dashboard, and developer guidance for adding new events.

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
