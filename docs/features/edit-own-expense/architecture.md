# Edit own expense — architecture

See [requirements.md](./requirements.md) for scope/acceptance criteria. This
doc covers the technical design and, most importantly, the impact of
narrowing the `expenses` UPDATE RLS policy.

## Orientation / existing patterns reused

- **Mutation pattern**: Splitiful's existing mutations (`createTrip`,
  `joinTrip`, `addExpense` — all in `src/lib/data/trips.ts`) go straight from
  a client component through the Supabase **browser** client
  (`src/lib/supabase/client.ts`), with authorization enforced entirely by
  RLS — there is no Next.js route handler in the loop. The single existing
  route under `src/app/api/` (`trip-email/route.ts`) exists only because
  sending email needs the server-held Resend secret, which the browser must
  never see. Editing an expense has no such secret-holding side effect, so
  it follows the direct-client-mutation pattern, **not** a new API route.
- **Page pattern**: `src/app/trip/[id]/add-expense/page.tsx` is the direct
  template for the new edit page — same on-mount `useEffect` fetch of member
  count + lock state, same inline amount/description validation, same locked
  ("Trip is locked…") empty state.
- **Read pattern**: `getTripView` / `getMyTrips` in `src/lib/data/trips.ts`
  already `select()` expenses fresh on every load with no caching layer —
  confirmed by reading both functions. Acceptance criterion 3 ("dashboard,
  settle-up, My Trips reflect the edit immediately") is therefore satisfied
  by construction once the row is updated; no extra invalidation work is
  needed.
- Grepped `src/` for any existing `.update()` call against `expenses` —
  there is none. `addExpense` only inserts. **This confirms the PM's framing
  literally: no code path anywhere in the shipped app performs an expense
  update today.** This matters a lot for the impact analysis below.

## Data model changes

None. No new table, no new column. `expenses.paid_by` (set once, at insert)
continues to be the sole "who owns this row" signal, per the PM's framing —
there is no separate `created_by` to add.

`src/lib/supabase/types.ts`'s hand-maintained `Database` type already types
`expenses.Update` as `Partial<Row>`, so no type-file change is needed either;
the data-access layer is simply responsible for only ever passing
`{ amount, description }` in the update payload (see below).

## RLS change (the core of this feature)

**Current policy** (`0001_init.sql`, restated by `0005_lock_expenses_when_trip_completed.sql`):

```sql
create policy "members can edit expenses" on public.expenses
  for update using (is_trip_member(trip_id) and is_trip_open(trip_id))
  with check (is_trip_member(trip_id) and is_trip_open(trip_id));
```

Any trip member can update any expense on an open trip — not scoped to
`paid_by` at all.

**New policy** (new migration, `supabase/migrations/0006_restrict_expense_update_to_payer.sql`):

```sql
drop policy "members can edit expenses" on public.expenses;

create policy "payer can edit their own expenses" on public.expenses
  for update
  using (paid_by = auth.uid() and is_trip_member(trip_id) and is_trip_open(trip_id))
  with check (paid_by = auth.uid() and is_trip_member(trip_id) and is_trip_open(trip_id));
```

Notes on the exact shape:

- Both `using` (evaluated against the pre-update row) and `with check`
  (evaluated against the post-update row) require `paid_by = auth.uid()`.
  Since `auth.uid()` is constant for the duration of one statement, this
  forces old `paid_by` = new `paid_by` = the caller — i.e. it is
  **impossible to reassign `paid_by` under this policy**, which gets
  acceptance criterion 7's "paid_by never changes" enforced at the DB layer
  as a side effect of the ownership check, not as separate logic.
- `is_trip_member(trip_id)` is kept (redundant with `paid_by = auth.uid()`
  today, since paid_by is only ever set to a trip member at insert time and
  there is no "remove member" flow anywhere in `src/` to make that go
  stale) purely as defense-in-depth, matching the existing insert policy's
  style of double-checking membership rather than trusting one signal.
- `is_trip_open(trip_id)` is unchanged from today — this is what gates
  edits on a completed/locked trip, reusing the same `is_trip_open()`
  function `0005` already introduced for insert/delete. Satisfies
  acceptance criterion 6.
- **`trip_id` immutability is not independently guaranteed by this policy**
  — `with check` only constrains it via `is_trip_member(trip_id) and
  is_trip_open(trip_id)` on the *new* value, so in principle a caller who
  is a member of two open trips and (by the logic above, since paid_by
  can't change) happens to be `paid_by` on both could move a row between
  them. This gap **already exists in today's deployed policy** — it is not
  introduced by this change. It's mitigated at the application layer: the
  new `updateExpense` data-access function (below) never accepts or sends a
  `trip_id` in its payload, so no code path in this app can trigger it.
  Closing it at the DB level (e.g. a `before update` trigger comparing
  `OLD.trip_id`/`NEW.trip_id`) is possible but out of scope for this pass —
  flagged here as a known pre-existing limitation, not a regression, per
  the requirements doc's framing that trip_id/paid_by immutability is an
  app-layer contract "in this pass."
- The **delete** policy (`"members can delete expenses"`) is untouched —
  it stays "any trip member may delete any expense on an open trip." No
  delete UI exists (explicit non-goal), so there's nothing to scope it to
  yet. Flagging the resulting **asymmetry** for whoever builds delete next:
  after this feature ships, deleting an expense will be *more* permissive
  than editing it, which is an odd inversion worth revisiting when that
  feature is scoped (see the ADR's "consequences" section).

## Data-access layer

Add to `src/lib/data/trips.ts`, mirroring `addExpense`'s shape exactly:

```ts
export async function updateExpense(
  supabase: Client,
  input: { expenseId: string; amountCents: number; description: string },
) {
  const { data, error } = await supabase
    .from("expenses")
    .update({
      amount: centsToDollars(input.amountCents),
      description: input.description,
    })
    .eq("id", input.expenseId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
```

Deliberately: no `tripId` or `paidBy` parameter exists on this function at
all — not just because RLS would reject a change to either, but so nothing
in the call signature invites an engineer to wire one in later without
noticing the omission (see the `trip_id` caveat above).

Behavior when RLS rejects the update (wrong payer, or locked trip): Postgres
RLS doesn't raise an error for a row that fails `using`/`with check` — the
row is simply excluded from the update's result set. Combined with
`.select().single()`, that surfaces to supabase-js as a "0 rows" error
(PostgREST `PGRST116`), which `updateExpense` rethrows like any other
Supabase error. This is what actually backs acceptance criterion 5 ("rejected
server-side, not just hidden in the UI") — a direct API/DB call with another
member's session gets a real error, not a silent no-op or a client-only
guard.

## Route / page shape

No new route handler. New page:

`src/app/trip/[id]/expense/[expenseId]/edit/page.tsx` (client component),
following `add-expense/page.tsx`'s structure:

- On mount: fetch the target expense row, member count, and trip lock state
  (three small `select()`s via the browser client, same style as
  `add-expense/page.tsx`'s `useEffect`), plus the current user via
  `supabase.auth.getUser()`.
- Gating (UX-layer only — the DB is the real enforcement, per above):
  - If the trip is locked, render the same locked-state UI
    `add-expense/page.tsx` already has (satisfies acceptance criterion 6's
    UI half).
  - If `expense.paid_by !== user.id`, don't render the edit form (satisfies
    acceptance criterion 1's UI half — no affordance shown for expenses you
    didn't pay).
- Reuse the same amount/description validation `add-expense/page.tsx`
  inlines today (`amountCents <= 0 || !description.trim()`). Since this is
  now a second call site for the identical rule, pull it into a small
  shared helper (e.g. `src/lib/validation/expense.ts`) rather than
  copy-pasting — a genuine, present-tense duplication, not speculative
  reuse.
- On submit: call `updateExpense`, then `router.push(`/trip/${id}`)`,
  mirroring `add-expense/page.tsx`'s post-submit navigation.
- On cancel: navigate back without calling `updateExpense` (acceptance
  criterion 4 — trivially satisfied by not wiring cancel to any mutation).

**Entry point**: `src/app/trip/[id]/page.tsx`'s expense list row (around
lines 208–224) is where the edit affordance belongs — that map already has
`expense.payer` and the outer scope already has `you` and `trip.isCompleted`
from `getTripView`, so gating "only show this on my own expense, only on an
open trip" needs no new query, just a condition
(`expense.payer.id === you?.id && !trip.isCompleted`) around a link to the
new edit route.

## Impact analysis

**What currently depends on the permissive UPDATE policy?**

Grepped all of `src/` for `.update(` and `.from("expenses")` — the only
existing operations against `expenses` are one `insert` (`addExpense`) and
three `select`s (`getMyTrips`, `getTripView`, and the add-expense page's own
lock-check query). **No shipped code path performs an update against
`expenses` today.** The "any member can edit any expense" grant has existed
in the DB since `0001_init.sql` but has never been exercised by the app.
Consequences:

- Narrowing the policy **cannot break any currently-deployed app behavior**,
  because there is no app behavior currently exercising it.
- The only theoretical consumer of today's permissive grant is a caller
  hitting Supabase's auto-generated PostgREST API directly with a valid
  trip-member JWT (e.g. via `curl` or a script) and expecting to update any
  teammate's expense. That's not a documented or product-sanctioned
  integration surface for Splitiful — the requirements doc itself frames
  today's breadth as an unused, deliberate-but-generic default ("small
  trusted group" call), not a promised capability. No compatibility
  guarantee is owed to that caller.

**Deploy-ordering (migration vs. app code, given Vercel + Supabase deploy
independently and non-atomically):**

Because no old app code depends on the wide-open policy, there's no
"old-code-needs-old-policy" window to protect against — the usual hazard
this analysis exists to catch. Concretely:
- If the migration lands **before** the new edit page ships: no user-facing
  effect (nothing calls update yet); once the edit page ships it works
  against the already-narrowed policy.
- If the migration lands **after** the new edit page ships: the edit page's
  `updateExpense` call would briefly run against the *old*, permissive
  policy — functionally it would still work (a payer editing their own
  expense is a subset of "any member editing any expense"), it just
  wouldn't yet enforce the payer restriction against a misuse attempt in
  that window.
- Net: **ship the migration in the same PR/deploy as the edit feature**
  (normal practice here) rather than because strict ordering is required —
  do this so the feature's "only the payer can edit, enforced server-side"
  guarantee (acceptance criterion 5) is actually true from the moment the
  edit UI is reachable, rather than trusting a lucky migration-first
  ordering.

**Reads are untouched.** The SELECT policy on `expenses` isn't touched by
this change, so `getTripView`/`getMyTrips` and every screen built on them
(trip dashboard, settle-up, My Trips) are unaffected and — per the "read
pattern" note above — will show an edited amount/description on next load
with no extra work, satisfying acceptance criterion 3.

**Delete policy asymmetry** (restated from the RLS section): after this
ships, delete remains "any member, any expense" while update becomes
"payer only." Not a regression (delete isn't touched), but flagged
prominently here since it's the kind of inconsistency a reviewer or the
next feature's author should know was a deliberate sequencing choice, not
an oversight.
