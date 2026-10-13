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
later. From the same roster, **Invite by email** opens the organizer's own mail app with a
prefilled message containing the trip's shared join link (Splitiful sends no email, never
receives the address and stores nothing). Full spec:
[docs/features/email-invites/requirements.md](./docs/features/email-invites/requirements.md).

Each account has **one display name** shared across all its trips (migration 0020). Creating a
trip doesn't ask for a name; a first-time prompt appears after sign-in or join if the account has
none. Feedback lives at the standalone `/feedback` page (session required; the old
`/trip/[id]/feedback` URL redirects there).

The organizer can also remove a real (non-placeholder) member from the trip's roster, and any
non-organizer member can leave a trip themselves, from the roster screen
(`/trip/[id]/invite`) — both require an explicit confirm step that discloses the removed/left
member could still rejoin by reusing the same invite link (there's no invite-code rotation in
this pass). Both hard-delete the `trip_members` row and are blocked once the trip is completed;
past expenses stay in the ledger untouched and attributed to the removed/left member, but
remaining members' computed shares recompute live across the smaller member count, the same way
they already do when someone joins mid-trip. The removed/left member sees an explicit in-app
"you're no longer on this trip" state the next time they visit — not an email — unless they
never logged an expense on that trip before being removed, in which case they see the existing
generic "trip not found" view instead (a disclosed, accepted gap — see
[ADR 0012](./docs/adr/0012-post-removal-detection-and-ghost-payer-rendering.md)). The organizer
can't remove or leave a trip via this flow. Full spec:
[docs/features/remove-member-access/requirements.md](./docs/features/remove-member-access/requirements.md).

The trip page has a third **List** tab (alongside Expenses/Details) for a shared shopping list:
any verified real trip member can add free-text items, claim an open item for themselves
(single first-come claimer, enforced at the database level against claim races), and release
their own claim via a × control — unclaim is claimer-only, not any member. A user's
claimed-unlogged items appear as multi-select pills in the add-expense sheet; selecting one or
more composes the expense's description as a comma-joined list of the selected items' names
(the amount is always typed by hand, never auto-filled). Submitting the expense marks the
selected items "logged" and links them to it, atomically with the expense's creation; logged
items move to a "Bought" section and tap through to their linked expense (read-only for anyone
but the payer, or on a locked trip). The Expenses tab shows a small badge counting the current
user's own claimed-unlogged items. Placeholder members can't claim or add items. A dark-mode/
glass visual variant was designed but deferred — not built in this pass, see
[docs/ROADMAP.md](./docs/ROADMAP.md). Full spec:
[docs/features/shopping-list/requirements.md](./docs/features/shopping-list/requirements.md).

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
- The organizer can remove a real member from the roster, and any non-organizer member can leave
  a trip themselves; both are locked once the trip is completed and neither rotates the invite
  code (removal/leaving is disclosed as reversible by reusing the same link, not true access
  revocation). See the "Status" section above for the full behavior.
- A shared, per-trip shopping list (the "List" tab) lets any verified member add items and claim
  one for themselves; a claimer's claimed-unlogged items can be selected as pills in the
  add-expense sheet to prefill the description, then move to "Bought" once that expense is
  logged. No price/quantity on a list item, no co-claiming, and no delete/undo of a logged item
  yet. See the "Status" section above for the full behavior.
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
