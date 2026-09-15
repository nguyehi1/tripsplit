# Architecture: add placeholder members

See `docs/features/add-placeholder-members/requirements.md` for the locked
product requirements this implements, and
[ADR 0004](../../adr/0004-placeholder-member-nullable-user-id-and-identity-key.md)
for the schema-shape and member-identity decision in detail — this doc
summarizes the resulting design and its impact.

## Existing functionality this overlaps with (checked, not duplicated)

- `trip_members` writes already go exclusively through `security definer`
  RPCs (`create_trip`, `join_trip`) — there is deliberately no direct
  `insert` RLS policy on this table (`0001_init.sql`), and there are
  currently no `update`/`delete` policies on it either (so a client's
  direct `.update()`/`.delete()` against `trip_members` is denied outright
  today — not "permissive but unused" the way `expenses.delete` is). This
  feature's three new mutations (add/rename/remove a placeholder) follow
  that same RPC pattern rather than introducing a second, direct-table-RLS
  mutation style for the same table.
- `src/lib/data/trips.ts` is the one data-access module for trips/expenses
  (per `docs/ARCHITECTURE.md`'s integration-points list) — new read/write
  logic for placeholders belongs there, not inlined in a page.
- `src/lib/settlement.ts` needs no changes (confirmed below) — a
  placeholder is an ordinary member row with zero expenses attached, so it
  falls out of the existing equal-split math for free.
- No existing "remove a member" capability exists anywhere in the app
  today (`docs/ARCHITECTURE.md`: "There is currently no way to remove a
  member from a trip"). This feature does **not** generalize that — it
  adds removal scoped exclusively to `is_placeholder = true` rows, per the
  locked non-goal ("this feature does not add any capability to remove a
  real, already-joined member").
- No payer-picker UI exists today. `src/app/trip/[id]/add-expense/page.tsx`
  and the edit-expense page never let the user choose who paid — `paidBy`
  is always the currently authenticated submitter
  (`supabase.auth.getUser()`), set once at insert and immutable thereafter
  (`0006_restrict_expense_update_to_payer.sql`). This matters for the
  payer-restriction design below and is flagged as an open question at the
  end of this doc.

## 1. Schema migration

New file `supabase/migrations/0008_add_placeholder_members.sql`, additive
to `trip_members` only:

```sql
alter table public.trip_members alter column user_id drop not null;

alter table public.trip_members add column is_placeholder boolean not null default false;

alter table public.trip_members add constraint trip_members_placeholder_user_id_check
  check (
    (is_placeholder and user_id is null)
    or (not is_placeholder and user_id is not null)
  );
```

- **No phased add-nullable/backfill/default/not-null dance is needed here**
  (contrast with `0007_add_expense_date.sql`/ADR 0003) — that playbook is
  for tightening a *new* column to `not null` on a populated table. Here
  we're doing the opposite for `user_id` (loosening `not null` to nullable,
  which is trivially safe for every existing row) and adding a brand-new
  column whose default (`false`) is already correct for every existing row
  unconditionally, with no backfill required. The check constraint holds
  immediately for all pre-existing rows without any data migration step.
- **Deploy-race safety**: old (pre-feature) app code only ever inserts into
  `trip_members` via `create_trip`/`join_trip`, both of which always supply
  a real `user_id` and never mention `is_placeholder`. Against the new
  schema, those inserts still succeed unchanged (`is_placeholder` defaults
  to `false`, and a real `user_id` satisfies the check constraint's
  not-placeholder branch) — so this migration is safe to land ahead of the
  frontend deploy, same as any purely additive schema change.
- **`unique (trip_id, user_id)` needs no change.** Postgres's default
  unique-constraint semantics treat every `NULL` as distinct from every
  other `NULL` (confirmed; this is standard SQL behavior, not something
  Postgres opts into — `NULLS NOT DISTINCT`, a PG15+ feature, would be the
  *wrong* direction for this feature and is not used). So an arbitrary
  number of `(trip_id, null)` rows can coexist under the existing
  constraint, which is exactly what allowing up to 20 placeholders per trip
  requires.
- `expenses.paid_by` is untouched (still `not null references
  auth.users(id)`) — see §3.

See [ADR 0004](../../adr/0004-placeholder-member-nullable-user-id-and-identity-key.md)
for why nullable-`user_id`-plus-flag was chosen over a synthetic non-null
`user_id`.

## 2. RPCs for add / rename / remove

Three new `security definer` functions, following the existing
`create_trip`/`join_trip`/`complete_trip` shape (organizer check mirrors
`complete_trip`'s `created_by = auth.uid()` pattern):

```sql
create or replace function public.add_placeholder_member(_trip_id uuid, _display_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare _member_id uuid;
declare _placeholder_count int;
begin
  -- Also serializes concurrent calls for the same trip (see cap note below).
  if not exists (
    select 1 from public.trips where id = _trip_id and created_by = auth.uid() for update
  ) then
    raise exception 'only the trip organizer can add a placeholder';
  end if;

  select count(*) into _placeholder_count
    from public.trip_members
    where trip_id = _trip_id and is_placeholder;
  if _placeholder_count >= 20 then
    raise exception 'a trip can have at most 20 placeholders';
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
    and m.is_placeholder;

  if not found then
    raise exception 'placeholder not found, or you are not the organizer';
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
    and m.is_placeholder;

  if not found then
    raise exception 'placeholder not found, or you are not the organizer';
  end if;
end;
$$;
revoke execute on function public.remove_placeholder_member(uuid) from public;
grant execute on function public.remove_placeholder_member(uuid) to authenticated;
```

Notes:

- **Organizer-only** is enforced inside each function against
  `trips.created_by = auth.uid()`, never trusted from client input — same
  pattern as `complete_trip`. Any client-side `isOrganizer` flag used to
  show/hide the "add placeholder" affordance is a UI convenience only.
- **`rename`/`remove` are placeholder-only by construction**: both filter
  on `is_placeholder` in the same statement that scopes to organizer and
  row id, so there is no code path in either function that can ever touch
  a real member's row — not because the caller is trusted to only pass a
  placeholder's id, but because the query itself excludes non-placeholder
  rows. Attempting either against a real member's id is indistinguishable
  from "row not found" (`raise exception` on `not found`), which is the
  correct behavior per the locked non-goal (no capability to remove/rename
  a real member is exposed, even accidentally).
- **20-cap race**: the `select ... for update` against the `trips` row
  (needed anyway for the organizer check) also serializes concurrent
  `add_placeholder_member` calls for the same trip, closing the
  check-then-insert race a plain count check would otherwise have between
  two overlapping calls. This is cheap (one extra row lock, held for the
  duration of the function) and reuses a statement already required for
  the auth check, rather than adding a separate advisory lock or a trigger
  — kept as a plain RPC-level check rather than a DB trigger because the
  RPC is already the sole write path for this table (mirrors how the
  organizer-only and placeholder-only checks above are also RPC-level, not
  triggers), and the cap itself is a soft guard rail ("stuck button /
  mis-click loop," per requirements' own rationale) rather than a hard
  security invariant.
- **Trip-lock (`completed_at`) gating — confirmed required (see "Product
  decisions" below):** all three RPCs must add
  `and public.is_trip_open(_trip_id)` to their checks and raise a clear
  error when it fails, rather than following `join_trip`'s unlocked
  precedent.

## 3. Payer-restriction enforcement, server-side

**Confirmed: no explicit new check is needed** — the existing schema and
RLS already make it structurally impossible for `paid_by` to reference a
placeholder, for two independent reasons:

1. `expenses.paid_by` is `not null references auth.users(id)`. A
   placeholder has `user_id = null` and, more fundamentally, **was never
   created via signup/auth at all** — there is no `auth.users` row
   corresponding to it, ever. There is no value anyone could put in
   `paid_by` that "is" a given placeholder, because a placeholder has no
   identity in `auth.users` to reference in the first place. This isn't a
   convention that could be violated by a careless insert; it's a FK
   pointing at a table that placeholders categorically never appear in.
2. Independently, the existing `"members can add expenses"` insert policy
   already requires `exists (select 1 from trip_members where trip_id =
   expenses.trip_id and user_id = expenses.paid_by)`. Since a placeholder's
   `trip_members.user_id` is `null`, and SQL's `null = <anything>`
   (including `null = null`) is never `true`, this `exists` check can never
   match a placeholder's row even in principle — on top of the FK already
   making the attempt impossible.

**No RLS policy on `expenses` needs to change for this feature.** The
`insert` policy (`0001_init.sql`) and the `update` policy (`payer can edit
their own expenses`, `0006_restrict_expense_update_to_payer.sql`) both
already key off `paid_by`/`user_id` matches that a placeholder can never
satisfy.

This also means requirement AC #8 ("an attempt to record an expense with a
placeholder as payer... must be rejected by the backend") is satisfied by
the schema exactly as it stands today, with zero new code — worth stating
explicitly since it's easy to assume a feature like this needs a new guard
when the existing constraints already forbid it by construction.

## 4. Read path (`src/lib/data/trips.ts`)

Two changes, both in `getTripView` and `getMyTrips`:

1. **Include `is_placeholder`** in the `trip_members` select (already
   `select("*")` in both functions, so this is automatic once the column
   exists) and surface it on every shaped member-like object as
   `isPlaceholder: boolean`: `members[]`, `you`, `expense.payer`,
   `settlement.from`/`to` (the latter two never actually placeholders in
   practice, but keeping the field present everywhere avoids a
   type-narrowing special case at render time).
2. **Member identity moves from `user_id` to `trip_members.id`** — see
   [ADR 0004](../../adr/0004-placeholder-member-nullable-user-id-and-identity-key.md)
   for the full reasoning. In short: today, `settlementMembers`/`members[]`
   use `m.user_id` as `id`, and expenses are matched to members by
   `paidBy === member.id` (both being the same `user_id`). Once
   placeholders can have `user_id = null` and **more than one placeholder
   per trip is allowed** (up to 20, duplicates-allowed per requirements),
   every placeholder would collide on `id = null`, which breaks two
   things concretely:
   - `balanceByMember`/`memberById` (both built as `Map`s keyed by that
     `id` in `getTripView`) would collapse all placeholders into a single
     map entry, so a lookup like `balanceByMember.get(m.user_id)` for a
     placeholder could return a different placeholder's balance object —
     typically manifesting as an incorrect `shareCents`/`netCents` display
     for some (not necessarily all) placeholders whenever the total
     doesn't divide evenly across members (the ±1-cent remainder is
     distributed by join-order index, so different placeholders can
     legitimately have different `shareCents`).
   - Every UI list that keys off `member.id` as a React `key`
     (`src/app/trip/[id]/page.tsx`'s Details-tab member list,
     `src/components/ui.tsx`'s `AvatarStack`, `src/app/trip/[id]/invite/page.tsx`'s
     roster list) would have duplicate/`null` keys among siblings once a
     second placeholder exists, which React does not handle correctly for
     list rendering.

   Fix: use `trip_members.id` (the row's own primary key, always unique)
   as the `id` on every shaped member object. To keep feeding
   `computeBalances`/`simplifyDebts` (`src/lib/settlement.ts`) correctly —
   which still needs to match each expense's `paid_by` (a `user_id`) to
   the right member — build a small per-call lookup translating `user_id
   -> trip_members.id` from the fetched member rows, and translate each
   expense's `paidBy` through it before constructing `settlementExpenses`.
   `computeBalances`/`simplifyDebts` themselves need **no code change** —
   they already treat `id`/`paidBy` as opaque matching keys; they just now
   receive `trip_members.id` values instead of `user_id` values.

   `you` (the current session's own member entry) is derived the same way:
   find the `trip_members` row where `user_id === currentUserId` (there is
   at most one, since real members are never placeholders and keep their
   existing unique-`user_id`-per-trip guarantee), then look it up by that
   row's `id` in `memberById`.

Nothing else in `getTripView`/`getMyTrips` changes — `totalCents`,
`avgPerPersonCents`, and the member *count* used for the equal split are
already computed from `trip_members` row count / `expenses` rows directly,
not from `user_id`, so placeholders are automatically included in the
split denominator per AC #9 with no code change there.

### UI surfacing (brief, implementation is the engineer's job)

- "(placeholder)" label (AC #5): render at each of the display sites
  (Details table, roster, settle-up) as `` `${member.displayName}${member.isPlaceholder ? " (placeholder)" : ""}` ``.
  Recommend a single shared helper (e.g. alongside `initialsFor`/
  `avatarColorFor` in `src/lib/avatar.ts`, which already centralizes
  per-member display derivations) rather than four independent inline
  concatenations. Must **not** be baked into the raw `displayName` field
  itself, since `initialsFor(displayName)` and the rename/edit flows need
  the unadorned name.
- Organizer-only add/remove affordance: gate on the existing `you?.isOrganizer`
  flag already present on `TripView`/`MyTrip` — purely a UI convenience;
  the real enforcement is the RPCs' own `created_by = auth.uid()` check
  (§2), so a stale or spoofed client-side flag can't grant the capability.
- Payer-picker exclusion (AC #7): see the open question below — there is
  currently no payer-picker UI to exclude placeholders from.

## 5. 20/trip cap and duplicate-names-allowed

- **Cap**: enforced in `add_placeholder_member` (§2) via a `count(*) ...
  where is_placeholder` check inside the same transaction as the
  organizer-check row lock, not a DB check constraint or trigger. A
  simple `check` constraint can't express a cross-row aggregate
  condition; a trigger would be a second enforcement surface for a rule
  that's already fully centralized in the one function that's the sole
  way to create a placeholder — the RPC is authoritative here the same
  way it already is for organizer-only and placeholder-only.
- **Duplicate names**: no enforcement anywhere, by design (locked
  decision) — `add_placeholder_member` never checks `display_name`
  against existing rows. No schema or RPC change needed beyond simply not
  adding a uniqueness check.

## Impact analysis

**`trip_members.user_id` (nullable now, was `not null`)**: grepped every
reader.
- `is_trip_member(_trip_id)` (`0001_init.sql`) — filters `where user_id =
  auth.uid()`; `auth.uid()` is never `null` for an authenticated caller, so
  a placeholder row (`user_id is null`) can never match this predicate
  regardless of the column's new nullability. No change needed, behavior
  identical.
- `get_trip_by_invite_code` — joins `trip_members` on `user_id = t.created_by`
  to find the organizer's display name for the pre-join invite preview.
  `t.created_by` is never null, so this join is unaffected by placeholders
  having `null` `user_id` — a placeholder row simply can't match this join
  condition either. No change needed.
- `create_trip`/`join_trip` — both always insert a real, non-null
  `user_id` (either `auth.uid()` at trip creation or the joining user's
  id). Unaffected by the column becoming nullable; still always populate
  it.
- `src/lib/data/trips.ts` (`getTripView`, `getMyTrips`) — the one place
  that needs to change, per §4.
- No other `.ts`/`.sql` reference to `trip_members.user_id` found.

**Backward compatibility**: additive and non-breaking for anyone not using
the new feature, matching requirements' own semver classification
("Feature", not "Breaking"). Specifically:
- Old app code (pre-migration-aware) inserting into `trip_members` via
  `create_trip`/`join_trip` continues to succeed unchanged against the new
  schema (§1's deploy-race note).
- No existing RLS policy is narrowed or widened by this feature (§3) — the
  payer restriction is a pre-existing structural guarantee, not a new
  policy.
- No existing route/RPC's signature changes. `add_placeholder_member`/
  `rename_placeholder_member`/`remove_placeholder_member` are brand new;
  nothing currently calls them, so there's no "old client, new RPC"
  ordering hazard the way there would be for a modified existing RPC.
- The one real cross-deploy hazard, as with any `trips.ts` change, is the
  standard "apply the migration before deploying frontend code that
  depends on the new column/RPCs" ordering already followed for prior
  migrations in this project (`0006`, `0007`) — not a new class of risk.

**Contained, non-architectural impact worth flagging for the engineer**:
`src/lib/data/trips.test.ts` has existing assertions of the form
`members.find((m) => m.id === "u1")` that assume `member.id` equals the
seeded `user_id`. Per ADR 0004, `member.id` becomes the `trip_members` row
id — these tests need updating as part of this feature's implementation,
not left as-is.

## Product decisions (resolved)

1. **Payer picker: reading (a) confirmed.** No payer-picker UI exists
   today and none is introduced by this feature. AC #7/#8 are
   forward-looking and already satisfied by §3's structural guarantee (no
   `auth.users` row exists for a placeholder, so `paid_by` can never
   reference one) plus the app's existing "you can only log what you
   paid for" model. No UI work needed here beyond §4's
   display/roster/organizer-affordance changes.
2. **Completed-trip gating: confirmed — block it.** All three RPCs
   (`add_placeholder_member`, `rename_placeholder_member`,
   `remove_placeholder_member`) must add `and public.is_trip_open(_trip_id)`
   to their organizer/target checks, mirroring how expenses are already
   locked in `0005_lock_expenses_when_trip_completed.sql`. Reject with a
   clear error (not a silent no-op) when the trip is completed. The
   "add placeholder" affordance in the UI must also reflect the lock
   (disabled/hidden with explanation), matching how the app already
   communicates the expense lock on a completed trip — not just fail
   server-side with no UI signal. This departs from `join_trip`'s
   unlocked precedent deliberately: removing a placeholder retroactively
   changes historical splits (AC #13), which is a materially bigger risk
   on a trip everyone has already treated as settled than a new member
   joining is.
