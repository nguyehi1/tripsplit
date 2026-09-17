import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * QA coverage for Decision 13 (simplified-onboarding): `complete_trip` had no anonymity guard at
 * all prior to this migration. Same constraint as migration 0010's test — there's no live/staging
 * Supabase project available to this repo, so this can't run the SQL against a real database.
 * What it can and does prove is that the migration file contains the verification guard, worded
 * the way the rest of this migration series expresses "not anonymous"
 * (`0009_simplified_onboarding.sql`'s `is_verified_trip_member`/`is_owner_or_verified_member` and
 * `0010_gate_join_and_placeholder_mutations.sql`'s standalone guard all use the same
 * `auth.jwt() ->> 'is_anonymous'` claim), and that it does NOT silently drop the function's
 * pre-existing signature, `created_by`/`completed_at` predicate, or grants. A regression that
 * removed the guard (or reverted to the un-gated 0001 body) would fail this test immediately,
 * without needing a live Supabase project.
 */

const migrationPath = join(__dirname, "0011_gate_complete_trip.sql");
const sql = readFileSync(migrationPath, "utf8");

const ANONYMITY_GUARD = "coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)";

function bodyOf(functionSignature: string): string {
  const start = sql.indexOf(`create or replace function public.${functionSignature}`);
  expect(start, `expected to find function public.${functionSignature} in the migration`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("\n$$;", start);
  expect(end, `expected to find the closing $$; for public.${functionSignature}`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe("migration 0011 — complete_trip verification gate (Decision 13)", () => {
  const body = bodyOf("complete_trip(_trip_id uuid)");

  it("checks the caller's session is not anonymous before doing anything else", () => {
    expect(body).toContain(ANONYMITY_GUARD);
    // Guard must come before the update, not after — order matters for a security check like this.
    const guardIndex = body.indexOf(ANONYMITY_GUARD);
    const updateIndex = body.indexOf("update public.trips");
    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(updateIndex).toBeGreaterThan(guardIndex);
  });

  it("preserves the existing created_by/completed_at predicate and update shape", () => {
    expect(body).toContain("set completed_at = now()");
    expect(body).toContain("where id = _trip_id and created_by = auth.uid() and completed_at is null");
  });

  it("keeps the function's signature, security definer, and authenticated-only grant", () => {
    expect(sql).toContain("returns void");
    expect(sql).toContain("language plpgsql security definer set search_path = public");
    expect(sql).toContain("revoke execute on function public.complete_trip(uuid) from public;");
    expect(sql).toContain("grant execute on function public.complete_trip(uuid) to authenticated;");
    expect(sql).not.toMatch(/grant execute on function public\.complete_trip[^;]*\bto\b[^;]*\banon\b/);
  });
});
