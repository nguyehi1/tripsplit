\i hdr.sql
-- Bob deletes X2, aged to 14s so S2's Undo is inside the window when it starts
set role authenticated; select set_config('test.uid',:'B',false), set_config('test.anon','false',false) \g /dev/null
select public.delete_expense(:'X2'::uuid) \g /dev/null
reset role;
update public.expenses set deleted_at = clock_timestamp() - interval '14 seconds' where id=:'X2';
