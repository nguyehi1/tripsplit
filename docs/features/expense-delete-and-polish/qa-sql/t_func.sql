\i hdr.sql
\set VERBOSITY verbose
-- helper: run as user
\echo ===== 1. delete as various callers (expect: all non-payer fail EX001, A succeeds)
-- anonymous (no uid)
set role authenticated; select set_config('test.uid','',false), set_config('test.anon','false',false);
select public.delete_expense(:'X1'::uuid);
-- other member B on A's expense
select set_config('test.uid',:'B',false);
select public.delete_expense(:'X1'::uuid);
-- non-member D
select set_config('test.uid',:'D',false);
select public.delete_expense(:'X1'::uuid);
-- anonymous-session member C trying A's
select set_config('test.uid',:'C',false), set_config('test.anon','true',false);
select public.delete_expense(:'X1'::uuid);
-- departed payer E (not a member) on X4
select set_config('test.uid',:'E',false), set_config('test.anon','false',false);
select public.delete_expense(:'X4'::uuid);
-- A on X4 (not payer)
select set_config('test.uid',:'A',false);
select public.delete_expense(:'X4'::uuid);
-- A on locked trip X5
select public.delete_expense(:'X5'::uuid);
-- anon role (not authenticated) call
reset role; set role anon; select public.delete_expense(:'X1'::uuid);
reset role;
\echo ---- state must be unchanged: deleted_at all null
select count(*) filter (where deleted_at is not null) as marked from public.expenses;
\echo ===== 2. A deletes X1 (linked to 2 items)
set role authenticated; select set_config('test.uid',:'A',false), set_config('test.anon','false',false);
select public.delete_expense(:'X1'::uuid);
reset role;
select id, status, claimed_by is not null as claimed, expense_id, unlinked_from_expense_id from public.shopping_list_items where id::text like 'f1%' order by id;
select id, deleted_at is not null as marked from public.expenses where id=:'X1';
\echo ---- hidden from reads (A sees X1? expect no)
set role authenticated; select count(*) as a_sees_x1 from public.expenses where id=:'X1';
select set_config('test.uid',:'B',false); select count(*) as b_sees_x1 from public.expenses where id=:'X1';
select count(*) as b_sees_t1_rows from public.expenses where trip_id=:'T1';
reset role;
\echo ---- delete twice: EX001 and deleted_at not rewritten
select deleted_at as before_ts from public.expenses where id=:'X1' \gset
set role authenticated; select set_config('test.uid',:'A',false);
select public.delete_expense(:'X1'::uuid);
reset role;
select (deleted_at = :'before_ts'::timestamptz) as unchanged from public.expenses where id=:'X1';
\echo ===== 3. get_trip_summary (service role) excludes marked, members with none still present
set role service_role; select * from public.get_trip_summary(:'T1') order by display_name; reset role;
\echo ===== 4. Undo as non-payer / non-member / locked / live
set role authenticated; select set_config('test.uid',:'B',false); select public.undo_delete_expense(:'X1'::uuid);
select set_config('test.uid',:'D',false); select public.undo_delete_expense(:'X1'::uuid);
select set_config('test.uid',:'A',false); select public.undo_delete_expense(:'X3'::uuid);  -- live row
select public.undo_delete_expense('00000000-0000-0000-0000-00000000dead'::uuid); -- nonexistent
reset role; set role anon; select public.undo_delete_expense(:'X1'::uuid); reset role;
\echo ===== 5. Undo by A in window -> relinks both items
set role authenticated; select set_config('test.uid',:'A',false); select public.undo_delete_expense(:'X1'::uuid); reset role;
select id, status, expense_id is not null as linked, unlinked_from_expense_id from public.shopping_list_items where id::text like 'f1%' order by id;
select deleted_at is null as live, amount, description, paid_by, trip_id from public.expenses where id=:'X1';
\echo ---- undo twice
set role authenticated; select set_config('test.uid',:'A',false); select public.undo_delete_expense(:'X1'::uuid); reset role;
