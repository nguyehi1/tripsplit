\i hdr.sql
begin;
select 's1 locked' , id from public.expenses where id=:'X2' for update;
select pg_sleep(2);
commit;
