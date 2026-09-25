import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * QA coverage for docs/features/remove-member-access — mirrors the text-assertion pattern used
 * by migrations 0010-0013's own `.qa.test.ts` files: no live/staging Supabase project is
 * available to this repo (no Docker daemon in this environment either), so this pins the
 * migration file's shape rather than executing the SQL against a real Postgres instance.
 *
 * That blind spot is not hypothetical here either: migration 0013 shipped with an ambiguous
 * column reference bug (an ON CONFLICT ... DO UPDATE SET referencing `excluded`-shadowed column
 * names unqualified) that broke both of its RPCs on their very first call, caught only after the
 * fact. Architecture.md explicitly calls out that this migration's two `delete ... using`
 * statements avoid that class of bug by fully qualifying every column reference — these tests pin
 * that claim in place so a future edit can't silently reintroduce it.
 */

const migrationPath = join(__dirname, "0014_remove_and_leave_trip_member.sql");
const sql = readFileSync(migrationPath, "utf8");

function statementFor(fnName: string): string {
  const start = sql.indexOf(`create or replace function public.${fnName}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("\n$$;", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe("migration 0014 — remove_trip_member", () => {
  const body = statementFor("remove_trip_member");

  it("hard-deletes from trip_members using a table-qualified delete...using (no ambiguous-column risk)", () => {
    expect(body).toContain("delete from public.trip_members m");
    expect(body).toContain("using public.trips t");
    expect(body).toContain("where m.id = _member_id");
  });

  it("every predicate column reference is table-qualified", () => {
    const whereClause = body.slice(body.indexOf("where m.id"), body.indexOf("if not found"));
    // m.*, t.* are fine; bare (unqualified) references to shared/ambiguous-prone column names
    // like user_id/created_by/trip_id/id would be the 0013-style risk.
    const bareCreatedBy = whereClause.match(/(?<!t\.)\bcreated_by\b/g) ?? [];
    const bareUserId = whereClause.match(/(?<!m\.)\buser_id\b/g) ?? [];
    expect(bareCreatedBy).toEqual([]);
    expect(bareUserId).toEqual([]);
  });

  it("is organizer-only (t.created_by = auth.uid())", () => {
    expect(body).toContain("t.created_by = auth.uid()");
  });

  it("excludes placeholder rows — placeholder removal stays on its own existing RPC (AC not covered here)", () => {
    expect(body).toContain("not m.is_placeholder");
  });

  it("rejects targeting the organizer's own row (AC7) via user_id is distinct from created_by", () => {
    expect(body).toContain("m.user_id is distinct from t.created_by");
  });

  it("is gated on the trip being open (AC9)", () => {
    expect(body).toContain("public.is_trip_open(t.id)");
  });

  it("guards against an anonymous/unverified caller, same shape as remove_placeholder_member", () => {
    expect(body).toContain("coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)");
  });

  it("raises a clear error when the delete matches nothing", () => {
    expect(body).toContain("if not found then");
    expect(body).toContain("raise exception");
  });

  it("execute is revoked from public and granted only to authenticated", () => {
    const grantSection = sql.slice(sql.indexOf("$$;", sql.indexOf("remove_trip_member(uuid)")));
    expect(sql).toContain("revoke execute on function public.remove_trip_member(uuid) from public;");
    expect(sql).toContain("grant execute on function public.remove_trip_member(uuid) to authenticated;");
    void grantSection;
  });
});

describe("migration 0014 — leave_trip", () => {
  const body = statementFor("leave_trip");

  it("hard-deletes the caller's own row via a table-qualified delete...using", () => {
    expect(body).toContain("delete from public.trip_members m");
    expect(body).toContain("using public.trips t");
    expect(body).toContain("m.user_id = auth.uid()");
  });

  it("every predicate column reference is table-qualified", () => {
    const whereClause = body.slice(body.indexOf("where m.trip_id"), body.indexOf("if not found"));
    const bareCreatedBy = whereClause.match(/(?<!t\.)\bcreated_by\b/g) ?? [];
    const bareUserId = whereClause.match(/(?<!m\.)\buser_id\b/g) ?? [];
    expect(bareCreatedBy).toEqual([]);
    expect(bareUserId).toEqual([]);
  });

  it("rejects the organizer leaving their own trip (t.created_by <> auth.uid())", () => {
    expect(body).toContain("t.created_by <> auth.uid()");
  });

  it("is gated on the trip being open (AC15)", () => {
    expect(body).toContain("public.is_trip_open(t.id)");
  });

  it("guards against an anonymous/unverified caller", () => {
    expect(body).toContain("coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)");
  });

  it("execute is revoked from public and granted only to authenticated", () => {
    expect(sql).toContain("revoke execute on function public.leave_trip(uuid) from public;");
    expect(sql).toContain("grant execute on function public.leave_trip(uuid) to authenticated;");
  });
});

describe("migration 0014 — was_removed_from_trip", () => {
  const body = statementFor("was_removed_from_trip");

  it("requires a non-anonymous caller", () => {
    expect(body).toContain("coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false");
  });

  it("requires the caller is NOT a current trip_members row on this trip", () => {
    expect(body).toContain("not exists (");
    expect(body).toContain("select 1 from public.trip_members where trip_id = _trip_id and user_id = auth.uid()");
  });

  it("requires the caller HAS a paid_by expense on this trip — the reconstructed 'was removed' signal", () => {
    expect(body).toContain("select 1 from public.expenses where trip_id = _trip_id and paid_by = auth.uid()");
  });

  it("does not write anything — pure select, no insert/update/delete (no new stored fact, per ADR 0012)", () => {
    expect(body).not.toMatch(/\b(insert|update|delete)\b/i);
  });

  it("execute is revoked from public and granted only to authenticated", () => {
    expect(sql).toContain("revoke execute on function public.was_removed_from_trip(uuid) from public;");
    expect(sql).toContain("grant execute on function public.was_removed_from_trip(uuid) to authenticated;");
  });
});

describe("migration 0014 — no data-model changes", () => {
  it("contains no ALTER TABLE / CREATE TABLE / DROP (function-only migration, per architecture.md)", () => {
    expect(sql).not.toMatch(/\balter table\b/i);
    expect(sql).not.toMatch(/\bcreate table\b/i);
    expect(sql).not.toMatch(/\bdrop table\b/i);
  });
});
