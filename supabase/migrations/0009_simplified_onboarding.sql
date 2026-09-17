-- Simplified onboarding: anonymous-auth-backed trip creation/viewing, plus a three-tier
-- permission model (public summary / verified detail / verified write) for non-owners.
-- See docs/features/simplified-onboarding/{requirements,architecture}.md and
-- docs/adr/0006-anonymous-auth-and-otp-linking-for-onboarding.md for the full rationale.
--
-- No new tables/columns. Two new security-definer helper functions, one new public RPC, and
-- policy rewrites on `expenses` (select/insert/update/delete) and `trip_members` (select).
-- `trips`' own select policy is intentionally left unchanged (see architecture.md) — the
-- public/detail distinction lives on `expenses`/`trip_members`, not `trips`.

-- Tier-2/tier-3 gate: same session, no extra step between detail-read and write for a
-- non-owner, by construction (both are built from this one predicate).
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

-- Detail-read needs one more allowance than write: the owner's own anonymous session can read
-- detail pre-verification, but cannot write pre-verification. Kept as a separate function
-- (not collapsed into is_verified_trip_member) so that extra read allowance can't leak into
-- write policies.
create or replace function public.is_owner_or_verified_member(_trip_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select
    public.is_verified_trip_member(_trip_id)
    or exists (select 1 from public.trips where id = _trip_id and created_by = auth.uid());
$$;
revoke execute on function public.is_owner_or_verified_member(uuid) from public, anon;
grant execute on function public.is_owner_or_verified_member(uuid) to authenticated;

-- expenses -------------------------------------------------------------------

drop policy if exists "members can read expenses" on public.expenses;
create policy "owner or verified member can read expense detail" on public.expenses
  for select using (is_owner_or_verified_member(trip_id));

drop policy if exists "members can add expenses" on public.expenses;
create policy "verified member can add expenses" on public.expenses
  for insert with check (
    is_verified_trip_member(trip_id)
    and is_trip_open(trip_id)
    and exists (select 1 from public.trip_members where trip_id = expenses.trip_id and user_id = expenses.paid_by)
  );

drop policy if exists "payer can edit their own expenses" on public.expenses;
drop policy if exists "members can edit expenses" on public.expenses;
create policy "verified payer can edit their own expenses" on public.expenses
  for update
  using (paid_by = auth.uid() and is_verified_trip_member(trip_id) and is_trip_open(trip_id))
  with check (paid_by = auth.uid() and is_verified_trip_member(trip_id) and is_trip_open(trip_id));

drop policy if exists "members can delete expenses" on public.expenses;
create policy "verified member can delete expenses" on public.expenses
  for delete using (is_verified_trip_member(trip_id) and is_trip_open(trip_id));

-- trip_members ---------------------------------------------------------------
-- Roster identity (names, who's on the trip) is detail-tier, same predicate/rationale as
-- expenses' select above — readable by a pre-verification owner, gated behind verification
-- for anyone else.

drop policy if exists "members can read trip roster" on public.trip_members;
create policy "owner or verified member can read trip roster" on public.trip_members
  for select using (is_owner_or_verified_member(trip_id));

-- New RPC: get_trip_summary (the public, zero-auth tier) ---------------------
-- Mirrors get_trip_by_invite_code's existing pattern (security definer, explicit grant to
-- anon + authenticated) but returns aggregated per-member numbers instead of expense rows —
-- the concrete implementation of "trip summary is publicly readable with zero auth."
-- Reproduces computeBalances' exact remainder rule (src/lib/settlement.ts): base share
-- floor(total/n), first `total mod n` members by join order get one extra cent — so a public
-- summary viewer and a verified detail viewer never disagree on the trip's own math.

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
