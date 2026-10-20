\i hdr.sql
set role authenticated; select set_config('test.uid',:'A',false), set_config('test.anon','false',false) \g /dev/null
select public.delete_expense(:'X1'::uuid) \g /dev/null
