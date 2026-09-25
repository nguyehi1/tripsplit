# Architecture: remove-member-access

Builds on the confirmed decisions in `requirements.md` (hard-delete `trip_members`, no
invite-code rotation, live/unsnapshotted balance recompute, in-app-only notification, organizer-
only for removing others, any non-organizer can leave, organizer can't remove/leave themself).
This doc covers the technical design and, critically, a consumer-impact bug this feature would
otherwise ship silently (see "Impact analysis — the ghost-payer bug" below).

## Existing precedent this reuses

- **`remove_placeholder_member`** (`supabase/migrations/0008_add_placeholder_members.sql`,
  gated further in `0010_gate_join_and_placeholder_mutations.sql`) is the only existing
  "remove a `trip_members` row" RPC. It hard-deletes, is organizer-only
  (`created_by = auth.uid()`), gates on `is_trip_open`, and adds a standalone
  `coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false` verification guard on top
  of that (not `is_verified_trip_member`, which presupposes membership that doesn't apply the
  same way here). The two new RPCs below (`remove_trip_member`, `leave_trip`) mirror this exact
  shape — same guard order, same `delete ... using ... if not found then raise` pattern, fully
  qualified column references throughout (`m.id`, `t.created_by`, etc. — see the ambiguous-
  column note below).
- **`src/app/trip/[id]/invite/page.tsx`** already renders the roster ("On the trip" — real
  members; "Placeholders" — placeholder members) and already has a full add/rename/remove
  UI pattern for placeholders, including a confirm-step state machine
  (`confirmRemoveId`/`startRemove`/`cancelRemove`/`handleRemoveConfirm`) that is the direct
  template for both new confirm flows (organizer-removes-real-member, self-leave). This is the
  natural, reuse-not-duplicate home for both new affordances rather than a new screen.
- **`src/lib/data/trips.ts`** is the one data-access module; new functions belong here,
  following the existing thin-RPC-wrapper style of `removePlaceholderMember`/
  `addPlaceholderMember`.

## Data model changes

**None.** No new tables, no new/renamed columns, no `ALTER TABLE`. This is 3 new
`security definer` SQL/plpgsql functions plus grants, in a new migration
`supabase/migrations/0014_remove_and_leave_trip_member.sql`. Because there is no schema change,
the migration-safety question ("does it apply cleanly against tables that already have rows")
is moot for this migration — it's function-only. There is also no risk of the
migration-0013-style bug (ambiguous column reference from an unqualified name that exists on
both sides of a join/upsert): none of the three new functions use an upsert or `excluded`
pseudo-relation, and every column reference in the two `delete ... using` statements is
table-qualified (`m.id`, `m.trip_id`, `t.id`, `t.created_by`), exactly matching
`remove_placeholder_member`'s existing, already-correct pattern.

No RLS *policy* changes either. `trip_members`, `trips`, and `expenses`' existing `select`
policies (`is_trip_member`, `is_owner_or_verified_member`) already correctly stop returning rows
to a caller once their `trip_members` row is gone — that's the whole mechanism that already
makes `getTripView` return null for a non-member today (same code path a stranger who never
joined already hits). Removal/leaving is just a new way to reach a state that already existed.

### New RPCs

```sql
-- Organizer removes another real (non-placeholder, non-self) member of an open trip.
create or replace function public.remove_trip_member(_member_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'confirm your email before managing the roster';
  end if;

  delete from public.trip_members m
  using public.trips t
  where m.id = _member_id
    and m.trip_id = t.id
    and t.created_by = auth.uid()
    and not m.is_placeholder
    and m.user_id is distinct from t.created_by
    and public.is_trip_open(t.id);

  if not found then
    raise exception 'member not found, you are not the organizer, the trip is locked, or that member can''t be removed this way';
  end if;
end;
$$;
revoke execute on function public.remove_trip_member(uuid) from public;
grant execute on function public.remove_trip_member(uuid) to authenticated;

-- Any non-organizer, non-placeholder member leaves an open trip (their own row only).
create or replace function public.leave_trip(_trip_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'confirm your email before leaving a trip';
  end if;

  delete from public.trip_members m
  using public.trips t
  where m.trip_id = _trip_id
    and m.trip_id = t.id
    and m.user_id = auth.uid()
    and t.created_by <> auth.uid()
    and public.is_trip_open(t.id);

  if not found then
    raise exception 'you are not a member of this trip, you are the organizer, or the trip is locked';
  end if;
end;
$$;
revoke execute on function public.leave_trip(uuid) from public;
grant execute on function public.leave_trip(uuid) to authenticated;
```

Both RPCs are organizer-only-for-others / self-only-for-leaving *by construction of the query*,
not just by UI — satisfies AC10 (RLS/RPC-level enforcement, not hidden UI) the same way
`remove_placeholder_member` already does. `not found` after the `delete` covers every rejection
reason in one message (member/row doesn't match the predicate at all): wrong caller, wrong
target, locked trip, or (for `remove_trip_member`) an attempt to target the organizer's own row —
mirrors the existing placeholder RPCs' error shape exactly.

`m.user_id is distinct from t.created_by` is what rejects the organizer's row specifically
(AC7): since the caller is required to be `t.created_by` for the row to match at all,
the only `trip_members` row where `user_id = t.created_by` is the organizer's own — excluding it
is equivalent to "not self," expressed the same way the schema already expresses identity
(`user_id`), with no extra parameter needed.

A third, read-only RPC is also needed — see "Detecting 'you were removed' on a later visit"
below, which is the part of this feature that most needed real design work.

### `src/lib/data/trips.ts` additions

```ts
/** Organizer-only, real-non-placeholder-member-only, blocked once the trip is completed or if targeting the organizer's own row. */
export async function removeTripMember(supabase: Client, memberId: string): Promise<void> { ... }

/** Non-organizer members only, blocked once the trip is completed. Removes the caller's own row. */
export async function leaveTrip(supabase: Client, tripId: string): Promise<void> { ... }

/** True if the caller is not currently a member of this trip but has a paid_by expense on it — see architecture.md. */
export async function wasRemovedFromTrip(supabase: Client, tripId: string): Promise<boolean> { ... }
```

All three are thin `supabase.rpc(...)` wrappers, same shape as `removePlaceholderMember`.

## Route/UI integration

No new API route — this is a same-origin RLS/RPC-authorized write with no server secret
involved, so it follows the app's default direct-client-to-Supabase mutation pattern (see
ARCHITECTURE.md's "Mutation pattern"), not `src/app/api/`.

- **`src/app/trip/[id]/invite/page.tsx`**: extend the existing `realMembers.map(...)` block
  (currently a read-only `Card` per member) with the same confirm-step affordance the
  `placeholders.map(...)` block already has, parameterized by which action applies to which row:
  - `isOrganizer && !member.isOrganizer && member.id !== view.you?.id && !locked` → show
    "Remove" (calls `removeTripMember`).
  - `!isOrganizer && member.id === view.you?.id && !locked` → show "Leave trip" (calls
    `leaveTrip`).
  - Both reuse the existing `confirmRemoveId`/`startRemove`/`cancelRemove` state machine shape
    (new parallel state, or a generalized `{ id, kind: "remove" | "leave" }`) and the existing
    locked-trip messaging block already rendered for placeholders.
  - The rejoin-via-link disclosure (scope decision 2) and exact copy is ux-designer's call, not
    architecture's — flagging only that the confirm step's copy slot exists and is the same one
    the placeholder-removal confirm step already uses.
- **`src/app/trip/[id]/page.tsx`** (`renderTripDashboard`): add a new fallback branch, and a new
  small presentational component (`RemovedFromTripScreen`, colocated the same way
  `TripSummaryOnly` is today) — see next section for what triggers it.

## Detecting "you were removed" on a later visit

This is the one piece of this feature that isn't just wiring up a delete RPC, and it deserves an
explicit design writeup — see also
[ADR 0012](../../adr/0012-post-removal-detection-and-ghost-payer-rendering.md).

**The problem restated precisely:** requirements.md's notification section and AC4/AC12 require
that a removed/left member, returning later "from a bookmark, the invite link, or navigation"
(i.e., not necessarily in the same client-side session/state as the removal action itself — the
organizer-removal case in particular happens in a *different* browser from the removed member's),
see an explicit "you're no longer on this trip" state, not the same generic view a stranger who
never joined would see. Scope decision 8 rules out a new audit-log table ("no audit trail beyond
what's naturally reconstructable... no new logging table"), and the data-model decision rules out
soft-delete. So the detection has to come from data that already exists for an unrelated reason.

**What already exists that can answer this:** `expenses.paid_by` references `auth.users(id)`
directly (not `trip_members`) and is never touched by removal (scope decision 4) — so a former
member who logged at least one expense before being removed/leaving still has rows in `expenses`
with their `auth.uid()` as `paid_by`, on a trip they're no longer a `trip_members` row for. That
combination — "not currently a member of this trip" + "has a paid_by row on this trip" — is
exactly "this session previously participated and is now gone," reconstructed entirely from data
that already exists for the ledger's own sake, with nothing new stored. This is squarely within
scope decision 8's "naturally reconstructable" carve-out, not the audit log it explicitly
excludes (no removed-by, no reason, no timestamp of removal — just a boolean).

```sql
create or replace function public.was_removed_from_trip(_trip_id uuid)
returns boolean
language sql security definer set search_path = public as $$
  select
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and not exists (
      select 1 from public.trip_members where trip_id = _trip_id and user_id = auth.uid()
    )
    and exists (
      select 1 from public.expenses where trip_id = _trip_id and paid_by = auth.uid()
    );
$$;
revoke execute on function public.was_removed_from_trip(uuid) from public;
grant execute on function public.was_removed_from_trip(uuid) to authenticated;
```

`renderTripDashboard`'s existing `view === null` branch (today: always renders
`TripSummaryOnly`, the same thing a total stranger with the link sees) becomes:

```
if (!view) {
  if (user && !user.is_anonymous && await wasRemovedFromTrip(supabase, id)) {
    return <RemovedFromTripScreen ... />;   // new
  }
  return <TripSummaryOnly id={id} summary={summary} />;  // unchanged
}
```

**Disclosed limitation, not silently accepted:** a member removed/left *before ever logging an
expense on that trip* has no `expenses` row to reconstruct from, and will see the existing
generic `TripSummaryOnly` fallback instead of the explicit removed/left state — i.e., AC4/AC12
are met for any member who paid for at least one thing, and unmet for one who didn't. Closing
this gap completely requires either the soft-delete/status-column model the requirements
explicitly rejected, or a new tombstone-style table recording who/when — which is what the
non-goals list ("no audit log of who removed whom and when") explicitly excludes even in its
minimal (no "who removed," just "when") form. Given the locked decisions, this gap is the
correct trade rather than something to silently work around; flagging it here so it's a known,
accepted trade rather than a missed requirement discovered later. (The *organizer's own* screen,
and a self-leaver's own screen, both already know synchronously that their own action just
succeeded — that immediate case needs no detection at all, it's ordinary post-mutation UI state.
Only the later/no-local-state return needs this RPC.)

## Impact analysis — the ghost-payer bug

This is the load-bearing finding of this pass: **as designed today, a removed member's own past
expenses will crash the trip-detail render for every remaining member**, not just fail to show a
name. This must be fixed as part of this feature, not left to whoever notices later.

`getTripView` (`src/lib/data/trips.ts`) builds `memberById` only from **current**
`trip_members` rows:

```ts
const members = memberRows.map((m, i) => ({ id: m.id, displayName: m.display_name, ... }));
const memberById = new Map(members.map((m) => [m.id, m]));
...
const expenses = expenseRows.map((e) => ({
  ...
  payer: memberById.get(memberIdForPaidBy(e.paid_by))!,
}));
```

`memberIdForPaidBy(paidBy)` is `userIdToMemberId.get(paidBy) ?? paidBy` — for a *current*
member's expense it resolves to their `trip_members.id`; for a *removed* member's expense (their
`trip_members` row is gone, so `userIdToMemberId` — built fresh from current `memberRows` on
every call — no longer has an entry for them), it falls through to the raw `paid_by` user id.
`memberById.get(<that raw user id>)` then returns `undefined`, because `memberById`'s keys are
`trip_members.id` values, not `user_id`s — the `!` non-null assertion is a lie at runtime.
`expense.payer` becomes `undefined`, and `src/app/trip/[id]/trip-tabs.tsx`'s expense-list render
(`expense.payer.initials`, `displayNameFor(expense.payer.displayName, ...)`) throws.

This is invisible today only because nobody has ever been able to leave a `trip_members` row
that still has attached expenses — `paid_by` has always pointed at a currently-present member.
This feature is exactly what breaks that invariant, on every trip where an organizer removes (or
a member leaves after logging) at least one expense.

**Required fix, same file:** after building `memberById` from current members, scan
`expenseRows` for any `paid_by` whose resolved id isn't a key in `memberById`, and synthesize a
"ghost payer" entry for each distinct one found — display name a fixed placeholder (e.g. "Removed
member"; exact copy is ux-designer's call, mirroring the existing `isPlaceholder` suffix
convention in `src/lib/avatar.ts`'s `displayNameFor`), a neutral/muted avatar, and a new marker
(e.g. `isRemoved: true`, parallel to the existing `isPlaceholder` field) so the UI can style it
distinctly. Two things this ghost entry must **not** do, to avoid a second-order bug:
- Must not be added to the `members` array returned for the roster/"Details" tab — that list
  stays exactly "current `trip_members` rows," unchanged.
- Must not be added to `computeBalances`' input member list — a ghost payer isn't a share-owing
  party; their historical `amountCents` already correctly counts toward the trip `totalCents`
  used as computeBalances' numerator (that reducer sums over all expenses regardless of payer, so
  AC6's "everyone's share reflects the smaller member count" and "the removed member's money
  they spent still counts toward the total" are both already satisfied with no change needed
  there) — only the *payer-object-for-rendering* resolution needs the ghost.

**Where this does *not* apply, and why:** `get_trip_summary` (used by `getTripSummary`, the
public/summary tier) has no equivalent bug — it returns member-level aggregates only, never a
per-expense payer object, and its own `paid` CTE already `left join`s from *current*
`trip_members` (so a removed member's spend is simply not attributed to anyone in that endpoint,
same as it isn't in `getTripView`'s per-member `paidCents` — expected, not a bug, since there is
no current member to credit it to). `getMyTrips`'s `settlementExpenses` mapping has the identical
`?? e.paid_by` fallback, but `getMyTrips` never surfaces individual expense/payer objects to the
UI (aggregate `yourBalance` only), so the same fallback is harmless there — it can't crash a
render that never happens.

**Member-count invariant, verified:** because the organizer can never remove or leave themself
(enforced at the RPC level, both functions), `trip_members` can never reach zero members via this
feature. `computeBalances`' `Math.floor(totalCents / sorted.length)` and `get_trip_summary`'s
`total_cents / member_count` both divide by the current member count — a long-standing implicit
"n ≥ 1" assumption that this feature could have broken if organizer self-removal were allowed. It
isn't, so this divide-by-zero risk doesn't materialize; noted here because it's exactly the kind
of interaction a "just delete a row" feature could silently introduce.

## Impact analysis — consumers of what's changing

Nothing existing is being modified or removed — this is purely additive (2 new mutation RPCs, 1
new read RPC, 3 new `trips.ts` functions, new UI affordances on an existing page, one required
bugfix in `getTripView` to a code path that was previously unreachable). Consumer-by-consumer:

- **`trip_members` table / its `select` RLS policy** — unchanged. Every existing reader
  (`getTripView`, `getMyTrips`, `get_trip_summary`, `get_trip_by_invite_code`) already treats "no
  row for this trip_id/user_id" as "not a member," which is exactly what a hard-delete produces —
  no new failure mode for any of them, other than the ghost-payer bug above (which is in
  `getTripView` specifically, fixed as part of this feature).
- **`expenses` table** — no rows touched, no policy changes. `paid_by`'s FK to `auth.users(id)`
  (not `trip_members`) is exactly why removal has zero cascade/delete impact on expense history
  (AC5/AC13/AC16).
- **`remove_placeholder_member` / `add_placeholder_member` / `rename_placeholder_member`** —
  untouched, and structurally can't collide with the new RPCs: `remove_trip_member` explicitly
  excludes placeholders (`not m.is_placeholder`), so a placeholder can only ever be removed
  through its own existing RPC, same as before.
- **`is_trip_member`, `is_trip_open`, `is_verified_trip_member`, `is_owner_or_verified_member`**
  — reused as-is (via `is_trip_open` directly, and via the same standalone anonymity guard
  pattern the placeholder RPCs use — see "Existing precedent" above); none are modified.
- **`auth.users` / the removed member's own session** — untouched by design: neither RPC
  touches `auth.users`, calls any admin/auth API, or revokes a session. Per requirements, this
  is deliberately *not* an access-revocation feature — the removed member's session, their access
  to every other trip, and their ability to reuse the same invite link to rejoin this one, are
  all unaffected. Confirmed by inspection: both new functions only ever `delete from
  public.trip_members`.

## Backward compatibility / deploy sequencing

Standard additive-migration-then-deploy case, not a special one: the migration must land before
the frontend deploy that calls the new RPCs (normal Supabase/Vercel sequencing — a
not-yet-deployed frontend simply never calls functions that don't exist yet in the interim
window; nothing currently deployed calls `remove_trip_member`/`leave_trip`/
`was_removed_from_trip`, so there's no window where old code breaks against the new schema, or
new code runs against the old one, unlike a column rename/removal would create). No API contract
is versioned or changed — this is a `feature` classification per requirements.md's own semver
call, confirmed.

## Semver

Confirmed: **feature** (additive). No existing route, RPC signature, or table consumer changes;
the one required change to existing code (`getTripView`'s ghost-payer handling) is a bugfix to a
path that was previously dead code (unreachable before this feature existed), not a behavior
change for any currently-possible trip state.
