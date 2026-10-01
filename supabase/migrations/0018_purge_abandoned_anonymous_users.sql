-- Retention policy for abandoned anonymous accounts (docs/compliance-review-2026-09-17.md #3,
-- ADR 0006 "Consequences"; policy text lives on /privacy, constant in src/lib/legal.ts).
--
-- Deletes anonymous (never email-verified) auth.users rows inactive for `_days` days (default
-- 90). Cascades remove their trip_members rows and any trips they created.
--
-- Deliberately conservative: a user is skipped -- never deleted -- if deleting them would take
-- other people's data with them:
--   * they paid any expense (expenses.paid_by has no ON DELETE action, so the delete would fail
--     anyway, and the expense is load-bearing for other members' balances), or
--   * a trip they created has any other member (real or placeholder) or any expense
--     (trips.created_by cascades, which would wipe the trip for everyone).
-- Skipped users fall under the manual erasure runbook (docs/runbooks/account-deletion-and-export.md).
--
-- Activity = latest of last refresh-token use, last sign-in, and creation, so a session the
-- browser is still refreshing is never treated as abandoned.

create or replace function public.purge_abandoned_anonymous_users(_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  _deleted integer;
begin
  with doomed as (
    select u.id
    from auth.users u
    where u.is_anonymous
      and u.email is null
      and greatest(
            u.created_at,
            coalesce(u.last_sign_in_at, u.created_at),
            coalesce((select max(rt.updated_at) from auth.refresh_tokens rt where rt.user_id = u.id::text), u.created_at)
          ) < now() - make_interval(days => _days)
      and not exists (select 1 from public.expenses e where e.paid_by = u.id)
      and not exists (
        select 1
        from public.trips t
        where t.created_by = u.id
          and (
            exists (select 1 from public.trip_members m where m.trip_id = t.id and m.user_id is distinct from u.id)
            or exists (select 1 from public.expenses e where e.trip_id = t.id)
          )
      )
  ),
  gone as (
    delete from auth.users where id in (select id from doomed) returning 1
  )
  select count(*) into _deleted from gone;

  return _deleted;
end;
$$;

revoke all on function public.purge_abandoned_anonymous_users(integer) from public, anon, authenticated;

-- Schedule daily at 03:17 UTC if pg_cron is available (Supabase: enable the extension first).
-- Not scheduled automatically when the extension is missing, so this migration never fails on a
-- fresh project -- see the runbook for enabling it.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge-abandoned-anonymous-users';
    perform cron.schedule('purge-abandoned-anonymous-users', '17 3 * * *', 'select public.purge_abandoned_anonymous_users(90)');
  else
    raise notice 'pg_cron not enabled; purge_abandoned_anonymous_users is NOT scheduled. See docs/runbooks/account-deletion-and-export.md.';
  end if;
end;
$$;
