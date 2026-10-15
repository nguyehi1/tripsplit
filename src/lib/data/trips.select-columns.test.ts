import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TRIP_LIST_COLUMNS, TRIP_VIEW_COLUMNS } from "./trip-columns";

/**
 * Grep test (starter lists criterion 69): no read of `trips` may use `select("*")` or an empty
 * `select()`, and `other_type` (the typed Other trip type, readable by every trip member through
 * the API) must stay out of every select list and out of the app outside a short allowlist.
 */

const SRC = join(__dirname, "../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !/\.bench\.ts$/.test(name) ? [full] : [];
  });
}

// Comments are stripped so a doc comment that mentions the old pattern is not an offender.
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const files = sourceFiles(SRC).map((path) => ({ path, text: stripComments(readFileSync(path, "utf8")) }));

describe("trips reads use explicit column lists", () => {
  it("no from('trips') is followed by select('*') or select()", () => {
    const star = /from\(\s*["'`]trips["'`]\s*\)\s*\.select\(\s*(?:["'`]\s*\*\s*["'`])?\s*\)/;
    const offenders = files.filter((f) => star.test(f.text)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("other_type is in neither shared column list", () => {
    expect(TRIP_LIST_COLUMNS).not.toContain("other_type");
    expect(TRIP_VIEW_COLUMNS).not.toContain("other_type");
  });

  it("both lists include types (the row icon and the trip view), never other_type", () => {
    expect(TRIP_VIEW_COLUMNS).toContain("types");
    expect(TRIP_LIST_COLUMNS).toContain("types");
  });

  it("other_type never appears inside a .select( argument", () => {
    const inSelect = /\.select\(\s*[^)]*other_type/;
    expect(files.filter((f) => inSelect.test(f.text)).map((f) => f.path)).toEqual([]);
  });

  it("other_type appears in src only where it is written or validated", () => {
    const allowed = [
      "lib/validation/trip-type.ts",
      "lib/data/trips.ts",
      "lib/data/trip-columns.ts",
      "lib/supabase/types.ts",
    ];
    const offenders = files
      .filter((f) => /other_type/.test(f.text))
      .map((f) => f.path.slice(SRC.length + 1))
      .filter((p) => !allowed.includes(p));
    expect(offenders).toEqual([]);
  });
});
