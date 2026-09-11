-- Supabase's public schema template runs
-- ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role,
-- so every new function gets a direct grant to anon regardless of the PUBLIC pseudo-role.
-- 0002_fix_function_grants.sql only revoked from PUBLIC, which left that direct anon grant in
-- place. Revoke it explicitly here for the functions that must not be publicly callable.

revoke execute on function public.is_trip_member(uuid) from anon;
revoke execute on function public.create_trip(text, text, text, date, date) from anon;
revoke execute on function public.join_trip(text, text) from anon;
revoke execute on function public.complete_trip(uuid) from anon;

-- get_trip_by_invite_code is intentionally public (unauthenticated invite-link preview), so its
-- anon grant is left as-is.
