\i hdr.sql
set role authenticated; select set_config('test.uid',:'A',false), set_config('test.anon','false',false) \g /dev/null
begin;
select 's1 complete_trip' ; select public.complete_trip(:'T1'::uuid);
select pg_sleep(2);
commit;
