\i hdr.sql
\pset format unaligned
\pset fieldsep ' | '
\pset tuples_only on
\echo ===== A: add expense via RPC claiming item f3 first? use B: B claims f3 already. B logs it.
set role authenticated; select set_config('test.uid',:'B',false), set_config('test.anon','false',false) \g /dev/null
select (public.add_expense_and_log_shopping_items(:'T1'::uuid, 9.50, 'bob buys', null, array['f3000000-0000-0000-0000-000000000003']::uuid[])).id as newid \gset
reset role;
select 'new expense deleted_at null? ' || (deleted_at is null) from public.expenses where id=:'newid';
select 'f3 status ' || status || ' linked=' || (expense_id = :'newid'::uuid) from public.shopping_list_items where id='f3000000-0000-0000-0000-000000000003';
\echo ===== B deletes it: f3 returns to claimed by B with marker
set role authenticated; select public.delete_expense(:'newid'::uuid) \g /dev/null
reset role;
select 'f3 ' || status || ' claimed_by_bob=' || (claimed_by='bb000000-0000-0000-0000-000000000002') || ' expense_id_null=' || (expense_id is null) || ' marker_set=' || (unlinked_from_expense_id=:'newid'::uuid) from public.shopping_list_items where id='f3000000-0000-0000-0000-000000000003';
\echo ===== concurrent claim between delete and Undo: Bob unclaims, A... (Carol is anon so use A claims)
set role authenticated; select set_config('test.uid',:'B',false) \g /dev/null
select public.unclaim_shopping_list_item('f3000000-0000-0000-0000-000000000003'::uuid) \g /dev/null
select set_config('test.uid',:'A',false) \g /dev/null
select public.claim_shopping_list_item('f3000000-0000-0000-0000-000000000003'::uuid) \g /dev/null
select set_config('test.uid',:'B',false) \g /dev/null
select public.undo_delete_expense(:'newid'::uuid) \g /dev/null
reset role;
select 'after undo f3 ' || status || ' claimer_is_alice=' || (claimed_by='aa000000-0000-0000-0000-000000000001') || ' linked=' || (expense_id is not null) || ' marker=' || coalesce(unlinked_from_expense_id::text,'null') from public.shopping_list_items where id='f3000000-0000-0000-0000-000000000003';
select 'expense live again ' || (deleted_at is null) from public.expenses where id=:'newid';
\echo ===== removed claimer: X7 with item f2 (claimed_by null, logged) -> delete -> open
set role authenticated; select set_config('test.uid',:'A',false) \g /dev/null
select public.delete_expense(:'X7'::uuid) \g /dev/null
reset role;
select 'f2 ' || status || ' claimed_by=' || coalesce(claimed_by::text,'null') || ' marker=' || coalesce(unlinked_from_expense_id::text,'null') from public.shopping_list_items where id='f2000000-0000-0000-0000-000000000002';
\echo -- undo: should NOT relink f2 (open) and clear marker
set role authenticated; select public.undo_delete_expense(:'X7'::uuid) \g /dev/null
reset role;
select 'f2 after undo ' || status || ' expense=' || coalesce(expense_id::text,'null') || ' marker=' || coalesce(unlinked_from_expense_id::text,'null') from public.shopping_list_items where id='f2000000-0000-0000-0000-000000000002';
\echo ===== claim/unclaim clear marker on intervening change: delete X1, bob... (items claimed by alice) unclaim then reclaim
set role authenticated; select public.delete_expense(:'X1'::uuid) \g /dev/null
select public.unclaim_shopping_list_item('f1000000-0000-0000-0000-000000000001'::uuid) \g /dev/null
select public.claim_shopping_list_item('f1000000-0000-0000-0000-000000000001'::uuid) \g /dev/null
reset role;
select 'f1 marker after unclaim+reclaim: ' || coalesce(unlinked_from_expense_id::text,'null') from public.shopping_list_items where id='f1000000-0000-0000-0000-000000000001';
select 'f1b marker (untouched): ' || coalesce(unlinked_from_expense_id::text,'null') from public.shopping_list_items where id='f1000000-0000-0000-0000-000000000011';
set role authenticated; select public.undo_delete_expense(:'X1'::uuid) \g /dev/null
reset role;
select 'f1 after undo ' || status || ' linked=' || (expense_id is not null) from public.shopping_list_items where id='f1000000-0000-0000-0000-000000000001';
select 'f1b after undo ' || status || ' linked=' || (expense_id is not null) from public.shopping_list_items where id='f1000000-0000-0000-0000-000000000011';
\echo ===== member-removal trigger with the new column: remove Alice (claimer) while X1 deleted; item has marker
set role authenticated; select public.delete_expense(:'X1'::uuid) \g /dev/null
reset role;
delete from public.trip_members where id='aa000000-0000-0000-0000-000000000001';
select 'after claimer removal: ' || id || ' ' || status || ' claimed_by=' || coalesce(claimed_by::text,'null') || ' marker=' || coalesce(unlinked_from_expense_id::text,'null') from public.shopping_list_items where id::text like 'f1%' order by id;
