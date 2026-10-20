\i hdr.sql
\echo ===== direct DML as authenticated (A payer)
set role authenticated; select set_config('test.uid',:'A',false), set_config('test.anon','false',false);
\echo -- DELETE as payer
delete from public.expenses where id=:'X3';
\echo -- DELETE as payer on a locked trip
delete from public.expenses where id=:'X5';
select set_config('test.uid',:'B',false);
\echo -- DELETE as other member
delete from public.expenses where id=:'X3';
select set_config('test.uid',:'D',false);
\echo -- DELETE as non-member
delete from public.expenses where id=:'X3';
reset role; set role anon;
\echo -- DELETE as anon role
delete from public.expenses where id=:'X3';
reset role;
select count(*) as x3_still_there from public.expenses where id=:'X3';
\echo ===== direct UPDATE
set role authenticated; select set_config('test.uid',:'A',false);
\echo -- update deleted_at (expect permission denied)
update public.expenses set deleted_at = now() - interval '1 hour' where id=:'X3';
\echo -- update paid_by
update public.expenses set paid_by=:'B' where id=:'X3';
\echo -- update trip_id
update public.expenses set trip_id=:'T3' where id=:'X3';
\echo -- update amount/desc/date on own live row (expect UPDATE 1)
update public.expenses set amount=11.11, description='edited', date=current_date where id=:'X3';
\echo -- update other member row (0 rows)
update public.expenses set amount=1 where id=:'X2';
\echo -- update returning * (select of unmarked works)
update public.expenses set amount=12.34 where id=:'X3' returning amount;
\echo -- update locked trip row
update public.expenses set amount=1 where id=:'X5';
reset role;
\echo -- marked row cannot be updated: delete X3 via RPC then try update
set role authenticated; select set_config('test.uid',:'A',false); select public.delete_expense(:'X3'::uuid);
update public.expenses set amount=99 where id=:'X3';
reset role;
select amount, deleted_at is not null as marked from public.expenses where id=:'X3';
\echo ===== direct INSERT
set role authenticated; select set_config('test.uid',:'A',false);
\echo -- insert paid_by=B (expect RLS violation)
insert into public.expenses(trip_id,paid_by,amount,description) values (:'T1',:'B',1,'x');
\echo -- insert with deleted_at set
insert into public.expenses(trip_id,paid_by,amount,description,deleted_at) values (:'T1',:'A',1,'x',now());
\echo -- insert normal paid_by=A
insert into public.expenses(trip_id,paid_by,amount,description) values (:'T1',:'A',1,'ok') returning deleted_at;
\echo -- insert on locked trip
insert into public.expenses(trip_id,paid_by,amount,description) values (:'T2',:'A',1,'x');
\echo -- insert by anon-session member C (unverified)
select set_config('test.uid',:'C',false), set_config('test.anon','true',false);
insert into public.expenses(trip_id,paid_by,amount,description) values (:'T1',:'C',1,'x');
reset role;
\echo ===== add_expense_and_log_shopping_items still works
set role authenticated; select set_config('test.uid',:'A',false), set_config('test.anon','false',false);
\df+ public.add_expense_and_log_shopping_items
reset role;
