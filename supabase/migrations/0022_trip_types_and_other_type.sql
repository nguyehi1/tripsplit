-- Trip types and the "Other" trip type (starter lists, 0.8.0). Adds two columns to public.trips,
-- a CHECK on each, and a seven-argument create_trip overload that sets them.
--
--   * trips.types       text[] not null default '{}' — the catalog types the organizer picked, in
--                       pick order. A closed set of fixed codes (camping, airbnb, international),
--                       at most three, no duplicates. Free text never goes in here and there is
--                       no 'other' code.
--   * trips.other_type  text, nullable, no default — the short plain-text label an organizer typed
--                       under "Other". "Other" is represented ONLY by this column being non-null.
--
-- other_type — purpose and access, kept as a SQL comment on purpose (a COMMENT ON COLUMN would be
-- published in PostgREST's OpenAPI document):
--   * Purpose: to decide which trip types to add next. It is read only in aggregate, by the
--     operator, by manual query, and is not joined to identity. Nothing in the app reads it back.
--   * Access: any trip member, including an anonymous joiner holding the invite link, can read the
--     column through the API under the existing trips SELECT policy (RLS is row-level). That is
--     accepted. It must NEVER be added to the return type of any RPC that serves non-members
--     (get_trip_by_invite_code, get_trip_summary, join_trip, join_trip_by_id) — this migration
--     does not redefine any of them.
--   * Deleted with the trip (cascade via created_by) and by the 90-day anonymous purge (0018);
--     cleared by the operator when an organizer is erased but the trip is kept — see
--     docs/runbooks/account-deletion-and-export.md.
--
-- Validation lives in CHECK constraints on the columns, not only in create_trip, because trips
-- has a direct INSERT policy (created_by = auth.uid()) and anonymous sessions use the
-- authenticated role. A CHECK that evaluates to NULL PASSES, so every predicate below is written
-- to be null-free for any non-null input. The CHECKs are inline expressions rather than a helper
-- function: every function in public is an /rpc endpoint by default.
--
-- create_trip: the five-argument function (0001, grants in 0002/0003) is left completely alone.
-- The new seven-argument overload has NO parameter defaults, so a PostgREST call with the five
-- old named arguments can match only the old overload (no PGRST203) and a seven-argument call
-- only the new one. Release order: apply this migration BEFORE deploying the app; new app code
-- selects trips.types.
--
-- No UPDATE path is added: there is no UPDATE policy on trips, and the table-level UPDATE privilege
-- is revoked below as defence in depth (complete_trip is security definer and unaffected).

begin;

alter table public.trips
  add column types text[] not null default '{}'::text[],
  add column other_type text;

-- types: every atom is null-free. The empty-array guard is required (array_ndims('{}') is NULL).
-- The CASE keeps array_remove from ever seeing a multi-dimensional array, which it rejects.
alter table public.trips
  add constraint trips_types_check check (
    cardinality(types) = 0
    or case
      when array_ndims(types) <> 1 then false
      else array_lower(types, 1) = 1
        and cardinality(types) <= 3
        and cardinality(array_remove(types, null)) = cardinality(types)
        and types <@ array['camping', 'airbnb', 'international']::text[]
        -- Duplicates: compare only positions that exist. Plain IS DISTINCT FROM is wrong here,
        -- because for a one- or two-element array the missing slots are both NULL and
        -- NULL IS DISTINCT FROM NULL is false, which would reject every one-type trip. NULL
        -- elements were already excluded above, so <> cannot return NULL for existing slots.
        and (cardinality(types) < 2 or types[1] <> types[2])
        and (cardinality(types) < 3 or (types[1] <> types[3] and types[2] <> types[3]))
    end
  );

-- other_type: 1-30 characters, at most 120 bytes, equal to its own trim (btrim() with no argument
-- trims ASCII space only), no double spaces, first character a letter or digit, every character on
-- an explicit code-point allowlist. The allowlist is written with \uXXXX escapes so it does not
-- depend on the database collation (Postgres has no \p{L}, and [[:alpha:]] follows the collation).
-- BMP only: this blocks every emoji, flag and tag sequence by construction. Invisible and format
-- characters (ZWSP, ZWJ, bidi controls, BOM, soft hyphen, U+034F, ...) are outside the allowlist.
-- The class strings below must stay identical to src/lib/validation/trip-type.ts (drift test).
alter table public.trips
  add constraint trips_other_type_check check (
    other_type is null or (
      char_length(other_type) between 1 and 30
      and octet_length(other_type) <= 120
      and other_type = btrim(other_type)
      and other_type !~ '  '
      and other_type ~ '^[A-Za-z0-9\u00AA\u00B5\u00BA\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u0386\u0388-\u05FF\u0606-\u061B\u061D-\u06DC\u06DE-\u070E\u0710-\u088F\u0892-\u08E1\u08E3-\u115E\u1161-\u167F\u1681-\u17B3\u17B6-\u180A\u1810-\u1AAF\u1B00-\u1DBF\u1E00-\u1FEE\u1FF0-\u1FFC\u1FFE-\u1FFF\u2C00-\u2DFF\u3005-\u3007\u3041-\u3096\u3099-\u309F\u30A1-\u30FF\u3105-\u312F\u3131-\u3163\u3165-\u318E\u31A0-\u31BF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\uD7FF\uF900-\uFA6B\uFA6D-\uFACE\uFAD2-\uFAD4\uFAD8-\uFD3D\uFD40-\uFDCF\uFDF0-\uFDFB\uFE70-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFF9F\uFFA1-\uFFDC]'
      and other_type ~ '^[A-Za-z0-9\u00AA\u00B5\u00BA\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u034E\u0350-\u037D\u037F-\u0386\u0388-\u05FF\u0606-\u061B\u061D-\u06DC\u06DE-\u070E\u0710-\u088F\u0892-\u08E1\u08E3-\u115E\u1161-\u167F\u1681-\u17B3\u17B6-\u180A\u1810-\u1FEE\u1FF0-\u1FFC\u1FFE-\u1FFF\u2C00-\u2DFF\u3005-\u3007\u3041-\u3096\u3099-\u309F\u30A1-\u30FF\u3105-\u312F\u3131-\u3163\u3165-\u318E\u31A0-\u31BF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\uD7FF\uF900-\uFA6B\uFA6D-\uFACE\uFAD2-\uFAD4\uFAD8-\uFD3D\uFD40-\uFDCF\uFDF0-\uFDFB\uFE20-\uFE2F\uFE70-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFF9F\uFFA1-\uFFDC &,./''-]+$'
    )
  );

-- Defence in depth for "no UPDATE path": no policy exists, and now no privilege either, so an
-- attempted update fails with "permission denied". Same precedent as shopping_list_items (0015).
revoke update on public.trips from anon, authenticated;

create or replace function public.create_trip(
  _name text,
  _display_name text,
  _location text,
  _starts_on date,
  _ends_on date,
  _types text[],
  _other_type text
)
returns table (trip_id uuid, invite_code text)
language plpgsql security definer set search_path = public as $$
declare _trip_id uuid;
declare _invite_code text;
declare _clean_other text;
begin
  -- NFC, collapse runs of spaces, trim. A bad value is NOT blanked or dropped: it goes into the
  -- insert and trips_other_type_check rejects it (23514), so a rejected value can never silently
  -- become a trip without it. normalize() needs Postgres 13+ and a UTF8 database.
  if _other_type is not null then
    _clean_other := btrim(regexp_replace(normalize(_other_type, NFC), ' {2,}', ' ', 'g'));
  end if;

  insert into public.trips (name, location, starts_on, ends_on, created_by, types, other_type)
  values (_name, _location, _starts_on, _ends_on, auth.uid(), coalesce(_types, '{}'::text[]), _clean_other)
  returning id, public.trips.invite_code into _trip_id, _invite_code;

  insert into public.trip_members (trip_id, user_id, display_name)
  values (_trip_id, auth.uid(), _display_name);

  return query select _trip_id, _invite_code;
end;
$$;
-- Revoking from public does not remove the separate anon grant (see 0002/0003), so both are explicit.
revoke execute on function public.create_trip(text, text, text, date, date, text[], text) from public;
revoke execute on function public.create_trip(text, text, text, date, date, text[], text) from anon;
grant execute on function public.create_trip(text, text, text, date, date, text[], text) to authenticated;

notify pgrst, 'reload schema';

commit;
