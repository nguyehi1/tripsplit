import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * QA regression guard: the function body in migration 0022 must be wrapped in a real
 * dollar-quote pair. A shell heredoc without a quoted delimiter once expanded `$$` to the shell's
 * process id, leaving `as 71705 ... 71705;` in the file, which is not valid SQL.
 */
const sql = readFileSync(join(__dirname, "0022_trip_types_and_other_type.sql"), "utf8");

describe("migration 0022 function body quoting", () => {
  it("opens and closes the create_trip body with a dollar-quote delimiter", () => {
    const start = sql.indexOf("create or replace function public.create_trip(");
    // The body opens with `declare` lines (as in 0001) before `begin`, so don't anchor to the end.
    const header = sql.slice(start, sql.indexOf("\nbegin\n", start));
    expect(header).toMatch(/security definer set search_path = public as (\$\$|\$[a-z_]+\$)\s*\n/);
  });

  it("has an even, non-zero number of $$ delimiters, like migration 0020", () => {
    const count = (sql.match(/\$\$/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
    expect(count % 2).toBe(0);
  });

  it("contains no bare numeric token where a delimiter belongs", () => {
    expect(sql).not.toMatch(/\bas \d{3,}\s*$/m);
    expect(sql).not.toMatch(/^\d{3,};\s*$/m);
  });
});
