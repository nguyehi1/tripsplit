import { describe, expect, it, vi } from "vitest";
import { addExpense, updateExpense } from "./trips";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

/**
 * Minimal chainable fake for the subset of the supabase-js query builder these two
 * functions use: `.from(table).insert(payload).select().single()` and
 * `.from(table).update(payload).eq(col, val).select().single()`.
 *
 * Records every call so tests can assert exactly what payload was sent to Postgres —
 * this is the only way to pin down "never sends paid_by/trip_id" (AC7) and "add-expense's
 * insert shape is untouched by the refactor" without a live database.
 */
function makeFakeSupabase(result: { data: unknown; error: unknown }) {
  const calls: { method: string; args: unknown[] }[] = [];

  const builder: Record<string, unknown> = {};
  const record = (method: string, ...args: unknown[]) => {
    calls.push({ method, args });
    return builder;
  };

  builder.insert = (payload: unknown) => record("insert", payload);
  builder.update = (payload: unknown) => record("update", payload);
  builder.eq = (col: string, val: unknown) => record("eq", col, val);
  builder.select = () => record("select");
  builder.single = () => Promise.resolve(result);

  const from = vi.fn((table: string) => {
    calls.push({ method: "from", args: [table] });
    return builder;
  });

  return { from, calls } as unknown as Client & { calls: typeof calls };
}

describe("updateExpense", () => {
  it("sends only amount and description in the update payload — never paid_by or trip_id", async () => {
    const fake = makeFakeSupabase({ data: { id: "e1", amount: 42.5, description: "Cabin" }, error: null });

    await updateExpense(fake, { expenseId: "e1", amountCents: 4250, description: "Cabin" });

    const updateCall = fake.calls.find((c) => c.method === "update");
    expect(updateCall).toBeDefined();
    const payload = updateCall!.args[0] as Record<string, unknown>;
    expect(payload).toEqual({ amount: 42.5, description: "Cabin" });
    expect(payload).not.toHaveProperty("paid_by");
    expect(payload).not.toHaveProperty("trip_id");
    expect(payload).not.toHaveProperty("id");
  });

  it("scopes the update to the given expense id via .eq", async () => {
    const fake = makeFakeSupabase({ data: { id: "e1" }, error: null });

    await updateExpense(fake, { expenseId: "e1", amountCents: 100, description: "Gum" });

    const eqCall = fake.calls.find((c) => c.method === "eq");
    expect(eqCall?.args).toEqual(["id", "e1"]);
  });

  it("converts amountCents to dollars for the numeric column", async () => {
    const fake = makeFakeSupabase({ data: {}, error: null });

    await updateExpense(fake, { expenseId: "e1", amountCents: 1, description: "Gum" });

    const payload = fake.calls.find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
    expect(payload.amount).toBeCloseTo(0.01);
  });

  it("rethrows the error when RLS excludes the row (e.g. editing someone else's expense, PGRST116)", async () => {
    const fake = makeFakeSupabase({
      data: null,
      error: { code: "PGRST116", message: "The result contains 0 rows" },
    });

    await expect(
      updateExpense(fake, { expenseId: "not-mine", amountCents: 100, description: "x" }),
    ).rejects.toMatchObject({ code: "PGRST116" });
  });

  it("returns the updated row on success", async () => {
    const row = { id: "e1", amount: 10, description: "Dinner" };
    const fake = makeFakeSupabase({ data: row, error: null });

    const result = await updateExpense(fake, { expenseId: "e1", amountCents: 1000, description: "Dinner" });

    expect(result).toEqual(row);
  });
});

describe("addExpense (regression: shared validator refactor must not change insert shape)", () => {
  it("still sends trip_id, paid_by, amount, and description on insert", async () => {
    const fake = makeFakeSupabase({ data: { id: "e1" }, error: null });

    await addExpense(fake, {
      tripId: "trip-1",
      paidBy: "user-1",
      amountCents: 4250,
      description: "Cabin",
    });

    const insertCall = fake.calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toEqual({
      trip_id: "trip-1",
      paid_by: "user-1",
      amount: 42.5,
      description: "Cabin",
    });
  });

  it("rethrows on insert error", async () => {
    const fake = makeFakeSupabase({ data: null, error: { message: "boom" } });

    await expect(
      addExpense(fake, { tripId: "t", paidBy: "u", amountCents: 100, description: "x" }),
    ).rejects.toMatchObject({ message: "boom" });
  });
});
