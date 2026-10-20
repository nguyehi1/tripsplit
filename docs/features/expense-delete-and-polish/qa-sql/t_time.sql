\i hdr.sql
\pset format unaligned
\pset tuples_only on
\set ON_ERROR_STOP off
\echo ===== 1. Undo boundary 14.9 / 15.1
set role authenticated; select set_config('test.uid',:'A',false), set_config('test.anon','false',false) \g /dev/null
select public.delete_expense(:'X3'::uuid) \g /dev/null
select public.delete_expense(:'X1'::uuid) \g /dev/null
reset role;
update public.expenses set deleted_at = clock_timestamp() - interval '14.9 seconds' where id=:'X3';
update public.expenses set deleted_at = clock_timestamp() - interval '15.1 seconds' where id=:'X1';
set role authenticated; select set_config('test.uid',:'A',false), set_config('test.anon','false',false) \g /dev/null
select 'undo@14.9 ok' from (select public.undo_delete_expense(:'X3'::uuid)) s;
select 'undo@15.1 (expect error next)';
select public.undo_delete_expense(:'X1'::uuid);
reset role;
select 'X3 live=' || (deleted_at is null) from public.expenses where id=:'X3';
select 'X1 marked=' || (deleted_at is not null) from public.expenses where id=:'X1';
\echo ===== 2. erase privileges as clients
set role authenticated; select set_config('test.uid',:'A',false), set_config('test.anon','false',false) \g /dev/null
select public.erase_expired_expenses();
select public.erase_expired_expenses_batch();
reset role; set role anon; select public.erase_expired_expenses(); reset role;
set role service_role; select public.erase_expired_expenses(); reset role;
\echo ===== 3. erase predicate as owner: X1 marked 15.1s (not yet eligible, <30s) survives; 29s survives; live survives; 31s erased; locked-trip 31s erased
update public.expenses set deleted_at = clock_timestamp() - interval '29 seconds' where id=:'X1';
update public.expenses set deleted_at = clock_timestamp() - interval '31 seconds', amount=amount where id=:'X2';  -- X2 is Bob's (T1)
update public.expenses set deleted_at = clock_timestamp() - interval '40 seconds' where id=:'X5';  -- locked trip
select 'erased count=' || public.erase_expired_expenses();
select 'X1(29s) exists=' || exists(select 1 from public.expenses where id=:'X1');
select 'X2(31s) exists=' || exists(select 1 from public.expenses where id=:'X2');
select 'X5(locked,40s) exists=' || exists(select 1 from public.expenses where id=:'X5');
select 'X3 live exists=' || exists(select 1 from public.expenses where id=:'X3');
select 'X4 live exists=' || exists(select 1 from public.expenses where id=:'X4');
select 'X6 other trip live exists=' || exists(select 1 from public.expenses where id=:'X6');
select 'locked-trip item f5: ' || status || ' expense=' || coalesce(expense_id::text,'null') from public.shopping_list_items where id='f5000000-0000-0000-0000-000000000005';
\echo ===== 4. cron-absent opportunistic: backdate X1 to 60s then A deletes X3 -> X1 erased by the batch
update public.expenses set deleted_at = clock_timestamp() - interval '60 seconds' where id=:'X1';
set role authenticated; select set_config('test.uid',:'A',false), set_config('test.anon','false',false) \g /dev/null
select public.delete_expense(:'X3'::uuid) \g /dev/null
reset role;
select 'X1 exists after opportunistic=' || exists(select 1 from public.expenses where id=:'X1');
select 'X3 marked=' || (deleted_at is not null) from public.expenses where id=:'X3';
select 'f1 items after erase: ' || id || ' ' || status || ' exp=' || coalesce(expense_id::text,'null') || ' mark=' || coalesce(unlinked_from_expense_id::text,'null') from public.shopping_list_items where id::text like 'f1%';
\echo ===== 5. delete-undo-delete: second delete gets fresh mark, never extends
set role authenticated; select set_config('test.uid',:'A',false), set_config('test.anon','false',false) \g /dev/null
select public.undo_delete_expense(:'X3'::uuid) \g /dev/null
select public.delete_expense(:'X3'::uuid) \g /dev/null
reset role;
select 'X3 marked=' || (deleted_at is not null) || ' fresh(<2s)=' || (clock_timestamp()-deleted_at < interval '2 seconds') from public.expenses where id=:'X3';
\echo ===== 6. Undo after erase
update public.expenses set deleted_at = clock_timestamp() - interval '40 seconds' where id=:'X3';
select public.erase_expired_expenses() \g /dev/null
set role authenticated; select set_config('test.uid',:'A',false), set_config('test.anon','false',false) \g /dev/null
select public.undo_delete_expense(:'X3'::uuid);
reset role;
