-- docs/ROADMAP.md's invite-code-rpc-hardening entry, "should-fix" item: get_trip_summary
-- (migration 0012) returns the trip's invite_code keyed only on trip UUID, to anon and
-- authenticated alike. That collapses the separation the app's design otherwise keeps between
-- the trip UUID (public, view-only — get_trip_summary/get_trip_view already treat it as
-- low-sensitivity) and the invite_code (the actual join credential, distributed only via the
-- invite link and, as of migration 0013, throttled against guessing). A UUID that leaks through
-- some channel the invite code never went through (referrer header, browser history, an
-- accidentally-forwarded /trip/<uuid> link, etc.) would, via this RPC, also hand over the join
-- credential — a strictly larger blast radius than the UUID leaking alone was meant to have.
--
-- Fix (option B from the roadmap's decision, chosen over stripping the two CTAs that depend on
-- this down to a dead end): stop returning invite_code from get_trip_summary at all, and add a
-- new join_trip_by_id RPC — same guards as join_trip (migration 0010's anonymity check,
-- migration 0013's throttle), but keyed by the trip's UUID instead of its invite code. Both
-- client call sites that used summary.inviteCode only ever had the trip UUID in scope anyway
-- (src/app/trip/[id]/page.tsx's TripSummaryOnly and RemovedFromTripScreen both already receive
-- `id`), so this preserves their exact current behavior (a bare-UUID visitor can still
-- confirm-and-join; a removed member can still rejoin) without the literal invite_code string
-- ever reaching the client again.
--
-- This does NOT change who can end up joining a trip: today, a UUID holder can already reach
-- join_trip in two hops (get_trip_summary(uuid) -> invite_code -> join_trip(invite_code)).
-- join_trip_by_id collapses that to one hop with the same end state. What it removes is the
-- invite_code value itself ever being serialized to a client that only had the UUID — the two
-- secrets stay independently scoped again, even though both happen to grant the same join
-- capability by product design.
--
-- Return type is changing (invite_code column removed), so get_trip_summary must be dropped
-- before it's recreated, same as migration 0012's own note.

drop function if exists public.get_trip_summary(uuid);

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

-- join_trip_by_id ------------------------------------------------------------------
-- Mirrors join_trip (migration 0013's version): same throttle, same anonymity guard, same
-- on-conflict membership upsert. The only difference is the lookup — join_trip resolves
-- `_invite_code` to a trip id via `public.trips.invite_code`; this RPC is handed the trip id
-- directly (it's the id the client already has from the page it's calling from) and only checks
-- the trip still exists, instead of looking anything up by a secret value.
--
-- Throttle bucket is namespaced separately from join_trip's ('join-trip-by-id:' vs
-- 'join-trip:') so the two paths don't share a budget — a caller legitimately retrying one path
-- shouldn't burn through the other's allowance.

create or replace function public.join_trip_by_id(_trip_id uuid, _display_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
begin
  perform public.throttle_rpc('join-trip-by-id:' || auth.uid()::text, 10, 60);

  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'confirm your email before joining a trip';
  end if;

  if not exists (select 1 from public.trips where id = _trip_id) then
    raise exception 'trip not found';
  end if;

  insert into public.trip_members (trip_id, user_id, display_name)
  values (_trip_id, auth.uid(), _display_name)
  on conflict (trip_id, user_id) do update set display_name = excluded.display_name;

  return _trip_id;
end;
$$;
revoke execute on function public.join_trip_by_id(uuid, text) from public;
grant execute on function public.join_trip_by_id(uuid, text) to authenticated;
