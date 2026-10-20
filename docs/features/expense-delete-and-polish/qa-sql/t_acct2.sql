\i hdr.sql
\pset format unaligned
\pset tuples_only on
\set ON_ERROR_STOP off
alter table auth.users add column if not exists email text;
create table if not exists auth.refresh_tokens(user_id text, updated_at timestamptz);
insert into public.expenses(id,trip_id,paid_by,amount,description) values ('ec000000-0000-0000-0000-00000000000c',:'T1',:'C',3,'anon-paid');
update public.expenses set deleted_at = clock_timestamp() where id='ec000000-0000-0000-0000-00000000000c';
update auth.users set created_at = now() - interval '200 days', last_sign_in_at = now() - interval '200 days' where id=:'C';
select 'purged ' || public.purge_abandoned_anonymous_users(90) || ' (expect 0, C has a marked expense)';
select 'C exists=' || exists(select 1 from auth.users where id=:'C');
\echo -- after erase, purge removes C
update public.expenses set deleted_at = clock_timestamp() - interval '60 seconds' where id='ec000000-0000-0000-0000-00000000000c';
select 'erased ' || public.erase_expired_expenses();
select 'purged ' || public.purge_abandoned_anonymous_users(90);
select 'C exists=' || exists(select 1 from auth.users where id=:'C');
\echo ===== trip cascade deletes marked rows too (T3 has no list items)
set role authenticated; select set_config('test.uid',:'A',false), set_config('test.anon','false',false) \g /dev/null
select public.delete_expense(:'X6'::uuid);
reset role;
delete from public.trips where id=:'T3';
select 'T3 expenses left ' || count(*) from public.expenses where trip_id=:'T3';
