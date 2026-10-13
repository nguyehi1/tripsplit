import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Static coverage for migration 0020 (one display name per account). Same text-assertion pattern
 * as the other migration `.qa.test.ts` files — no live Supabase project is available to this repo.
 */

const sql = readFileSync(join(__dirname, "0020_one_display_name_per_account.sql"), "utf8");

function bodyOf(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `expected public.${name} in migration 0020`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("\n$$;", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe("migration 0020 — one display name per account", () => {
  it("adds no column: it is a pure functions-and-trigger migration", () => {
    expect(sql).not.toMatch(/alter table/i);
    expect(sql).not.toContain("name_is_provisional");
  });

  it("canonical_display_name ignores placeholders and the 'Organizer' stand-in", () => {
    const body = bodyOf("canonical_display_name");
    expect(body).toContain("and not is_placeholder");
    expect(body).toContain("and display_name <> 'Organizer'");
    expect(body).toContain("order by joined_at desc");
  });

  it("set_my_display_name needs a verified caller and a 1-50 character name, and renames every non-placeholder row", () => {
    const body = bodyOf("set_my_display_name");
    expect(body).toContain("coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)");
    expect(body).toContain("char_length(_clean) < 1 or char_length(_clean) > 50");
    expect(body).toContain("where user_id = auth.uid() and not is_placeholder");
  });

  it("the trigger lets an existing account name win and turns a blank name into 'Organizer'", () => {
    const body = bodyOf("trip_members_apply_canonical_name");
    expect(body).toContain("new.display_name := _existing;");
    expect(body).toContain("new.display_name := 'Organizer';");
    expect(sql).toContain("before insert on public.trip_members");
  });

  it("keeps get/set_my_display_name authenticated-only and the helper internal", () => {
    expect(sql).toContain("grant execute on function public.get_my_display_name() to authenticated;");
    expect(sql).toContain("grant execute on function public.set_my_display_name(text) to authenticated;");
    expect(sql).toContain("revoke all on function public.canonical_display_name(uuid) from public, anon, authenticated;");
  });
});
