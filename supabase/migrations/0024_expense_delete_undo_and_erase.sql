-- Expense delete with Undo, then a server-side hard erase. See
-- docs/features/expense-delete-and-polish/{requirements,architecture}.md and
-- docs/adr/0017-expense-delete-soft-mark-then-erase.md.
--
-- Shape: delete marks expenses.deleted_at (database clock) inside a SECURITY DEFINER function and
-- reverts linked shopping-list items; the read policy hides marked rows; Undo clears the mark
-- inside 15 s; rows are hard-erased from 30 s by erase_expired_expenses (pg_cron each minute plus
-- a bounded opportunistic batch inside delete/Undo). Clients can neither delete expenses nor write
-- the mark.
--
-- Deliberately NO explicit begin/commit: this file is one multi-statement script applied in one
-- call (one implicit transaction in the SQL editor, one transaction per file in the Supabase CLI).
-- The policy statements are adjacent so there is no gap with a missing update policy or an open
-- delete policy. Everything is idempotent (safe to re-run). The cron block is last and cannot fail
-- the migration.

-- 1. Columns and indexes (additive, nullable, no rewrite) --------------------------------------

alter table public.expenses add column if not exists deleted_at timestamptz null;

alter table public.shopping_list_items
  add column if not exists unlinked_from_expense_id uuid null references public.expenses(id) on delete set null;

create index if not exists expenses_deleted_at_idx
  on public.expenses (deleted_at) where deleted_at is not null;
create index if not exists shopping_list_items_unlinked_expense_idx
  on public.shopping_list_items (unlinked_from_expense_id) where unlinked_from_expense_id is not null;

-- 2. Policies and privileges on expenses --------------------------------------------------------
-- Permissive policies are OR-ed, so a surviving old policy would silently defeat this change. Drop
-- by exact live name (migration 0009's four), the older names (already dropped by 0009, dropped
-- again defensively) and the five names created below (so a re-run works), then create the final
-- set: exactly one select, one insert, one update, zero delete.

drop policy if exists "owner or verified member can read expense detail" on public.expenses;
drop policy if exists "verified member can add expenses" on public.expenses;
drop policy if exists "verified payer can edit their own expenses" on public.expenses;
drop policy if exists "verified member can delete expenses" on public.expenses;
drop policy if exists "members can read expenses" on public.expenses;
drop policy if exists "members can add expenses" on public.expenses;
drop policy if exists "members can edit expenses" on public.expenses;
drop policy if exists "payer can edit their own expenses" on public.expenses;
drop policy if exists "members can delete expenses" on public.expenses;
drop policy if exists "owner or verified member can read live expense detail" on public.expenses;
drop policy if exists "verified member can add own expenses" on public.expenses;
drop policy if exists "verified payer can edit their own live expenses" on public.expenses;

create policy "owner or verified member can read live expense detail" on public.expenses
  for select using (is_owner_or_verified_member(trip_id) and deleted_at is null);

create policy "verified member can add own expenses" on public.expenses
  for insert with check (
    is_verified_trip_member(trip_id)
    and is_trip_open(trip_id)
    and paid_by = auth.uid()
    and deleted_at is null
    and exists (select 1 from public.trip_members where trip_id = expenses.trip_id and user_id = expenses.paid_by)
  );

create policy "verified payer can edit their own live expenses" on public.expenses
  for update
  using (paid_by = auth.uid() and is_verified_trip_member(trip_id) and is_trip_open(trip_id) and deleted_at is null)
  with check (paid_by = auth.uid() and is_verified_trip_member(trip_id) and is_trip_open(trip_id) and deleted_at is null);

-- No delete policy, and no DELETE privilege for the client roles (trip cascade and the 0018 purge
-- do not run as these roles). Table-level UPDATE is replaced by a column grant so deleted_at,
-- paid_by and trip_id cannot be written by direct API; a new expenses column is not
-- client-updatable unless its migration grants it.
revoke delete on public.expenses from anon, authenticated;
revoke update on public.expenses from anon, authenticated;
grant update (amount, description, date) on public.expenses to authenticated;

-- 3. Number helpers (one place for the ordered numbers: erase after > undo accept > 10 s toast) -

create or replace function public.expense_undo_accept_interval()
returns interval
language sql immutable set search_path = public, pg_temp as $$
  select interval '15 seconds';
$$;
revoke execute on function public.expense_undo_accept_interval() from public, anon, authenticated;

create or replace function public.expense_erase_after_interval()
returns interval
language sql immutable set search_path = public, pg_temp as $$
  select interval '30 seconds';
$$;
revoke execute on function public.expense_erase_after_interval() from public, anon, authenticated;

-- 4. Erase (not executable by any client role) -------------------------------------------------
-- One batch: pick expired marked rows with the predicate inside the locking statement, revert any
-- list item still pointing at them so the FK can never block, then delete with the age asserted
-- again. No parameters. No trip-open reference: locked trips are erased too. Cannot touch a live
-- row. Variables are _v_-prefixed because deleted_at/expense_id/status are column names.

create or replace function public.erase_expired_expenses_batch()
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _v_ids uuid[];
  _v_count integer := 0;
begin
  select coalesce(array_agg(x.id), '{}'::uuid[]) into _v_ids
  from (
    select e.id
    from public.expenses e
    where e.deleted_at is not null
      and e.deleted_at < clock_timestamp() - public.expense_erase_after_interval()
    order by e.deleted_at
    limit 50
    for update skip locked
  ) x;

  if coalesce(array_length(_v_ids, 1), 0) = 0 then
    return 0;
  end if;

  update public.shopping_list_items i
  set expense_id = null,
      unlinked_from_expense_id = null,
      status = case when i.claimed_by is null then 'open' else 'claimed' end
  where i.expense_id = any(_v_ids);

  delete from public.expenses e
  where e.id = any(_v_ids)
    and e.deleted_at is not null
    and e.deleted_at < clock_timestamp() - public.expense_erase_after_interval();

  get diagnostics _v_count = row_count;
  return _v_count;
end;
$$;
revoke execute on function public.erase_expired_expenses_batch() from public, anon, authenticated;

-- Loops the batch, at most 10 times (500 rows per run); stops early on a short batch.
create or replace function public.erase_expired_expenses()
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _v_total integer := 0;
  _v_n integer;
  _v_round integer;
begin
  for _v_round in 1..10 loop
    _v_n := public.erase_expired_expenses_batch();
    _v_total := _v_total + _v_n;
    exit when _v_n < 50;
  end loop;
  return _v_total;
end;
$$;
revoke execute on function public.erase_expired_expenses() from public, anon, authenticated;

-- 5. delete_expense / undo_delete_expense --------------------------------------------------------
-- Fixed SQLSTATEs and messages, no row content: EX001 'expense_not_available' for EVERY delete
-- failure, EX002 'expense_undo_unavailable' for EVERY Undo failure, so nothing distinguishes the
-- cause (no existence or ownership oracle). Cheap checks first, throttle only once the caller is
-- proven entitled (a call that later raises rolls back its own increment), lock order: trips
-- (share), expenses, items.

create or replace function public.delete_expense(_expense_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _v_uid uuid;
  _v_trip_id uuid;
  _v_paid_by uuid;
  _v_completed_at timestamptz;
begin
  _v_uid := auth.uid();
  if _v_uid is null then
    raise exception 'expense_not_available' using errcode = 'EX001';
  end if;

  select e.trip_id, e.paid_by into _v_trip_id, _v_paid_by
  from public.expenses e where e.id = _expense_id;
  if _v_trip_id is null or _v_paid_by <> _v_uid then
    raise exception 'expense_not_available' using errcode = 'EX001';
  end if;

  if not public.is_verified_trip_member(_v_trip_id) then
    raise exception 'expense_not_available' using errcode = 'EX001';
  end if;

  perform public.throttle_rpc('expense-change:' || _v_uid::text || ':' || _v_trip_id::text, 20, 60);

  -- complete_trip updates this row, so delete/Undo and lock serialize here.
  select t.completed_at into _v_completed_at
  from public.trips t where t.id = _v_trip_id for share;
  if not found or _v_completed_at is not null then
    raise exception 'expense_not_available' using errcode = 'EX001';
  end if;

  -- Re-check after the lock: a member removed in the gap, or a row deleted meanwhile, fails here.
  if not public.is_verified_trip_member(_v_trip_id) then
    raise exception 'expense_not_available' using errcode = 'EX001';
  end if;
  perform 1 from public.expenses e
  where e.id = _expense_id and e.paid_by = _v_uid and e.deleted_at is null
  for update;
  if not found then
    raise exception 'expense_not_available' using errcode = 'EX001';
  end if;

  update public.expenses e set deleted_at = clock_timestamp() where e.id = _expense_id;

  -- Revert linked items to the caller's bag (or open if the claimer is gone), remembering the link.
  update public.shopping_list_items i
  set unlinked_from_expense_id = _expense_id,
      expense_id = null,
      status = case when i.claimed_by is null then 'open' else 'claimed' end
  where i.expense_id = _expense_id;

  -- Hygiene must never roll back the delete.
  begin
    perform public.erase_expired_expenses_batch();
  exception when others then
    null;
  end;
end;
$$;
revoke execute on function public.delete_expense(uuid) from public, anon;
grant execute on function public.delete_expense(uuid) to authenticated;

create or replace function public.undo_delete_expense(_expense_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _v_uid uuid;
  _v_trip_id uuid;
  _v_paid_by uuid;
  _v_completed_at timestamptz;
  _v_deleted_at timestamptz;
  _v_member_id uuid;
begin
  _v_uid := auth.uid();
  if _v_uid is null then
    raise exception 'expense_undo_unavailable' using errcode = 'EX002';
  end if;

  select e.trip_id, e.paid_by into _v_trip_id, _v_paid_by
  from public.expenses e where e.id = _expense_id;
  if _v_trip_id is null or _v_paid_by <> _v_uid then
    raise exception 'expense_undo_unavailable' using errcode = 'EX002';
  end if;

  if not public.is_verified_trip_member(_v_trip_id) then
    raise exception 'expense_undo_unavailable' using errcode = 'EX002';
  end if;

  perform public.throttle_rpc('expense-change:' || _v_uid::text || ':' || _v_trip_id::text, 20, 60);

  select t.completed_at into _v_completed_at
  from public.trips t where t.id = _v_trip_id for share;
  if not found or _v_completed_at is not null then
    raise exception 'expense_undo_unavailable' using errcode = 'EX002';
  end if;

  if not public.is_verified_trip_member(_v_trip_id) then
    raise exception 'expense_undo_unavailable' using errcode = 'EX002';
  end if;
  select e.deleted_at into _v_deleted_at
  from public.expenses e
  where e.id = _expense_id and e.paid_by = _v_uid and e.deleted_at is not null
  for update;
  if not found
     or clock_timestamp() >= _v_deleted_at + public.expense_undo_accept_interval() then
    raise exception 'expense_undo_unavailable' using errcode = 'EX002';
  end if;

  update public.expenses e set deleted_at = null where e.id = _expense_id;

  select tm.id into _v_member_id
  from public.trip_members tm
  where tm.trip_id = _v_trip_id and tm.user_id = _v_uid;

  -- Re-link only items still exactly as delete left them. Never by description.
  update public.shopping_list_items i
  set status = 'logged', expense_id = _expense_id, unlinked_from_expense_id = null
  where i.unlinked_from_expense_id = _expense_id
    and i.expense_id is null
    and i.status = 'claimed'
    and i.claimed_by = _v_member_id
    and i.trip_id = _v_trip_id;

  -- No stale marker survives.
  update public.shopping_list_items i
  set unlinked_from_expense_id = null
  where i.unlinked_from_expense_id = _expense_id;

  begin
    perform public.erase_expired_expenses_batch();
  exception when others then
    null;
  end;
end;
$$;
revoke execute on function public.undo_delete_expense(uuid) from public, anon;
grant execute on function public.undo_delete_expense(uuid) to authenticated;

-- 6. claim / unclaim: clear the Undo marker (bodies from 0015 plus one assignment) --------------
-- create or replace keeps the existing grants.

create or replace function public.claim_shopping_list_item(_item_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  _trip_id uuid;
  _member_id uuid;
begin
  select trip_id into _trip_id from public.shopping_list_items where id = _item_id;
  if _trip_id is null then
    raise exception 'item not found';
  end if;

  if not public.is_verified_trip_member(_trip_id) then
    raise exception 'you must be a verified member of this trip to claim an item';
  end if;

  select tm.id into _member_id
    from public.trip_members tm
    where tm.trip_id = _trip_id and tm.user_id = auth.uid();

  update public.shopping_list_items i
  set status = 'claimed', claimed_by = _member_id, unlinked_from_expense_id = null
  where i.id = _item_id
    and i.status = 'open'
    and public.is_trip_open(_trip_id);

  if not found then
    raise exception 'item was already claimed, deleted, or the trip is locked';
  end if;
end;
$$;

create or replace function public.unclaim_shopping_list_item(_item_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  _trip_id uuid;
  _member_id uuid;
begin
  select trip_id into _trip_id from public.shopping_list_items where id = _item_id;
  if _trip_id is null then
    raise exception 'item not found';
  end if;

  if not public.is_verified_trip_member(_trip_id) then
    raise exception 'you must be a verified member of this trip to release an item';
  end if;

  select tm.id into _member_id
    from public.trip_members tm
    where tm.trip_id = _trip_id and tm.user_id = auth.uid();

  update public.shopping_list_items i
  set status = 'open', claimed_by = null, unlinked_from_expense_id = null
  where i.id = _item_id
    and i.status = 'claimed'
    and i.claimed_by = _member_id
    and public.is_trip_open(_trip_id);

  if not found then
    raise exception 'item was not claimed by you, already logged, or the trip is locked';
  end if;
end;
$$;

-- 7. get_trip_summary: exclude marked rows (definer bypasses RLS, so it filters itself) ---------
-- create or replace ONLY, never drop: 0021 revoked anon/authenticated execute, and a drop and
-- recreate would hand them back via Supabase's default grants. Same signature and return table.
-- In `paid` the filter is in the LEFT JOIN's ON clause (in WHERE it would drop members that have
-- no live expenses).

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
    from public.expenses where trip_id = _trip_id and deleted_at is null
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
    left join public.expenses e
      on e.trip_id = tm.trip_id and e.paid_by = tm.user_id and e.deleted_at is null
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

-- 8. Schedule the erase each minute if pg_cron is available (last, cannot fail the migration) ----
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'erase-expired-expenses';
      perform cron.schedule('erase-expired-expenses', '* * * * *', 'select public.erase_expired_expenses()');
    exception when others then
      raise notice 'could not schedule erase-expired-expenses (%); erase is NOT scheduled. See docs/runbooks/account-deletion-and-export.md.', sqlerrm;
    end;
  else
    raise notice 'pg_cron not enabled; erase_expired_expenses is NOT scheduled. See docs/runbooks/account-deletion-and-export.md.';
  end if;
end;
$$;
