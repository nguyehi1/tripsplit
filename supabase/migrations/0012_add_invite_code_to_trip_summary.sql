-- Pre-push review fix 1 (simplified-onboarding): a visitor who opens a bare `/trip/<uuid>` link
-- (rather than the proper `/join/[code]` invite link) sees TripSummaryOnly
-- (src/app/trip/[id]/page.tsx), whose "See full details" CTA had no invite code to route
-- through. It sent them to `/check-email` with no `invite` param, so confirming their email via
-- OTP never called `/api/join` (src/app/check-email/page.tsx's handleConfirm only does that when
-- `invite` is present) — they'd become a verified, non-anonymous Supabase user who was still
-- never inserted into trip_members, and RLS kept rejecting them, landing them right back on
-- TripSummaryOnly. A permanent loop with no way out.
--
-- Fix: extend get_trip_summary (the public, zero-auth tier already used by TripSummaryOnly) to
-- also return the trip's invite_code, so the page can build a `/check-email?invite=<code>&...`
-- link identical in shape to /join/[code]'s own, routing the visitor through the existing
-- /api/join mechanism on confirm instead of a dead end. invite_code is not new exposure: it's
-- already public/non-sensitive, and get_trip_by_invite_code (0001_init.sql) already exposes it
-- in the reverse direction (code -> trip preview) with the same anon grant.
--
-- Return type is changing (a new output column), so the function must be dropped before it's
-- recreated — Postgres won't let `create or replace function` alter a function's return type.

drop function if exists public.get_trip_summary(uuid);

create or replace function public.get_trip_summary(_trip_id uuid)
returns table (
  member_id uuid,
  display_name text,
  paid_cents bigint,
  share_cents bigint,
  invite_code text
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
      + case when rm.rn <= (select total_cents from total) % (select member_count from n) then 1 else 0 end,
    (select invite_code from public.trips where id = _trip_id)
  from ranked_members rm
  left join paid p on p.member_id = rm.id;
$$;
revoke execute on function public.get_trip_summary(uuid) from public;
grant execute on function public.get_trip_summary(uuid) to anon, authenticated;
