-- Closes the blocking gap in docs/reviews/security-compliance/project/security-review-2026-09-17-followup.md finding #1: the
-- Upstash-backed rate limiter in src/lib/rate-limit.ts only sits in front of this app's own
-- /api/* routes. A caller who skips splitiful.app and hits Supabase's own PostgREST endpoint
-- directly with the public anon/publishable key -- verified live in that report -- reaches
-- get_trip_by_invite_code and join_trip completely unthrottled, since Vercel's edge (where the
-- app-level limiter runs) is never in that request's path at all.
--
-- The only layer every call to these RPCs passes through, app-routed or direct, is Postgres
-- itself. So the throttle moves here, per the follow-up report's "what would actually close
-- this" option (b) (docs/ROADMAP.md's invite-code-rpc-hardening entry picks this over option
-- (a) -- revoking the grants and routing through a new service-role key -- since join_trip's
-- verification guard (migration 0010) depends on the caller's own auth.uid()/auth.jwt(), which a
-- service-role call wouldn't carry without re-deriving it server-side anyway).
--
-- Two different identities are available depending on the RPC:
--   - join_trip requires `authenticated` (grant unchanged), so auth.uid() is a JWT-verified,
--     unspoofable identity -- an attacker who wants a fresh bucket must mint a brand-new
--     anonymous session (supabase.auth.signInAnonymously()), not just resend a request with a
--     different header.
--   - get_trip_by_invite_code is deliberately callable by `anon` (zero-auth invite-link preview,
--     see docs/features/simplified-onboarding) -- there is no session to key off, so this one
--     falls back to the same x-forwarded-for signal src/lib/rate-limit.ts already trusts, read
--     here from PostgREST's `request.headers` GUC. That carries the same caveat
--     docs/reviews/security-compliance/project/security-review-2026-09-17-followup.md finding #3 raises for the app-level limiter
--     (spoofable if whatever sits in front of PostgREST ever appends rather than overwrites the
--     header) -- not a guarantee, but it closes the gap finding #1 actually named: today this
--     path has *zero* throttling of any kind, not "the same imperfect throttling the app path
--     gets."
--
-- Both throttles are enforced inside the functions themselves (not a wrapping trigger or
-- separate gate callers could route around), so there's no second door left open.

create table if not exists public.rpc_rate_limits (
  bucket_key text primary key,
  window_start timestamptz not null,
  attempt_count integer not null
);

-- Never exposed via PostgREST: no grants to anon/authenticated below, and RLS with no policies
-- denies every row to every role as a second layer even if a grant were ever added by mistake.
alter table public.rpc_rate_limits enable row level security;

-- Called only from inside the security-definer RPCs below, so it runs with their already-
-- elevated privileges for the duration of that call -- it doesn't need its own grants. Raises
-- rather than returning a boolean so a call site can't forget to check a return value.
--
-- Every reference to the target table's own columns in the `do update set` below is schema-
-- and-table-qualified (`rpc_rate_limits.window_start`, not bare `window_start`) -- required,
-- not stylistic: an upsert's `excluded` pseudo-relation has the same column names as the
-- insert's target list, so a bare reference is genuinely ambiguous between "the row's existing
-- value" and "the value just proposed for insertion" whenever, as here, both relations share a
-- column name. Verified live against a throwaway Postgres instance: the unqualified version
-- fails with `column reference "window_start" is ambiguous` on every call, not just on an
-- actual conflict.
create or replace function public.throttle_rpc(_bucket_key text, _limit integer, _window_seconds integer)
returns void
language plpgsql set search_path = public as $$
declare _count integer;
begin
  insert into public.rpc_rate_limits (bucket_key, window_start, attempt_count)
  values (_bucket_key, now(), 1)
  on conflict (bucket_key) do update set
    window_start = case
      when rpc_rate_limits.window_start <= now() - make_interval(secs => _window_seconds) then now()
      else rpc_rate_limits.window_start
    end,
    attempt_count = case
      when rpc_rate_limits.window_start <= now() - make_interval(secs => _window_seconds) then 1
      else rpc_rate_limits.attempt_count + 1
    end
  returning attempt_count into _count;

  if _count > _limit then
    raise exception 'rate limited: try again shortly';
  end if;
end;
$$;

-- get_trip_by_invite_code -------------------------------------------------------
-- Signature/return type/behavior otherwise unchanged (still anon+authenticated, still a pure
-- lookup) -- language changes from sql to plpgsql only because the throttle check needs
-- procedural control flow (raise on failure) before the query runs.

create or replace function public.get_trip_by_invite_code(_code text)
returns table (
  trip_id uuid,
  name text,
  location text,
  starts_on date,
  ends_on date,
  is_completed boolean,
  organizer_name text
)
language plpgsql security definer set search_path = public as $$
declare _ip text;
begin
  _ip := coalesce(
    nullif(
      split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1),
      ''
    ),
    'unknown'
  );
  perform public.throttle_rpc('invite-lookup:' || _ip, 20, 60);

  return query
    select
      t.id, t.name, t.location, t.starts_on, t.ends_on, t.completed_at is not null,
      m.display_name
    from public.trips t
    left join public.trip_members m on m.trip_id = t.id and m.user_id = t.created_by
    where t.invite_code = _code;
end;
$$;
revoke execute on function public.get_trip_by_invite_code(text) from public;
grant execute on function public.get_trip_by_invite_code(text) to anon, authenticated;

-- join_trip -----------------------------------------------------------------------
-- Signature/return type/behavior otherwise unchanged from migration 0010 (verification guard
-- kept as-is) -- only the throttle check is added, keyed by auth.uid() since this RPC is
-- authenticated-only.

create or replace function public.join_trip(_invite_code text, _display_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare _trip_id uuid;
begin
  perform public.throttle_rpc('join-trip:' || auth.uid()::text, 10, 60);

  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'confirm your email before joining a trip';
  end if;

  select id into _trip_id from public.trips where invite_code = _invite_code;
  if _trip_id is null then
    raise exception 'invalid invite code';
  end if;

  insert into public.trip_members (trip_id, user_id, display_name)
  values (_trip_id, auth.uid(), _display_name)
  on conflict (trip_id, user_id) do update set display_name = excluded.display_name;

  return _trip_id;
end;
$$;
revoke execute on function public.join_trip(text, text) from public;
grant execute on function public.join_trip(text, text) to authenticated;
