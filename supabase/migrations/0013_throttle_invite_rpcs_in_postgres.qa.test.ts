import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * QA coverage for the invite-code-rpc-hardening follow-up
 * (docs/security-review-2026-09-17-followup.md finding #1 / docs/ROADMAP.md's
 * invite-code-rpc-hardening entry, remediation option (b)). Same constraint as migrations
 * 0010/0011/0012's tests -- no live/staging Supabase project available to this repo, so this
 * proves the migration file's shape rather than running the SQL.
 *
 * That blind spot is not hypothetical: the first version of this migration shipped with
 * `throttle_rpc`'s `on conflict ... do update set` referencing `window_start`/`attempt_count`
 * unqualified, which Postgres rejects as ambiguous (an upsert's `excluded` pseudo-relation has
 * the same column names as the insert's target list) -- a bug this text-matching suite couldn't
 * catch since it never executes the SQL, and one that would have made every call to either RPC
 * fail on migration 0013's very first statement, verified live against a throwaway Postgres 10
 * instance (`initdb`/`pg_ctl`, schema stubbing `public.trips`/`public.trip_members`/`auth.uid()`/
 * `auth.jwt()`) before and after the fix. The tests below at least pin the specific fix in place
 * (qualified references) so a future edit can't silently reintroduce the same ambiguity.
 */

const migrationPath = join(__dirname, "0013_throttle_invite_rpcs_in_postgres.sql");
const sql = readFileSync(migrationPath, "utf8");

describe("migration 0013 — throttle get_trip_by_invite_code and join_trip inside Postgres", () => {
  it("creates a rate-limit table with no public grants, RLS enabled", () => {
    expect(sql).toContain("create table public.rpc_rate_limits");
    expect(sql).toContain("alter table public.rpc_rate_limits enable row level security");
    expect(sql).not.toMatch(/grant .* on (table )?public\.rpc_rate_limits/);
  });

  it("defines a shared throttle_rpc helper that raises once the limit is exceeded", () => {
    expect(sql).toContain("create or replace function public.throttle_rpc(_bucket_key text, _limit integer, _window_seconds integer)");
    expect(sql).toContain("if _count > _limit then");
    expect(sql).toContain("raise exception 'rate limited: try again shortly';");
  });

  it("qualifies every column reference inside throttle_rpc's CASE expressions (bare references are ambiguous against `excluded`, verified live) — the SET clause's own bare target column names (`window_start =`, `attempt_count =`) are unaffected, since a SET target can't be table-qualified", () => {
    const start = sql.indexOf("on conflict (bucket_key) do update set");
    const end = sql.indexOf("returning attempt_count into _count", start);
    const setClause = sql.slice(start, end);
    // every `case`...`end` block's condition/branches must reference these columns qualified
    const caseBlocks = setClause.match(/case[\s\S]*?end/g) ?? [];
    expect(caseBlocks.length).toBeGreaterThan(0);
    for (const block of caseBlocks) {
      const bareWindowStart = block.match(/(?<!rpc_rate_limits\.)\bwindow_start\b/g) ?? [];
      const bareAttemptCount = block.match(/(?<!rpc_rate_limits\.)\battempt_count\b/g) ?? [];
      expect(bareWindowStart).toEqual([]);
      expect(bareAttemptCount).toEqual([]);
    }
    expect(setClause).toContain("rpc_rate_limits.window_start");
    expect(setClause).toContain("rpc_rate_limits.attempt_count");
  });

  it("guards the x-forwarded-for extraction against request.headers being an empty string, not just unset", () => {
    expect(sql).toContain("nullif(current_setting('request.headers', true), '')::json");
  });

  it("get_trip_by_invite_code moves from a pure sql function to plpgsql and throttles by IP before querying", () => {
    const start = sql.indexOf("create or replace function public.get_trip_by_invite_code");
    const end = sql.indexOf("grant execute on function public.get_trip_by_invite_code", start);
    const body = sql.slice(start, end);
    expect(body).toContain("language plpgsql security definer set search_path = public");
    expect(body).toContain("nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for'");
    expect(body).toContain("perform public.throttle_rpc('invite-lookup:' || _ip, 20, 60);");
    // the throttle check must run before the query, not after
    expect(body.indexOf("perform public.throttle_rpc")).toBeLessThan(body.indexOf("return query"));
  });

  it("keeps get_trip_by_invite_code's public exposure and return shape unchanged", () => {
    expect(sql).toContain("revoke execute on function public.get_trip_by_invite_code(text) from public;");
    expect(sql).toContain("grant execute on function public.get_trip_by_invite_code(text) to anon, authenticated;");
    const start = sql.indexOf("returns table (", sql.indexOf("get_trip_by_invite_code"));
    const end = sql.indexOf(")", start);
    expect(sql.slice(start, end)).toContain("organizer_name text");
  });

  it("join_trip throttles by auth.uid() before the existing anonymity guard and invite-code lookup", () => {
    const start = sql.indexOf("create or replace function public.join_trip");
    const end = sql.indexOf("grant execute on function public.join_trip", start);
    const body = sql.slice(start, end);
    expect(body).toContain("perform public.throttle_rpc('join-trip:' || auth.uid()::text, 10, 60);");
    expect(body).toContain("if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then");
    expect(body).toContain("raise exception 'invalid invite code';");
    expect(body.indexOf("perform public.throttle_rpc")).toBeLessThan(body.indexOf("auth.jwt() ->> 'is_anonymous'"));
    expect(body.indexOf("auth.jwt() ->> 'is_anonymous'")).toBeLessThan(body.indexOf("invalid invite code"));
  });

  it("keeps join_trip's grant (authenticated only) and membership upsert unchanged", () => {
    expect(sql).toContain("revoke execute on function public.join_trip(text, text) from public;");
    expect(sql).toContain("grant execute on function public.join_trip(text, text) to authenticated;");
    expect(sql).toContain(
      "insert into public.trip_members (trip_id, user_id, display_name)\n  values (_trip_id, auth.uid(), _display_name)\n  on conflict (trip_id, user_id) do update set display_name = excluded.display_name;",
    );
  });
});
