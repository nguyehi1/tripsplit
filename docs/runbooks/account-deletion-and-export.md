# Runbook: account deletion, data export, anonymous-account retention

Requests arrive at Splitiful@gmail.com (the address on /privacy; `src/lib/legal.ts`).
Respond within 30 days (the figure promised on /privacy).

## 0. One-time setup

- Make sure Splitiful@gmail.com is a monitored inbox (it's a regular Gmail account, so no
  DNS or forwarding setup is needed).
- Supabase dashboard: Database > Extensions > enable `pg_cron`, then re-run the last block of
  migration 0018 (or `select cron.schedule('purge-abandoned-anonymous-users', '17 3 * * *',
  'select public.purge_abandoned_anonymous_users(90)')`). Verify with `select * from cron.job;`.

## 1. Verify the requester

- Verified account: the request must come from the email on the account. Otherwise reply to that
  address asking them to confirm.
- Anonymous account (no email): ask for the trip link and display name. Only act if that is
  consistent with a single anonymous member; if unsure, ask them to confirm from the browser.

## 2. Export

Find the user id: `select id from auth.users where email = '<email>';`

```sql
select jsonb_build_object(
  'account',   (select to_jsonb(u) - 'encrypted_password' from (select id, email, created_at from auth.users where id = '<uid>') u),
  'memberships', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.trip_members m where m.user_id = '<uid>'),
  'trips',     (select coalesce(jsonb_agg(to_jsonb(t) - 'invite_code'), '[]') from public.trips t where t.id in (select trip_id from public.trip_members where user_id = '<uid>')),
  'expenses_paid', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from public.expenses e where e.paid_by = '<uid>'),
  'feedback',  (select coalesce(jsonb_agg(to_jsonb(f)), '[]') from public.feedback f where f.user_id = '<uid>')
);
```

Send the JSON to the verified address. (Expense participant splits live on other members' rows;
include only the requester's own.)

Notes: `memberships` carries the account's display name on every trip (one name per account since
migration 0020). `feedback` rows hold free-text comments linked to the account, not to a trip
(`trip_id` is null for feedback sent from `/feedback`), so they cannot be found by trip.

## 3. Deletion

Two cases, because `expenses.paid_by` has no ON DELETE action and `trips.created_by` cascades:

**A. Safe hard delete** — the user paid no expenses and created no trip that anyone else belongs to:

```sql
-- check first
select count(*) from public.expenses where paid_by = '<uid>';
select t.id from public.trips t where t.created_by = '<uid>'
  and (exists (select 1 from public.trip_members m where m.trip_id = t.id and m.user_id is distinct from '<uid>')
       or exists (select 1 from public.expenses e where e.trip_id = t.id));
```

Both empty -> Supabase dashboard Authentication > Users > Delete user (cascades memberships,
trips and `feedback`, since `feedback.user_id` is `on delete cascade`).

**B. Shared data** — user paid expenses or organized a trip others are on. Hard-deleting would
break others' balances or wipe their trip. Instead anonymize:

1. Call the Admin API `deleteUser(uid, true)` (soft delete: scrubs email/identities, keeps the
   uuid so FKs hold), or the dashboard equivalent.
2. `update public.trip_members set display_name = 'Former member' where user_id = '<uid>';`
   (A direct update is not affected by the migration 0020 name trigger, which only fires on insert.)
3. `delete from public.feedback where user_id = '<uid>';` The soft delete keeps the uuid, so the
   cascade does not run and their feedback comments would otherwise remain.
4. Tell the requester what was removed and what remains (their amounts on shared expenses,
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

## 4. Anonymous-account retention (automatic)

`public.purge_abandoned_anonymous_users(90)` runs daily via pg_cron. It deletes unverified
anonymous users inactive 90 days, skipping any that paid expenses or organize a trip with other
members or expenses. Dry run the candidate count by copying the CTE `doomed` and selecting count.
Changing the period: update the cron command, `ANON_RETENTION_DAYS` in `src/lib/legal.ts`, and
the privacy page copy together.
