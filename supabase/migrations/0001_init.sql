-- Splitiful v1 schema: trips, membership, expenses, feedback.
-- See ~/.claude/plans/gentle-tumbling-floyd.md for the locked product/auth decisions this
-- schema implements. `location`/`starts_on`/`ends_on`/`completed_at` on `trips` and the whole
-- `feedback` table are additions beyond that plan, added to match the mobile screens already
-- built (trip creation collects dates/location; the trip can be locked; there's a feedback form).

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  starts_on date,
  ends_on date,
  created_by uuid not null references auth.users(id) on delete cascade,
  invite_code text not null unique default substr(md5(random()::text), 1, 8),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  joined_at timestamptz not null default now(),
  unique (trip_id, user_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  paid_by uuid not null references auth.users(id),
  amount numeric(10, 2) not null check (amount > 0),
  description text not null,
  receipt_photo_url text,
  created_at timestamptz not null default now()
);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete set null,
  rating text check (rating in ('yes', 'fine', 'not_really')),
  comment text,
  created_at timestamptz not null default now()
);

create index on public.trip_members (trip_id);
create index on public.expenses (trip_id);
create index on public.trips (invite_code);
create index on public.feedback (user_id);

alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.expenses enable row level security;
alter table public.feedback enable row level security;

-- Avoids infinite recursion (a trip_members policy that queries trip_members).
create or replace function public.is_trip_member(_trip_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = _trip_id and user_id = auth.uid()
  );
$$;
revoke execute on function public.is_trip_member(uuid) from public;
grant execute on function public.is_trip_member(uuid) to authenticated;

-- trips --------------------------------------------------------------------

create policy "members can read their trips" on public.trips
  for select using (is_trip_member(id) or created_by = auth.uid());
create policy "authenticated users can create trips" on public.trips
  for insert with check (created_by = auth.uid());

-- trip_members ---------------------------------------------------------------
-- No direct INSERT policy: joining only happens through the join_trip RPC so a client can't
-- fabricate membership in a trip whose UUID they merely guessed.

revoke insert on public.trip_members from authenticated;
create policy "members can read trip roster" on public.trip_members
  for select using (is_trip_member(trip_id));

-- expenses -------------------------------------------------------------------
-- Any trip member may read/insert/update/delete any expense on their trip (locked decision:
-- convenient for a small trusted group). paid_by must itself be a trip member.

create policy "members can read expenses" on public.expenses
  for select using (is_trip_member(trip_id));
create policy "members can add expenses" on public.expenses
  for insert with check (
    is_trip_member(trip_id)
    and exists (
      select 1 from public.trip_members
      where trip_id = expenses.trip_id and user_id = expenses.paid_by
    )
  );
create policy "members can edit expenses" on public.expenses
  for update using (is_trip_member(trip_id)) with check (is_trip_member(trip_id));
create policy "members can delete expenses" on public.expenses
  for delete using (is_trip_member(trip_id));

-- feedback ---------------------------------------------------------------------

create policy "users can send feedback" on public.feedback
  for insert with check (user_id = auth.uid());
create policy "users can read their own feedback" on public.feedback
  for select using (user_id = auth.uid());

-- RPCs -----------------------------------------------------------------------

-- Called by an unauthenticated visitor on /join/[code] to render the invite before they sign in.
create or replace function public.get_trip_by_invite_code(_code text)
returns table (
  trip_id uuid,
  name text,
  location text,
  starts_on date,
  ends_on date,
  is_completed boolean,
  organizer_name text
)
language sql security definer set search_path = public as $$
  select
    t.id, t.name, t.location, t.starts_on, t.ends_on, t.completed_at is not null,
    m.display_name
  from public.trips t
  left join public.trip_members m on m.trip_id = t.id and m.user_id = t.created_by
  where t.invite_code = _code;
$$;
revoke execute on function public.get_trip_by_invite_code(text) from public;
grant execute on function public.get_trip_by_invite_code(text) to anon, authenticated;

-- Creates a trip and adds its creator as the first (organizer) member, atomically.
create or replace function public.create_trip(
  _name text,
  _display_name text,
  _location text default null,
  _starts_on date default null,
  _ends_on date default null
)
returns table (trip_id uuid, invite_code text)
language plpgsql security definer set search_path = public as $$
declare _trip_id uuid;
declare _invite_code text;
begin
  insert into public.trips (name, location, starts_on, ends_on, created_by)
  values (_name, _location, _starts_on, _ends_on, auth.uid())
  returning id, public.trips.invite_code into _trip_id, _invite_code;

  insert into public.trip_members (trip_id, user_id, display_name)
  values (_trip_id, auth.uid(), _display_name);

  return query select _trip_id, _invite_code;
end;
$$;
revoke execute on function public.create_trip(text, text, text, date, date) from public;
grant execute on function public.create_trip(text, text, text, date, date) to authenticated;

-- The only way a trip_members row is created for anyone other than the trip's creator.
-- Idempotent (on conflict ... do update) so revisiting an old invite link is safe.
create or replace function public.join_trip(_invite_code text, _display_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare _trip_id uuid;
begin
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

-- Locks a trip so its expense list stops changing. Only the trip's creator (organizer) may call
-- it; a no-op if the trip is already completed.
create or replace function public.complete_trip(_trip_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.trips
  set completed_at = now()
  where id = _trip_id and created_by = auth.uid() and completed_at is null;
end;
$$;
revoke execute on function public.complete_trip(uuid) from public;
grant execute on function public.complete_trip(uuid) to authenticated;

-- Storage ----------------------------------------------------------------------
-- Private bucket for receipt photos; access goes through RLS, not public URLs.
-- Path convention: {trip_id}/{expense_id}.jpg

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "members can read trip receipts" on storage.objects
  for select using (
    bucket_id = 'receipts' and is_trip_member((storage.foldername(name))[1]::uuid)
  );
create policy "members can upload trip receipts" on storage.objects
  for insert with check (
    bucket_id = 'receipts' and is_trip_member((storage.foldername(name))[1]::uuid)
  );
