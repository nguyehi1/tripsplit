\i hdr.sql
select pg_sleep(0.7);
\timing on
select 'erase while locked returned ' || public.erase_expired_expenses();
select 'exists=' || exists(select 1 from public.expenses where id=:'X2');
select pg_sleep(2);
select 'erase after unlock returned ' || public.erase_expired_expenses();
select 'exists=' || exists(select 1 from public.expenses where id=:'X2');
