\i hdr.sql
\pset format unaligned
\pset tuples_only on
\set ON_ERROR_STOP off
\echo ===== unverified (anonymous session) payer
insert into public.expenses(id,trip_id,paid_by,amount,description) values ('ec000000-0000-0000-0000-00000000000c',:'T1',:'C',3,'anon-paid');
set role authenticated; select set_config('test.uid',:'C',false), set_config('test.anon','true',false) \g /dev/null
select public.delete_expense('ec000000-0000-0000-0000-00000000000c'::uuid);
reset role;
update public.expenses set deleted_at = clock_timestamp() where id='ec000000-0000-0000-0000-00000000000c';
set role authenticated;
select public.undo_delete_expense('ec000000-0000-0000-0000-00000000000c'::uuid);
reset role;
update public.expenses set deleted_at = null where id='ec000000-0000-0000-0000-00000000000c';
\echo ===== rate limit: 20 ok then 21st rejected (delete/undo share a bucket)
set role authenticated; select set_config('test.uid',:'A',false), set_config('test.anon','false',false) \g /dev/null
select 'call ' || n || ': ' from generate_series(1,1) n \g /dev/null
do $$
declare i int; ok int := 0; err text;
begin
  for i in 1..11 loop
    begin
      perform public.delete_expense('e3000000-0000-0000-0000-000000000003'::uuid);
      ok := ok + 1;
      perform public.undo_delete_expense('e3000000-0000-0000-0000-000000000003'::uuid);
      ok := ok + 1;
    exception when others then
      err := sqlerrm;
      raise notice 'failed at successful-count % : % (state %)', ok, err, sqlstate;
      exit;
    end;
  end loop;
  raise notice 'total successes %', ok;
end $$;
reset role;
select 'bucket rows: ' || bucket_key || ' count=' || attempt_count from public.rpc_rate_limits where bucket_key like 'expense-change:%';
