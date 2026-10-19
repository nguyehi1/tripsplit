-- Make the trips SELECT policy cheap to evaluate across the whole table (performance review,
-- 2026-10). Behaviour is unchanged: a caller can read a trip iff they are a member of it or
-- created it.
--
-- Why: the policy was `is_trip_member(id) or created_by = auth.uid()`. Postgres cannot use an
-- index through that OR (one arm is an opaque function call), so every `select ... from trips`
-- (the /trips list sends no WHERE) ran the security-definer is_trip_member() once per row in the
-- WHOLE table, so cost grew with the total number of trips ever created, not with the caller's
-- own trips. Measured on a scratch Postgres 10.5 with 200k trips: ~4.7-8.7 s before, ~0.23 s after,
-- identical result set. An index on trips(created_by) alone does not help; the planner still
-- seq-scans because of the OR.
--
-- How: my_trip_ids() returns the caller's trip ids once, so the policy can use an uncorrelated
-- `id in (select ...)` that the planner hashes. It is security definer with the same search_path
-- and the same anon/public revoke as is_trip_member() (0001-0003), so it reads trip_members past
-- that table's RLS exactly as is_trip_member() did; an inline subquery on trip_members would run
-- under that table's RLS and risks policy recursion, which is why is_trip_member() is a definer
-- function in the first place. `(select auth.uid())` makes the uid an init-plan value, evaluated
-- once per statement rather than per row.
--
-- is_trip_member() itself is untouched: every other policy and RPC still uses it.
--
-- The trip_members(user_id) index backs my_trip_ids(); without it that lookup is a seq scan of
-- trip_members. All statements are idempotent, and the policy swap is atomic in one transaction.

begin;

create index if not exists trip_members_user_id_idx on public.trip_members (user_id);

create or replace function public.my_trip_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select trip_id from public.trip_members where user_id = auth.uid();
$$;
revoke execute on function public.my_trip_ids() from public, anon;
grant execute on function public.my_trip_ids() to authenticated;

drop policy if exists "members can read their trips" on public.trips;
create policy "members can read their trips" on public.trips
  for select using (id in (select public.my_trip_ids()) or created_by = (select auth.uid()));

commit;
