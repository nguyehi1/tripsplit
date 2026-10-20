\i hdr.sql
set role authenticated; select set_config('test.uid',:'A',false), set_config('test.anon','false',false) \g /dev/null
begin;
select public.delete_expense(:'X3'::uuid);
select pg_sleep(2);
commit;
