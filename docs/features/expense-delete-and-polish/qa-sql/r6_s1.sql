\i hdr.sql
begin;
delete from public.trip_members where user_id=:'B' and trip_id=:'T1';
select 's1' from public.trips where id=:'T1' for update;
select pg_sleep(2);
commit;
