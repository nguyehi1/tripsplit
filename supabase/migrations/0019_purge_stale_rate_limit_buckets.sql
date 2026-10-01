-- Retention for public.rpc_rate_limits (migration 0013). Buckets are keyed by caller IP
-- ('invite-lookup:<ip>') or auth.uid(), so stale rows are personal data with no purpose: every
-- throttle window in this schema is 60 seconds (throttle_rpc calls in 0013/0016), and an expired
-- bucket is reset on its next hit anyway. Nothing ever deleted them, so the table grew by one row
-- per distinct caller forever. The privacy policy describes IP retention accordingly.
--
-- Deletes buckets whose window ended over a day ago -- far past any live window.

create or replace function public.purge_stale_rate_limit_buckets()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _deleted integer;
begin
  with gone as (
    delete from public.rpc_rate_limits
    where window_start < now() - interval '1 day'
    returning 1
  )
  select count(*) into _deleted from gone;

  return _deleted;
end;
$$;

revoke all on function public.purge_stale_rate_limit_buckets() from public, anon, authenticated;

-- Hourly, if pg_cron is enabled (same guard as migration 0018).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge-stale-rate-limit-buckets';
    perform cron.schedule('purge-stale-rate-limit-buckets', '23 * * * *', 'select public.purge_stale_rate_limit_buckets()');
  else
    raise notice 'pg_cron not enabled; purge_stale_rate_limit_buckets is NOT scheduled.';
  end if;
end;
$$;
