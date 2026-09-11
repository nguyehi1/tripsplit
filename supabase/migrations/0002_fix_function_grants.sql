-- Postgres grants EXECUTE on new functions to the PUBLIC pseudo-role by default, which anon
-- inherits. 0001_init.sql only added grants to authenticated/anon without revoking that default,
-- so anon could call these SECURITY DEFINER functions via /rest/v1/rpc/*.

revoke execute on function public.is_trip_member(uuid) from public;
grant execute on function public.is_trip_member(uuid) to authenticated;

revoke execute on function public.get_trip_by_invite_code(text) from public;
grant execute on function public.get_trip_by_invite_code(text) to anon, authenticated;

revoke execute on function public.create_trip(text, text, text, date, date) from public;
grant execute on function public.create_trip(text, text, text, date, date) to authenticated;

revoke execute on function public.join_trip(text, text) from public;
grant execute on function public.join_trip(text, text) to authenticated;

revoke execute on function public.complete_trip(uuid) from public;
grant execute on function public.complete_trip(uuid) to authenticated;
