# Delete an account

Erase or anonymize one account's data. Verify the requester first ([Runbooks](README.md#verify-the-requester)) and, if they want a copy, [export their data](export-user-data.md) before deleting.

Two cases, because `expenses.paid_by` has no ON DELETE action and `trips.created_by` cascades:

**Before case A or B:** if the requester deleted an expense in the last few minutes, that row still
exists until it is erased and will block the user delete on the `paid_by` foreign key (and make the
"paid no expenses" check below non-empty). Wait about 2 minutes, or run
`select public.erase_expired_expenses();` as the postgres owner (SQL editor), then run the usual check.

**A. Safe hard delete** — the user paid no expenses and created no trip that anyone else belongs to:

```sql
-- check first
select count(*) from public.expenses where paid_by = '<uid>';
select t.id from public.trips t where t.created_by = '<uid>'
  and (exists (select 1 from public.trip_members m where m.trip_id = t.id and m.user_id is distinct from '<uid>')
       or exists (select 1 from public.expenses e where e.trip_id = t.id));
```

Both empty -> Supabase dashboard Authentication > Users > Delete user (cascades memberships,
trips and `feedback`, since `feedback.user_id` is `on delete cascade`). The cascade through
`trips.created_by` also deletes the trip's `types` and `other_type`.

**B. Shared data** — user paid expenses or organized a trip others are on. Hard-deleting would
break others' balances or wipe their trip. Instead anonymize:

1. Call the Admin API `deleteUser(uid, true)` (soft delete: scrubs email/identities, keeps the
   uuid so FKs hold), or the dashboard equivalent.
2. `update public.trip_members set display_name = 'Former member' where user_id = '<uid>';`
   (A direct update is not affected by the migration 0020 name trigger, which only fires on insert.)
3. `delete from public.feedback where user_id = '<uid>';` The soft delete keeps the uuid, so the
   cascade does not run and their feedback comments would otherwise remain.
4. Clear the typed trip type on trips they organized (the trip is kept, so the cascade does not
   remove it): `update public.trips set other_type = null where created_by = '<uid>';` Run as the
   service role or in the SQL editor. This is an operator statement, not an app path (the app has
   no way to update `trips`). Leave `types` as is.
5. Tell the requester what was removed and what remains (their amounts on shared expenses,
   unnamed). Needs counsel sign-off on whether this meets erasure obligations (open question in
   compliance review #2).

**C. A person who exists only as a placeholder name.** An organizer may have typed someone's name
as a name-only placeholder. That person has no account and no
`user_id`, so none of the queries above find them. They can ask us to remove or anonymize the name.
Confirm with them the trip link and the name as it appears, then find the row:

```sql
select m.id, m.trip_id, m.display_name, t.completed_at
from public.trip_members m join public.trips t on t.id = m.trip_id
where m.is_placeholder and m.trip_id = '<trip_id>' and m.display_name ilike '<name>';
```

Then either anonymize (keeps the split count unchanged, preferred on a completed trip or one with
expenses):
`update public.trip_members set display_name = 'Former member' where id = '<member_id>' and is_placeholder;`
or delete the row (changes the live equal split across remaining members, so tell the organizer):
`delete from public.trip_members where id = '<member_id>' and is_placeholder;`
Expense amounts are unaffected either way. Splitiful never receives or stores an invitee's email
address from Invite by email (the address stays in the organizer's browser, and Invite by email
adds no placeholder or any other record), so there is nothing to erase for it. If the person writes
in about an invite without having an account, we hold no email for them and no account to match.

## Related

- [Export a user's data](export-user-data.md)
- [Monitor the expense erase job](monitor-expense-erase.md)
- [Data model](../reference/data-model.md)

Last verified: 2026-10-20 against 9a951bb
