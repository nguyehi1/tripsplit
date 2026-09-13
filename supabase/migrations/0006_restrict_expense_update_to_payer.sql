-- Narrows the expenses UPDATE policy from "any trip member can edit any expense" to "only the
-- paying member can edit their own expense," backing the new edit-own-expense feature.
--
-- Semver note: this *tightens* previously-permitted (if never exercised by the app) DB
-- behavior — see docs/features/edit-own-expense/architecture.md's impact analysis. No shipped
-- code path performs an update against `expenses` today, so this cannot break any deployed
-- app behavior; the only theoretical caller affected is one hitting PostgREST directly to edit
-- a teammate's expense, which was never a documented capability.
--
-- Because `auth.uid()` is constant for the duration of one statement, requiring
-- `paid_by = auth.uid()` in both `using` (old row) and `with check` (new row) also makes
-- `paid_by` immutable under this policy as a side effect of the ownership check.

drop policy "members can edit expenses" on public.expenses;

create policy "payer can edit their own expenses" on public.expenses
  for update
  using (paid_by = auth.uid() and is_trip_member(trip_id) and is_trip_open(trip_id))
  with check (paid_by = auth.uid() and is_trip_member(trip_id) and is_trip_open(trip_id));
