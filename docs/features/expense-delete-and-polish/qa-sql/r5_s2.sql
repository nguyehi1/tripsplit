\i hdr.sql
select pg_sleep(0.7);
set role authenticated; select set_config('test.uid',:'A',false), set_config('test.anon','false',false) \g /dev/null
\timing on
select public.complete_trip(:'T1'::uuid);
select public.undo_delete_expense(:'X3'::uuid);
