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
  'expenses_paid', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from public.expenses e where e.paid_by = '<uid>')
);
```

Send the JSON to the verified address. (Expense participant splits live on other members' rows;
include only the requester's own.)

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

Both empty -> Supabase dashboard Authentication > Users > Delete user (cascades memberships/trips).

**B. Shared data** — user paid expenses or organized a trip others are on. Hard-deleting would
break others' balances or wipe their trip. Instead anonymize:

1. Call the Admin API `deleteUser(uid, true)` (soft delete: scrubs email/identities, keeps the
   uuid so FKs hold), or the dashboard equivalent.
2. `update public.trip_members set display_name = 'Former member' where user_id = '<uid>';`
3. Tell the requester what was removed and what remains (their amounts on shared expenses,
   unnamed). Needs counsel sign-off on whether this meets erasure obligations (open question in
   compliance review #2).

## 4. Anonymous-account retention (automatic)

`public.purge_abandoned_anonymous_users(90)` runs daily via pg_cron. It deletes unverified
anonymous users inactive 90 days, skipping any that paid expenses or organize a trip with other
members or expenses. Dry run the candidate count by copying the CTE `doomed` and selecting count.
Changing the period: update the cron command, `ANON_RETENTION_DAYS` in `src/lib/legal.ts`, and
the privacy page copy together.
