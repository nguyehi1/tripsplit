\i hdr.sql
-- X3 aged 14s. S1 locks the row (as an erase batch would), keeps it 2s, deletes it, commits.
update public.expenses set deleted_at = clock_timestamp() - interval '14 seconds' where id=:'X3' and false;
begin;
select 's1 lock' , id from public.expenses where id=:'X2' for update;
select pg_sleep(2);
delete from public.expenses where id=:'X2';
commit;
select 's1 done';
