\i hdr.sql
select pg_sleep(0.7);
set role authenticated; select set_config('test.uid',:'B',false), set_config('test.anon','false',false) \g /dev/null
\timing on
select public.undo_delete_expense(:'X2'::uuid);
