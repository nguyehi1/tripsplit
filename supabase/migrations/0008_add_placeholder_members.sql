-- Placeholder members: name-only trip_members rows with no Supabase auth account, so the
-- equal split can account for someone who will never sign up (e.g. a kid, someone without a
-- smartphone). See docs/features/add-placeholder-members/{requirements,architecture}.md and
-- docs/adr/0004-placeholder-member-nullable-user-id-and-identity-key.md for the full rationale.
--
-- No phased add-nullable/backfill/not-null dance needed here (contrast with
-- 0007_add_expense_date.sql / ADR 0003) — loosening `user_id` to nullable is trivially safe for
-- every existing row, and `is_placeholder`'s default (false) is already correct for every
-- existing row with no backfill required.

alter table public.trip_members alter column user_id drop not null;

alter table public.trip_members add column is_placeholder boolean not null default false;

alter table public.trip_members add constraint trip_members_placeholder_user_id_check
  check (
    (is_placeholder and user_id is null)
    or (not is_placeholder and user_id is not null)
  );

-- Note: `unique (trip_id, user_id)` needs no change — Postgres treats every NULL as distinct
-- from every other NULL, so an arbitrary number of (trip_id, null) placeholder rows can coexist.

-- Add / rename / remove a placeholder, all organizer-only, all gated on the trip still being
-- open (mirrors 0005_lock_expenses_when_trip_completed.sql's expense lock — removing a
-- placeholder retroactively changes a completed trip's live-computed split, so it's blocked
-- once the trip is locked, same as editing an expense is).

create or replace function public.add_placeholder_member(_trip_id uuid, _display_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare _member_id uuid;
declare _placeholder_count int;
begin
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
