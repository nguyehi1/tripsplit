-- Shared shopping list with per-item claiming. See
-- docs/features/shopping-list/{requirements,architecture}.md and
-- docs/adr/0013-shopping-list-claim-release-trigger-on-member-removal.md for the full rationale.
--
-- New table (shopping_list_items), a new before-delete trigger on trip_members (the app's first
-- trigger — ADR 0013), and three new security-definer RPCs (claim/unclaim/log). No existing
-- table/column/RLS policy is altered — see architecture.md section 5's impact analysis.

-- shopping_list_items ---------------------------------------------------------

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  description text not null check (char_length(btrim(description)) > 0),
  added_by uuid references public.trip_members(id),
  claimed_by uuid references public.trip_members(id),
  status text not null default 'open' check (status in ('open', 'claimed', 'logged')),
  -- No `on delete` action (blocks, doesn't cascade/null) — deliberate: leaves the data model able
  -- to revert a logged item back to claimed-unlogged later (expense-delete, not yet built)
  -- without a schema change, rather than letting a future expense delete silently corrupt this
  -- table's shape guarantee via a passive cascade. See architecture.md section 1.
  expense_id uuid references public.expenses(id),
  created_at timestamptz not null default now(),
  constraint shopping_list_items_shape_check check (
    (status = 'open' and claimed_by is null and expense_id is null)
    or (status = 'claimed' and claimed_by is not null and expense_id is null)
    or (status = 'logged' and expense_id is not null)
  )
);

create index on public.shopping_list_items (trip_id, status);
create index on public.shopping_list_items (claimed_by) where claimed_by is not null;
create index on public.shopping_list_items (added_by) where added_by is not null;
create index on public.shopping_list_items (expense_id) where expense_id is not null;

-- ADR 0013: a before-delete trigger on trip_members that releases a departing member's active
-- claim back to `open` (and clears added_by/claimed_by referencing them) before the row is
-- actually deleted — otherwise remove_trip_member/leave_trip (migration 0014, already shipped)
-- would start failing with a shape-check violation the moment a removed member held a claim.
create or replace function public.release_shopping_list_claims_on_member_removal()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.shopping_list_items
  set claimed_by = null,
      status = case when status = 'claimed' then 'open' else status end
  where claimed_by = old.id;

  update public.shopping_list_items
  set added_by = null
  where added_by = old.id;

  return old;
end;
$$;

create trigger release_shopping_list_claims_before_member_delete
  before delete on public.trip_members
  for each row
  execute function public.release_shopping_list_claims_on_member_removal();

-- RLS ---------------------------------------------------------------------------

alter table public.shopping_list_items enable row level security;

create policy "owner or verified member can read shopping list" on public.shopping_list_items
  for select using (is_owner_or_verified_member(trip_id));

-- Add an item: any verified member, open trip, and added_by must resolve to the caller's own
-- (necessarily non-placeholder) trip_members row — same shape as expenses' insert policy pinning
-- paid_by to a real trip member.
create policy "verified member can add shopping list items" on public.shopping_list_items
  for insert
  with check (
    is_verified_trip_member(trip_id)
    and is_trip_open(trip_id)
    and status = 'open'
    and claimed_by is null
    and expense_id is null
    and exists (
      select 1 from public.trip_members tm
      where tm.id = shopping_list_items.added_by
        and tm.trip_id = shopping_list_items.trip_id
        and tm.user_id = auth.uid()
    )
  );

-- Pre-claim delete: adder-only, open items only.
create policy "adder can delete their own unclaimed item" on public.shopping_list_items
  for delete
  using (
    is_verified_trip_member(trip_id)
    and is_trip_open(trip_id)
    and status = 'open'
    and exists (
      select 1 from public.trip_members tm
      where tm.id = shopping_list_items.added_by and tm.user_id = auth.uid()
    )
  );

-- Deliberately NO update policy/grant — every status transition (claim/unclaim/log) goes through
-- a security-definer RPC below, the same "no direct write grant, RPC is the only door" shape as
-- trip_members itself. RLS's using/with check split can't correlate old-vs-new status across a
-- single UPDATE policy, and splitting claim/unclaim/log into separate policies would reopen the
-- claim race this feature exists to close — see architecture.md section 1b.
revoke update on public.shopping_list_items from authenticated;

-- RPCs: claim / unclaim -----------------------------------------------------------

-- Claim race guarantee: the `update ... where status = 'open'` below is a single statement that
-- acquires a row lock on the target item. Two concurrent callers serialize on that lock; the
-- loser's own `where status = 'open'` re-evaluates against the now-`'claimed'` row, matches zero
-- rows, and `if not found` raises — never a silent no-op or a double-claim.
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
  set status = 'claimed', claimed_by = _member_id
  where i.id = _item_id
    and i.status = 'open'
    and public.is_trip_open(_trip_id);

  if not found then
    raise exception 'item was already claimed, deleted, or the trip is locked';
  end if;
end;
$$;
revoke execute on function public.claim_shopping_list_item(uuid) from public;
grant execute on function public.claim_shopping_list_item(uuid) to authenticated;

-- Claimer-only (requirements.md decision 2, superseded — see the product decision note in
-- docs/features/shopping-list/design.md and requirements.md): only the trip_members row that
-- currently holds the claim may release it. `_member_id` is derived server-side from
-- `auth.uid()`, exactly like `claim_shopping_list_item` — never trusting a client-supplied member
-- id — so a caller can't pass someone else's member id to work around this. The `and i.claimed_by
-- = _member_id` predicate is folded into the same conditional-update-as-compare-and-swap the
-- claim RPC already uses (see that function's own comment on the race guarantee), so "claimed by
-- someone else" and "already unclaimed/logged/trip locked" both fail the same clean way, via the
-- same `if not found` branch below.
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
  set status = 'open', claimed_by = null
  where i.id = _item_id
    and i.status = 'claimed'
    and i.claimed_by = _member_id
    and public.is_trip_open(_trip_id);

  if not found then
    raise exception 'item was not claimed by you, already logged, or the trip is locked';
  end if;
end;
$$;
revoke execute on function public.unclaim_shopping_list_item(uuid) from public;
grant execute on function public.unclaim_shopping_list_item(uuid) to authenticated;

-- RPC: atomic expense-creation-plus-item-logging -----------------------------------
-- Additive, second RPC — the existing addExpense/`expenses` insert RLS path (used when no items
-- are selected) is left completely untouched, so "skip the list" keeps working byte-for-byte
-- unchanged. Runs the expense insert and the items update in one function body/transaction: an
-- unhandled exception (the mismatch-count guard) rolls back both, so there's no window where the
-- expense exists but its items didn't get linked, or vice versa.
create or replace function public.add_expense_and_log_shopping_items(
  _trip_id uuid,
  _amount numeric,
  _description text,
  _date date,
  _item_ids uuid[]
)
returns public.expenses
language plpgsql security definer set search_path = public as $$
declare
  _member_id uuid;
  _expense public.expenses;
  _updated_count int;
begin
  if not public.is_verified_trip_member(_trip_id) then
    raise exception 'you must be a verified member to add an expense';
  end if;
  if not public.is_trip_open(_trip_id) then
    raise exception 'this trip is locked';
  end if;

  select tm.id into _member_id from public.trip_members tm
    where tm.trip_id = _trip_id and tm.user_id = auth.uid();
  if _member_id is null then
    raise exception 'you are not a member of this trip';
  end if;

  insert into public.expenses (trip_id, paid_by, amount, description, date)
  values (_trip_id, auth.uid(), _amount, _description, coalesce(_date, current_date))
  returning * into _expense;

  if _item_ids is not null and array_length(_item_ids, 1) > 0 then
    update public.shopping_list_items i
    set status = 'logged', expense_id = _expense.id
    where i.id = any(_item_ids)
      and i.trip_id = _trip_id
      and i.status = 'claimed'
      and i.claimed_by = _member_id;

    get diagnostics _updated_count = row_count;
    if _updated_count <> array_length(_item_ids, 1) then
      raise exception 'one or more selected items are no longer claimed by you — refresh and try again';
    end if;
  end if;

  return _expense;
end;
$$;
revoke execute on function public.add_expense_and_log_shopping_items(uuid, numeric, text, date, uuid[]) from public;
grant execute on function public.add_expense_and_log_shopping_items(uuid, numeric, text, date, uuid[]) to authenticated;
