\i hdr.sql
\pset format unaligned
\pset tuples_only on
\set ON_ERROR_STOP off
-- delete first (open), then lock, then undo
set role authenticated; select set_config('test.uid',:'A',false), set_config('test.anon','false',false) \g /dev/null
select public.delete_expense(:'X3'::uuid) \g /dev/null
select public.complete_trip(:'T1'::uuid) \g /dev/null
select public.undo_delete_expense(:'X3'::uuid);
reset role;
select 'X3 still hidden/marked=' || (deleted_at is not null) from public.expenses where id=:'X3';
set role authenticated; select 'A sees X3: ' || count(*) from public.expenses where id=:'X3'; reset role;
update public.expenses set deleted_at = clock_timestamp() - interval '45 seconds' where id=:'X3';
select 'erased ' || public.erase_expired_expenses();
select 'X3 exists=' || exists(select 1 from public.expenses where id=:'X3');
select 'live rows of locked trip untouched: ' || count(*) from public.expenses where trip_id=:'T1' and deleted_at is null;
