-- Decision 13 (simplified-onboarding, requirements.md): `complete_trip` (Settle up) had no
-- anonymity guard at all — unlike `join_trip` and the placeholder-member RPCs, which migration
-- 0010 already gated, `complete_trip` (0001_init.sql) let an anonymous, never-verified organizer
-- mark their own trip complete with nothing stopping them, client- or server-side (the client
-- side gap is closed separately, by including "Settle up" in the trip page's hide-until-verified
-- button set — see src/app/trip/[id]/verify-inline.tsx). This closes the server-side half: the
-- exact same class of gap 0010's header comment already explains for `join_trip` — an anonymous
-- Supabase session carries the `authenticated` role (the entire premise this feature's RLS model
-- relies on), so nothing but an explicit guard stops a bare `signInAnonymously()` + RPC call from
-- completing someone's trip.
--
-- Same predicate as migration 0010: `coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) =
-- false`. Signature, return type, `security definer`, the existing `created_by = auth.uid() and
-- completed_at is null` predicate, and grants are otherwise unchanged.

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
