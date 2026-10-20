import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard for expense-delete-and-polish (architecture.md 5.1, ADR 0017). Deleted expenses are hidden
 * by the `expenses` read policy (`deleted_at is null`), not by a filter in each query, so any code
 * that reads `expenses` another way must be reviewed for `deleted_at`:
 *  - a new `from("expenses")` in app code goes through RLS and is safe, but is pinned here so the
 *    author is forced to look;
 *  - a new SQL file that mentions `expenses` (a definer function or view bypasses RLS) must filter
 *    `deleted_at` itself, and is pinned here for the same reason.
 * To add to an allowlist, confirm the reader excludes marked rows, then update the count/list.
 */

const ROOT = join(__dirname, "../../..");
const SRC = join(ROOT, "src");
const MIGRATIONS = join(ROOT, "supabase/migrations");

function walk(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full, keep);
    return keep(name) ? [full] : [];
  });
}

const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("expenses read guard", () => {
  it("pins every app-code read of the expenses table", () => {
    const counts: Record<string, number> = {};
    for (const path of walk(SRC, (n) => /\.(ts|tsx)$/.test(n) && !/\.(test|bench)\.tsx?$/.test(n))) {
      const hits = stripComments(readFileSync(path, "utf8")).match(/from\("expenses"\)/g);
      if (hits) counts[path.slice(SRC.length + 1)] = hits.length;
    }
    expect(counts).toEqual({
      "app/trip/[id]/edit-expense-sheet-content.tsx": 1,
      "lib/data/trips.ts": 4,
    });
  });

  it("pins every SQL migration that mentions expenses", () => {
    const files = walk(MIGRATIONS, (n) => n.endsWith(".sql"))
      .filter((path) => /\bexpenses\b/.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(MIGRATIONS.length + 1))
      .sort();
    expect(files).toEqual([
      "0001_init.sql",
      "0005_lock_expenses_when_trip_completed.sql",
      "0006_restrict_expense_update_to_payer.sql",
      "0007_add_expense_date.sql",
      "0009_simplified_onboarding.sql",
      "0012_add_invite_code_to_trip_summary.sql",
      "0014_remove_and_leave_trip_member.sql",
      "0015_shopping_list.sql",
      "0016_join_by_trip_id_drop_invite_code_leak.sql",
      "0018_purge_abandoned_anonymous_users.sql",
      "0024_expense_delete_undo_and_erase.sql",
    ]);
  });
});
