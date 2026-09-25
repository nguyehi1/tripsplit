-- Remove member from roster + self-service leave trip. See
-- docs/features/remove-member-access/{requirements,architecture}.md and
-- docs/adr/0012-post-removal-detection-and-ghost-payer-rendering.md for the full rationale.
--
-- No data-model changes (no new tables/columns) — three new `security definer` functions only,
-- mirroring `remove_placeholder_member`'s existing hard-delete shape
-- (0008_add_placeholder_members.sql, guard order from 0010_gate_join_and_placeholder_mutations.sql).

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

-- Read-only: true iff the caller previously participated in this trip (has a paid_by expense)
-- but is no longer a trip_members row on it — the "was I removed/did I leave" signal reconstructed
-- from data that already exists for the ledger's own sake, per ADR 0012 (no new stored fact, no
-- audit table).
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
