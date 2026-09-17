-- QA follow-up to 0009_simplified_onboarding.sql. Two gaps found in the anonymous-auth/
-- verification-tier model that migration landed:
--
-- 1. `join_trip` (0001_init.sql) had no verification check at all. A Supabase anonymous
--    session carries the `authenticated` role (the entire premise 0009's RLS model relies on),
--    so anyone could call `signInAnonymously()` and then hit `join_trip` directly with an
--    invite code and an arbitrary display name, becoming a `trip_members` row with zero email/
--    OTP verification — violating AC13/AC17 ("every write action ... requires a verified
--    session") and inflating `get_trip_summary`'s member count for free, repeatably.
--
-- 2. `add_placeholder_member` / `rename_placeholder_member` / `remove_placeholder_member`
--    (0008_add_placeholder_members.sql) were gated only on `created_by = auth.uid()`, with no
--    verification check. Per requirements.md's now-corrected AC5, placeholder-member management
--    is enumerated as a mutation exactly like adding/editing an expense or inviting others — the
--    organizer's zero-auth free zone is trip creation + full viewing only, never mutation. An
--    anonymous, never-verified organizer could otherwise add/rename/remove placeholders
--    indefinitely without ever completing OTP verification.
--
-- Both use the same predicate: `coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) =
-- false`, i.e. "the caller's session is not anonymous." This is deliberately *not*
-- `is_verified_trip_member` — that helper (0009) already presupposes *existing* membership
-- (`is_trip_member(_trip_id) or created_by = auth.uid()`), which doesn't apply to `join_trip`
-- (the caller isn't a member yet — becoming one is the whole point of the call) and is
-- redundant for the placeholder RPCs, which already separately check `created_by = auth.uid()`
-- inline. A simpler, standalone anonymity check is the right-sized fix for both.

-- join_trip -------------------------------------------------------------------
-- Signature/return type/behavior otherwise unchanged — only a verification guard is added at
-- the top of the function body.

create or replace function public.join_trip(_invite_code text, _display_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare _trip_id uuid;
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'confirm your email before joining a trip';
  end if;

  select id into _trip_id from public.trips where invite_code = _invite_code;
  if _trip_id is null then
    raise exception 'invalid invite code';
  end if;

  insert into public.trip_members (trip_id, user_id, display_name)
  values (_trip_id, auth.uid(), _display_name)
  on conflict (trip_id, user_id) do update set display_name = excluded.display_name;

  return _trip_id;
end;
$$;
revoke execute on function public.join_trip(text, text) from public;
grant execute on function public.join_trip(text, text) to authenticated;

-- placeholder-member management -------------------------------------------------
-- Same verification guard added to all three RPCs, on top of their existing
-- `created_by = auth.uid()` organizer check (unchanged) and open-trip check (unchanged).

create or replace function public.add_placeholder_member(_trip_id uuid, _display_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare _member_id uuid;
declare _placeholder_count int;
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'confirm your email before managing the guest list';
  end if;

  -- Also serializes concurrent calls for the same trip (see cap note in architecture.md).
  if not exists (
    select 1 from public.trips
    where id = _trip_id and created_by = auth.uid() and public.is_trip_open(_trip_id)
    for update
  ) then
    raise exception 'only the trip organizer can add a placeholder to an open trip';
  end if;

  select count(*) into _placeholder_count
    from public.trip_members
    where trip_id = _trip_id and is_placeholder;
  if _placeholder_count >= 20 then
    raise exception 'This trip already has 20 placeholders — the most this feature supports. Remove one first.';
  end if;

  insert into public.trip_members (trip_id, user_id, display_name, is_placeholder)
  values (_trip_id, null, _display_name, true)
  returning id into _member_id;

  return _member_id;
end;
$$;
revoke execute on function public.add_placeholder_member(uuid, text) from public;
grant execute on function public.add_placeholder_member(uuid, text) to authenticated;

create or replace function public.rename_placeholder_member(_member_id uuid, _display_name text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'confirm your email before managing the guest list';
  end if;

  update public.trip_members m
  set display_name = _display_name
  from public.trips t
  where m.id = _member_id
    and m.trip_id = t.id
    and t.created_by = auth.uid()
    and m.is_placeholder
    and public.is_trip_open(t.id);

  if not found then
    raise exception 'placeholder not found, you are not the organizer, or the trip is locked';
  end if;
end;
$$;
revoke execute on function public.rename_placeholder_member(uuid, text) from public;
grant execute on function public.rename_placeholder_member(uuid, text) to authenticated;

create or replace function public.remove_placeholder_member(_member_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'confirm your email before managing the guest list';
  end if;

  delete from public.trip_members m
  using public.trips t
  where m.id = _member_id
    and m.trip_id = t.id
    and t.created_by = auth.uid()
    and m.is_placeholder
    and public.is_trip_open(t.id);

  if not found then
    raise exception 'placeholder not found, you are not the organizer, or the trip is locked';
  end if;
end;
$$;
revoke execute on function public.remove_placeholder_member(uuid) from public;
grant execute on function public.remove_placeholder_member(uuid) to authenticated;
