# Architecture: Simplified onboarding

See `docs/features/simplified-onboarding/requirements.md` for the approved
requirements (13 locked decisions, 18 acceptance criteria) — this doc is the
"how." See [ADR 0006](../../adr/0006-anonymous-auth-and-otp-linking-for-onboarding.md)
for the anonymous-auth/linking tradeoff specifically (the one decision here
with a real, only-partially-verified Supabase behavior underneath it).

**Revision note (Decisions 12–13):** the sections below through "OTP
confirmation: sign-in vs. linking" describe the *original* implementation,
which shipped and is live in the codebase today (`src/lib/auth-gate.ts`,
`src/lib/pending-action.ts`, the `requireVerifiedSession` + redirect-to-
`/check-email` call sites in `add-expense`, `expense/[id]/edit`, and
`invite/page.tsx`). They are left in place, not rewritten, because they still
correctly describe **the invitee's flow**, which Decision 12 explicitly does
not change, and because the three-tier RLS/data model they describe is
unaffected by Decisions 12–13. **The organizer's own three (now four,
Decision 13) mutation triggers no longer use the attempt-then-redirect
pattern described there** — see the new "Update: hide-and-reveal replaces
attempt-then-redirect for the organizer (Decisions 12–13)" section below,
inserted after "OTP confirmation," which is the authoritative description of
current-desired-state for the organizer's own trip. Read both: the original
sections for the model and the invitee flow, the new section for what
changes and why.

## Existing overlap check

- `src/lib/data/trips.ts` (`createTrip`, `joinTrip`, `getTripView`,
  `getMyTrips`) is reused unchanged in shape; `createTrip`/`joinTrip` need no
  signature change (they already just forward to `auth.uid()`-scoped RPCs).
  `getTripView` remains the **detail-tier** fetch; a new sibling,
  `getTripSummary`, is added alongside it for the **summary-tier** fetch
  (see Data model changes).
- `src/app/check-email/page.tsx` (email + 6-digit code UI, resend cooldown,
  `remember-signin-email` prefill) is reused **as the UI**, unchanged in
  markup/mechanics, exactly as requirements decisions 3/6 require. What
  changes underneath it is *which Supabase Auth call* it makes — see
  "OTP confirmation: sign-in vs. linking" below and ADR 0006. This is the
  one place the "reuse as-is" instruction and Supabase's actual API surface
  are in tension, and it's called out explicitly rather than glossed over.
- `src/proxy.ts`'s pattern-matching + optimistic-cookie-check structure is
  kept; only `PROTECTED_PATTERNS` and the pass/redirect condition change
  (see Impact analysis).
- `is_trip_member(uuid)` / `is_trip_open(uuid)` (both `security definer` SQL
  functions) are extended with one new sibling, `is_verified_trip_member`,
  rather than modified — every existing policy built on them is untouched.
- `get_trip_by_invite_code` (existing public RPC, granted to `anon`) is the
  template for the new `get_trip_summary` RPC — same "security definer,
  explicit `anon` grant, revoke from `public`" pattern as
  `0002_fix_function_grants.sql`/`0003_fix_function_grants_anon.sql` already
  established for `get_trip_by_invite_code`.
- `src/lib/settlement.ts`'s `simplifyDebts` is reused unchanged, running
  client-side over whatever balances `get_trip_summary` returns — no
  settlement logic is duplicated in SQL (see Data model changes).
- `/api/trip-email`'s "not signed in → 401" behavior needs to change, per
  the non-goal note that flags this as an architecture-owned implementation
  detail (see Impact analysis).

## Core model: three tiers, two axes of trust

Every trip-scoped read/write request is evaluated against two independent
facts about the caller's session:

1. **Is this session anonymous or permanent?** — `auth.jwt() ->> 'is_anonymous'`.
   Supabase's anonymous-auth feature issues a real `auth.users` row and a
   real session/JWT for an anonymous sign-in, with `is_anonymous: true` as a
   JWT claim (and `auth.users.is_anonymous` as the backing column) — so
   `auth.uid()` is never null for an anonymous session, only "anonymous or
   not" is in question, not "authenticated or not." This is what makes RLS
   ownership possible from the moment of trip creation (requirements
   decision 1): `trips.created_by = auth.uid()` works identically whether
   that `uid()` belongs to an anonymous or a permanent user.
2. **Is this `auth.uid()` a member of this specific trip** — `trip_id`
   present in `trip_members` for that user — **or the trip's owner**
   (`trips.created_by = auth.uid()`)?

Crossing these two axes gives exactly the three tiers requirements describe,
plus the owner's asymmetric case:

| Caller | Public summary | Detail (line items) | Write (expense/invite) |
|---|---|---|---|
| No session at all | ✅ (public RPC) | ❌ | ❌ |
| Anonymous, not a member/owner of this trip | ✅ | ❌ | ❌ |
| Anonymous, **owns** this trip (pre-verification organizer) | ✅ | ✅ | ❌ |
| Anonymous, is a **member** but not owner (shouldn't normally occur — see below) | ✅ | ❌ | ❌ |
| Permanent (non-anonymous), is a verified member or owner | ✅ | ✅ | ✅ |

The "anonymous member but not owner" row is a state the product flow never
intentionally creates (an invitee's anonymous session is only ever created
at the moment they're about to verify — see "Invitee join sequencing"
below) but RLS still has to define *something* for it rather than leaving a
gap, since a client could otherwise reach it by calling `join_trip`
directly with an anonymous session's token. The table's answer (summary
only, same as a non-member) is what `is_verified_trip_member` (below)
already produces for free — no special-casing needed.

## Data model changes

No new tables. Changes are to RLS policies, two new/changed SQL functions,
and one new RPC. No column changes to `trips`, `trip_members`, or
`expenses`.

### New helper function: `is_verified_trip_member`

```sql
create or replace function public.is_verified_trip_member(_trip_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and (
      public.is_trip_member(_trip_id)
      or exists (select 1 from public.trips where id = _trip_id and created_by = auth.uid())
    );
$$;
revoke execute on function public.is_verified_trip_member(uuid) from public, anon;
grant execute on function public.is_verified_trip_member(uuid) to authenticated;
```

This is the single tier-2/tier-3 gate: "same session, no extra step"
(requirements decision 7) falls out naturally from using the *same*
function for both the detail-`select` policy and every write policy —
there is no second, separately-maintained check to drift out of sync with
the first, which is exactly the "no separate gate between read-detail and
write" requirement (AC 12) enforced structurally rather than by convention.

### New helper function: `is_owner_or_verified_member`

Detail-read needs one more allowance than write does: the **owner's own
anonymous session** can read detail pre-verification (AC 3), but cannot
write pre-verification (AC 5, decision 2). So detail-`select` and write
policies use two different predicates built from the same primitives —
they must **not** be collapsed into one shared function, or the owner's
extra read allowance would leak into write:

```sql
create or replace function public.is_owner_or_verified_member(_trip_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select
    public.is_verified_trip_member(_trip_id)
    or exists (select 1 from public.trips where id = _trip_id and created_by = auth.uid());
$$;
revoke execute on function public.is_owner_or_verified_member(uuid) from public, anon;
grant execute on function public.is_owner_or_verified_member(uuid) to authenticated;
```

Note this one **does not** gate on `is_anonymous` at all for the ownership
branch — an anonymous owner passes via `created_by = auth.uid()` regardless
of verification state, which is precisely the asymmetry requirements
describe ("owner's anonymous session sees everything about their own trip;
a non-owner only sees the summary until they verify").

### RLS policy changes on `expenses`

Today, `select` is a single policy (`is_trip_member(trip_id)`) covering
both summary and detail in one grant, because there was no summary tier —
the whole dashboard was already gated by `proxy.ts` on session existence.
That policy is replaced:

```sql
drop policy "members can read expenses" on public.expenses;

create policy "owner or verified member can read expense detail" on public.expenses
  for select using (is_owner_or_verified_member(trip_id));
```

`insert`/`update`/`delete` keep their existing shape (`is_trip_member` +
`is_trip_open`, and for `update`, `paid_by = auth.uid()`) but swap
`is_trip_member(trip_id)` for `is_verified_trip_member(trip_id)` in each
`using`/`with check` clause — **not** `is_owner_or_verified_member`, since
write must exclude the pre-verification owner (decision 2/AC 5). Concretely:

```sql
drop policy "members can add expenses" on public.expenses;
create policy "verified member can add expenses" on public.expenses
  for insert with check (
    is_verified_trip_member(trip_id)
    and is_trip_open(trip_id)
    and exists (select 1 from public.trip_members where trip_id = expenses.trip_id and user_id = expenses.paid_by)
  );

drop policy "payer can edit their own expenses" on public.expenses;
create policy "verified payer can edit their own expenses" on public.expenses
  for update
  using (paid_by = auth.uid() and is_verified_trip_member(trip_id) and is_trip_open(trip_id))
  with check (paid_by = auth.uid() and is_verified_trip_member(trip_id) and is_trip_open(trip_id));

drop policy "members can delete expenses" on public.expenses;
create policy "verified member can delete expenses" on public.expenses
  for delete using (is_verified_trip_member(trip_id) and is_trip_open(trip_id));
```

(`delete` has no shipped UI today per `docs/ARCHITECTURE.md`'s existing
note — carried forward unchanged in permissiveness-relative-to-update, just
re-based on the verified predicate instead of plain membership.)

### RLS policy changes on `trips` / `trip_members`

`trips`' existing `select` policy (`is_trip_member(id) or created_by =
auth.uid()`) is **left as-is** — it already allows an anonymous owner to
read their own trip row, and a verified member to read theirs. It's the
`expenses` table (line items) that needed the new tiered predicate, not
`trips` itself, since `trips` never held the public-summary vs.
detail distinction — the numbers requirements call "summary" (totals,
who-owes-whom) are *derived from* `expenses`, not stored on `trips`.

`trip_members`' `select` policy (`is_trip_member(trip_id)`) is likewise
unchanged — the roster (names, who's on the trip) is treated as part of
"detail" today already implicitly (it's only ever fetched via
`getTripView`/`getMyTrips`, both gated by proxy today), and continues to
require the same tier-2 predicate through a parallel change:

```sql
drop policy "members can read trip roster" on public.trip_members;
create policy "owner or verified member can read trip roster" on public.trip_members
  for select using (is_owner_or_verified_member(trip_id));
```

(Same "owner OR verified" predicate as `expenses`' select — roster identity
is detail-tier, readable by the pre-verification owner, not by a
non-member.) `create_trip`'s `security definer` body is unaffected — it
inserts as the calling `auth.uid()` regardless of that user's anonymous
status, which is exactly what's needed (an anonymous `create_trip` caller
becomes `created_by`).

**Correction (post-QA, migration 0010):** `join_trip`'s body was originally
assumed unaffected on the same reasoning — "it just inserts as the calling
`auth.uid()`." That reasoning is wrong for `join_trip` specifically, because
unlike `create_trip` (an anonymous owner is *supposed* to be able to create
and own a trip pre-verification, per decision 1), `join_trip` grants
`trip_members` access to an *existing* trip, which decision 8/AC13/AC17
require to be gated on verification like every other write. Since a
Supabase anonymous session carries the `authenticated` role — the entire
premise this feature's RLS model relies on — nothing stopped a client from
calling `signInAnonymously()` and then `join_trip` directly with a guessed
or shared invite code, becoming a member with zero email/OTP verification.
Migration 0010 closes this by adding a
`coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false` guard at
the top of `join_trip`'s body (its signature, return type, and otherwise
unchanged behavior are preserved) — see that migration's header comment for
the full rationale, including why this uses a standalone anonymity check
rather than `is_verified_trip_member` (which presupposes existing
membership, not becoming a member).

### New RPC: `get_trip_summary` (the public, zero-auth tier)

Mirrors `get_trip_by_invite_code`'s existing pattern (`security definer`,
explicit grant to `anon` + `authenticated`, callable with just an id) but
returns the aggregated numbers instead of expense rows — this is the
concrete implementation of "trip summary is publicly readable with zero
auth" (AC 10/17):

```sql
create or replace function public.get_trip_summary(_trip_id uuid)
returns table (
  member_id uuid,
  display_name text,
  paid_cents bigint,
  share_cents bigint
)
language sql security definer set search_path = public as $$
  with total as (
    select coalesce(sum(round(amount * 100)), 0)::bigint as total_cents
    from public.expenses where trip_id = _trip_id
  ),
  n as (
    select count(*)::bigint as member_count from public.trip_members where trip_id = _trip_id
  ),
  ranked_members as (
    select id, display_name,
      row_number() over (order by joined_at) as rn
    from public.trip_members where trip_id = _trip_id
  ),
  paid as (
    select tm.id as member_id, coalesce(sum(round(e.amount * 100)), 0)::bigint as paid_cents
    from public.trip_members tm
    left join public.expenses e on e.trip_id = tm.trip_id and e.paid_by = tm.user_id
    where tm.trip_id = _trip_id
    group by tm.id
  )
  select
    rm.id,
    rm.display_name,
    coalesce(p.paid_cents, 0),
    (select total_cents from total) / (select member_count from n)
      + case when rm.rn <= (select total_cents from total) % (select member_count from n) then 1 else 0 end
  from ranked_members rm
  left join paid p on p.member_id = rm.id;
$$;
revoke execute on function public.get_trip_summary(uuid) from public;
grant execute on function public.get_trip_summary(uuid) to anon, authenticated;
```

This reproduces `computeBalances`' exact remainder rule (base share =
`floor(total/n)`, the first `total mod n` members **by join order** get one
extra cent) so identical numbers are what both an unauthenticated summary
viewer and a verified detail viewer see — the two tiers must never
disagree on the trip's own settlement math. `paid_cents`/`share_cents` are
returned (not `net_cents`) so `src/lib/data/trips.ts`'s new
`getTripSummary` wrapper can compute `net = paid - share` in TS and hand
the array straight to the existing `simplifyDebts(balances)` — reusing that
function unchanged rather than porting the greedy-settle algorithm to SQL.
Only aggregates and member display names are exposed; no `expenses.id`,
`description`, `date`, or count-of-expenses leaves this function, which is
what keeps line items out of the public surface (AC 11).

`_trip_id` is used here (not `invite_code`) since the summary is fetched
from `/trip/[id]` itself once that route is reachable pre-auth (see
"Route/page changes" below) — `get_trip_by_invite_code` remains the
separate, existing lookup used by `/join/[code]`'s own preview.

### Invitee join sequencing (no RLS change, a call-order change)

Today, `/join/[code]` collects name + email and calls `signInWithOtp`
*before* any trip_members row exists — `join_trip` only runs after
`verifyOtp` succeeds (in `check-email`'s `confirm()`, gated on the
`invite` query param). That sequencing is **already** "verify, then join
atomically" — it does not need to change. What changes is only *when the
invitee reaches that screen*: today `/join/[code]`'s single "Join the
trip" button forces this immediately; under the new flow, opening
`/join/[code]` shows the trip preview/summary with no form at all, and
name+email collection is deferred to the moment the visitor taps "View
details" or "Add an expense" — i.e. the existing `check-email?invite=...`
path is reached later, from a new trigger point, not removed. `join_trip`
still only ever runs post-`verifyOtp`, i.e. against a permanent session by
construction of this call order — the verification guard migration 0010
adds to its body (see the correction above) is defense-in-depth for a
direct RPC call outside this call order, not a change to this sequencing.

## OTP confirmation: sign-in vs. linking (the one real API-level fork)

This is the crux of the feature and the one place "reuse the existing OTP
implementation as-is" (decision 3) needs a precise reading. Requirements
lock two things simultaneously:

- Decision 3: use the *same* `signInWithOtp` + code-verification
  implementation for both triggers.
- Decision 4: verification must be Supabase's **anonymous-to-permanent
  linking**, so the *existing* anonymous session's `auth.uid()` — the one
  RLS ownership already points at — is what ends up permanent. No new
  identity, no reassignment.

Supabase's anonymous-linking mechanism is **not** `signInWithOtp` +
`verifyOtp({ type: 'email' })` (today's exact call pair). Per Supabase's
documented anonymous sign-in linking flow, converting an anonymous session
to a permanent identity is done by calling `supabase.auth.updateUser({
email })` **while the anonymous session is the active session** — this
updates the *existing* user row in place (setting its email, clearing
`is_anonymous`) rather than performing a fresh sign-in that would
authenticate (or silently create) a *different* user by that email.
Confirming the emailed code for that path is `verifyOtp({ email, token,
type: 'email_change' })`, not `type: 'email'`. If the UI instead calls
`signInWithOtp`/`verifyOtp({ type: 'email' })` while anonymous — today's
exact code path — Supabase treats it as an ordinary passwordless sign-in
unrelated to the current session: verifying it authenticates as whatever
user that email already resolves to (a new user, the first time), **not**
the anonymous session's user id, which would silently orphan the trip's
existing `created_by`/`trip_members` row and violate decision 4's "no
reassignment" guarantee outright.

**Resolution — same UI, branching call underneath it:**
`src/app/check-email/page.tsx`'s markup, resend cooldown, and
`remember-signin-email` behavior are unchanged (satisfying decision 3 at
the UX/mechanics level, which is what it's actually protecting — one
screen, one mental model for the visitor). Its `sendCode()`/`resend()`/
`confirm()` handlers branch on whether the current session is anonymous:

```ts
const { data: { user } } = await supabase.auth.getUser();
const isAnonymous = user?.is_anonymous === true;

// sending the code
const { error } = isAnonymous
  ? await supabase.auth.updateUser({ email })
  : await supabase.auth.signInWithOtp({ email });

// confirming the code
const { error } = isAnonymous
  ? await supabase.auth.verifyOtp({ email, token: code, type: "email_change" })
  : await supabase.auth.verifyOtp({ email, token: code, type: "email" });
```

`src/app/page.tsx` (today's upfront email screen) and the "no browser
memory" returning-sign-in path (AC 15/16) never have an anonymous session
active, so they always take the unchanged `signInWithOtp`/`type: "email"`
branch — this fork is additive, not a rewrite of the existing behavior for
existing callers.

**This is flagged as an open risk, not asserted as verified fact** — see
[ADR 0006](../../adr/0006-anonymous-auth-and-otp-linking-for-onboarding.md)
for why, what a pre-implementation spike needs to confirm against the
project's actual `@supabase/supabase-js` version (`^2.116.0`) and Auth
server config, and the fallback if `updateUser`'s email path turns out to
require a different email template/token type than assumed here (Supabase
has changed OTP/linking email template wiring across versions; the
anonymous-linking docs describe the shape of the mechanism but the
project's specific mailer/template config has not been inspected as part
of this architecture pass).

**Email template consequence**: `updateUser({ email })`'s confirmation
email is Supabase's "Confirm signup" (or "Change Email Address," depending
on project config) template — a **different** template than
`signInWithOtp`'s "Magic Link"/OTP template. Both need to be configured in
the Supabase dashboard to send matching 6-digit-code copy (not a
magic-link URL) so the single `check-email` screen's "we sent a 6-digit
code" copy is accurate regardless of which branch fired. This is a
dashboard config task, not a code change, but it blocks this feature and
is easy to miss since it's invisible to `git diff`.

**Where anonymous sessions are created:**

- **Organizer**: `src/lib/data/trips.ts`'s `createTrip` gains a
  precondition, run from `src/app/trip/new/page.tsx`'s `handleCreate()`
  before calling `createTrip`:
  ```ts
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }
  ```
  (AC 2's "if one doesn't already exist on this browser" — a second visit
  to `/trip/new` in the same browser, session already anonymous or
  upgraded, skips this and reuses the existing session, satisfying "Create
  your first trip" being non-limiting per AC 4/decision 9.)
- **Invitee**: the same precondition is added at the point `check-email`'s
  `confirm()` handler runs for an `invite`-flow visitor who arrived with no
  session at all (not the organizer's own trip) — i.e., immediately before
  branching to `updateUser`/`signInWithOtp` above, if `!user`, call
  `signInAnonymously()` first, then re-derive `isAnonymous = true` for that
  same request. This satisfies AC 12's "anonymous session created for them
  if one didn't already exist, then linked" in one continuous step,
  invisible to the visitor as two calls.

## Update: hide-and-reveal replaces attempt-then-redirect for the organizer (Decisions 12–13)

This section is authoritative over the "Route/page changes" section below
wherever the two disagree about **the organizer's own trip**. It leaves that
section's description of the **invitee's** flow (public summary →
attempt-then-redirect OTP → resume) untouched — Decision 12 is explicit that
this pivot applies only to the organizer's own trip.

### Why: the shipped attempt-then-redirect pattern wasted organizer effort

The original design (now superseded, per Decision 12) rendered Add expense /
Settle up / Invite others unconditionally on the trip page for the owner,
attempted the mutation on submit, and only then ran `requireVerifiedSession`
and redirected to `/check-email?trigger=...` with a save-draft-and-resume
round trip (`src/lib/pending-action.ts`) if unverified. Manual testing after
the anonymous-session/RLS migrations landed found this let an organizer fill
in an entire expense form, or start an invite, with no visible sign that a
verification wall was coming — only to hit it at the last step. Decision 12
replaces this with hiding the entry points entirely while unverified,
alongside a persistent inline verification CTA on the trip page itself.

### Determining "is this session verified" — reusing the existing `is_anonymous` signal, with one addition

The trip page (`src/app/trip/[id]/page.tsx`) already computes exactly the
signal this needs, for the same reason it needs it for the existing
three-tier summary/detail split: `getTripView` only resolves for a caller
`is_owner_or_verified_member` allows through, and per the "Core model" table
above, **the only way an *anonymous* session's `getTripView` call resolves at
all is if that session owns the trip** (the "anonymous, member but not owner"
row is a non-issue in practice — see that table's note). So whenever `view`
is non-null, `user.is_anonymous === true` unambiguously means "this is the
pre-verification owner viewing their own trip," and `user.is_anonymous !==
true` unambiguously means "this caller (owner or invitee) is already
verified." No new query, no new RPC, no new column is needed to decide
buttons-vs-CTA — it is a pure re-read of the same `user` the page already
fetches via `supabase.auth.getUser()` for the existing tiering decision.

**The one gap the existing signal doesn't cover: verification completing
asynchronously while the trip page is already open.** The whole point of
Decision 12 is that confirmation happens *inline, without navigation* — the
organizer submits an email, then a code, and both round trips are
`fetch`-level Supabase Auth calls from a client component already mounted on
`/trip/[id]`. Nothing about that flow reloads the page or re-runs the Server
Component that computed `user`/`view` at initial render. Two options, and
the one this architecture recommends:

- **Rejected: rely solely on `router.refresh()`.** Calling
  `router.refresh()` after `verifyOtp` succeeds re-runs the Server Component,
  which re-fetches `user` (now permanent) and `view`, and would naturally
  flip the render branch. This is correct but not sufficient alone: a
  refresh is a network round trip with its own latency, so between "OTP
  confirmed" and "server round-trip completes" the buttons would still be
  hidden — reintroducing a small version of the same "nothing visibly
  happened" problem Decision 12 exists to remove, this time for the *reveal*
  instead of the gate.
- **Recommended: flip local client state immediately, reconcile with
  `router.refresh()` in the background.** The mutation-gate widget (below)
  is a client component that receives `initialIsVerified` as a prop from the
  server render, but keeps its own `verified` state, initialized from that
  prop. On the inline `confirm()` call's success, it sets `verified = true`
  synchronously (revealing the buttons with no perceptible delay) *and*
  calls `router.refresh()` in the background to reconcile the rest of the
  page (e.g., re-fetch `view` so `you`/`members` reflect the now-permanent
  `auth.uid()` if that ever matters, and to pick up server-derived state this
  widget doesn't itself track). The two are safe to run together because the
  underlying RLS predicates are already satisfied the instant `verifyOtp`
  resolves — the client isn't guessing ahead of the server's authorization
  state, it's just choosing not to wait for a redundant round trip to render
  what's already true.

This means the block of buttons/CTA on the trip page can no longer be pure
server-rendered JSX with no client state (unlike most of this page, per
`docs/ARCHITECTURE.md`'s Server-Component-by-default pattern) — it is
necessarily promoted to a small `"use client"` leaf, fed `tripId` and
`initialIsVerified` as props, following the same "small co-located client
leaf fed by props" split the rest of the page already uses for its
interactive pieces (`TripTabs` is the existing precedent).

### Shared OTP logic: extract a hook, don't duplicate the linking fork

`src/app/check-email/page.tsx` already contains the one piece of this
feature with real, easy-to-get-wrong subtlety: the `isAnonymous` branch
between `updateUser`/`verifyOtp({ type: "email_change" })` (anonymous-to-
permanent linking, Decision 4) and `signInWithOtp`/`verifyOtp({ type:
"email" })` (plain sign-in), plus resend-cooldown timing and
`remembered-email` integration (see "OTP confirmation: sign-in vs. linking"
above and [ADR 0006](../../adr/0006-anonymous-auth-and-otp-linking-for-onboarding.md)).
The inline organizer widget needs the **identical** send/confirm logic —
same two Supabase call pairs, same branch condition — just rendered as two
compact fields on the trip page instead of a full screen with its own route.

**Recommendation: extract the core send/confirm logic out of
`check-email/page.tsx` into a shared hook** (e.g. `src/lib/use-otp-flow.ts`),
used by both:

```ts
// Sketch — not a full implementation.
export function useOtpFlow(supabase: Client) {
  const [phase, setPhase] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function sendCode(inputEmail: string) { /* isAnonymous branch, as today */ }
  async function confirmCode(code: string) { /* isAnonymous branch, as today */ }
  // resend cooldown state/logic, unchanged from check-email today

  return { phase, email, error, pending, sendCode, confirmCode /* , ... */ };
}
```

- `src/app/check-email/page.tsx` becomes a thin wrapper: its markup
  (headline-per-`trigger`, resend cooldown UI, `remembered-email` prefill)
  is unchanged pixel-for-pixel, but its `sendCode`/`resend`/`confirm`
  handlers call into the hook instead of holding the branching logic inline.
  This satisfies decision 3's "same implementation" at the actual
  code-reuse level, not just "looks the same to the user" — there is now
  exactly one place the anonymous-linking fork is implemented, not two that
  could drift apart the next time Supabase changes something about
  `updateUser`/`email_change` (per ADR 0006's flagged risk).
- The new inline widget (e.g. `src/app/trip/[id]/verify-inline.tsx`) is a
  second, much smaller thin wrapper: an email `Field` + submit, then (once
  `phase === "code"`) a code `Field` + submit, both inline in the trip page's
  layout instead of a full-page `Screen`. No resend-cooldown UI is a hard
  requirement here (design.md's call), but the hook exposes it either way at
  no extra cost.
- **Rejected alternative — duplicate the branch in a second file.** Copying
  the `isAnonymous`/`updateUser`/`verifyOtp` fork into a second component
  was considered and rejected: it is the one piece of this feature ADR 0006
  flags as unverified against the project's exact Supabase version/config,
  and a bug found in it later (e.g. the email-template mismatch ADR 0006
  calls out) would need fixing in two places instead of one if duplicated.
  Extraction costs one new file and a small refactor of an already-shipped
  page; the alternative risks silent divergence in exactly the code this
  project has already flagged as its highest-uncertainty spot.

### Fate of `/check-email` and its `?trigger=` params

Per Decision 12, the organizer's own trip never navigates to `/check-email`
for its three (now four, Decision 13) mutation triggers — verification for
those happens entirely inline on `/trip/[id]`. Concretely:

- **`trigger=add-expense`, `trigger=invite`, `trigger=placeholder`** (the
  three organizer-only trigger values in `check-email/page.tsx`'s `Trigger`
  union) become **dead** — nothing navigates to `/check-email` with these
  values anymore once the mutation-gate buttons are hidden pre-verification
  (there's no click to redirect from). They should be **removed** from
  `Trigger`, `isTrigger`, and `triggerHeadline` in `check-email/page.tsx`,
  along with the `router.push('/check-email?trigger=add-expense...')` /
  `trigger=invite` / `trigger=placeholder` call sites in
  `add-expense/page.tsx`, `expense/[id]/edit/page.tsx`, and
  `invite/page.tsx` (see "Fate of `pending-action.ts`" below for what else
  goes with them).
- **`trigger=detail` and `trigger=invitee-expense`** (the invitee's two
  trigger values, used by `/join/[code]/page.tsx` and the trip page's
  summary-only branch) are **unchanged** — Decision 12 does not touch the
  invitee flow at all.
- **`/check-email` with no `trigger`** (the plain, no-`invite`-param case)
  remains the "no browser memory" returning-sign-in path (AC 15/16),
  unchanged.

So after this change, `/check-email` is reached from exactly two places, as
the task framing anticipated: (a) the invitee's attempt-then-redirect flow
(`trigger=detail`/`trigger=invitee-expense`, from `/join/[code]` and the
trip page's summary-only view), and (b) the no-session, no-browser-memory
returning-visitor sign-in (no `trigger`). It does **not** additionally
become "the shared logic, just also reachable as a full page for the
organizer" — the inline widget does not link out to `/check-email` under any
circumstance; it is a fully separate rendering of the same underlying hook,
per the extraction above.

### Fate of `src/lib/pending-action.ts`

The save-draft-and-resume mechanism was built to survive exactly the round
trip Decision 12 removes for the organizer: "start a mutation → get
redirected to `/check-email` → come back → replay it." With that round trip
gone for the organizer, its three exports split three ways:

- **`savePendingExpenseDraft`/`takePendingExpenseDraft` — keep.** These are
  not organizer-only: per requirements' invitee flow (AC 11/12), an invitee
  can also reach add-expense and edit-expense via attempt-then-redirect,
  which is unchanged. `add-expense/page.tsx` and
  `expense/[id]/edit/page.tsx`'s `requireVerifiedSession`-then-redirect-
  then-resume logic stays exactly as it is today, because it's still load-
  bearing for that caller — the only thing that changes for these two pages
  is that the organizer can no longer reach the *form itself* while
  unverified (the mutation-gate hides the "Add an expense" button/route
  entry point on the trip page), so in practice these pages' own
  `requireVerifiedSession` check becomes unreachable-when-unverified for an
  owner but remains reachable (and necessary) for an invitee editing/adding
  on someone else's trip.
- **`savePendingInviteAction`/`takePendingInviteAction` — remove.** Inviting
  is an organizer-only action (invitees never see an invite/share button);
  once the invite screen's entry point is hidden pre-verification there is
  no path left that produces a pending invite action to resume.
  `invite/page.tsx`'s `requireVerifiedSession`-then-redirect-then-resume
  logic around "Copy link"/"Share" should be deleted along with these two
  functions and the `trigger=invite` redirect.
- **`savePendingPlaceholderAction`/`takePendingPlaceholderAction` — remove.**
  Same reasoning: placeholder-member management is organizer-only (per
  Decision 11/AC5, enumerated as part of "Invite others"), reachable only
  from the now-hidden-pre-verification invite screen. `invite/page.tsx`'s
  placeholder add/rename/remove gate-and-resume logic and the
  `trigger=placeholder` redirect should be deleted along with these two
  functions.

Net: `pending-action.ts` keeps exactly the `PendingExpenseDraft` type and its
two functions (still load-bearing for the invitee's unchanged flow); the
`PendingInviteAction` and `PendingPlaceholderAction` types and their four
functions are dead code once the organizer-side call sites that produced
them are removed, and should be deleted in the same change rather than left
behind — leaving them would be exactly the kind of "looks load-bearing,
isn't" landmine a later pass could easily misread as still-required
infrastructure for the invite/placeholder RPCs (which remain gated
server-side; only the client-side resume plumbing for them is dead).

### `src/lib/auth-gate.ts`'s `requireVerifiedSession` — narrows in practice, doesn't disappear

`requireVerifiedSession` itself is not organizer-specific — it stays exactly
as written (a thin `getUser()` + `is_anonymous` check) and remains the gate
`add-expense/page.tsx` and `expense/[id]/edit/page.tsx` call before
submitting, for the invitee case described above. What changes is only
*which callers ever observe it return `false`* in practice for the
organizer's own trip: since the mutation-gate widget already hides the
"Add an expense" entry point for an unverified owner, that owner can no
longer reach a page where `requireVerifiedSession` would fire — the check
becomes defense-in-depth for that caller (matching AC 17's "not merely by UI
routing" principle: even if some future regression re-exposed the button,
the click-time check and the RLS policy underneath it both still hold) while
staying live and necessary for the invitee.

### Settle-up (Decision 13): closing the one mutation that had no gate at all

`complete_trip` and `src/app/trip/[id]/settle-up/page.tsx` were never
touched by the original mutation-gate work — confirmed by inspection:
`settle-up/page.tsx` calls `completeTrip(supabase, id)` directly with no
`requireVerifiedSession` check of any kind, client- or server-side, and
`complete_trip` (`supabase/migrations/0001_init.sql`) has no
`is_anonymous`/verification guard in its body, unlike `join_trip` and the
placeholder RPCs (which migration 0010 already fixed). This is closed as two
parts, matching Decision 13 exactly:

1. **New migration `0011_gate_complete_trip.sql`**, following the same
   pattern as `0010_gate_join_and_placeholder_mutations.sql`: `create or
   replace function public.complete_trip` with the same
   `coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false` guard
   added at the top of the body, signature (`complete_trip(_trip_id uuid)
   returns void`), the existing `where id = _trip_id and created_by =
   auth.uid() and completed_at is null` predicate, and grants
   (`revoke ... from public; grant ... to authenticated;`) all otherwise
   unchanged:

   ```sql
   create or replace function public.complete_trip(_trip_id uuid)
   returns void
   language plpgsql security definer set search_path = public as $$
   begin
     if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
       raise exception 'confirm your email before settling up';
     end if;

     update public.trips
     set completed_at = now()
     where id = _trip_id and created_by = auth.uid() and completed_at is null;
   end;
   $$;
   revoke execute on function public.complete_trip(uuid) from public;
   grant execute on function public.complete_trip(uuid) to authenticated;
   ```

   This closes AC 17's "`complete_trip` (settle up) fails without a
   **verified** session backing it" as a direct-RPC-call guarantee, not just
   a UI-routing one — the exact same class of gap migration 0010's header
   comment already explains for `join_trip` (an anonymous session carries
   the `authenticated` role, so nothing but this guard stops a bare
   `signInAnonymously()` + RPC call from completing someone's trip).
2. **"Settle up" joins the organizer's hidden-until-verified button set**
   (Decision 12/AC5's list, now four entries instead of three) — the
   trip page's icon-button row (`IconLinkButton` linking to
   `/trip/${id}/settle-up`) is included in the same mutation-gate widget
   described above, not left visible-and-gated-only-on-click the way it was
   before this fix. `settle-up/page.tsx` itself needs no
   `requireVerifiedSession` addition for the organizer path (the entry
   point is hidden before the page is ever reached), but should still not
   be treated as a page that can only ever be reached by a verified owner
   at the network layer — the RLS/RPC guard in part 1 is what actually
   enforces that, per AC 17's "not merely by UI routing" principle.

### Does the RLS/three-tier model change? No — confirmed

Decisions 12–13 (Change 1) are a client-side UX restructuring only: which
component renders, and when a click reaches `requireVerifiedSession` versus
never rendering a clickable element at all. Every predicate in "Core model:
three tiers, two axes of trust" and "Data model changes" above
(`is_verified_trip_member`, `is_owner_or_verified_member`, the `expenses`/
`trip_members` policies, `get_trip_summary`) is unaffected by Change 1 and
needs no revision. **Decision 13 (Change 2) is the one genuine server-side
change accompanying this pass**, and it is additive to the existing model,
not a revision of it: `complete_trip` slots into the exact same "write
requires `is_anonymous = false`" rule the table in "Core model" already
describes for expenses/invite, closing a gap where one RPC had silently
never been brought into line with a rule the rest of the system already
followed. `docs/ARCHITECTURE.md`'s auth-model summary should name
`complete_trip` explicitly alongside expenses/invite once migration 0011
lands, since today it describes "writes" as a class without calling out that
this one RPC was, until now, an unenforced exception to its own rule.

## Route/page changes

### `src/proxy.ts`

`PROTECTED_PATTERNS` and the optimistic session check no longer map
cleanly to "has any session" — that check needs to become "the path is
being requested in a way that needs *some* server-checkable identity,
scoped to what proxy.ts can actually see (which is session existence and
`is_anonymous`, not trip membership — RLS remains the real boundary, per
the existing "optimistic" comment)." Concretely:

```ts
// /trip/new and /trip/[id]* no longer require a session at all — an anonymous
// session is created client-side by the pages themselves (trip creation) or is
// simply absent (a summary-only invitee view). /trips still requires *some*
// session (anonymous or permanent) since "your trips" is meaningless with none.
const SESSION_REQUIRED_PATTERNS = [/^\/trips/];
```

`isProtectedPath` is renamed `requiresSession` (matching the narrower
scope) and checked only against `SESSION_REQUIRED_PATTERNS`. `/trip/new`
and `/trip/[id]*` are removed from the gated set entirely — they fall
through to `NextResponse.next()` unconditionally, same as any other public
page today. This directly satisfies AC 18 ("no longer redirects an
anonymous-session trip creator away from their own new trip, and does not
require a session at all for summary-level trip-viewing paths") while
leaving `/trips`' gate (and its `?next=` redirect shape) untouched, since a
trips *landing* page for a session-less visitor is meaningless (there is
nothing to list) — AC 15's "lands on a trips landing page" always happens
after sign-in-by-code succeeds, i.e. after a session exists, so `/trips`
keeping its gate does not conflict with that criterion.

The comment above `PROTECTED_PATTERNS` ("middleware check is optimistic;
RLS is the real enforcement") becomes load-bearing in a new way here: with
`/trip/[id]*` ungated, a request for a trip the visitor has no relationship
to reaches the page/RPC layer with **no session at all**, which is now an
*expected*, not defensive-only, case — `get_trip_summary` must work for
exactly this caller, and `getTripView`'s underlying `expenses`/
`trip_members` selects must return empty/RLS-filtered results (not throw)
for that same caller, which the existing `try { getTripView(...) } catch`
pattern in `trip/[id]/page.tsx` already handles as its "couldn't load"
branch — reused, not rebuilt, for the new "not entitled to detail yet"
case (see below).

### `src/app/trip/[id]/page.tsx` — tiered rendering

Currently: `redirect("/")` if no `user`, then `getTripView` (full detail)
unconditionally. Both premises change:

1. No `redirect("/")` fallback — a visitor with no session, or an anonymous
   session unrelated to this trip, is a valid caller now, not a defensive
   edge case.
2. Always fetch summary via the new `getTripSummary(supabase, id)`
   (wrapping `get_trip_summary`, works with `supabase.auth.getUser()`
   returning `null`). If this 404s/empties (bad id), render today's
   "couldn't load" message unchanged.
3. Additionally attempt `getTripView(supabase, id, user?.id)` **only when a
   user exists** (any session, anonymous or not) — its result is `null` if
   RLS filters it out (non-owner, non-verified caller), same failure mode
   the try/catch already handles today, just no longer collapsed into "show
   the couldn't-load screen": when `getTripSummary` succeeded but
   `getTripView` came back empty/errored, render the **summary view** (the
   trip header/total/who-owes-whom card, matching AC 10's "final answer"
   framing) plus a "View details" / "Add an expense" affordance that routes
   into the OTP trigger (see below) instead of the detail tabs.
4. When `getTripView` *does* resolve (owner's anonymous session, or a
   verified member/owner), render exactly what the page renders today —
   full detail tabs, add-expense button, etc. No behavior change for that
   caller.

This means the page now has three render branches (couldn't-load /
summary-only / full-detail) where it had two (couldn't-load / full-detail)
before — matching the three tiers, not a UI redesign of any one of them
(non-goal).

**Updated by Decision 12** (see "Update: hide-and-reveal replaces
attempt-then-redirect for the organizer" above): within branch 4
(full-detail), the mutating entry points (Add expense, Settle up, Invite
others/roster) are no longer always rendered — they're handed off to a new
client-leaf mutation-gate widget, passed `initialIsVerified={user != null &&
user.is_anonymous !== true}` (meaningful only in this branch, since branch 4
is reached at all only for an owner or a verified member — see that
section's signal-reuse argument for why this is sound without an extra
query). The widget renders the buttons when verified, or the inline
email/code CTA in their place when not, and self-promotes to "verified" the
instant its inline confirm succeeds without waiting on a page refresh.

### `src/app/trip/[id]/invite/page.tsx` and add/edit-expense pages — the mutation gate

**Superseded for the organizer by Decision 12 — see "Update: hide-and-reveal
replaces attempt-then-redirect for the organizer" above.** The premise below
("an owner needs to *see* the invite link and add-expense form
pre-verification") is no longer correct for the organizer's own trip: those
entry points are hidden, not shown-and-gated-on-click. This section's
description remains accurate as written for **the invitee**, who still
reaches `add-expense`/`expense/[id]/edit` via the trip's normal UI (there is
no invitee-facing "invite" or "placeholder" screen at all, so those two
gates are organizer-only and are the ones removed by Decision 12 — see the
update section's "Fate of `pending-action.ts`").

The page itself keeps rendering without a verified session (an owner needs
to *see* the invite link and add-expense form pre-verification — only the
underlying write is gated, matching decision 2's "viewing... never
triggers it"). What's added is a **shared client-side gate**, run
immediately before the actual mutating call in each of: `add-expense`'s
`handleSubmit`, `expense/[id]/edit`'s save handler, and the invite page's
"Copy link"/"Share" action:

```ts
// src/lib/auth-gate.ts (new)
export async function requireVerifiedSession(supabase: Client): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  return user != null && user.is_anonymous !== true;
}
```

When `requireVerifiedSession` returns `false`, the calling page routes to
`check-email` (with `next` pointing back at itself, and, in the
mutation case, the pending action's inputs preserved — e.g. via query
params or `sessionStorage`, since `check-email` navigates away and back)
instead of attempting the write; **the write is submitted only after
`check-email`'s `confirm()` succeeds**, satisfying AC 8's "unlocked by,
not independent of, completing the OTP step." This is a **new** shared
module — nothing today needs to distinguish "has a session" from "has a
verified session" mid-flow, since every mutating page today assumed
`proxy.ts` had already guaranteed a real, permanent session.

**Resuming the pending action after `check-email`**: the simplest option,
and the one this architecture recommends, is that `check-email`'s
`next` param (already used for the plain sign-in case) simply routes back
to the exact page the mutation started from (e.g. `/trip/[id]/add-expense`
with the form's field values carried in the URL query string or
`sessionStorage`, keyed by trip id) rather than attempting to replay the
mutation from `check-email` itself — this keeps `check-email` fully
generic (it has no idea what triggered it, same as today) at the cost of
the visitor needing one extra tap ("submit" again) after confirming,
which is an acceptable, simple tradeoff and should be confirmed with
UX rather than decided unilaterally here.

### `/` (`src/app/page.tsx`) — replaces the email-first screen

Becomes a server- or client-rendered branch on session state (implementation
detail, not decided here): no session → "Create your first trip" CTA
(AC 1) calling `signInAnonymously()` + `createTrip` as described above;
existing session (anonymous or permanent) → redirect straight into the
relevant trip (`/trip/[id]`, if exactly one anonymous-owned trip exists
for a not-yet-verified organizer) or `/trips` (permanent session, possibly
multi-trip) — AC 14. The email-field UI currently on this page moves to
being reachable only via an explicit "Already have an account? Sign in"
affordance, still using the unchanged `signInWithOtp`/`check-email` path
for the no-browser-memory case (AC 15/16). This is UX-doc territory in
detail (copy, layout); flagged here only for the auth-state branching it
requires, which is new logic this page doesn't have today.

### `check-email`'s post-confirm redirect target

`confirm()`'s `router.push(next)` (today defaults to `/trips`) needs a
third branch alongside "join flow" (existing) and "plain sign-in" (existing,
`next` defaults to `/trips` — AC 15's trips-landing-page requirement,
already satisfied by the existing default): the **organizer mutation
resume** case, where `next` should point back at the triggering page (see
above) rather than `/trips`. No change to the `/trips` default itself.

### `/api/trip-email` — no-longer-always-authenticated caller

Today this route 401s unless `supabase.auth.getUser()` returns a
*permanent* user with an email — but `trip/new/page.tsx` now calls it
right after `createTrip`, when the caller is very often still anonymous
with no email at all. Per the requirements' own non-goal note, exact
sequencing is left to implementation; this architecture's recommendation:
make the "not signed in" case (and the new "signed in but anonymous, no
email yet" case) a **silent no-op success** (`{ ok: true, skipped: true }`)
rather than a 401 — the call site already treats this endpoint as
best-effort (`.catch(() => {})`), so no caller-side change is needed, and
the "you created a trip" email simply doesn't fire until the organizer has
an email at all, which structurally cannot happen before their first
verification per this feature's own model.

## Impact analysis

### `src/proxy.ts`

Modified as described above. `/join/[code]` and `/check-email` were never
in `PROTECTED_PATTERNS` and are unaffected. `/trips` keeps its exact
current gate and redirect shape.

### `src/lib/data/trips.ts`

Additive: new `getTripSummary` function wrapping `get_trip_summary`.
`getTripView`, `getMyTrips`, `createTrip`, `joinTrip`, `addExpense`,
`updateExpense` are unchanged in signature and behavior for any caller who
already has a verified/permanent session — the RLS predicate swap
(`is_trip_member` → `is_verified_trip_member`/`is_owner_or_verified_member`)
only changes outcomes for callers who are anonymous or unverified, which
is exactly the new population this feature introduces, not existing
traffic.

### `src/app/check-email/page.tsx`

Behavior fork added (`updateUser`+`email_change` vs. `signInWithOtp`+
`email`) as described. Markup, resend cooldown, and
`remember-signin-email` integration unchanged. Existing callers
(`/join/[code]`'s invite flow, `/`'s plain sign-in) both still work: an
invite-flow visitor who already has an anonymous session (because they
already tried "View details" once) takes the linking branch; a
returning-visitor plain sign-in with no active session takes the unchanged
`signInWithOtp` branch.

**Updated by Decision 12** (see "Update: hide-and-reveal..." above): the
`isAnonymous`/`updateUser`/`signInWithOtp` fork described above is extracted
out of this page into a shared hook (`src/lib/use-otp-flow.ts`, proposed),
which this page now calls into rather than implementing inline; this page's
own markup/mechanics stay as described. The `Trigger` union drops
`"add-expense"`, `"invite"`, and `"placeholder"` (dead once the organizer's
mutation-gate buttons are hidden pre-verification instead of redirecting
here); `"detail"` and `"invitee-expense"` (the invitee's two triggers) are
unchanged.

### `src/lib/auth-gate.ts` and `src/lib/pending-action.ts`

**New impact from Decision 12.** `auth-gate.ts`'s `requireVerifiedSession`
is unchanged in implementation and stays load-bearing for the invitee's
`add-expense`/`expense/[id]/edit` flow; for the organizer it becomes
defense-in-depth only, since the mutation-gate widget already prevents an
unverified owner from reaching a page that would call it. In
`pending-action.ts`, `PendingExpenseDraft` (and its two functions) stay,
still needed by the invitee's unchanged resume flow; `PendingInviteAction`
and `PendingPlaceholderAction` (and their four functions) become dead code
once the invite/placeholder-management entry points are hidden rather than
click-then-redirect-gated, and should be deleted along with the
`trigger=invite`/`trigger=placeholder` redirect call sites in
`invite/page.tsx` — see "Fate of `pending-action.ts`" above for the full
per-export breakdown and rationale.

### `src/app/trip/[id]/page.tsx`, `invite/page.tsx`, `add-expense/page.tsx`, `expense/[id]/edit/page.tsx`, `settle-up/page.tsx`

**New impact from Decisions 12–13.** A new client-leaf mutation-gate widget
(proposed: `src/app/trip/[id]/verify-inline.tsx`, using the extracted OTP
hook above) is added to the trip page's full-detail branch, replacing the
unconditional rendering of Add expense / Settle up / Invite others with a
verified-check that shows those entry points or the inline CTA. `invite/
page.tsx` and `add-expense/page.tsx` lose the `requireVerifiedSession`-then-
redirect-then-resume logic that previously ran on the organizer's own click
path (dead once their entry points are hidden) but that same logic in
`add-expense/page.tsx`/`expense/[id]/edit/page.tsx` stays for the invitee
caller, per the split above. `settle-up/page.tsx` gains no client-side
`requireVerifiedSession` call of its own (Decision 13 folds "Settle up" into
the same mutation-gate widget, so the page is simply not reached
pre-verification) but does depend on the new migration below for
server-side enforcement.

### `src/app/api/join/route.ts`

Unchanged. It already runs after `verifyOtp` succeeds and derives its user
from `supabase.auth.getUser()` server-side — indifferent to whether that
session was newly linked-from-anonymous or a plain sign-in, since either
way it's a real, permanent, authenticated session with an email by the
time this route runs.

### `src/app/api/trip-email/route.ts`

Changed as described (401 → silent no-op for anonymous/no-user callers).

### `supabase/migrations/`

New migration file (e.g. `0009_simplified_onboarding.sql`) containing:
`is_verified_trip_member`, `is_owner_or_verified_member`, `get_trip_summary`,
and the four `drop policy` / `create policy` pairs on `expenses` +
`trip_members` above. No `alter table`, so no additive-not-null-column
phasing concern (unlike ADR 0003's `expenses.date` migration) — this is a
pure policy/function migration, safe to apply without a deploy-ordering
window, **except** for one thing worth flagging: the moment this migration
lands, the *old*, still-deployed frontend (which still calls `getTripView`
unconditionally behind `proxy.ts`'s old gate) is now running against RLS
that requires `is_verified_trip_member`/`is_owner_or_verified_member`
instead of plain `is_trip_member` — an existing signed-in-but-somehow-
anonymous session should not exist in production today (anonymous auth
isn't enabled yet), so in practice every currently-live session is
permanent and unaffected; this is called out only for completeness, not
because a real regression window is expected.

`0010_gate_join_and_placeholder_mutations.sql` (already landed, QA
follow-up) added the `is_anonymous`-guard pattern to `join_trip` and the
three placeholder-member RPCs. **New migration `0011_gate_complete_trip.sql`
(Decision 13)** adds the identical guard pattern to `complete_trip` — the
one write RPC 0010 didn't touch, found in a later review pass, per
requirements' own framing as a "pre-existing security gap ... being closed
alongside this feature, not new-feature scope in itself" (see "Semver
classification" in requirements.md and the "Settle-up" subsection above for
the exact SQL). Same safe-to-apply characterization as 0009/0010: no `alter
table`, pure function replacement, no deploy-ordering window.

### Supabase project configuration (outside `supabase/migrations/`)

Two dashboard-level changes this feature depends on, neither expressible
as a SQL migration:
1. **Enable anonymous sign-ins** (Auth → Settings) — required for
   `signInAnonymously()` to succeed at all.
2. **Email template alignment** for the "Confirm signup"/"Change Email
   Address" template (used by the `updateUser` linking path) to match the
   existing OTP/magic-link template's 6-digit-code wording — see "OTP
   confirmation" above.

## Semver / breaking-change policy

Feature, per requirements' own classification — no external route/RPC
signature is removed (only two new RPCs and RLS-predicate changes that
tighten *and* loosen different edges), but the auth model gains anonymous
sessions and a verification tier that didn't exist before, which is why
requirements flagged this as architecture-significant rather than a plain
UI change. `docs/ARCHITECTURE.md` is amended (not just this doc) to record
the new "anonymous auth + verification tiers" model as current-state,
since it changes a system-wide invariant (the existing doc's own
"`src/proxy.ts` remains the sole place ... auth-gating happens (session
existence only)" line stops being accurate for `/trip/*` once this ships).

**Decisions 12–13 addendum:** Decision 12 (hide-and-reveal) is a pure
client-side UX change with no RLS/RPC-signature impact and no semver
implication beyond the feature's existing classification — no caller-facing
contract changes. Decision 13's `complete_trip` fix is, per requirements'
own semver section, properly a **bug fix** riding alongside this feature
(a pre-existing gap since anonymous auth was introduced, not new-feature
scope), same characterization requirements already gives it — called out
here only so this doc's semver framing doesn't read as silently
contradicting requirements.md's.
