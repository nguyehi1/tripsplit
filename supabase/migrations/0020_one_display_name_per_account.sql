-- One display name per account. Until now `trip_members.display_name` was typed fresh on every
-- trip, so the same verified email could appear as "Alex" on one trip and "Alexander" on
-- another. This migration makes the account's name sticky:
--
--   * `canonical_display_name(user)`   — the account's most recent real name (internal helper).
--   * `get_my_display_name()`          — lets the client ask "do I already have a name?" right
--                                        after sign-in, so it only prompts when the answer is no.
--   * `set_my_display_name(name)`      — sets/renames the name on every trip the caller is on
--                                        (verified accounts only).
--   * BEFORE INSERT trigger            — whichever RPC adds a member row (create_trip, join_trip,
--                                        join_trip_by_id), an account that already has a name keeps
--                                        it, and a blank name (organizer creating a trip before
--                                        signing in — we no longer ask for one up front) becomes the
--                                        'Organizer' placeholder until they pick a name.
--
-- 'Organizer' is the "name not chosen yet" sentinel: canonical_display_name ignores it, so it is
-- never treated as the account's real name.

create or replace function public.canonical_display_name(_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select display_name
  from public.trip_members
  where user_id = _user_id
    and not is_placeholder
    and display_name <> 'Organizer'
  order by joined_at desc
  limit 1;
$$;
revoke all on function public.canonical_display_name(uuid) from public, anon, authenticated;

create or replace function public.get_my_display_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.canonical_display_name(auth.uid());
$$;
revoke all on function public.get_my_display_name() from public, anon;
grant execute on function public.get_my_display_name() to authenticated;

create or replace function public.set_my_display_name(_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _clean text := btrim(coalesce(_name, ''));
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'sign in with your email first';
  end if;
  if char_length(_clean) < 1 or char_length(_clean) > 50 then
    raise exception 'name must be 1-50 characters';
  end if;

  update public.trip_members
  set display_name = _clean
  where user_id = auth.uid() and not is_placeholder;
end;
$$;
revoke all on function public.set_my_display_name(text) from public, anon;
grant execute on function public.set_my_display_name(text) to authenticated;

create or replace function public.trip_members_apply_canonical_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _existing text;
begin
  if new.user_id is null or new.is_placeholder then
    return new;
  end if;

  _existing := public.canonical_display_name(new.user_id);
  if _existing is not null then
    new.display_name := _existing;
  elsif btrim(coalesce(new.display_name, '')) = '' then
    new.display_name := 'Organizer';
  end if;
  return new;
end;
$$;
revoke all on function public.trip_members_apply_canonical_name() from public, anon, authenticated;

drop trigger if exists trip_members_apply_canonical_name on public.trip_members;
create trigger trip_members_apply_canonical_name
  before insert on public.trip_members
  for each row execute function public.trip_members_apply_canonical_name();
