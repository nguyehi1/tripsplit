# Architecture

Current-state snapshot of the system. The `architect` agent updates this file
(amends it, does not replace it) every time `/feature` touches something
architecturally significant. For *why* a past decision was made — especially
one later reversed or superseded — see [`adr/`](adr/) rather than trying to
reconstruct it from this file's edit history.

## System overview

Splitiful is a Next.js 16 (App Router) app with Supabase for auth, database,
and row-level security, and Gmail SMTP (via `nodemailer`) for transactional
email. Deployed on Vercel.

**Mutation pattern**: almost all writes go directly from client components
through the Supabase browser client (`src/lib/supabase/client.ts`), calling
either a table `.insert()`/`.update()` or a `security definer` RPC (e.g.
`create_trip`, `join_trip`, `complete_trip`), with **RLS as the authorization
boundary** — there is deliberately no Next.js route handler in that path.
`src/app/api/` is reserved for the rare case where a server-held secret is
involved (currently just `trip-email/route.ts`, which needs the Gmail App
Password). New CRUD-style mutations should default to the direct-client pattern
and only add an API route when there's a genuine server-secret or
server-only-computation reason to.

**Read/render pattern**: data-fetch-then-render pages default to **Server
Components** that fetch via `src/lib/supabase/server.ts`'s `createClient()`
during SSR, not client components that fetch on mount. `src/app/trips/page.tsx`
and `src/app/trip/[id]/page.tsx` (the trips list and trip dashboard) were
converted from the latter to the former by the ssr-trip-pages feature,
specifically to remove a redundant client-side `supabase.auth.getUser()` +
data-fetch waterfall that `src/proxy.ts`'s existing server-side auth gate had
already made unnecessary. Interactive-only pieces (state that doesn't need a
server round trip, e.g. a tab switch) are split into small, co-located
`"use client"` leaves fed by props from the Server Component; pure navigation
(`router.push` for a plain link) is expressed as `<Link>` (or the
`LinkButton`/`IconLinkButton` primitives in `src/components/ui.tsx`) instead
of a client-side `onClick` handler, since a function prop can't cross the
Server → Client boundary but an `href` string can. See
[ADR 0005](adr/0005-ssr-page-conversion-pattern.md) for the full pattern —
it's the template for the still-deferred conversions of `check-email`,
`join/[code]`, and the home page, which are more form-heavy and will need a
case-by-case split rather than converting wholesale. At the time of that
feature, `src/proxy.ts` was the sole place `/trips`/`/trip/*` auth-gating
happened (session existence only); a Server Component page additionally
checked trip *membership* itself (via RLS surfacing an error from
`getTripView`/`getMyTrips`, rendered as the existing inline "couldn't load"
UI) since that's a check `proxy.ts` structurally cannot make. **As of the
simplified-onboarding feature this is no longer true for `/trip/*`** — see
the "Auth model" note directly below; `/trips` alone still matches the
description above unchanged.

**Modal-that's-also-a-route pattern (parallel + intercepting routes)**: as of
the ux-revamp feature, `src/app/trip/[id]/` has the app's first
`layout.tsx` and first parallel route (`@sheet`), used to render add-expense
as an overlay sheet over the trip view while keeping
`/trip/[id]/add-expense` independently loadable/shareable and closable via
the browser back button. `@sheet/(.)add-expense/page.tsx` intercepts
in-app, client-side navigation to that URL (so the trip view underneath is
never re-fetched or remounted — it's the real reason this mechanism, not a
query-param/client-state overlay, was chosen); `add-expense/page.tsx` itself
remains the literal route, now rendering the full trip dashboard with the
sheet already open, as the hard-navigation/deep-link/refresh fallback (Next
only intercepts soft, client-side navigation). `@sheet/default.tsx`,
`@sheet/page.tsx`, and `@sheet/[...catchAll]/page.tsx` all return `null` so
the sheet never gets left "stuck" open when navigating elsewhere under
`/trip/[id]/*`. `layout.tsx` also routes `children` through a new
`"use client"` leaf, `trip-sheet-chrome.tsx`, which derives whether the
sheet is open from `usePathname()` (true for both the intercepted and the
hard-nav-fallback case, since intercepting a route still updates the real
pathname) and applies/transitions the trip view's dim/blur/scale
accordingly — this is what keeps the background's "receding" motion
synced with the sheet's own spring-up, and, since a value already in place
at first paint never CSS-transitions, is also what makes a cold load
(direct hit or refresh) render already dimmed with no replayed entrance
animation, with no separate flag needed for that half of the motion. See
[ADR 0008](adr/0008-add-expense-sheet-via-intercepting-parallel-routes.md)
and `docs/features/ux-revamp/architecture.md` for the full design, the
rejected simpler alternative, and why this is reserved for the
page-vs-overlay case rather than adopted as a new default over ADR 0005's
plain Server Component + `<Link>` pattern.

**Design tokens / theming**: as of the ux-revamp feature, all color,
shadow, and radius values used by a restyled screen are expected to be named
CSS custom properties declared in `src/app/globals.css`'s `:root` block
(mirrored into the adjacent `@theme inline` block for Tailwind utility-class
access), not hardcoded per-component literals — so that a future dark theme
is a token-value swap (a new `[data-theme="dark"]` block in that one file)
rather than a component-by-component rebuild. Exactly one theme ("warm
paper") is resolved today; no toggle, `[data-theme]` attribute, or
`prefers-color-scheme` handling exists yet — see
[ADR 0007](adr/0007-css-custom-property-tokens-for-themeable-restyle.md) for
the full decision and the discipline this places on future component code
(reference `var(--token)` / a token-backed utility class, never a raw
hex/oklch/rgba literal, for anything that should participate in a future
theme swap).

**Auth model — anonymous sessions + a three-tier verification boundary**: as
of the simplified-onboarding feature, not every session is a permanent,
email-verified identity. `supabase.auth.signInAnonymously()` (Supabase
anonymous auth) issues a real `auth.users` row and session — `auth.uid()`
is never null for an anonymous session, only `auth.jwt() ->>
'is_anonymous'` distinguishes it from a permanent one — so RLS ownership
(`trips.created_by = auth.uid()`) works identically for both from the
moment a trip is created, with no separate client-only ownership flag.
Trip-scoped data now has three access tiers, checked in RLS/RPCs (not
`src/proxy.ts`, which only ever checked session existence and still does):
(1) a trip's **summary** (aggregated totals, who-owes-whom — no line
items) is readable with **no session at all**, via the `get_trip_summary`
`security definer` RPC (same public-RPC pattern as
`get_trip_by_invite_code`); (2) **detailed** expense line items and the
member roster require `is_owner_or_verified_member(trip_id)` — true for a
trip's owner (any session, anonymous or not) or for any non-anonymous
session that's a trip member; (3) **writes** (expenses, "invite"'s
server-side effects, placeholder-member management, and `complete_trip`
"settle up") require the narrower `is_verified_trip_member(trip_id)` (or, for
`complete_trip` specifically as of migration 0011, an equivalent standalone
`is_anonymous = false` guard) — true only for a *non-anonymous*
owner-or-member, deliberately excluding the pre-verification owner, so
that viewing one's own trip is free but mutating it always requires
completing the existing OTP code flow at least once. `complete_trip` was a
gap in this rule from when anonymous auth first shipped (migration 0009)
until migration 0011 closed it — see
`docs/features/simplified-onboarding/architecture.md`'s "Settle-up
(Decision 13)" section. Both non-`complete_trip` predicates are `security
definer` SQL functions built from the existing `is_trip_member`/ownership
checks, added by `docs/features/simplified-onboarding/architecture.md`; see
that doc and
[ADR 0006](adr/0006-anonymous-auth-and-otp-linking-for-onboarding.md) for
the full policy list and the Supabase anonymous-to-permanent linking
mechanism (`updateUser({ email })` + `verifyOtp({ type: 'email_change' })`)
used to carry that ownership forward when an anonymous session's email is
confirmed — a different call pair than the `signInWithOtp`/
`verifyOtp({ type: 'email' })` pair still used, unchanged, for a returning
visitor with no active anonymous session. `src/proxy.ts` no longer gates
`/trip/new` or `/trip/[id]*` on session existence at all (only `/trips`
still requires *some* session) — RLS/the RPC tier above is the real
enforcement for those paths now, more so than before.

**Client-side gating mechanics differ by relationship to the trip.** For an
**invitee**, the trigger to verify is still attempt-then-redirect: viewing
detail or writing an expense redirects to the full-page `/check-email` OTP
flow and resumes the attempted action on success
(`src/lib/auth-gate.ts`'s `requireVerifiedSession` +
`src/lib/pending-action.ts`'s save-draft-and-resume). For the **organizer's
own trip**, this was replaced by a hide-and-reveal pattern: the trip page
hides its mutating entry points (Add expense, Settle up, Invite others)
entirely while the owner's session is unverified and shows a persistent
inline email/code verification widget in their place, with no navigation to
`/check-email` — see
`docs/features/simplified-onboarding/architecture.md`'s "Update:
hide-and-reveal replaces attempt-then-redirect for the organizer" section
for the full mechanics and rationale. Both mechanisms sit in front of the
same RLS/RPC enforcement described above; neither is itself the security
boundary.

**Locking**: a trip can be marked completed (`trips.completed_at`, set by the
`complete_trip` RPC, organizer-only, one-way — no "reopen" RPC exists). Once
completed, `public.is_trip_open(trip_id)` returns false and every write-side
RLS policy on `expenses` (`insert`/`update`/`delete`) requires it, so no
expense can be added, edited, or deleted on a completed trip. UI mirrors this
with a locked-state screen (see `src/app/trip/[id]/add-expense/page.tsx`).
As of the add-placeholder-members feature, `add_placeholder_member`/
`rename_placeholder_member`/`remove_placeholder_member` also require
`is_trip_open(trip_id)` and reject with a clear error once a trip is
completed — removing a placeholder retroactively shifts a completed trip's
live-computed split (see below), so this was deliberately locked down rather
than left open the way `join_trip` still is. `join_trip` itself remains
**unlocked** — a real member can still join a completed trip today; that
pre-existing gap was out of scope for this feature and was left as-is rather
than solved unprompted.

**Client-local device state**: not everything needs to be server state.
Browser `localStorage` is used for small, non-sensitive, per-device
conveniences that don't warrant a DB column or session data (e.g. the
sign-in screen remembering the last-used email — see
`src/lib/remembered-email.ts`). Convention for this kind of module: a
namespaced key, and every read/write wrapped in try/catch so the feature
degrades to today's behavior (not an error) when storage is unavailable or
blocked (private browsing, disabled storage).

**Analytics & event tracking**: Vercel Analytics (`@vercel/analytics`) collects
Web Vitals (LCP, INP, CLS) automatically via the `<Analytics />` component in
the root layout (`src/app/layout.tsx`). Custom event tracking (trip creation,
expense flows, joins, invites, sign-in, settlement) is implemented via a shared
wrapper `src/lib/tracking.ts` that calls Vercel's `track()` function — event
names only, no custom data fields, to avoid PII risk. All tracking is
client-only (runs in `"use client"` components). Events fire on page mount (for
page-view events like `trip_create_start`) or in success callbacks after data
mutations (like `trip_create_complete`). See
[`docs/features/vercel-analytics/architecture.md`](features/vercel-analytics/architecture.md)
for the full event list, placement, and privacy safeguards.

**Additive `not null` schema changes on populated tables**: sequence as add
nullable -> backfill -> set DB-level default -> set `not null`, all in one
migration file (see
`supabase/migrations/0007_add_expense_date.sql` and
[ADR 0003](adr/0003-expense-date-column-sequencing.md) for the worked
example). This matters because a Supabase migration and a Vercel deploy are
not atomic — old, not-yet-redeployed app code can still be inserting rows
against the new schema for a window after the migration lands, and a DB-level
default is what keeps those inserts (which don't yet send the new column)
succeeding until the new frontend is live. The *reverse* direction —
loosening an existing `not null` column to nullable, or adding a new nullable
column with an always-correct default — needs no such phasing; see
`supabase/migrations/0008_add_placeholder_members.sql` for that simpler case.

## Data model

Schema is managed via `supabase/migrations/NNNN_*.sql` (sequential, never
edited after merge). See migration files for the authoritative current
schema; summarized here as it stabilizes:

- `trips` — one row per trip; `completed_at` (nullable) is the lock; unique
  `invite_code` is how joining works.
- `trip_members` — join table (`trip_id`, `user_id`, `display_name`); no
  direct `insert` RLS policy — the only way a row is created is through the
  `create_trip`/`join_trip` RPCs (`security definer`), so a client can't
  fabricate membership by guessing a trip's UUID. There is currently no way
  to remove a *real* member from a trip (no "leave trip" flow exists anywhere
  in `src/`). As of the add-placeholder-members feature, `user_id` is
  **nullable** and a new `is_placeholder boolean not null default false`
  column marks name-only members with no Supabase auth account — a check
  constraint ties the two together (`is_placeholder` iff `user_id is null`).
  Placeholders are created/renamed/removed exclusively through
  `add_placeholder_member`/`rename_placeholder_member`/
  `remove_placeholder_member` (`security definer`, organizer-only, and for
  rename/remove, placeholder-only-by-query — see
  `docs/features/add-placeholder-members/architecture.md`), following the
  same "RPC is the only write path" pattern as `create_trip`/`join_trip`.
  The existing `unique (trip_id, user_id)` constraint needed no change to
  support multiple placeholders per trip: Postgres's default unique-index
  semantics already treat every `NULL` as distinct from every other `NULL`.
  **Important for any code reading `trip_members`**: because `user_id` is no
  longer guaranteed unique-and-non-null per row, `src/lib/data/trips.ts`
  identifies a member by `trip_members.id` (the row's own primary key), not
  `user_id`, in everything it returns (`members[].id`, `you.id`,
  `expense.payer.id`, etc.) — see
  [ADR 0004](adr/0004-placeholder-member-nullable-user-id-and-identity-key.md).
  `user_id` remains available on the raw row for matching against
  `expenses.paid_by` (which is still always a real user id), but is not used
  as the display-layer identity key anymore.
- `expenses` — one row per logged expense; `paid_by` (set once, at insert,
  to the submitting user) is the **only** ownership signal — there is no
  separate `created_by` column. `amount` is `numeric(10,2)` dollars,
  converted to/from integer cents at the `src/lib/currency.ts` boundary.
  `date` (added by the expense-date-month feature,
  `supabase/migrations/0007_add_expense_date.sql`) is the calendar date the
  expense happened, distinct from `created_at` (the insert-time log
  timestamp) — `not null` with a `current_date` DB-level default and a
  `date <= current_date` check, backfilled from `created_at::date` for
  pre-feature rows. Splits are **not** stored per-expense — every screen
  that needs a member's share computes it dynamically (equal split across
  current `trip_members` count) via `src/lib/settlement.ts`, so changing an
  expense's `amount` needs no reconciliation of separate split rows. This
  also means a placeholder member (add-placeholder-members feature) is
  included in that count with zero settlement-logic changes — it's just a
  member row with no expenses ever attached to it, since `paid_by` still
  references `auth.users(id)` directly and a placeholder never has a
  corresponding `auth.users` row to reference.
- `feedback` — free-standing, scoped to `user_id = auth.uid()` on both
  read and write.

**RLS on `expenses`** (the policy set most likely to need attention as
future features touch expenses — see ADRs before changing further):
- `select` — as of simplified-onboarding, `is_owner_or_verified_member(trip_id)`
  (a trip's owner, any session; or a non-anonymous member) — **not** plain
  `is_trip_member`, since an unverified non-owner must not see line items
  (tier 2 of the three-tier model above).
- `insert` — as of simplified-onboarding, `is_verified_trip_member(trip_id)`
  (excludes the pre-verification owner, unlike `select`'s predicate) and
  `is_trip_open(trip_id)`, and only if `paid_by` is itself a trip member.
  This `exists` check against `trip_members` (`user_id = expenses.paid_by`)
  can never match a placeholder row, since a placeholder's `user_id` is
  `null` and SQL's `null = <anything>` is never true — combined with
  `paid_by`'s own `not null` FK to `auth.users(id)` (a table placeholders
  never appear in at all), this policy needed no change to keep
  placeholders permanently unable to be a payer.
- `update` — as of the edit-own-expense feature, only the row's own
  `paid_by` (i.e., only the member who logged it), only while
  `is_trip_open(trip_id)`; as of simplified-onboarding, that member check is
  `is_verified_trip_member(trip_id)`. See
  [ADR 0002](adr/0002-restrict-expense-update-rls-to-payer.md) for why this
  was narrowed from "any trip member" and what it doesn't (yet) guarantee
  (`trip_id` isn't independently pinned by this policy — mitigated at the
  application layer today, not the DB).
- `delete` — still any *verified* member (`is_verified_trip_member`, as of
  simplified-onboarding), on an open trip — **intentionally not yet scoped
  to `paid_by`**, because no delete UI/flow exists yet. This is now *more*
  permissive than `update` on the same table; a future delete feature
  should revisit whether to apply the same payer-scoping (see ADR 0002's
  consequences).

**RLS on `trip_members`** (`select`): as of simplified-onboarding,
`is_owner_or_verified_member(trip_id)` — same predicate and same rationale
as `expenses`' `select` above (roster identity is detail-tier, readable by
a pre-verification owner, gated behind verification for anyone else).

## Known integration points / shared code

Track anything with more than one consumer here, so future features check
this before adding a parallel implementation.

- `src/lib/data/trips.ts` — the one data-access module for trips/expenses;
  wraps every read/write against `trips`, `trip_members`, and `expenses`
  behind typed functions (`createTrip`, `joinTrip`, `completeTrip`,
  `addExpense`, `updateExpense`, `getMyTrips`, `getTripView`, and as of
  simplified-onboarding, `getTripSummary` — the zero-auth, aggregates-only
  sibling of `getTripView` wrapping the `get_trip_summary` RPC; see that
  feature's architecture doc). New trip/expense read or write logic belongs
  here, not inlined in a page.
  As of the add-placeholder-members feature, this is also where the
  `user_id`-nullable-per-row reality of `trip_members` is translated into a
  stable `trip_members.id`-based identity for every shaped member object it
  returns — see the `trip_members` entry above and ADR 0004. Any new
  function added here that shapes member data should reuse that same
  row-id-based identity rather than reintroducing `user_id` as a display key.
  Both functions take a generic `SupabaseClient<Database>`, satisfied by
  both `src/lib/supabase/client.ts`'s browser client and
  `src/lib/supabase/server.ts`'s server client — as of the ssr-trip-pages
  feature they're called from a Server Component (`src/app/trip/[id]/page.tsx`,
  `src/app/trips/page.tsx`) as well as several remaining client components
  (`settle-up`, `invite`, `join/[code]/welcome`), with no signature change
  needed for either caller type. As of the ux-revamp feature,
  `src/app/trip/[id]/page.tsx`'s body is factored into a shared, exported
  render function so `src/app/trip/[id]/add-expense/page.tsx` (the
  hard-navigation fallback for the add-expense sheet) can reuse the same
  tiered fetch/render without a second implementation — see
  [ADR 0008](adr/0008-add-expense-sheet-via-intercepting-parallel-routes.md).
- Amount/description validation for an expense (positive amount, non-empty
  description) lives in `src/lib/validation/expense.ts`
  (`isValidExpenseInput`), shared by `src/app/trip/[id]/add-expense/page.tsx`
  and `src/app/trip/[id]/expense/[expenseId]/edit/page.tsx` — extracted as
  part of edit-own-expense once a second call site existed. New expense-form
  surfaces should import this rather than reinlining the rule. Date
  validation (real calendar date, not in the future) lives alongside it as
  `isValidExpenseDate`, added by the expense-date-month feature.
- `src/lib/dates.ts` — shared date-formatting/date-math helpers
  (`formatDate`, `formatDateRange`, and, as of expense-date-month,
  `todayIso` and `formatDayDate`), used by trip-date display and now
  expense-date display/defaulting. New date formatting or "what's today"
  logic anywhere in the app should go through here rather than reimplementing
  `Date` handling at the call site — in particular, `todayIso()` is the
  browser-local "today," deliberately not the DB's `current_date` (UTC);
  see [ADR 0003](adr/0003-expense-date-column-sequencing.md) for why the
  distinction matters. As of the ssr-trip-pages feature, `formatDate`/
  `formatDayDate`/`formatDateRange` (everything *except* `todayIso`, which is
  deliberately left local-anchored) parse and format their plain-calendar-date
  inputs against an explicit, fixed `"UTC"` zone rather than relying on the
  runtime's implicit local timezone — needed once code calling them could run
  server-side (a fixed process timezone) as well as client-side (the
  visitor's own), and applied at the shared-module level so every caller,
  converted or not, gets the same environment-independent, correct-by-construction
  formatting rather than two different behaviors depending on where the
  caller happens to run.
- `src/lib/avatar.ts` — per-member display derivations (`initialsFor`,
  `avatarColorFor`); recommended home for a shared "name, with `
  (placeholder)` suffix if applicable" helper added by the
  add-placeholder-members feature, rather than reimplementing that string
  concatenation at each of the several places a member's name is rendered.
- `src/lib/tracking.ts` — the one analytics event-tracking module
  (`trackEvent(eventName)`), a thin wrapper around `@vercel/analytics`'s
  `track()` with client-only guards and silent-failure error handling. All
  custom event tracking calls go through here. See
  [`docs/features/vercel-analytics/architecture.md`](features/vercel-analytics/architecture.md)
  for the event list and placement strategy.
- `is_trip_member(_trip_id)` and `is_trip_open(_trip_id)` (both
  `security definer` SQL functions, `supabase/migrations/0001_init.sql` and
  `0005_lock_expenses_when_trip_completed.sql`) are the shared building
  blocks nearly every RLS policy on `trips`/`trip_members`/`expenses` is
  built from — extend by composing with these rather than re-deriving
  membership/lock logic inline in a new policy. `is_trip_member` continues
  to work unchanged for placeholders: it matches on `user_id = auth.uid()`,
  which a placeholder (no auth session, ever) can never satisfy either as
  caller or as target. As of simplified-onboarding, two more `security
  definer` functions compose on top of it: `is_verified_trip_member(_trip_id)`
  (owner-or-member **and** non-anonymous — the tier-2/tier-3 gate) and
  `is_owner_or_verified_member(_trip_id)` (adds back the pre-verification
  owner's own read access — tier-2 only, deliberately not used by any write
  policy). New trip-scoped tables/policies that need to distinguish
  "verified" from "merely a member" should compose these, not re-check
  `auth.jwt() ->> 'is_anonymous'` inline — see
  [ADR 0006](adr/0006-anonymous-auth-and-otp-linking-for-onboarding.md).
- `src/lib/remembered-email.ts` — the one client-`localStorage` helper in
  the app (`getRememberedEmail`/`setRememberedEmail`/`clearRememberedEmail`,
  namespaced key `splitiful:last-signin-email`), used to prefill the
  last-used email on the same device. As of simplified-onboarding, this is
  read from three places instead of one: `src/app/home-screen.tsx`'s
  no-browser-memory sign-in form (`/?signin=1`, the direct descendant of
  the old `/` email screen), and, via the shared `src/lib/use-otp-flow.ts`
  hook, both `src/app/check-email/page.tsx` (invitee flow) and
  `src/app/trip/[id]/verify-inline.tsx` (organizer's inline widget). If a
  future feature wants a second piece of per-device local state, check
  here first — same try/catch-wrapped pattern applies rather than a new
  ad hoc `localStorage` call site.
- `src/components/ui.tsx` — shared, hook-free UI primitives (`Button`,
  `IconButton`, `Card`, `TabSwitch`, etc.) usable from either a Server or
  Client Component as long as no function prop (`onClick`/`onChange`) is
  passed from a Server Component parent. As of the ssr-trip-pages feature,
  it also exports `LinkButton`/`IconLinkButton` — `next/link`-based
  siblings of `Button`/`IconButton` with the same class strings, for a
  styled control whose action is pure navigation (an `href`, which *can*
  cross the Server → Client boundary) rather than a client-side operation (a
  function, which can't). Use `Button`/`IconButton` when the action needs to
  run code before/instead of navigating (from inside a Client Component);
  use `LinkButton`/`IconLinkButton` when it's just a styled link — as of the
  ux-revamp feature, this is also the primitive the relocated add-expense
  sheet's close (X) affordance standardizes on (see ADR 0008), replacing
  that screen's previous mix of `router.back()`/`router.push()` handlers.
  As of the ux-revamp feature, these primitives (and `Screen`'s existing
  ambient `glow` prop) are also the intended home for the new warm-paper
  visual behaviors (sticky/blurred nav, floating capsule action, paw-print
  texture) — added as new, off-by-default opt-in props/variants, not
  changes to existing defaults, since ~20 route files across the app share
  these components and most of them are outside any given restyle pass's
  scope. See `docs/features/ux-revamp/architecture.md`'s "Shared-component
  blast radius" section.
- `src/app/globals.css` — as of the ux-revamp feature, this is also the
  app's one design-token source (`:root` custom properties, mirrored into
  the adjacent `@theme inline` block) — see the "Design tokens / theming"
  note in System overview above and
  [ADR 0007](adr/0007-css-custom-property-tokens-for-themeable-restyle.md).
  New color/shadow/radius values a screen needs should extend this file's
  token set rather than introducing a local literal, so a future theme
  (dark mode) stays a value swap in one place.
- `src/proxy.ts` — the server-side session-existence gate. As of
  simplified-onboarding, it gates **only** `/trips` (session required,
  redirecting to `/?next=...` when absent, unchanged from before) —
  `/trip/new` and `/trip/[id]*` are no longer in its gated set at all,
  since both now need to work with no session or with just an anonymous
  one (see the auth-model section above). Page-level code under `/trip/*`
  must not assume `proxy.ts` guaranteed a session; it performs its own
  `getUser()` calls and RLS-backed tiered fetches instead (summary via
  `get_trip_summary`, always; detail via `getTripView`, only when
  entitled).
- `src/lib/rate-limit.ts` — the app's one rate-limiting module, added to
  close docs/security-review-2026-09-17.md's blocking finding (invite codes
  are low-entropy and every consuming RPC was unthrottled). Wraps
  `@upstash/ratelimit` + `@upstash/redis` (sliding window, keyed by
  `x-forwarded-for`) behind a single `enforceRateLimit(request, { key,
  limit, windowSeconds })` helper; used by `GET
  /api/trip-invite/[code]/route.ts` (the new server-side chokepoint for the
  invite-preview lookup, which used to call `get_trip_by_invite_code`
  straight from the browser via `supabase.rpc(...)` and so couldn't be
  rate-limited from this app at all) and `POST /api/join/route.ts`. This
  makes Upstash Redis a runtime dependency: `UPSTASH_REDIS_REST_URL`/
  `UPSTASH_REDIS_REST_TOKEN` must be set in production, or those two routes
  fail closed with a 503 rather than running unthrottled. New endpoints
  that accept a guessable/brute-forceable credential from an unauthenticated
  caller should call `enforceRateLimit` too, rather than adding a parallel
  throttling mechanism.
- This app-level limiter only sits in front of this app's own `/api/*`
  routes — it can't protect a Postgres function that's independently
  callable with the public anon/publishable key, which is exactly what
  `get_trip_by_invite_code`/`join_trip` are
  (docs/security-review-2026-09-17-followup.md finding #1). Those two RPCs
  also throttle themselves from inside Postgres
  (`supabase/migrations/0013_throttle_invite_rpcs_in_postgres.sql`,
  [ADR 0009](adr/0009-throttle-invite-rpcs-inside-postgres.md)), so the
  limit applies to a direct-to-Supabase caller too. `isDbRateLimitError`/
  `dbRateLimitResponse` (`src/lib/rate-limit.ts`) let a route handler map
  that DB-raised rejection to the same 429 shape `enforceRateLimit`
  returns. A future RPC with the same guessable-credential shape should
  get this same DB-side throttle, not just an app-level one.

## ADR index

Architecture decisions live in [`adr/`](adr/) as immutable, numbered records.
List notable ones here as they're added:

- [0001](adr/0001-record-architecture-decisions.md) — Record architecture decisions as ADRs
- [0002](adr/0002-restrict-expense-update-rls-to-payer.md) — Restrict `expenses` UPDATE RLS to the paying member
- [0003](adr/0003-expense-date-column-sequencing.md) — Sequencing the `expenses.date` migration for zero-downtime, and sourcing "today" from the app not the DB
- [0004](adr/0004-placeholder-member-nullable-user-id-and-identity-key.md) — Nullable `user_id` for placeholder members, and keying member identity off `trip_members.id`
- [0005](adr/0005-ssr-page-conversion-pattern.md) — Pattern for converting a client-fetched page to a Server Component (Server Component + `"use client"` leaves + `Link`-based navigation), and why the residual server-side `getUser()` round trip is an accepted tradeoff
- [0006](adr/0006-anonymous-auth-and-otp-linking-for-onboarding.md) — Supabase anonymous auth for pre-verification trip ownership, and anonymous-to-permanent linking (`updateUser`/`email_change`) instead of `signInWithOtp` when verifying an anonymous session
- [0007](adr/0007-css-custom-property-tokens-for-themeable-restyle.md) — CSS custom properties (extending the existing `globals.css` token set) as the mechanism for a themeable light-now/dark-later visual system, over Tailwind `dark:` variants, a JSON token pipeline, or CSS-in-JS
- [0008](adr/0008-add-expense-sheet-via-intercepting-parallel-routes.md) — Add-expense as an intercepted/parallel-route overlay sheet over the trip view, with the literal route kept as a hard-navigation/deep-link fallback, over a query-param/client-state overlay; also covers the pathname-driven background dim/blur/scale mechanism and the explicit `animateEntrance` flag that suppresses the sheet's own entrance animation on a cold load
- [0009](adr/0009-throttle-invite-rpcs-inside-postgres.md) — Throttle `get_trip_by_invite_code`/`join_trip` inside the `plpgsql` functions themselves (keyed by `x-forwarded-for`/`auth.uid()`), over revoking their public grants and routing through a new service-role key, so a direct-to-Supabase caller can't bypass the app-level Upstash limiter
