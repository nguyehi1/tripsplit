# Architecture

Detailed current-state architecture and data-access reference. For a quick
description of shipped product behavior and outstanding release work, start
with [`../README.md`](../README.md) and [`ROADMAP.md`](ROADMAP.md). The
`architect` updates this file when a feature changes the system architecture.
Feature docs are point-in-time records; they may retain superseded proposals.
ADRs explain durable technical decisions and identify decisions that were
later superseded.

## System overview

Splitiful is a Next.js 16 (App Router) app with Supabase for auth, database,
and row-level security, and Resend for transactional email. Deployed on
Vercel.

**Mutation pattern**: almost all writes go directly from client components
through the Supabase browser client (`src/lib/supabase/client.ts`), calling
either a table `.insert()`/`.update()` or a `security definer` RPC (e.g.
`create_trip`, `join_trip`, `complete_trip`), with **RLS as the authorization
boundary** — there is deliberately no Next.js route handler in that path.
`src/app/api/` is reserved for the rare case where a server-held secret is
involved (currently just `trip-email/route.ts`, which needs the Resend API
key). New CRUD-style mutations should default to the direct-client pattern
and only add an API route when there's a genuine server-secret or
server-only-computation reason to. As of the shopping-list feature, this
pattern gained one narrow exception: `public.shopping_list_items`'
claim/unclaim/log-into-expense transitions go through `security definer`
RPCs with **no direct UPDATE grant at all** on that table (mirroring
`trip_members`' existing no-INSERT-grant shape below), and a member's
removal interaction with an in-flight claim is handled by the app's first DB
trigger — see [ADR 0013](adr/0013-shopping-list-claim-release-trigger-on-member-removal.md)
for why RLS's `using`/`with check` split can't express the needed
old-row/new-row correlation on its own, and why a trigger (not a second RLS
policy or an app-level cleanup job) was the right, narrowly-scoped escape
hatch — not a new default for future features to reach for casually. **As of
the starter-list feature**, `create_trip` has a second, seven-argument
overload (no parameter defaults) that also stores the trip's types and an
optional typed "Other" trip type; the five-argument function is untouched.
Validation of those values lives in CHECK constraints on the `trips` columns,
not only in the RPC, because the direct-INSERT policy on `trips` is reachable
by every session (anonymous included). See
[ADR 0014](adr/0014-trip-types-column-checks-and-create-trip-overload.md)
and `docs/features/starter-list-exploration/architecture.md`.

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
description above unchanged. **As of the performance-scaling feature**, note
that `/trips` specifically still pays *two* sequential Supabase-Auth-server
round trips per request (one inside `proxy.ts`'s gate, one again in the page
itself) — an already-known, deliberately-accepted tradeoff from ADR 0005; see
[ADR 0011](adr/0011-forward-verified-user-id-header-for-trips-page.md) for
the proposed (not yet executed) fix, contingent on real latency data.

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
plain Server Component + `<Link>` pattern. **As of the performance-scaling
feature**, note that `add-expense-sheet-content.tsx`'s own mount-time gating
fetch (member count, lock state, ownership) independently re-fetches data the
underlying trip page's Server Component already computed — a real, if not
yet acted-on, round-trip-reduction candidate; see
`docs/features/performance-scaling/architecture.md`'s add/edit-expense
section. **As of the shopping-list feature**, this same scaffold is reused a
second time for an "Add an item" sheet (`@sheet/(.)add-item/page.tsx` +
`add-item/page.tsx`, same intercepted/hard-nav-fallback shape) — the only
existing-file edit this required was generalizing `trip-sheet-chrome.tsx`'s
`dimmed` pathname check to also match `/add-item`, not just `/add-expense`;
see `docs/features/shopping-list/architecture.md`.

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
`src/lib/pending-action.ts`'s save-draft-and-resume). **As of the
performance-scaling feature**, `requireVerifiedSession` accepts an optional
already-fetched user object (`requireVerifiedSession(supabase,
prefetchedUser?)`) so a caller that's about to need the user object anyway
(e.g. add-expense's submit handler, which also needs it for `paidBy`) can
avoid a second, redundant `supabase.auth.getUser()` round trip — existing
callers that don't pass it keep today's exact behavior. For the
**organizer's own trip**, this was replaced by a hide-and-reveal pattern: the
trip page hides its mutating entry points (Add expense, Settle up, Invite
others) entirely while the owner's session is unverified and shows a
persistent inline email/code verification widget in their place, with no
navigation to `/check-email` — see
`docs/features/simplified-onboarding/architecture.md`'s "Update:
hide-and-reveal replaces attempt-then-redirect for the organizer" section
for the full mechanics and rationale. Both mechanisms sit in front of the
same RLS/RPC enforcement described above; neither is itself the security
boundary. **As of the shopping-list feature**, claim/unclaim/add-item/delete
all reuse the invitee's exact `requireVerifiedSession`-then-redirect
mechanism (a new `"invitee-shopping-list"` `check-email` trigger value,
additive to the existing `Trigger` union); this feature deliberately does
**not** add a `pending-action.ts`-style resume mechanism for these
one-tap mutations (accepted, documented tradeoff — see
`docs/features/shopping-list/architecture.md`), unlike the multi-field
expense draft that mechanism exists for. **As of the starter-list feature**,
one narrow exception is made for the Suggested card's "+" on the List tab:
an unverified organizer can see that tab (the shopping-list read policy
admits the owner on any session), and tapping "+" does not redirect — it
parks that single item name in an in-memory slot, scrolls to and focuses the
inline verification widget (`requestVerification` on
`TripVerificationContext`), and adds exactly that item automatically once
`verified` flips true. Memory only, never URL or storage, cleared on use,
unmount and sign-out, re-authorized by the unchanged RLS insert policy; see
[ADR 0015](adr/0015-in-memory-single-item-replay-after-inline-verification.md).
`pending-action.ts` itself is still not extended.

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
than solved unprompted. As of the remove-member-access feature, the same
`is_trip_open` gate also covers `remove_trip_member`/`leave_trip` (see the
`trip_members` entry below) — a completed trip's roster can't change after
the fact via any of these paths, consistently. As of the shopping-list
feature, the same gate also covers `claim_shopping_list_item`/
`unclaim_shopping_list_item`/`add_expense_and_log_shopping_items` and the
plain-RLS add/delete-item policies — a locked trip's list is frozen exactly
like its expense list already is.

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
for the full event list, placement, and privacy safeguards. `@vercel/speed-insights`
is also installed and mounted alongside `<Analytics />` in the root layout,
giving real-user, per-route Web Vitals (TTFB/LCP/etc.) in the Vercel
dashboard — page-level only, no per-call/per-query breakdown. **As of the
starter-list feature**, one rule is made explicit: an event name may encode a
user choice only when it comes from a closed, code-defined set (the starter
catalog's type codes, plus fixed names such as `trip_type_selected_other`);
user-typed text, its length, or its presence is never an event name or
property.

**Performance instrumentation (interim)**: as of the performance-scaling
feature, `src/lib/perf/timing.ts` provides `timeAsync` (server-side) and
`reportClientTiming` (client-side, via a small `POST /api/perf-log` beacon
route) for wrapping individual Supabase calls with structured, greppable
`[perf]`-tagged log lines (`{ surface, call, durationMs, ok }`, no PII) —
built because neither `trackEvent` (no properties, by design) nor
`@vercel/speed-insights` (page-level only) can produce the per-call p50/p95
breakdown a felt-slowness investigation needs. This is deliberately
temporary/interim, not a permanent tracing layer — see
[ADR 0010](adr/0010-interim-per-call-timing-instrumentation.md) and
`docs/features/performance-scaling/architecture.md` for the full mechanism,
call sites, and what's deliberately excluded (no instrumentation inside any
Postgres function body, to avoid an observability-only RPC edit of the kind
migration 0013 already showed can break production).

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
**As of the starter-list feature** (migration 0022), the same reasoning has a
second half worth stating: *new app code against the old schema* is the
dangerous direction when the new code selects a new column (`trips.types`),
because a missing column fails the whole read. Release rule: apply the
migration (preferably as its own earlier merge), confirm it, then deploy the
app. Rollback is "redeploy the previous build"; the columns are left in place.

## Data model

Schema is managed via `supabase/migrations/NNNN_*.sql` (sequential, never
edited after merge). See migration files for the authoritative current
schema; summarized here as it stabilizes:

- `trips` — one row per trip; `completed_at` (nullable) is the lock; unique
  `invite_code` is how joining works. As of the starter-list feature
  (migration 0022), two more columns:
  `types text[] not null default '{}'` (the trip's catalog types in pick
  order, a closed set of `camping`/`airbnb`/`international`, at most 3, no
  duplicates) and `other_type text null` (a short typed trip type, 1-30
  characters). Both have **column CHECK constraints** (`trips_types_check`,
  `trips_other_type_check`), not only RPC validation, because the direct
  INSERT policy lets any session, anonymous included, write the table.
  "Other" exists only as `other_type` being non-null; there is no `other`
  code in `types`. The `other_type` check is a locale-independent
  code-point allowlist (BMP only, no emoji, no control, invisible or markup
  characters). Neither column has an UPDATE path (no policy; table-level
  update revoked), so both are fixed after create. `other_type` is readable
  by any trip member through the API (RLS is row-level), so no public RPC
  and no `select("*")` may return it; the app never selects it. It is free
  text and treated as potentially personal data (runbook covers export and
  the clear-on-erasure case). See ADR 0014 and
  `docs/features/starter-list-exploration/architecture.md`.
- `trip_members` — join table (`trip_id`, `user_id`, `display_name`); no
  direct `insert` RLS policy — the only way a row is created is through the
  `create_trip`/`join_trip` RPCs (`security definer`), so a client can't
  fabricate membership by guessing a trip's UUID. As of the add-placeholder-members
  feature, `user_id` is **nullable** and a new `is_placeholder boolean not
  null default false` column marks name-only members with no Supabase auth
  account — a check constraint ties the two together (`is_placeholder` iff
  `user_id is null`). Placeholders are created/renamed/removed exclusively
  through `add_placeholder_member`/`rename_placeholder_member`/
  `remove_placeholder_member` (`security definer`, organizer-only, and for
  rename/remove, placeholder-only-by-query — see
  `docs/features/add-placeholder-members/architecture.md`), following the
  same "RPC is the only write path" pattern as `create_trip`/`join_trip`.
  The existing `unique (trip_id, user_id)` constraint needed no change to
  support multiple placeholders per trip: Postgres's default unique-index
  semantics already treat every `NULL` as distinct from every other `NULL`.
  As of the remove-member-access feature, a **real** member's row can also be
  removed — either by the trip's organizer (`remove_trip_member`, any other
  non-placeholder member) or by the member themself (`leave_trip`,
  self-only) — both `security definer` RPCs following the exact same
  hard-delete/organizer-or-self/`is_trip_open`-gated shape as
  `remove_placeholder_member`, and both structurally unable to target the
  organizer's own row (see
  `docs/features/remove-member-access/architecture.md`). This is a **hard
  delete**, not a status/soft-delete column — there is no queryable "was a
  member, now removed" state on `trip_members` itself; see
  [ADR 0012](adr/0012-post-removal-detection-and-ghost-payer-rendering.md)
  for how the app still surfaces a removed/left member's own "you're no
  longer on this trip" state on a later visit (reconstructed from
  `expenses.paid_by`, not stored), and for a real historical-rendering
  consequence this creates (a former member's past expenses need a
  synthetic "ghost payer" in `getTripView`, since their `trip_members` row —
  and with it their display name — no longer exists to resolve `paid_by`
  against). **As of the shopping-list feature**, `trip_members` also gained
  the app's first trigger (`before delete`,
  `release_shopping_list_claims_on_member_removal`) so that removing a
  member who currently holds a shopping-list claim doesn't break — see the
  `shopping_list_items` entry below and
  [ADR 0013](adr/0013-shopping-list-claim-release-trigger-on-member-removal.md).
  **Important for any code reading `trip_members`**: because
  `user_id` is no longer guaranteed unique-and-non-null per row (and, as of
  remove-member-access, no longer guaranteed to have a row at all for every
  `user_id` that ever appears in `expenses.paid_by` on a trip),
  `src/lib/data/trips.ts` identifies a member by `trip_members.id` (the
  row's own primary key), not `user_id`, in everything it returns
  (`members[].id`, `you.id`, `expense.payer.id`, etc.) — see
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
  corresponding `auth.users` row to reference. As of remove-member-access,
  this "current `trip_members` count" denominator can shrink after expenses
  already exist (a removed/left member's past `paid_by` rows stay exactly
  as they were, but they no longer count toward the member total the trip
  total is divided across) — this is a deliberate, live-recompute
  consequence, not a bug, and mirrors how a member joining mid-trip already
  changes the same denominator today; see
  `docs/features/remove-member-access/architecture.md` and ADR 0012. As of
  the shopping-list feature, nothing about `expenses` itself changed — the
  new `add_expense_and_log_shopping_items` RPC (see below) inserts into this
  table with the same shape/validation `addExpense`'s existing direct insert
  already enforces, duplicated intentionally rather than routing the
  existing "skip the list" path through the new RPC (see
  `docs/features/shopping-list/architecture.md` for the tradeoff).
- `shopping_list_items` — one row per per-trip shopping-list item (the
  shopping-list feature). `trip_id`, free-text `description`, nullable
  `added_by`/`claimed_by` (both `trip_members.id`, per ADR 0004's identity
  convention — nullable specifically so member removal can clear them
  without an FK violation, see below), `status` (`open`/`claimed`/`logged`,
  `text` + check constraint, matching this schema's existing
  enum-via-check-constraint style — see `feedback.rating` — rather than a
  Postgres `enum` type), and a nullable `expense_id` (references `expenses`,
  deliberately with **no** `on delete` action — left blocking rather than
  cascading, so the not-yet-built expense-delete feature is forced to
  explicitly reconcile a logged item's status rather than relying on a
  passive `on delete set null` that would otherwise violate this table's own
  shape-check constraint). Claim/unclaim/log-into-expense are **RPC-only**
  (`claim_shopping_list_item`, `unclaim_shopping_list_item`,
  `add_expense_and_log_shopping_items` — no `UPDATE` grant on the table at
  all, the same "RPC is the only write path" shape `trip_members` already
  uses for its own no-`INSERT`-grant), which is also how the DB-level
  claim-race guarantee works: a single conditional `UPDATE ... WHERE status
  = 'open'` inside `claim_shopping_list_item` relies on Postgres's own
  row-locking so exactly one concurrent caller ever wins. Adding and
  pre-claim deleting an item stay plain RLS-backed `insert`/`delete` (no RPC
  needed — single-ownership-predicate rules, same shape as ADR 0002's
  payer-only-edit policy). A `before delete on trip_members` trigger (the
  app's first trigger) releases a removed member's in-flight claim back to
  `open` and clears their `added_by`/`claimed_by` references, so
  `remove_trip_member`/`leave_trip` keep working unchanged even when the
  removed member held a claim — see
  [ADR 0013](adr/0013-shopping-list-claim-release-trigger-on-member-removal.md)
  for why RLS alone can't express this and `docs/features/shopping-list/architecture.md`
  for the full design (including the atomic
  `add_expense_and_log_shopping_items` RPC that links selected items to a
  new expense in the same transaction it's created in). As of the
  starter-list feature, the Suggested card's "+" adds an item through this
  same plain insert (name only); suggestions themselves are never stored —
  they are derived client-side from `trips.types` and a bundled catalog, so
  a deleted suggested item simply reappears as a suggestion.
- One display name per account (migration 0020,
  `supabase/migrations/0020_one_display_name_per_account.sql`) — not a new
  table; it changes how `trip_members.display_name` is set. A `before insert`
  trigger on `trip_members` (`trip_members_apply_canonical_name`) overwrites
  the name on every non-placeholder row with the account's canonical name
  (the most recently joined real name, via the internal
  `canonical_display_name(user)` helper), whichever RPC inserts the row
  (`create_trip`, `join_trip`, `join_trip_by_id`). A blank name with no
  canonical name is stored as `'Organizer'`, which is the "not chosen yet"
  sentinel and is ignored by `canonical_display_name`. Two client RPCs:
  `get_my_display_name()` (authenticated; null means prompt the user) and
  `set_my_display_name(name)` (verified accounts only, 1-50 characters after
  trim), which rewrites the name on all of the caller's non-placeholder rows,
  including past and completed trips. Trip creation no longer asks for a
  name; the first-time `NamePromptForm` appears after sign-in or join when
  `get_my_display_name` returns null. Placeholders are untouched. The trigger
  is insert-only, so admin updates (such as the "Former member" anonymization
  in the deletion runbook) are not overridden.
- `feedback` — free-standing, scoped to `user_id = auth.uid()` on both
  read and write. Submitted from the standalone `/feedback` page (no trip
  context, so `trip_id` is null for new rows). The old
  `/trip/[id]/feedback` URL is a permanent redirect to `/feedback`
  (`next.config.ts`).

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
  placeholders permanently unable to be a payer. As of shopping-list, this
  policy is unchanged and unused by the new
  `add_expense_and_log_shopping_items` RPC path (a `security definer`
  function bypasses RLS and re-derives the same checks manually) — see the
  `expenses` data-model entry above.
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
  consequences). **As of the shopping-list feature**, a future delete
  feature also needs to reconcile `shopping_list_items.expense_id`/`status`
  for any logged item linked to the deleted expense — see that table's
  entry above and `docs/features/shopping-list/architecture.md`.

**RLS on `trip_members`** (`select`): as of simplified-onboarding,
`is_owner_or_verified_member(trip_id)` — same predicate and same rationale
as `expenses`' `select` above (roster identity is detail-tier, readable by
a pre-verification owner, gated behind verification for anyone else). As of
remove-member-access, no policy change was needed here: once a real member's
row is hard-deleted by `remove_trip_member`/`leave_trip`, this same `select`
policy already stops returning it to anyone, the same way it's always
stopped returning rows for a trip a caller never joined.

**RLS on `shopping_list_items`** (new, shopping-list feature): `select` uses
the same `is_owner_or_verified_member(trip_id)` predicate as
`expenses`/`trip_members` above (detail-tier read — the List tab only
renders inside the same full-detail view those already gate). `insert`
(adding an item) and `delete` (pre-claim, adder-only) are plain RLS
policies following ADR 0002's single-ownership-predicate shape. There is
**no `update` policy or grant at all** — every status transition
(claim/unclaim/log-into-expense) goes through a `security definer` RPC
instead, since RLS's `using`/`with check` split can't correlate an old
status with a new one on a single `for update` policy, and splitting the
three transitions into separate permissive policies would reopen exactly
the claim-race hole this feature exists to close (Postgres ORs all
`using`/`with check` clauses together across permissive policies for the
same command — see ADR 0002's own "Consequences" note on this same hazard).
See `docs/features/shopping-list/architecture.md` section 1b for the full
policy text and reasoning, and [ADR 0013](adr/0013-shopping-list-claim-release-trigger-on-member-removal.md)
for the related member-removal trigger.

**RLS on `trips`**: `select` is `is_trip_member(id) or created_by = auth.uid()`
and `insert` is `created_by = auth.uid()` (migration 0001); there is no
`update` or `delete` policy. Because `select` is row-level, any member
(including an anonymous joiner) can read every column of a trip row they can
see, which is why a column such as `other_type` must be kept out of every
public RPC and every `select("*")`. As of the starter-list feature, table-level
`update` on `trips` is also revoked from `anon` and `authenticated`
(defense in depth; completion goes through the `security definer`
`complete_trip`).

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
  **As of the performance-scaling feature**, `getMyTrips` accepts an optional
  pre-fetched `trips` rows parameter so a caller that already needs to run
  its own `trips` query concurrently with an auth check doesn't force a
  second, redundant one — see
  `docs/features/performance-scaling/architecture.md`'s `/trips` section;
  omitting it keeps today's exact behavior. **As of the remove-member-access
  feature**, this is also where `removeTripMember`/`leaveTrip`/
  `wasRemovedFromTrip` live (thin wrappers around the new
  `remove_trip_member`/`leave_trip`/`was_removed_from_trip` RPCs, same style
  as `removePlaceholderMember`), and where `getTripView` gained required
  "ghost payer" handling for a removed/left member's historical `paid_by`
  rows — see `docs/features/remove-member-access/architecture.md` and ADR
  0012. Any future function here that maps an `expenses.paid_by` id through
  a current-`trip_members`-keyed lookup must account for the id possibly not
  resolving to any current member, the same way `getTripView` now does.
  **As of the shopping-list feature, this module is deliberately not where
  the new entity's data access lives** — see the new
  `src/lib/data/shopping-list.ts` entry below for why. **As of the
  starter-list feature**, `createTrip` takes optional `types`/`otherType` and
  returns `typesStored`: with neither it calls the unchanged five-argument
  RPC; otherwise the new seven-argument overload, falling back to the
  five-argument one **only** on `PGRST202`/`42883` (function not found),
  never on a check violation, and it rethrows a code-only error so a CHECK
  failure's row dump (name, location, Other text) can never reach UI,
  logs or analytics. `getMyTrips`/`getTripView` no longer use `select("*")`
  on `trips`: they use the explicit column lists in
  `src/lib/data/trip-columns.ts` (kept out of this module so tests that mock
  `@/lib/data/trips` do not strip them), and `getTripView` returns
  `trip.types`. `other_type` is never selected. Any new read of `trips` must
  use an explicit column list.
- `src/lib/starter-catalog.ts`, `src/lib/starter-suggestions.ts`,
  `src/lib/validation/trip-type.ts` (new, starter-list feature) — the
  catalog is the **one** editable config file (type codes, labels, phrases,
  item names; header carries the special-category editing note) and
  everything else (tiles, card, sentence, analytics event names, the
  `TripType` union) reads from it; `starter-suggestions.ts` is the pure
  derive/merge/dedupe logic; `trip-type.ts` normalizes and validates the
  typed Other text and exports the character class that is kept identical to
  the one inside migration 0022's CHECK (a test enforces the match). Adding a
  catalog type also needs a migration re-adding `trips_types_check` and a row
  in `docs/ANALYTICS.md`. There is no `other` code anywhere.
- **Revision 3 (starter-list feature, home shelf)**: `src/components/template-shelf.tsx`
  (server-renderable, no state or data imports) renders one link tile per
  catalog type plus "Blank trip" on `/trips` and in `WelcomeContent` on `/`; its
  two `"use client"` leaves in `template-tile.tsx` exist only to fire the
  closed-set `home_template_tapped_<code>` / `home_blank_trip_tapped` events
  (`homeTemplateTappedEvent` in `starter-suggestions.ts` returns `undefined`
  outside the catalog; name only, on the tap, no account). `/trip/new` is now a
  thin async server wrapper (`page.tsx`) that validates `?type=` with
  `parseTypeParam` and passes only the typed result to the client
  `new-trip-form.tsx` (`initialType`), so the tile is checked on first paint; the
  raw query value is never echoed, redirected on or forwarded, and the proxy is
  unchanged. `ui.tsx` gains a flat `fab` button variant and `FabBar` (the canvas
  "New trip" pill on `/trips`); `BottomBar` and the capsule variants are
  untouched. Icons for the picker and the shelf share `trip-type-icons.ts`; the
  `--color-accent-ink` token backs "Blank trip", the checked tile icon and the
  "+" glyph. No database, API or migration change. See
  `docs/features/starter-list-exploration/architecture.md` section 17.
- **Revision 4 (starter-list feature, layout fixes)**: `Screen` in `ui.tsx` now
  clips with `overflow: clip` instead of `hidden`; `hidden` creates a scroll
  container, which silently disabled `position: sticky` on the top bar and on
  `BottomBar`/`FabBar` (a pre-existing bug). Do not change it back. `FabBar` is
  fixed to the viewport bottom. Home trip rows are compact (68px, no "Trip"
  pill, no avatar stack). The Suggested card renders last in the List tab, with
  its notice floating above the bottom bar. No database or API change.
- `src/lib/data/shopping-list.ts` (new, shopping-list feature) — the data-
  access module for `shopping_list_items`, split out from `trips.ts` rather
  than added to it (same "distinct bounded entity gets its own file"
  reasoning that already produced `src/lib/settlement.ts`,
  `src/lib/validation/expense.ts`, and `src/lib/avatar.ts` as siblings of
  `trips.ts` rather than growth inside it). Exposes `getShoppingListView`
  (one shaped read: open/mine-claimed/logged groupings plus the current
  user's claimed-unlogged count, for the badge), `addShoppingListItems`
  (plain multi-row `.insert()` — atomic by construction, no RPC needed),
  `deleteShoppingListItem` (plain RLS-scoped `.delete()`), and thin wrappers
  around the three RPCs (`claimShoppingListItem`, `unclaimShoppingListItem`,
  `addExpenseWithShoppingItems`). See
  `docs/features/shopping-list/architecture.md` for the full design. The
  starter-list Suggested card's "+" reuses `addShoppingListItems` with a
  single description.
- Amount/description validation for an expense (positive amount, non-empty
  description) lives in `src/lib/validation/expense.ts`
  (`isValidExpenseInput`), shared by `src/app/trip/[id]/add-expense/page.tsx`
  and `src/app/trip/[id]/expense/[expenseId]/edit/page.tsx` — extracted as
  part of edit-own-expense once a second call site existed. New expense-form
  surfaces should import this rather than reinlining the rule. Date
  validation (real calendar date, not in the future) lives alongside it as
  `isValidExpenseDate`, added by the expense-date-month feature. **As of the
  shopping-list feature**, `edit/page.tsx` also gained a read-only render
  branch (a verified non-payer, or any viewer on a locked trip) so a Bought
  shopping-list item can tap through to the expense it linked to — no RLS
  change was needed (the existing `select` policy already permits any
  verified/owner member to read the row; only this page's own gating logic
  changed), see `docs/features/shopping-list/architecture.md`.
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
  `avatarColorFor`, and `displayNameFor`); home for the "name, with `
  (placeholder)` suffix if applicable" helper added by the
  add-placeholder-members feature. As of the remove-member-access feature,
  this is also the recommended home for the equivalent "name, with a
  removed-member marker" treatment `getTripView`'s ghost-payer entries need
  (see ADR 0012) — extend `displayNameFor`'s existing suffix pattern rather
  than adding a parallel string-concatenation helper.
- `src/lib/pending-action.ts` — carries an in-progress expense draft across
  the redirect-to-`/check-email`-and-back round trip
  (`savePendingExpenseDraft`/`takePendingExpenseDraft`, `sessionStorage`-
  backed). **As of the shopping-list feature, deliberately not extended**
  for claim/unclaim/add-item/delete — those are single-tap mutations with a
  low resumption cost (unlike a multi-field expense draft), so losing one
  across an OTP redirect is an accepted, documented UX papercut rather than
  a reason to add a second pending-action shape; see
  `docs/features/shopping-list/architecture.md`. Revisit only if this proves
  to be real friction in practice. **As of the starter-list feature, still
  not extended**: the Suggested card's first-"+" replay uses a one-item
  in-memory slot and the inline verification widget instead (ADR 0015).
- `src/lib/mailto-invite.ts` (email-invites feature) — pure functions that
  build the "Invite by email" `mailto:` (subject/body copy, control-character
  stripping, `isPlausibleEmail`). The invitee's address exists only in the
  browser: it is never sent to a server, stored, or logged, and no new
  schema or API route backs the feature, and it adds no roster row. Any change that sends the
  address anywhere (logging, analytics properties, a fetch) breaks a claim made
  on `/privacy`; see `docs/reviews/security-compliance/features/email-invites/compliance.md`.
- `src/lib/errors.ts` — `errorMessage`, `errorCode`:
  normalize thrown values (Supabase errors are plain objects, not `Error`s).
  User-facing roster failures go through `rosterErrorCopy` so raw database
  text is never shown.
- `src/lib/tracking.ts` — the one analytics event-tracking module
  (`trackEvent(eventName)`), a thin wrapper around `@vercel/analytics`'s
  `track()` with client-only guards and silent-failure error handling. All
  custom event tracking calls go through here. See
  [`docs/features/vercel-analytics/architecture.md`](features/vercel-analytics/architecture.md)
  for the event list and placement strategy. Not the same thing as
  `src/lib/perf/timing.ts` (performance-scaling feature) — that module is for
  temporary, numeric-only latency instrumentation, not user-facing product
  events; see the "Performance instrumentation" note above.
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
  [ADR 0006](adr/0006-anonymous-auth-and-otp-linking-for-onboarding.md). As
  of remove-member-access, `remove_trip_member`/`leave_trip`/
  `was_removed_from_trip` (`supabase/migrations/0014_remove_and_leave_trip_member.sql`)
  reuse `is_trip_open` directly and the same standalone
  `coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false` guard
  the placeholder-member RPCs already use (not `is_verified_trip_member`,
  for the same reason noted where that guard was first added — see migration
  0010's header comment). **As of the shopping-list feature**,
  `is_verified_trip_member`/`is_owner_or_verified_member`/`is_trip_open` are
  reused unchanged by every new RLS policy and RPC this feature adds — no
  new composable predicate was needed. The one new mechanism this feature
  adds (a `before delete` trigger on `trip_members`, releasing an in-flight
  shopping-list claim) is *not* a new RLS predicate — see
  [ADR 0013](adr/0013-shopping-list-claim-release-trigger-on-member-removal.md).
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
  blast radius" section. **As of the shopping-list feature**, `TabSwitch`
  gained an optional `badge?: number` field on each option (renders the
  small accent count-pill design-reference's Screen 2 describes when
  `badge > 0`) — additive to the existing `{ value, label }` option shape;
  its one existing consumer (`trip-tabs.tsx`) passes no `badge` and is
  unaffected.
- `src/app/globals.css` — as of the ux-revamp feature, this is also the
  app's one design-token source (`:root` custom properties, mirrored into
  the adjacent `@theme inline` block) — see the "Design tokens / theming"
  note in System overview above and
  [ADR 0007](adr/0007-css-custom-property-tokens-for-themeable-restyle.md).
  New color/shadow/radius values a screen needs should extend this file's
  token set rather than introducing a local literal, so a future theme
  (dark mode) stays a value swap in one place.
- `src/proxy.ts` — the server-side session-existence gate. As of
  simplified-onboarding, it gates **only** `/trips` (and, since the feedback
  move, `/feedback`; both need some session) (session required,
  redirecting to `/?next=...` when absent, unchanged from before) —
  `/trip/new` and `/trip/[id]*` are no longer in its gated set at all,
  since both now need to work with no session or with just an anonymous
  one (see the auth-model section above). Page-level code under `/trip/*`
  must not assume `proxy.ts` guaranteed a session; it performs its own
  `getUser()` calls and RLS-backed tiered fetches instead (summary via
  `get_trip_summary`, always; detail via `getTripView`, only when
  entitled). **As of the performance-scaling feature**, see
  [ADR 0011](adr/0011-forward-verified-user-id-header-for-trips-page.md) for
  a proposed (not executed) change that would have this file forward its
  own verified user id to `/trips` via a trusted request header — flagged
  here since any future change to this file should check that ADR first,
  whether or not it's ever acted on. **As of the remove-member-access
  feature**, `renderTripDashboard` (`src/app/trip/[id]/page.tsx`) gained a
  new fallback branch between "full detail view" and the pre-existing
  generic `TripSummaryOnly` view, for a caller who isn't currently a member
  but was previously — see the `trip_members` data-model entry above and
  ADR 0012. **As of the shopping-list feature**, `renderTripDashboard` also
  fetches the trip's shopping-list view (once `getTripView`'s detail tier
  resolves) alongside `expenses`/`members`, fails soft to an empty list on
  error (mirroring `getTripSummary`'s own try/catch-to-null handling), and
  extends its `tab` query-param branch to a third `"list"` value — see
  `docs/features/shopping-list/architecture.md`. **As of the starter-list
  feature**, it also passes `trip.types` down to the List tab, and a trip
  created with a catalog type lands on `?tab=list`.
- `src/lib/rate-limit.ts` — the app's one rate-limiting module, added to
  close docs/reviews/security-compliance/project/security-review-2026-09-17.md's blocking finding (invite codes
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
  (docs/reviews/security-compliance/project/security-review-2026-09-17-followup.md finding #1). Those two RPCs
  also throttle themselves from inside Postgres
  (`supabase/migrations/0013_throttle_invite_rpcs_in_postgres.sql`,
  [ADR 0009](adr/0009-throttle-invite-rpcs-inside-postgres.md)), so the
  limit applies to a direct-to-Supabase caller too. `isDbRateLimitError`/
  `dbRateLimitResponse` (`src/lib/rate-limit.ts`) let a route handler map
  that DB-raised rejection to the same 429 shape `enforceRateLimit`
  returns. A future RPC with the same guessable-credential shape should
  get this same DB-side throttle, not just an app-level one. **As of the
  performance-scaling feature**: do not race `enforceRateLimit`/the
  Postgres-side throttle against the RPC call they gate to save latency —
  see `docs/features/performance-scaling/architecture.md`'s `join_trip`
  section for why this was considered and explicitly rejected (it would
  change when the Postgres-side bucket fills, since a request the app-level
  limiter would have rejected would still reach and count against it).
  **As of the starter-list feature**, trip creation itself (direct INSERT on
  `trips`, and both `create_trip` overloads) is knowingly unthrottled; the
  new CHECKs bound row size only. The real fix (revoke direct INSERT on
  `trips` and throttle both overloads together) is recorded as backlog, not
  done.
- `GET /api/trip-invite/[code]` — as of the performance-scaling feature,
  this route's response also carries the trip's public `summary`
  (`get_trip_summary`, fetched server-side in parallel with the existing
  invite lookup) alongside the pre-existing `InviteInfo` fields, so
  `/join/[code]/page.tsx` needs one fetch instead of one fetch plus a
  direct-to-Supabase RPC call from the browser. Additive-only response
  shape; see `docs/features/performance-scaling/architecture.md` for the
  full impact analysis (single consumer, no versioning needed).

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
- [0010](adr/0010-interim-per-call-timing-instrumentation.md) — Structured server-log timing plus a temporary client beacon endpoint for the performance-scaling feature's Phase-1 latency baseline, over extending `trackEvent`, relying solely on Speed Insights, instrumenting inside Postgres RPC bodies, or adopting a full APM vendor
- [0011](adr/0011-forward-verified-user-id-header-for-trips-page.md) — Proposed (contingent, not yet executed): forward `proxy.ts`'s verified user id to `/trips` via a trusted request header to eliminate the page's duplicate `getUser()` call, over keeping both calls or switching to `getSession()`/`getClaims()`
- [0012](adr/0012-post-removal-detection-and-ghost-payer-rendering.md) — Detecting "you were removed from this trip" on a later visit by reconstructing it from existing `expenses.paid_by` rows (no new column/table), and synthesizing an in-memory "ghost payer" for a removed member's historical expenses in `getTripView`, over soft-delete, a new tombstone table, or a `localStorage` marker
- [0013](adr/0013-shopping-list-claim-release-trigger-on-member-removal.md) — A `before delete` trigger on `trip_members` (the app's first trigger) to release an in-flight shopping-list claim and clear `added_by`/`claimed_by` when a member is removed, over a declarative `on delete set null`/`restrict`, a relaxed shape-check constraint, read-time reconstruction (ADR 0012's pattern), or an app-level cleanup job
- [0014](adr/0014-trip-types-column-checks-and-create-trip-overload.md) — Trip types and the typed "Other" trip type stored as two `trips` columns validated by column CHECKs (inline, locale-independent code-point allowlist, no validator function), a seven-argument `create_trip` overload with no parameter defaults and a not-found-only client fallback, and client-side derived suggestions, over RPC-only validation, defaults on the existing function, a second-step update, an `other` code in `types`, or a separate custom-types table
- [0015](adr/0015-in-memory-single-item-replay-after-inline-verification.md) — A one-item in-memory pending slot (held in TripVerificationProvider, bound to the tapping user, 10-minute TTL) plus the inline verification widget to add the first tapped suggestion automatically after an unverified organizer verifies, over `pending-action.ts`/sessionStorage with a `/check-email` redirect, loosening RLS for the organizer, or hiding the card until verification
