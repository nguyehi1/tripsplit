import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * QA coverage for pre-push review fix 1 (simplified-onboarding): `get_trip_summary` must now also
 * return `invite_code` so `TripSummaryOnly` (src/app/trip/[id]/page.tsx) can route a bare
 * `/trip/[id]` visitor's "See full details" link through the same `invite=<code>` -> `/api/join`
 * mechanism `/join/[code]` uses, instead of leaving them verified but never joined. Same
 * constraint as migrations 0010/0011's tests — no live/staging Supabase project available to this
 * repo, so this proves the migration file's shape rather than running the SQL.
 */

const migrationPath = join(__dirname, "0012_add_invite_code_to_trip_summary.sql");
const sql = readFileSync(migrationPath, "utf8");

describe("migration 0012 — get_trip_summary returns invite_code (pre-push review fix 1)", () => {
  it("drops the old function before recreating it (the return type is changing)", () => {
    const dropIndex = sql.indexOf("drop function if exists public.get_trip_summary(uuid);");
    const createIndex = sql.indexOf("create or replace function public.get_trip_summary(_trip_id uuid)");
    expect(dropIndex).toBeGreaterThanOrEqual(0);
    expect(createIndex).toBeGreaterThan(dropIndex);
  });

  it("adds invite_code to the returns table", () => {
    const start = sql.indexOf("returns table (");
    const end = sql.indexOf(")", start);
    const returnsClause = sql.slice(start, end);
    expect(returnsClause).toContain("member_id uuid");
    expect(returnsClause).toContain("display_name text");
    expect(returnsClause).toContain("paid_cents bigint");
    expect(returnsClause).toContain("share_cents bigint");
    expect(returnsClause).toContain("invite_code text");
  });

  it("selects invite_code from public.trips keyed by _trip_id in the function body", () => {
    expect(sql).toContain("(select invite_code from public.trips where id = _trip_id)");
  });

  it("preserves the existing balance-math predicate untouched", () => {
    expect(sql).toContain(
      "(select total_cents from total) / (select member_count from n)\n      + case when rm.rn <= (select total_cents from total) % (select member_count from n) then 1 else 0 end,",
    );
  });

  it("keeps the security definer, search_path, and anon+authenticated grant (same public exposure as get_trip_by_invite_code)", () => {
    expect(sql).toContain("language sql security definer set search_path = public");
    expect(sql).toContain("revoke execute on function public.get_trip_summary(uuid) from public;");
    expect(sql).toContain("grant execute on function public.get_trip_summary(uuid) to anon, authenticated;");
  });
});
