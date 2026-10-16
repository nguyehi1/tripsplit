-- public.rls_auto_enable() is an event trigger function (installed outside of migrations,
-- presumably by the Supabase dashboard/template) that auto-enables RLS on newly created tables.
-- It returns the `event_trigger` pseudo-type, so Postgres refuses to run it via a direct call
-- (including PostgREST's /rest/v1/rpc/*) -- only the event trigger dispatcher can invoke it.
-- The anon/PUBLIC execute grant is therefore dead weight rather than an exploitable path, but the
-- linter flags it and it wasn't tracked anywhere, so pin it down here.
--
-- It only exists on a hosted project where the dashboard/template installed it -- a from-scratch
-- `supabase db reset` (CI, a fresh local dev db) never creates it, and `revoke` has no `IF EXISTS`
-- form, so this is guarded behind an existence check rather than a bare `revoke`.

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public;
    revoke execute on function public.rls_auto_enable() from anon;
    revoke execute on function public.rls_auto_enable() from authenticated;
  end if;
end $$;
