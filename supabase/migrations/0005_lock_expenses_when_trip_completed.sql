-- Once a trip is completed (locked via complete_trip), its expense list must stop changing —
-- otherwise the settlement a completed trip reports could drift from what members actually see.
-- There's no "reopen" RPC, so this lock is permanent for a trip once set.

create or replace function public.is_trip_open(_trip_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.trips
    where id = _trip_id and completed_at is null
  );
$$;
revoke execute on function public.is_trip_open(uuid) from public, anon;
grant execute on function public.is_trip_open(uuid) to authenticated;

drop policy "members can add expenses" on public.expenses;
create policy "members can add expenses" on public.expenses
  for insert with check (
    is_trip_member(trip_id)
    and is_trip_open(trip_id)
    and exists (
      select 1 from public.trip_members
      where trip_id = expenses.trip_id and user_id = expenses.paid_by
    )
  );

drop policy "members can edit expenses" on public.expenses;
create policy "members can edit expenses" on public.expenses
  for update using (is_trip_member(trip_id) and is_trip_open(trip_id))
  with check (is_trip_member(trip_id) and is_trip_open(trip_id));

drop policy "members can delete expenses" on public.expenses;
create policy "members can delete expenses" on public.expenses
  for delete using (is_trip_member(trip_id) and is_trip_open(trip_id));
