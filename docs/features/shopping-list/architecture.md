# Architecture: Shared shopping list with per-item claiming (shopping-list)

Inputs: [requirements.md](requirements.md) (authoritative scope/AC),
[planning.md](planning.md) (rationale for excluded/decided points),
[design-reference.md](design-reference.md) (five approved screens),
[design.md](design.md) (ux-designer stage — states, copy, a11y, and four items
explicitly flagged to this stage; treated as settled UX direction, not
re-litigated below except where it flags an open architecture question),
[docs/ARCHITECTURE.md](../../ARCHITECTURE.md), ADR 0002, 0004, 0005, 0006,
0008, 0012, and `supabase/migrations/0001`, `0008`, `0009`, `0013`, `0014`.

## 0. Existing functionality this reuses (no parallel implementation)

Per the architect role's own instruction to check for overlap before adding a
parallel mechanism — everything below is an **extension** of an existing
module/pattern, not a new one:

- **RLS building blocks**: `is_trip_member`, `is_trip_open`,
  `is_verified_trip_member`, `is_owner_or_verified_member` — reused as-is
  (composed, not re-derived), per ARCHITECTURE.md's own instruction.
- **RPC-as-the-only-write-path pattern**: `trip_members` has no direct
  `insert`/`update` grant for `authenticated` — every write goes through a
  `security definer` RPC (`join_trip`, `add_placeholder_member`,
  `remove_trip_member`, etc.). Section 2 below follows this exactly for the
  claim/unclaim/log transitions, rather than inventing an RLS-conditional-
  update mechanism.
- **Placeholder exclusion proof-by-construction**: `expenses.paid_by`'s
  placeholder-exclusion needs no extra constraint because every write path
  derives it from `trip_members.user_id = auth.uid()`, and a placeholder's
  `user_id` is always `null` (ADR 0004). Section 1 applies the identical
  reasoning to `claimed_by`/`added_by`.
- **`src/lib/data/trips.ts`**: not modified. A new sibling module,
  `src/lib/data/shopping-list.ts`, is added instead (see section 4) — same
  reasoning that already split `src/lib/settlement.ts`,
  `src/lib/validation/expense.ts`, and `src/lib/avatar.ts` out of `trips.ts`:
  a distinct, bounded entity gets its own file rather than growing the one
  "trips/expenses" module into a second domain.
- **`add-expense-sheet-content.tsx`** (ADR 0008): this is the *one* shared
  component both the intercepted sheet and the hard-nav fallback render — so
  "surfaced at both existing call sites" (requirements) means extending this
  one file once, not building two integrations. Confirmed by reading ADR 0008
  and the file itself.
- **`SheetShell` + `@sheet` parallel route** (ADR 0008): reused, not
  reinvented, for the new "Add an item" sheet (section 4).
- **`src/lib/pending-action.ts`**: considered for a shopping-list equivalent
  (design.md flags this); decision below is to *not* add one (section 4).
- **`edit/page.tsx`**: extended with a read-only render branch for Bought
  tap-through (design.md section 7's resolution), not a new page.
- **`TabSwitch`** (`src/components/ui.tsx`): extended with an optional badge,
  not a new tab component.

## 1. Data model

### New table: `public.shopping_list_items`

```sql
create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  description text not null check (char_length(btrim(description)) > 0),
  added_by uuid references public.trip_members(id),
  claimed_by uuid references public.trip_members(id),
  status text not null default 'open' check (status in ('open', 'claimed', 'logged')),
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
```

**No separate `note` column.** design-reference.md's row-copy example
("Dev added · the dark one") and design.md's copy table both mention an
"optional note," but requirements.md's Scope section is explicit: an item has
only "free-text description," and there's no acceptance criterion, schema
note, or non-goal-list slot for a second field (contrast with the explicitly
excluded quantity field). Resolving this ambiguity in requirements.md's
favor (it's stated authoritative over design-reference where they conflict):
one `description text` column; "the dark one" is just content the adder
types into that same field, not a structured attribute. Flagging this
explicitly rather than silently picking a side.

**Why `added_by`/`claimed_by` are nullable `references trip_members(id)`
with no `on delete` action, backed by a trigger (not a declarative
cascade)** — this is the one genuinely new mechanism this feature
introduces; see [ADR 0013](../../adr/0013-shopping-list-claim-release-trigger-on-member-removal.md)
for the full reasoning. Short version: `remove_trip_member`/`leave_trip`
(migration 0014) hard-delete a `trip_members` row. If a still-open claim
existed for a removed member's row, a plain `on delete set null` on
`claimed_by` would null the column while leaving `status = 'claimed'`,
**violating `shopping_list_items_shape_check`** — meaning removing that
member would fail with a constraint error, a real regression against the
already-shipped remove-member-access feature. A `before delete on
trip_members` trigger fixes this correctly: it reverts a still-`claimed`
item to `open` (consistent with "released back for anyone to claim," the
exact unclaim semantics already defined) and clears `claimed_by`/`added_by`
on any row that references the row about to be deleted, *before* the delete
proceeds — so by the time Postgres checks the (default, unnamed) FK
constraint, nothing points at the deleted id anymore, and the delete
succeeds cleanly regardless of whether that member had claims.

```sql
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
```

**Known, accepted edge case** (flagged, not solved here — matches this
feature's own "known limitation" precedent): if a `logged` item's claimer is
later removed from the trip, `claimed_by` nulls out (status stays `logged`,
allowed by the relaxed shape-check clause above) — the eventual expense-
delete feature, when it reverts a logged item to claimed-unlogged, will find
no claimer to reassign to for that specific case. This mirrors the already-
accepted "ghost payer" tolerance (ADR 0012) for the same general class of
problem (a removed member's historical data outliving their roster row);
not a new risk this feature introduces, just the same one recurring.

**Why `expense_id` has no `on delete` action (blocks, doesn't cascade)**:
per requirements' explicit ask ("the architecture stage should still leave
the data model able to revert an item to claimed-unlogged later without a
schema change"), a passive `on delete set null` would let a future
`DELETE FROM expenses` silently null `expense_id` while leaving
`status = 'logged'` — which the shape-check *allows* (logged only requires
`expense_id is not null`... wait, it would then have `expense_id is null`,
which matches **no** branch of the check, so this would also raise a
constraint violation). That's intentional: today nothing deletes expenses
(no delete UI/RPC exists — ARCHITECTURE.md already notes `expenses`' delete
RLS is permissive but unused), so this FK is inert now. Leaving it as the
default blocking behavior is a deliberate forcing function: the
not-yet-built expense-delete feature must explicitly write its own
reconciliation (`update shopping_list_items set status = 'claimed',
expense_id = null where expense_id = <deleted id>`, run *before* the
expense delete in the same transaction) rather than accidentally relying on
a passive cascade that would corrupt this table's shape guarantee. Noted
here for whoever builds that feature next, same spirit as ADR 0002's
"watch for" notes.

**Placeholder exclusion from `claimed_by`/`added_by`**: no extra CHECK/FK
constraint referencing `trip_members.is_placeholder` is added. Both columns
are only ever written by code that derives the value from
`trip_members.user_id = auth.uid()` (the two claim RPCs, and the insert RLS
policy for `added_by` — see sections 1b/2) — and a placeholder's `user_id`
is always `null`, which can never equal `auth.uid()`. This is the identical
proof-by-construction ARCHITECTURE.md already documents for
`expenses.paid_by`'s placeholder-exclusion (ADR 0004 territory) — reusing
it rather than adding a second, redundant enforcement mechanism (a trigger
or a check-constraint subquery would duplicate a guarantee that's already
structurally true, adding maintenance surface for no additional safety).
**Tradeoff accepted**: this guarantee depends on *every* future write path
continuing to derive these columns the same way — there is no independent,
declarative backstop if a future migration ever adds a second write path
(e.g., a raw admin `UPDATE`) that sets `claimed_by` directly. This is the
same tradeoff already accepted for `paid_by`, not a new one.

### Migration safety review (required per architect role)

- **Applies cleanly against existing rows**: yes — this is a `create table`
  (no existing `shopping_list_items` rows to conflict with) plus one new
  trigger on the already-populated `trip_members` table. `create trigger`
  does not rewrite/backfill existing rows; it only affects future `delete`s.
  No phased add-nullable/backfill/not-null sequencing (ADR 0003's concern)
  applies here — there is no `not null` column being added to a populated
  table.
- **No deploy-window race**: the table, its RLS policies, the two claim
  RPCs, the logging RPC, and the trigger all land in one migration file. Old
  (pre-this-feature) app code doesn't know `shopping_list_items` exists at
  all, so there is no window where a claimed item could exist without the
  trigger that protects `remove_trip_member`/`leave_trip` also existing —
  the hazard the trigger fixes and its fix are introduced atomically.
- **Ambiguous-column check** (the specific class of bug that broke
  migration 0013 in production): every statement in the new RPCs/trigger
  either touches exactly one table per statement (`update
  shopping_list_items ...`, `update expenses ...`, run as separate
  statements, never joined in a single `insert ... on conflict do update`),
  or qualifies columns explicitly where two objects could plausibly share a
  name (`old.id` vs. `shopping_list_items.claimed_by`/`added_by` in the
  trigger — `old` is a distinct record namespace, not a table alias, so no
  bare-name ambiguity). No `on conflict ... do update set` (the exact
  construct that caused 0013's ambiguity) appears anywhere in this
  migration. Verified by re-reading every new function body against this
  specific failure mode.

## 1b. RLS policies

```sql
alter table public.shopping_list_items enable row level security;

-- Detail-tier read, same predicate/rationale as expenses/trip_members select
-- (readable by a pre-verification owner viewing their own trip; gated behind
-- verification for anyone else) — the List tab only renders inside the same
-- full-detail view those already gate.
create policy "owner or verified member can read shopping list" on public.shopping_list_items
  for select using (is_owner_or_verified_member(trip_id));

-- Add an item: any verified member, open trip, and added_by must resolve to
-- the caller's own (necessarily non-placeholder) trip_members row — same
-- shape as expenses' insert policy pinning paid_by to a real trip member.
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

-- Pre-claim delete: adder-only, open items only — direct RLS analogue of
-- ADR 0002's payer-only-edit shape (single ownership predicate, no
-- state-transition correlation needed, so a plain policy suffices — no RPC).
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

-- Deliberately NO update policy/grant — see section 2: every status
-- transition (claim/unclaim/log) goes through a security-definer RPC, the
-- same "no direct write grant, RPC is the only door" shape as trip_members
-- itself (`revoke insert on trip_members from authenticated`, 0001_init.sql).
revoke update on public.shopping_list_items from authenticated;
```

**Why no UPDATE policy, and why that's not a gap**: RLS's `using`
(evaluated against the pre-update row) and `with check` (evaluated against
the post-update row) can't be correlated with each other — there's no way
to express "new status may only be `claimed` if old status was `open`"
purely as RLS predicates on a single `for update` policy. (Multiple
separate permissive policies don't fix this either: Postgres ORs all
`using` clauses together and all `with check` clauses together across
policies for the same command, so a caller could satisfy one policy's
`using` and a *different* policy's `with check` — exactly the mix-and-match
hazard ADR 0002's "Consequences" section already warns about for this
codebase. Splitting claim/unclaim/log into three separate UPDATE policies
would silently reopen the claim race this feature exists to close.) Rather
than solve state-transition correlation with a second new mechanism (a
trigger, mirroring section 1's), this reuses the codebase's existing answer
to "a mutation needs more logic than one ownership predicate can express":
a `security definer` RPC, exactly like `join_trip`/`add_placeholder_member`/
`remove_trip_member` already are.

## 2. RPCs (claim/unclaim/log) — the claim-race guarantee

```sql
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

  -- Decision 2 (requirements.md) as amended post-implementation, 2026-09-29:
  -- claimer-only. `_member_id` is derived server-side from auth.uid(), exactly like
  -- claim_shopping_list_item — never trusting a client-supplied member id — and folded
  -- into the same conditional-update-as-compare-and-swap shape the claim RPC already
  -- uses, so "claimed by someone else" fails via the same clean `if not found` branch
  -- as every other precondition failure here.
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
```

**How this actually closes the claim race, at the DB level, not just the
UI** (the acceptance criterion explicitly requires this be verified at the
data layer): the `update ... where status = 'open'` inside
`claim_shopping_list_item` is a single statement acquiring a row lock on
that specific item. Under Postgres's default READ COMMITTED isolation, two
concurrent calls targeting the same row serialize on that lock: the second
call blocks until the first's transaction commits, then re-evaluates its
own `where status = 'open'` against the now-current (already `'claimed'`)
row and matches zero rows — `if not found` fires, and that caller gets a
clean exception, never a silent no-op or a double-claim. This is the
standard Postgres "conditional update as compare-and-swap" idiom — no
unique index, advisory lock, or `select ... for update` is needed beyond
the UPDATE's own implicit row lock, because there is only ever one row
being contended for (not a second row being inserted, which is the case
`unique`/advisory-lock tricks exist for).

## 3. Atomic expense-creation-plus-item-logging (requirement 6)

**New, additive RPC** — used only when the add-expense sheet's submission
includes one or more selected shopping-list items:

```sql
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
```

**Atomicity mechanism**: both the `insert into expenses` and the `update
shopping_list_items` run inside the same function body, i.e. the same
calling transaction. An unhandled `raise exception` (the mismatch-count
guard) aborts the *entire* transaction — the just-inserted expense row rolls
back too. There is no window where the expense exists but its items didn't
get linked (or vice versa): either both happen or neither does. This
directly resolves design.md section 9's flagged item 4 ("worth doing at
that layer if cheap") — it turned out cheap (one more RPC, following
`create_trip`'s existing "insert into two tables atomically" precedent), so
it's built now rather than deferred, closing what design.md itself called a
staleness bug in the two-call alternative.

**Why this is a *second*, additive RPC rather than routing all expense
creation through it (including the "skip the list" path)**: the existing
`addExpense` (`src/lib/data/trips.ts`, plain `.from("expenses").insert()`
under RLS) is left **completely untouched**. Requirements' own acceptance
criterion ("skipping the shopping list entirely... continues to work
exactly as it does today, unchanged") is best satisfied literally — the
no-items submission runs the identical code path it always has, not a
functionally-equivalent-but-different one. The existing `expenses` insert
RLS policy also stays in force unmodified, so this is genuinely zero-risk
for every trip that never touches this feature. **Tradeoff accepted**: this
means expense-insert validation (verified member, trip open, `paid_by`
resolves to a member) now exists in two places — the RLS policy (for
`addExpense`'s path) and this RPC's manual checks (since a `security
definer` function bypasses RLS by default and must replicate it, the same
reason `create_trip`/`join_trip` already manually re-check what RLS would
otherwise enforce). A future change to expense-insert validation rules
needs to be applied in both places — flagged here so it isn't missed later,
the same spirit as ADR 0002's own "watch for" notes.

**Why not a two-call-plus-reconciliation approach instead** (insert
expense, then separately update items, catching/logging a mismatch): this
is exactly the shape design.md's section 9 already flags as producing a
"stale item status" bug under partial failure, and the atomic RPC above
eliminates that failure mode outright rather than needing to detect and
message it. No reconciliation logic is needed anywhere in the client.

**Client-side composition of the description field** (design.md section 6's
resolved merge algorithm — comma-joined pill fragments distinct from a
free-typed remainder, tracked by item id) is pure client state; nothing
here constrains or is constrained by it. The one architectural commitment:
`selectedItemIds` must be tracked as its own client-state value (not
re-derived from the text field), since it's exactly the array passed as
`_item_ids` to the RPC above.

## 4. Client data-fetching / integration points

### New data module: `src/lib/data/shopping-list.ts`

```ts
getShoppingListView(supabase, tripId, currentUserId)
  // -> { items: ShoppingListItem[], myClaimedUnloggedCount: number }
  // one .from("shopping_list_items").select(...).eq("trip_id", tripId) read,
  // shaped/grouped (open / mine-claimed / logged) the same way trips.ts already
  // shapes getTripView's output — not left to the UI to re-derive from raw rows.

addShoppingListItems(supabase, { tripId, addedBy, descriptions: string[] })
  // plain multi-row .insert([...]) — one PostgREST request, one statement,
  // atomic by construction (all rows succeed or the whole insert fails/rolls
  // back) — closes design.md section 4's flagged "add-multiple-items
  // atomicity" question with "yes, already atomic," no RPC needed.

deleteShoppingListItem(supabase, itemId)   // plain .delete(), RLS-scoped
claimShoppingListItem(supabase, itemId)    // wraps claim_shopping_list_item RPC
unclaimShoppingListItem(supabase, itemId)  // wraps unclaim_shopping_list_item RPC
addExpenseWithShoppingItems(supabase, {...})  // wraps add_expense_and_log_shopping_items RPC
```

Same shape/precedent as `src/lib/data/trips.ts`'s existing wrappers (thin,
typed, one function per RPC/table op, comment noting what's enforced
server-side vs. here).

### `renderTripDashboard` (`src/app/trip/[id]/page.tsx`)

Fetches `getShoppingListView` as one more parallel query, alongside
`getTripView`, **only attempted when `view` resolves** (List tab is
detail-tier, same gate as Expenses/roster) and wrapped in the same
try/catch-to-empty-default pattern `fetchSummary` already uses, so a
shopping-list read failure degrades to an empty list rather than breaking
the whole trip page. **Must be fetched regardless of which tab is
initially active** — `TabSwitch` is a client-side, no-round-trip tab
control, so all three tabs' data has to already be in the initial payload,
exactly like `expenses`/`members` already both load before `TripTabs`
decides which one to show first.

`tab` query-param handling extends from `tab === "details" ? "details" :
"expenses"` to a third branch for `tab === "list"` (design.md section 1's
`?tab=list` deep-link decision).

### `trip-tabs.tsx` / `TabSwitch`

`TripTabs`'s `tab` state type extends to `"expenses" | "details" | "list"`;
a third render branch delegates to a new sibling component,
`shopping-list-tab.tsx` (kept out of the already-large `trip-tabs.tsx` file,
same split-by-concern reasoning as section 0). The existing two branches'
JSX is untouched — this is additive, not a restructure.

`TabSwitch`'s `options` shape gains an optional `badge?: number` field
(rendered as the small accent pill from design-reference Screen 2 when
`badge > 0`, nothing when absent/0). One existing consumer
(`trip-tabs.tsx`'s Expenses/Details options) — verified via grep as the
component's only call site — passes no `badge`, so its rendering is
byte-for-byte unchanged; this is a pure addition to the prop shape, not a
breaking change to the component's contract.

### `add-expense-sheet-content.tsx` (ADR 0008's shared component — the real insertion point)

The existing gating `useEffect` (which already fetches `user`, member
count, and trip lock state via one `Promise.all`) is restructured to
resolve `user` first, then fetch member count / trip lock / "my
claimed-unlogged items on this trip" concurrently — the last keyed off
`user.id`, via a direct `.from("shopping_list_items").select(...)` filtered
to the caller's own `trip_members.id` and `status = 'claimed'` (RLS's
existing select policy already permits this; no RPC needed, matching how
every other read in this app is a plain `.from()` call). This is a small,
scoped restructuring of one existing effect — the ownership/lock/redirect
logic it already contains is untouched.

`handleSubmit` branches on whether any items are currently selected:
zero selected → calls `addExpense` exactly as today (byte-for-byte
unchanged call); one or more selected → calls the new
`addExpenseWithShoppingItems` wrapper instead, passing the selected item
ids. This is the one behavioral branch point requirements' "skip the list
continues to work unchanged" criterion depends on, and it's structured so
that criterion is true by construction, not by testing after the fact.

A new "From your bag" block (toggle pills, per design-reference Screen 4 and
design.md section 5's loading/error/disabled states) renders above the
existing amount/description card, conditionally on the fetched
claimed-unlogged list being non-empty — matching the existing pattern of
conditional blocks already in this component (e.g. the locked-trip branch).

### `SheetShell` / `@sheet` parallel route — the "Add an item" sheet

Reuses the exact ADR 0008 scaffold a second time: `@sheet/(.)add-item/page.tsx`
(intercepted) and `add-item/page.tsx` (hard-nav/deep-link fallback, same
shape as `add-expense/page.tsx`), both wrapping a new shared
`AddItemSheetContent` component. `@sheet/[...catchAll]/page.tsx` already
covers this new route with no change (it nulls the slot for *any*
`/trip/[id]/*` subroute not explicitly matched). **One existing file does
need a small, explicit edit**: `trip-sheet-chrome.tsx`'s `dimmed` check
(`pathname.endsWith("/add-expense")`) must be generalized to also match
`/add-item` (e.g. `pathname.endsWith("/add-expense") ||
pathname.endsWith("/add-item")`), or the background dim/blur/scale motion
won't trigger for the new sheet. Flagged explicitly as a required,
in-scope touch to existing shared code (see Impact analysis).

### Bought tap-through (design.md section 7's resolution)

Extends `src/app/trip/[id]/expense/[expenseId]/edit/page.tsx`'s existing
gating (`expenseResult.data.paid_by !== user.id` today unconditionally
shows a generic "Couldn't load this expense.") with a read-only render
branch instead of the blocking one, for a verified non-payer viewer or a
locked trip. **No RLS change needed** — `expenses`' select policy
(`is_owner_or_verified_member`) already permits any verified/owner trip
member to read the row; today's block is purely an application-layer
choice in this one page, not an RLS restriction, so widening it is safe and
additive (see Impact analysis — nobody currently reaches this branch
successfully, so there's no existing working behavior being changed, only
previously-blocked behavior being unblocked).

### Invitee attempt-then-redirect trigger

Claim/unclaim/add-item/delete all call `requireVerifiedSession` before
their mutation, exactly like `add-expense-sheet-content.tsx` does today. A
new `"invitee-shopping-list"` value is added to `check-email/page.tsx`'s
`Trigger` union (currently `"detail" | "invitee-expense"`) with its own
headline copy — a small, explicit, additive edit to that file (see Impact
analysis).

**Decision: no pending-action mechanism for shopping-list mutations.**
design.md flags (as an open item, not a requirement) that resuming a
claim/unclaim/delete tap after the OTP round trip would need something
paralleling `savePendingExpenseDraft`/`takePendingExpenseDraft`, but also
gives an explicit, accepted fallback copy ("You're verified — tap it
again.") if it isn't built. This architecture takes that fallback: unlike
an expense draft (a multi-field form, genuinely costly to retype), a
claim/unclaim/delete is a single tap with trivial resumption cost — losing
it after a redirect is a minor, one-tap UX papercut, not a data-loss risk,
and doesn't warrant a new client-state module for v1. Revisit only if usage
data shows this is a real point of friction.

## 5. Impact analysis (existing consumers touched)

This feature is additive (new table, new RPCs, new tab) but touches several
existing, shipped files. None of these are breaking changes to what's
currently deployed; called out explicitly per the architect role's
required step:

| File / mechanism | Change | Backward-compatible? |
|---|---|---|
| `trip_members` (table) | New `before delete` trigger | Yes — purely additive to future deletes; no existing row/behavior changes. **Without it**, this feature would introduce a real regression: `remove_trip_member`/`leave_trip` (migration 0014, already shipped) would start failing with a constraint error the moment a removed member had a still-open shopping-list claim. Caught and resolved by ADR 0013, not left as a latent bug. |
| `add-expense-sheet-content.tsx` | Gating effect restructured; `handleSubmit` branches on selection | Yes — the zero-selected path calls the exact same `addExpense` function unchanged; the effect's existing ownership/redirect/lock logic is untouched, only reordered to resolve `user` before firing the new query. |
| `trip-sheet-chrome.tsx` | `dimmed` pathname check widened | Yes — strictly additive (`||` with a new pathname suffix); every existing route's `dimmed` value is unchanged. |
| `trip-tabs.tsx` | Third tab branch added | Yes — existing "expenses"/"details" branches' JSX untouched. |
| `TabSwitch` (`ui.tsx`) | New optional `badge` prop | Yes — optional, one existing call site verified (grep) to pass no `badge`; unaffected. |
| `expense/[expenseId]/edit/page.tsx` | New read-only branch for non-payer/locked viewers | Yes — today, every non-payer viewer is already blocked with a generic error; nobody has a *working* flow through this branch today for this to break. Widening from "blocked" to "read-only" is strictly additive from the current deployed behavior's perspective. |
| `check-email/page.tsx` | New `Trigger` union member + headline | Yes — additive union member; existing `"detail"`/`"invitee-expense"` triggers and their copy are untouched. |
| `expenses` table/RLS | **Not modified** | N/A — `addExpense`'s existing insert policy is left exactly as-is; the new RPC replicates the same checks manually rather than routing through or altering it. |
| `getTripView`/`trips.ts` | **Not modified** | N/A — shopping list data is fetched by a new sibling module and function, not folded into `getTripView`'s existing, tested shape. |

**Deploy-window / migration-vs-deploy-atomicity check**: since every piece
(table, RLS, trigger, and all three RPCs) lands in one migration file, and
no existing table/column/RLS policy is altered, there is no intermediate
state where old app code and new schema (or vice versa) disagree about
anything this feature touches. The one cross-feature interaction that
*could* have caused exactly this kind of drift — `remove_trip_member`/
`leave_trip` deployed before this feature existed, now needing to keep
working once it does — is what ADR 0013's trigger exists to close, and it
ships atomically with the table it protects.

## 6. Semver

Matches requirements.md's classification: **Feature** (additive, minor).
Confirmed at the architecture level — no existing table is altered, no
existing RLS policy is narrowed or widened, no existing RPC signature
changes, and the one existing call path this feature's UI depends on
(`addExpense`) is left byte-for-byte untouched for its existing (no-items)
use.

## 7. Deferred to engineer/QA (not resolved here)

- Exact PostgREST query shape for "my claimed-unlogged items" (section 4) —
  a direct `.select()` with an embedded/filtered join or a two-step lookup;
  either is fine, not an architectural distinction.
- All UI states, copy, and a11y — fully specified in design.md; this doc
  doesn't restate them.
- The description-field merge algorithm's exact implementation (design.md
  section 6) — client-only state, no backend dependency, confirmed above.
