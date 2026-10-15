import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OTHER_TILE_LABEL, STARTER_TYPES } from "./starter-catalog";

describe("starter catalog", () => {
  it("has unique, lowercase codes and no 'other' code", () => {
    const codes = STARTER_TYPES.map((t) => t.code as string);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toBe(c.toLowerCase());
    expect(codes).not.toContain("other");
    expect(OTHER_TILE_LABEL).toBe("Other");
  });

  it("has non-empty names with no duplicates inside a type (case-insensitive, trimmed)", () => {
    for (const type of STARTER_TYPES) {
      const keys = type.items.map((n) => n.trim().toLowerCase());
      for (const n of type.items) expect(n.trim().length).toBeGreaterThan(0);
      expect(new Set(keys).size, type.code).toBe(keys.length);
    }
  });

  it("every name satisfies the shopping-list name rule (0015) and a house maximum of 80", () => {
    for (const type of STARTER_TYPES) {
      for (const n of type.items) {
        expect(n.trim().length).toBeGreaterThan(0);
        expect(n.length).toBeLessThanOrEqual(80);
      }
    }
  });

  it("carries the special-category editing note in its header", () => {
    const text = readFileSync(join(__dirname, "starter-catalog.ts"), "utf8");
    expect(text).toMatch(/special-category/);
    expect(text).toMatch(/Prescriptions/);
  });

  it("codes match the allowed list in the newest migration that defines trips_types_check", () => {
    const dir = join(__dirname, "../../supabase/migrations");


    const newest = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) => readFileSync(join(dir, f), "utf8").includes("trips_types_check"))
      .pop()!;
    const sql = readFileSync(join(dir, newest), "utf8");
    const m = sql.match(/types <@ array\[([^\]]+)\]/)!;
    const codes = [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
    expect(codes).toEqual(STARTER_TYPES.map((t) => t.code));
  });

  it("every code has its analytics event documented", () => {
    const doc = readFileSync(join(__dirname, "../../docs/ANALYTICS.md"), "utf8");
    for (const t of STARTER_TYPES) expect(doc).toContain(`trip_type_selected_${t.code}`);
    expect(doc).toContain("trip_type_selected_other");
    expect(doc).toContain("suggestion_add_complete");
  });
});
