\i hdr.sql
select pg_sleep(0.7);
set role authenticated; select set_config('test.uid',:'B',false), set_config('test.anon','false',false) \g /dev/null
\timing on
\echo undo at age 14s+0.7 then lock waits to 2s => age>15s => expect EX002
select public.undo_delete_expense(:'X2'::uuid);
