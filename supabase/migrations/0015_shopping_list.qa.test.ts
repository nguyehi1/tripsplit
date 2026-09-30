import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * QA coverage for docs/features/shopping-list — mirrors the text-assertion pattern already
 * established by migrations 0010-0014's own `.qa.test.ts` files: no live/staging Supabase
 * project or Docker daemon is available in this environment (confirmed: `docker` is not
 * installed and only a bare, auth-schema-less PostgreSQL 10.5 binary is on PATH, insufficient to
 * exercise `auth.uid()`/`auth.jwt()`/RLS/security-definer semantics faithfully), so this pins the
 * migration file's actual SQL shape rather than executing it against a real Postgres instance.
 *
 * This is a real, disclosed gap against requirements.md's explicit "verified at the data layer"
 * asks for the claim race and unclaim-permission acceptance criteria — these tests prove the SQL
 * has the *shape* architecture.md claims (single conditional UPDATE as compare-and-swap, claimer-
 * only predicate derived server-side from auth.uid(), etc.), not that Postgres actually serializes
 * two concurrent sessions on the row lock the way the architecture doc's prose claims. That
 * specific claim is a standard, well-documented Postgres MVCC/locking behavior (not something this
 * migration invents), but a live/staging run of the two-concurrent-callers scenario is still the
 * only way to fully close this AC — flagged in the QA report, not silently assumed here.
 */

const migrationPath = join(__dirname, "0015_shopping_list.sql");
const sql = readFileSync(migrationPath, "utf8");

function statementFor(fnName: string): string {
  const start = sql.indexOf(`create or replace function public.${fnName}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("\n$$;", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe("migration 0015 — shopping_list_items table shape", () => {
  it("has the three-state lifecycle shape-check constraint tying status to claimed_by/expense_id", () => {
    expect(sql).toContain("status in ('open', 'claimed', 'logged')");
    expect(sql).toContain("(status = 'open' and claimed_by is null and expense_id is null)");
    expect(sql).toContain("(status = 'claimed' and claimed_by is not null and expense_id is null)");
    expect(sql).toContain("(status = 'logged' and expense_id is not null)");
  });

  it("added_by/claimed_by reference trip_members, not auth.users directly (placeholder-exclusion proof-by-construction depends on this)", () => {
    expect(sql).toContain("added_by uuid references public.trip_members(id)");
    expect(sql).toContain("claimed_by uuid references public.trip_members(id)");
  });

  it("expense_id has no ON DELETE action (blocks a future expense delete rather than silently cascading/nulling)", () => {
    const col = sql.slice(sql.indexOf("expense_id uuid references"), sql.indexOf("created_at timestamptz"));
    expect(col).not.toMatch(/on delete/i);
  });
});

describe("migration 0015 — RLS: no direct write path other than insert/delete-when-open + RPCs", () => {
  it("revokes UPDATE from authenticated entirely — every status transition must go through an RPC", () => {
    expect(sql).toContain("revoke update on public.shopping_list_items from authenticated;");
  });

  it("insert policy pins added_by to the caller's own (non-placeholder-derivable) trip_members row via user_id = auth.uid()", () => {
    const insertPolicy = sql.slice(
      sql.indexOf('create policy "verified member can add shopping list items"'),
      sql.indexOf('create policy "adder can delete'),
    );
    expect(insertPolicy).toContain("is_verified_trip_member(trip_id)");
    expect(insertPolicy).toContain("is_trip_open(trip_id)");
    expect(insertPolicy).toContain("status = 'open'");
    expect(insertPolicy).toContain("claimed_by is null");
    expect(insertPolicy).toContain("expense_id is null");
    expect(insertPolicy).toContain("tm.id = shopping_list_items.added_by");
    expect(insertPolicy).toContain("tm.user_id = auth.uid()");
  });

  it("delete policy is adder-only and open-items-only (pre-claim delete, AC5)", () => {
    const deletePolicy = sql.slice(
      sql.indexOf('create policy "adder can delete'),
      sql.indexOf("revoke update on public.shopping_list_items"),
    );
    expect(deletePolicy).toContain("status = 'open'");
    expect(deletePolicy).toContain("tm.id = shopping_list_items.added_by and tm.user_id = auth.uid()");
    expect(deletePolicy).toContain("is_trip_open(trip_id)");
  });

  it("select policy is the existing owner-or-verified-member detail-tier predicate, reused not re-derived", () => {
    expect(sql).toContain(
      'create policy "owner or verified member can read shopping list" on public.shopping_list_items\n  for select using (is_owner_or_verified_member(trip_id));',
    );
  });
});

describe("migration 0015 — claim_shopping_list_item: the claim-race guarantee (AC3)", () => {
  const body = statementFor("claim_shopping_list_item");

  it("derives the acting member id server-side from auth.uid(), never trusting a client-supplied member id", () => {
    expect(body).toContain("tm.user_id = auth.uid()");
    expect(body).not.toMatch(/_member_id\s+uuid\s*(:=|default)/); // not a parameter, purely derived
  });

  it("is a single conditional UPDATE guarded on status = 'open' (the compare-and-swap / row-lock serialization point)", () => {
    expect(body).toContain("set status = 'claimed', claimed_by = _member_id");
    expect(body).toContain("where i.id = _item_id");
    expect(body).toContain("and i.status = 'open'");
    expect(body).toContain("and public.is_trip_open(_trip_id)");
  });

  it("raises a clean exception (not a silent no-op) when the compare-and-swap matches zero rows", () => {
    expect(body).toContain("if not found then");
    expect(body).toContain("raise exception 'item was already claimed, deleted, or the trip is locked';");
  });

  it("gates on verified membership before attempting the update", () => {
    expect(body).toContain("is_verified_trip_member(_trip_id)");
  });

  it("execute is revoked from public and granted only to authenticated", () => {
    expect(sql).toContain("revoke execute on function public.claim_shopping_list_item(uuid) from public;");
    expect(sql).toContain("grant execute on function public.claim_shopping_list_item(uuid) to authenticated;");
  });
});

describe("migration 0015 — unclaim_shopping_list_item: claimer-only (superseded decision 2, AC4)", () => {
  const body = statementFor("unclaim_shopping_list_item");

  it("derives _member_id server-side from auth.uid(), exactly like the claim RPC — no client-supplied member id accepted anywhere in this function", () => {
    expect(body).toContain("tm.user_id = auth.uid()");
    // The function signature takes only _item_id — confirm no second uuid parameter exists that
    // could let a caller name someone else's member id.
    const signature = sql.slice(
      sql.indexOf("create or replace function public.unclaim_shopping_list_item"),
      sql.indexOf("language plpgsql", sql.indexOf("create or replace function public.unclaim_shopping_list_item")),
    );
    expect(signature).toContain("(_item_id uuid)");
    expect(signature).not.toMatch(/_member_id\s+uuid/);
  });

  it("the compare-and-swap UPDATE requires BOTH status = 'claimed' AND claimed_by = _member_id — a different member's claim cannot be released", () => {
    expect(body).toContain("set status = 'open', claimed_by = null");
    expect(body).toContain("and i.status = 'claimed'");
    expect(body).toContain("and i.claimed_by = _member_id");
  });

  it("raises a clean exception distinguishing 'not claimed by you' from the other failure modes, never a silent no-op", () => {
    expect(body).toContain("if not found then");
    expect(body).toContain("raise exception 'item was not claimed by you, already logged, or the trip is locked';");
  });

  it("also respects trip-lock gating, same as claim", () => {
    expect(body).toContain("public.is_trip_open(_trip_id)");
  });

  it("execute is revoked from public and granted only to authenticated", () => {
    expect(sql).toContain("revoke execute on function public.unclaim_shopping_list_item(uuid) from public;");
    expect(sql).toContain("grant execute on function public.unclaim_shopping_list_item(uuid) to authenticated;");
  });
});

describe("migration 0015 — add_expense_and_log_shopping_items: atomicity (AC6/8/9)", () => {
  const body = statementFor("add_expense_and_log_shopping_items");

  it("both the expense insert and the item-logging update live in the same function body (one transaction)", () => {
    const insertIdx = body.indexOf("insert into public.expenses");
    const updateIdx = body.indexOf("update public.shopping_list_items");
    expect(insertIdx).toBeGreaterThan(0);
    expect(updateIdx).toBeGreaterThan(insertIdx);
  });

  it("re-verifies membership, trip-open, and resolves the caller's own member id manually (security definer bypasses RLS)", () => {
    expect(body).toContain("is_verified_trip_member(_trip_id)");
    expect(body).toContain("is_trip_open(_trip_id)");
    expect(body).toContain("tm.user_id = auth.uid()");
  });

  it("only logs items that are actually claimed by the caller (claimed_by = _member_id, status = 'claimed') — can't log someone else's claim or a stale item", () => {
    expect(body).toContain("i.status = 'claimed'");
    expect(body).toContain("i.claimed_by = _member_id");
  });

  it("a row-count mismatch (fewer items updated than requested) raises, rolling back the whole transaction including the just-inserted expense", () => {
    expect(body).toContain("get diagnostics _updated_count = row_count;");
    expect(body).toContain("if _updated_count <> array_length(_item_ids, 1) then");
    expect(body).toContain("raise exception");
  });

  it("expense insert derives paid_by from auth.uid(), matching the existing addExpense/RLS convention", () => {
    expect(body).toContain("values (_trip_id, auth.uid(), _amount, _description, coalesce(_date, current_date))");
  });

  it("execute is revoked from public and granted only to authenticated", () => {
    expect(sql).toContain(
      "revoke execute on function public.add_expense_and_log_shopping_items(uuid, numeric, text, date, uuid[]) from public;",
    );
    expect(sql).toContain(
      "grant execute on function public.add_expense_and_log_shopping_items(uuid, numeric, text, date, uuid[]) to authenticated;",
    );
  });
});

describe("migration 0015 — ADR 0013 trigger: releasing claims before a trip_members row is deleted", () => {
  it("is a BEFORE DELETE trigger on trip_members (runs before the FK would otherwise block the delete)", () => {
    expect(sql).toContain("create trigger release_shopping_list_claims_before_member_delete");
    expect(sql).toContain("before delete on public.trip_members");
  });

  const fnBody = statementFor("release_shopping_list_claims_on_member_removal");

  it("reverts a still-claimed item back to open (not left dangling in a shape-check-violating state) when its claimer is removed", () => {
    expect(fnBody).toContain("where claimed_by = old.id");
    expect(fnBody).toContain("status = case when status = 'claimed' then 'open' else status end");
  });

  it("also nulls added_by for items the removed member added (independent of their claim state)", () => {
    expect(fnBody).toContain("set added_by = null");
    expect(fnBody).toContain("where added_by = old.id");
  });

  it("does not touch logged items' status (only claimed -> open; logged stays logged per the accepted 'ghost payer' edge case)", () => {
    // The CASE only flips 'claimed' -> 'open'; every other status (including 'logged') falls
    // through to the ELSE branch and is left as-is.
    expect(fnBody).toContain("case when status = 'claimed' then 'open' else status end");
  });
});

describe("migration 0015 — no ambiguous-column risk (the exact class of bug that broke migration 0013)", () => {
  it("the trigger function never bare-references a column shared between old and shopping_list_items without a namespace", () => {
    const fnBody = statementFor("release_shopping_list_claims_on_member_removal");
    // `old.id` is always namespaced; the target table's own columns (claimed_by/added_by/status)
    // are unambiguous since `old` is a distinct record, not a second table alias in the same
    // FROM/JOIN.
    expect(fnBody).not.toMatch(/\bon conflict\b/i);
  });

  it("no ON CONFLICT ... DO UPDATE appears anywhere in this migration", () => {
    expect(sql).not.toMatch(/\bon conflict\b/i);
  });
});
