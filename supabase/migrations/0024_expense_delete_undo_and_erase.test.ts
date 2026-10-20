import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Text-shape checks on migration 0024 (the behavioural proof is a real-Postgres run, see the
 * feature's QA notes). Pins the policy swap and the privilege model so an edit cannot quietly
 * reintroduce a delete path or a client-writable mark.
 */
const sql = readFileSync(join(__dirname, "0024_expense_delete_undo_and_erase.sql"), "utf8");
const code = sql.replace(/^\s*--.*$/gm, "");

describe("0024 expense delete migration", () => {
  it("has no explicit transaction wrapper", () => {
    expect(code).not.toMatch(/^\s*(begin|commit)\s*;/im);
  });

  it("drops the four live 0009 policy names", () => {
    for (const name of [
      "owner or verified member can read expense detail",
      "verified member can add expenses",
      "verified payer can edit their own expenses",
      "verified member can delete expenses",
    ]) {
      expect(code).toContain(`drop policy if exists "${name}" on public.expenses;`);
    }
  });

  it("creates exactly three policies and no delete policy", () => {
    const created = [...code.matchAll(/create policy "([^"]+)" on public\.expenses\s+for (\w+)/g)].map((m) => [m[1], m[2]]);
    expect(created).toEqual([
      ["owner or verified member can read live expense detail", "select"],
      ["verified member can add own expenses", "insert"],
      ["verified payer can edit their own live expenses", "update"],
    ]);
  });

  it("hides marked rows in all three policies and pins paid_by on insert", () => {
    const policies = code.split("create policy").slice(1);
    expect(policies).toHaveLength(3);
    for (const p of policies) expect(p).toContain("deleted_at is null");
    expect(policies[1]).toContain("paid_by = auth.uid()");
  });

  it("revokes client delete and limits update to three columns", () => {
    expect(code).toContain("revoke delete on public.expenses from anon, authenticated;");
    expect(code).toContain("revoke update on public.expenses from anon, authenticated;");
    expect(code).toContain("grant update (amount, description, date) on public.expenses to authenticated;");
  });

  it("keeps get_trip_summary a create or replace, never a drop", () => {
    expect(code).not.toMatch(/drop function[^;]*get_trip_summary/i);
    expect(code).toMatch(/left join public\.expenses e\s+on [^;]*e\.deleted_at is null/);
  });

  it("makes the erase functions unexecutable by client roles", () => {
    for (const fn of ["erase_expired_expenses()", "erase_expired_expenses_batch()", "expense_erase_after_interval()", "expense_undo_accept_interval()"]) {
      expect(code).toContain(`revoke execute on function public.${fn} from public, anon, authenticated;`);
    }
  });

  it("re-asserts the erase age in the DELETE itself", () => {
    expect(code).toMatch(/delete from public\.expenses e\s+where e\.id = any\(_v_ids\)\s+and e\.deleted_at is not null\s+and e\.deleted_at < clock_timestamp\(\) - public\.expense_erase_after_interval\(\)/);
  });

  it("orders the numbers: erase after > undo accept", () => {
    expect(code).toContain("select interval '15 seconds'");
    expect(code).toContain("select interval '30 seconds'");
  });
});
