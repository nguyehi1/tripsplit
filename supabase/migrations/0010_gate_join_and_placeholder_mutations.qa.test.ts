import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * QA coverage for fixes #1 and #3 (see the QA follow-up on simplified-onboarding): there's no
 * live/staging Supabase project available to this repo (same constraint ADR 0006 notes for the
 * OTP-linking fork), so this can't run the SQL against a real database. What it can and does
 * prove is that the migration file this fix depends on actually contains the verification guard
 * for each of the four RPCs it's supposed to gate, worded the way the rest of this migration
 * series expresses "not anonymous" (`0009_simplified_onboarding.sql`'s
 * `is_verified_trip_member`/`is_owner_or_verified_member` predicates use the same
 * `auth.jwt() ->> 'is_anonymous'` claim) — and that it does NOT silently drop any of the
 * pre-existing organizer/open-trip checks those functions already had. A regression that removed
 * the guard (or reverted to the un-gated 0001/0008 bodies) would fail this test immediately,
 * without needing a live Supabase project.
 */

const migrationPath = join(__dirname, "0010_gate_join_and_placeholder_mutations.sql");
const sql = readFileSync(migrationPath, "utf8");

const ANONYMITY_GUARD = "coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)";

function bodyOf(functionSignature: string): string {
  const start = sql.indexOf(`create or replace function public.${functionSignature}`);
  expect(start, `expected to find function public.${functionSignature} in the migration`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("\n$$;", start);
  expect(end, `expected to find the closing $$; for public.${functionSignature}`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe("migration 0010 — join_trip verification gate (fix #1)", () => {
  const body = bodyOf("join_trip(_invite_code text, _display_name text)");

  it("checks the caller's session is not anonymous before doing anything else", () => {
    expect(body).toContain(ANONYMITY_GUARD);
    // Guard must come before the invite-code lookup/insert, not after — order matters for a
    // security check like this.
    const guardIndex = body.indexOf(ANONYMITY_GUARD);
    const insertIndex = body.indexOf("insert into public.trip_members");
    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(insertIndex).toBeGreaterThan(guardIndex);
  });

  it("preserves the existing invite-code lookup and upsert behavior", () => {
    expect(body).toContain("select id into _trip_id from public.trips where invite_code = _invite_code");
    expect(body).toContain("on conflict (trip_id, user_id) do update set display_name = excluded.display_name");
  });

  it("keeps the function's signature, security definer, and authenticated-only grant", () => {
    expect(sql).toContain("returns uuid");
    expect(sql).toContain("language plpgsql security definer set search_path = public");
    expect(sql).toContain("grant execute on function public.join_trip(text, text) to authenticated;");
  });
});

describe("migration 0010 — placeholder-member RPC verification gates (fix #3)", () => {
  it("add_placeholder_member: gates on verification, keeps the organizer/open-trip/cap checks", () => {
    const body = bodyOf("add_placeholder_member(_trip_id uuid, _display_name text)");
    expect(body).toContain(ANONYMITY_GUARD);
    expect(body).toContain("created_by = auth.uid() and public.is_trip_open(_trip_id)");
    expect(body).toContain("_placeholder_count >= 20");
  });

  it("rename_placeholder_member: gates on verification, keeps the organizer/placeholder/open-trip checks", () => {
    const body = bodyOf("rename_placeholder_member(_member_id uuid, _display_name text)");
    expect(body).toContain(ANONYMITY_GUARD);
    expect(body).toContain("t.created_by = auth.uid()");
    expect(body).toContain("m.is_placeholder");
    expect(body).toContain("public.is_trip_open(t.id)");
  });

  it("remove_placeholder_member: gates on verification, keeps the organizer/placeholder/open-trip checks", () => {
    const body = bodyOf("remove_placeholder_member(_member_id uuid)");
    expect(body).toContain(ANONYMITY_GUARD);
    expect(body).toContain("t.created_by = auth.uid()");
    expect(body).toContain("m.is_placeholder");
    expect(body).toContain("public.is_trip_open(t.id)");
  });

  it("all three keep their authenticated-only grants (no anon/public execute)", () => {
    expect(sql).toContain("grant execute on function public.add_placeholder_member(uuid, text) to authenticated;");
    expect(sql).toContain("grant execute on function public.rename_placeholder_member(uuid, text) to authenticated;");
    expect(sql).toContain("grant execute on function public.remove_placeholder_member(uuid) to authenticated;");
    expect(sql).not.toMatch(/grant execute on function public\.(add|rename|remove)_placeholder_member[^;]*\bto\b[^;]*\banon\b/);
  });
});
