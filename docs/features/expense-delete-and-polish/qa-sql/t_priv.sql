\echo == function privileges (anon / authenticated / public-via-nobody)
select p.proname,
  has_function_privilege('anon',p.oid,'execute') as anon,
  has_function_privilege('authenticated',p.oid,'execute') as authd,
  has_function_privilege('service_role',p.oid,'execute') as svc,
  (select coalesce(bool_or(a.grantee=0),false) from aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a) as public_grant
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('erase_expired_expenses','erase_expired_expenses_batch','expense_undo_accept_interval','expense_erase_after_interval','delete_expense','undo_delete_expense','get_trip_summary','claim_shopping_list_item','unclaim_shopping_list_item','complete_trip')
order by 1;
\echo == table privileges expenses
select grantee, privilege_type from information_schema.role_table_grants where table_name='expenses' and table_schema='public' and grantee in ('anon','authenticated','PUBLIC') order by 1,2;
select grantee, column_name, privilege_type from information_schema.column_privileges where table_name='expenses' and table_schema='public' and grantee in ('anon','authenticated') and privilege_type='UPDATE' order by 1,2;
\echo == attributes of definer functions
select proname, prosecdef, proconfig, pronargs, pronargdefaults from pg_proc where proname in ('delete_expense','undo_delete_expense','erase_expired_expenses','erase_expired_expenses_batch','get_trip_summary') order by 1;
\echo == triggers on expenses / publication
select tgname from pg_trigger where tgrelid in ('public.expenses'::regclass,'public.shopping_list_items'::regclass) and not tgisinternal;
select pubname, schemaname, tablename from pg_publication_tables where tablename in ('expenses','shopping_list_items');
select pubname from pg_publication;
\echo == rls
select relname, relrowsecurity from pg_class where relname='expenses';
