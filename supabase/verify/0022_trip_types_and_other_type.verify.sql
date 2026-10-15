-- Manual verification for migration 0022 (trip types and the Other trip type).
-- NOT a migration: it lives in supabase/verify/, not supabase/migrations/, because the Supabase CLI
-- applies every <number>_*.sql file in migrations/ and this one would collide with 0022's version. Run it once in the Supabase SQL
-- editor against each database (a non-production project first, then production) AFTER the
-- migration is applied, and keep the output with the QA report. It only reads the catalog.
--
-- Every row has a check name, the expected value and the actual value; `ok` must be true on every
-- row. PostgREST cannot read the catalog, which is why this is a script and not part of the live
-- vitest suite.

-- For the reviewer to read (not asserted): the CHECK definitions as Postgres stored them. This is
-- first on purpose: the Supabase SQL editor shows only the LAST statement's result, and the checks
-- table below must be the one you see.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.trips'::regclass and conname in ('trips_types_check', 'trips_other_type_check');

with checks as (
  -- Privileges on both create_trip overloads -------------------------------------------------
  select 'anon cannot execute create_trip (7 args)' as check_name, 'false' as expected,
         has_function_privilege('anon', 'public.create_trip(text, text, text, date, date, text[], text)', 'execute')::text as actual
  union all
  select 'anon cannot execute create_trip (5 args)', 'false',
         has_function_privilege('anon', 'public.create_trip(text, text, text, date, date)', 'execute')::text
  union all
  select 'authenticated can execute create_trip (7 args)', 'true',
         has_function_privilege('authenticated', 'public.create_trip(text, text, text, date, date, text[], text)', 'execute')::text
  union all
  select 'authenticated can execute create_trip (5 args)', 'true',
         has_function_privilege('authenticated', 'public.create_trip(text, text, text, date, date)', 'execute')::text
  union all
  select 'routine_privileges: no anon or PUBLIC grantee on any create_trip overload', '0',
         (select count(*)::text from information_schema.routine_privileges
           where routine_schema = 'public' and routine_name = 'create_trip'
             and grantee in ('anon', 'PUBLIC'))
  union all
  select 'routine_privileges: authenticated is a grantee on both create_trip overloads', '2',
         (select count(distinct specific_name)::text from information_schema.routine_privileges
           where routine_schema = 'public' and routine_name = 'create_trip' and grantee = 'authenticated')
  union all
  select 'two create_trip overloads exist', '2',
         (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'create_trip')
  union all
  select 'the 7-argument overload has no parameter defaults', '0',
         (select p.pronargdefaults::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'create_trip' and p.pronargs = 7)
  union all
  select 'the 7-argument overload is security definer with search_path = public', 'true',
         (select (p.prosecdef and 'search_path=public' = any (p.proconfig))::text
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'create_trip' and p.pronargs = 7)

  -- No UPDATE path on trips ------------------------------------------------------------------
  union all
  select 'authenticated has no table-level UPDATE on public.trips', 'false',
         has_table_privilege('authenticated', 'public.trips', 'update')::text
  union all
  select 'anon has no table-level UPDATE on public.trips', 'false',
         has_table_privilege('anon', 'public.trips', 'update')::text
  union all
  -- A column-level grant would survive the table-level revoke, so check every column.
  select 'no column of public.trips is UPDATE-able by anon or authenticated', '0',
         (select count(*)::text
            from information_schema.columns c, (values ('anon'), ('authenticated')) as r(role_name)
           where c.table_schema = 'public' and c.table_name = 'trips'
             and has_column_privilege(r.role_name, 'public.trips', c.column_name, 'update'))
  union all
  select 'no UPDATE policy exists on public.trips', '0',
         (select count(*)::text from pg_policies
           where schemaname = 'public' and tablename = 'trips' and cmd in ('UPDATE', 'ALL'))

  -- Columns and constraints ------------------------------------------------------------------
  union all
  select 'trips.types is text[] not null', 'ARRAY:NO',
         (select data_type || ':' || is_nullable from information_schema.columns
           where table_schema = 'public' and table_name = 'trips' and column_name = 'types')
  union all
  select 'trips.other_type is text, nullable, no default', 'text:YES:',
         (select data_type || ':' || is_nullable || ':' || coalesce(column_default, '')
            from information_schema.columns
           where table_schema = 'public' and table_name = 'trips' and column_name = 'other_type')
  union all
  select 'both CHECK constraints exist and are validated', '2',
         (select count(*)::text from pg_constraint
           where conrelid = 'public.trips'::regclass and contype = 'c' and convalidated
             and conname in ('trips_types_check', 'trips_other_type_check'))
  union all
  select 'no existing row violates trips_types_check', '0',
         (select count(*)::text from public.trips
           where not (cardinality(types) = 0
             or case when array_ndims(types) <> 1 then false
                else array_lower(types, 1) = 1 and cardinality(types) <= 3
                  and cardinality(array_remove(types, null)) = cardinality(types)
                  and types <@ array['camping', 'airbnb', 'international']::text[]
                  and (cardinality(types) < 2 or types[1] <> types[2])
                  and (cardinality(types) < 3 or (types[1] <> types[3] and types[2] <> types[3])) end))
  union all
  select 'no existing row has a non-null other_type outside the allowed shape', '0',
         (select count(*)::text from public.trips
           where other_type is not null and (char_length(other_type) not between 1 and 30 or other_type <> btrim(other_type)))

  -- The types CHECK expression itself, exercised on literal arrays (single-element, empty and
  -- boundary cases included). A CHECK passes when it evaluates to NULL, so "rejected" below means
  -- the expression is false, not merely not-true.
  union all
  select 'types CHECK accepts {}, each single type, both orders of two, and all three', '7',
         (select count(*)::text
            from (values ('{}'::text[]), ('{camping}'), ('{airbnb}'), ('{international}'),
                         ('{camping,airbnb}'), ('{airbnb,camping}'), ('{camping,airbnb,international}')) v(types)
           where coalesce(cardinality(types) = 0
             or case when array_ndims(types) <> 1 then false
                else array_lower(types, 1) = 1 and cardinality(types) <= 3
                  and cardinality(array_remove(types, null)) = cardinality(types)
                  and types <@ array['camping', 'airbnb', 'international']::text[]
                  and (cardinality(types) < 2 or types[1] <> types[2])
                  and (cardinality(types) < 3 or (types[1] <> types[3] and types[2] <> types[3])) end, true))
  union all
  select 'types CHECK rejects duplicates, unknown, wrong case, 4 elements, NULL elements', '8',
         (select count(*)::text
            from (values ('{camping,camping}'::text[]), ('{camping,airbnb,camping}'), ('{camping,airbnb,airbnb}'),
                         ('{bogus}'), ('{other}'), ('{Camping}'),
                         ('{camping,airbnb,international,camping}'), ('{camping,NULL}')) v(types)
           where not coalesce(cardinality(types) = 0
             or case when array_ndims(types) <> 1 then false
                else array_lower(types, 1) = 1 and cardinality(types) <= 3
                  and cardinality(array_remove(types, null)) = cardinality(types)
                  and types <@ array['camping', 'airbnb', 'international']::text[]
                  and (cardinality(types) < 2 or types[1] <> types[2])
                  and (cardinality(types) < 3 or (types[1] <> types[3] and types[2] <> types[3])) end, true))

  -- Public RPCs must not return the new columns ----------------------------------------------
  union all
  select 'get_trip_by_invite_code, get_trip_summary, join_trip, join_trip_by_id do not mention types or other_type', '0',
         (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname in ('get_trip_by_invite_code', 'get_trip_summary', 'join_trip', 'join_trip_by_id')
             and (pg_get_functiondef(p.oid) ~* '\mother_type\M' or pg_get_functiondef(p.oid) ~* '\mtypes\M'))
  union all
  select 'no function in public returns public.trips rows', '0',
         (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prorettype = 'public.trips'::regtype)
)
select check_name, expected, actual, (expected = actual) as ok
from checks
order by ok, check_name;
