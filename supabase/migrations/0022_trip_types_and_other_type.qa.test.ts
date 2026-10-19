import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Static coverage for migration 0022 (trip types and the Other trip type). Same text-assertion
 * pattern as the other migration `.qa.test.ts` files. What these cannot prove (the CHECK accept
 * and reject matrix on real Postgres, grants, direct-INSERT rejection) is covered by
 * 0022_trip_types_and_other_type.live.qa.test.ts and the .verify.sql script, run by hand.
 */

const raw = readFileSync(join(__dirname, "0022_trip_types_and_other_type.sql"), "utf8");
// Comments describe the columns by name; assertions about code must not see them.
const sql = raw
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");
const flat = sql.replace(/\s+/g, " ");

describe("migration 0022: trip types and other_type", () => {
  it("is wrapped in begin; ... commit; and reloads the PostgREST schema", () => {
    expect(sql.trim().startsWith("begin;")).toBe(true);
    expect(sql.trim().endsWith("commit;")).toBe(true);
    expect(sql).toContain("notify pgrst, 'reload schema';");
  });

  it("adds the two columns with their exact definitions, guarded for a retried apply", () => {
    expect(flat).toContain("add column if not exists types text[] not null default '{}'::text[]");
    expect(flat).toContain("add column if not exists other_type text");
    expect(flat).not.toMatch(/other_type text (not null|default)/);
  });

  it("adds both named CHECKs inline, never not valid, each guarded by an existence check", () => {
    expect(sql).toContain("add constraint trips_types_check check (");
    expect(sql).toContain("add constraint trips_other_type_check check (");
    expect(sql).not.toMatch(/not valid/i);
    expect(sql).toContain("conname = 'trips_types_check'");
    expect(sql).toContain("conname = 'trips_other_type_check'");
  });

  it("types CHECK keeps the empty-array guard, the closed set, and a null-free shape", () => {
    expect(flat).toContain("cardinality(types) = 0 or case when array_ndims(types) <> 1 then false");
    expect(flat).toContain("cardinality(types) <= 3");
    expect(flat).toContain("cardinality(array_remove(types, null)) = cardinality(types)");
    expect(flat).toContain("types <@ array['camping', 'airbnb', 'international']::text[]");
    // Duplicate checks compare only slots that exist. `is distinct from` on a missing slot is the
    // bug that rejected every one-type trip: NULL IS DISTINCT FROM NULL is false.
    expect(flat).toContain("(cardinality(types) < 2 or types[1] <> types[2])");
    expect(flat).toContain("(cardinality(types) < 3 or (types[1] <> types[3] and types[2] <> types[3]))");
    expect(sql).not.toContain("is distinct from types[");
    expect(sql).not.toMatch(/types\[\d\] is distinct from/);
    expect(sql).not.toMatch(/'other'/);
  });

  it("other_type CHECK is null-or-valid with length, octet, trim, double-space and class rules", () => {
    expect(flat).toContain("other_type is null or (");
    expect(flat).toContain("char_length(other_type) between 1 and 30");
    expect(flat).toContain("octet_length(other_type) <= 120");
    expect(flat).toContain("other_type = btrim(other_type)");
    expect(sql).toContain("other_type !~ '  '");
    expect(sql).toMatch(/other_type ~ '\^\[[^\]]+\]'/);
    expect(sql).toMatch(/other_type ~ '\^\[[^\]]+\]\+\$'/);
  });

  it("revokes UPDATE on trips and adds no policy or column grant", () => {
    expect(sql).toContain("revoke update on public.trips from anon, authenticated;");
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).not.toMatch(/grant update/i);
  });

  it("adds a seven-argument create_trip overload with no parameter defaults", () => {
    const start = sql.indexOf("create or replace function public.create_trip(");
    expect(start).toBeGreaterThanOrEqual(0);
    const header = sql.slice(start, sql.indexOf("returns table", start));
    expect(header).toContain("_types text[]");
    expect(header).toContain("_other_type text");
    expect(header).not.toMatch(/default/i);
    expect(header.match(/^\s+_\w+ /gm)).toHaveLength(7);
    expect(sql).toContain("security definer set search_path = public");
    expect(sql).toContain("public.trips.invite_code");
  });

  it("grants only authenticated on the seven-argument signature, with explicit revokes", () => {
    const sig = "public.create_trip(text, text, text, date, date, text[], text)";
    expect(sql).toContain(`revoke execute on function ${sig} from public;`);
    expect(sql).toContain(`revoke execute on function ${sig} from anon;`);
    expect(sql).toContain(`grant execute on function ${sig} to authenticated;`);
    expect(sql).not.toMatch(/grant [^;]* to [^;]*(anon|public)/i);
  });

  it("leaves the five-argument function and every public trip RPC alone", () => {
    expect(sql).not.toContain("create_trip(text, text, text, date, date)");
    expect(sql).not.toMatch(/drop function/i);
    for (const fn of ["get_trip_by_invite_code", "get_trip_summary", "join_trip", "join_trip_by_id", "get_trip_view"]) {
      expect(sql, fn).not.toContain(fn);
    }
    expect(sql).not.toMatch(/setof public\.trips|\bt\.\*/);
  });

  it("documents purpose and access in SQL comments, not COMMENT ON COLUMN", () => {
    expect(sql).not.toMatch(/comment on column/i);
    expect(raw).toContain("to decide which trip types to add next");
    expect(raw).toContain("any trip member");
  });
});
