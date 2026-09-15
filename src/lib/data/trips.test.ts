import { describe, expect, it, vi } from "vitest";
import { addExpense, getTripView, updateExpense } from "./trips";
import { todayIso } from "@/lib/dates";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

const FIXED_DATE = "2024-05-10";

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

    await updateExpense(fake, { expenseId: "e1", amountCents: 4250, description: "Cabin", date: FIXED_DATE });

    const updateCall = fake.calls.find((c) => c.method === "update");
    expect(updateCall).toBeDefined();
    const payload = updateCall!.args[0] as Record<string, unknown>;
    expect(payload).toEqual({ amount: 42.5, description: "Cabin", date: FIXED_DATE });
    expect(payload).not.toHaveProperty("paid_by");
    expect(payload).not.toHaveProperty("trip_id");
    expect(payload).not.toHaveProperty("id");
  });

  it("scopes the update to the given expense id via .eq", async () => {
    const fake = makeFakeSupabase({ data: { id: "e1" }, error: null });

    await updateExpense(fake, { expenseId: "e1", amountCents: 100, description: "Gum", date: FIXED_DATE });

    const eqCall = fake.calls.find((c) => c.method === "eq");
    expect(eqCall?.args).toEqual(["id", "e1"]);
  });

  it("converts amountCents to dollars for the numeric column", async () => {
    const fake = makeFakeSupabase({ data: {}, error: null });

    await updateExpense(fake, { expenseId: "e1", amountCents: 1, description: "Gum", date: FIXED_DATE });

    const payload = fake.calls.find((c) => c.method === "update")!.args[0] as Record<string, unknown>;
    expect(payload.amount).toBeCloseTo(0.01);
  });

  it("rethrows the error when RLS excludes the row (e.g. editing someone else's expense, PGRST116)", async () => {
    const fake = makeFakeSupabase({
      data: null,
      error: { code: "PGRST116", message: "The result contains 0 rows" },
    });

    await expect(
      updateExpense(fake, { expenseId: "not-mine", amountCents: 100, description: "x", date: FIXED_DATE }),
    ).rejects.toMatchObject({ code: "PGRST116" });
  });

  it("returns the updated row on success", async () => {
    const row = { id: "e1", amount: 10, description: "Dinner" };
    const fake = makeFakeSupabase({ data: row, error: null });

    const result = await updateExpense(fake, { expenseId: "e1", amountCents: 1000, description: "Dinner", date: FIXED_DATE });

    expect(result).toEqual(row);
  });
});

describe("addExpense (regression: shared validator refactor must not change insert shape)", () => {
  it("still sends trip_id, paid_by, amount, and description on insert, plus an explicit date", async () => {
    const fake = makeFakeSupabase({ data: { id: "e1" }, error: null });

    await addExpense(fake, {
      tripId: "trip-1",
      paidBy: "user-1",
      amountCents: 4250,
      description: "Cabin",
      date: FIXED_DATE,
    });

    const insertCall = fake.calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toEqual({
      trip_id: "trip-1",
      paid_by: "user-1",
      amount: 42.5,
      description: "Cabin",
      date: FIXED_DATE,
    });
  });

  it("rethrows on insert error", async () => {
    const fake = makeFakeSupabase({ data: null, error: { message: "boom" } });

    await expect(
      addExpense(fake, { tripId: "t", paidBy: "u", amountCents: 100, description: "x", date: FIXED_DATE }),
    ).rejects.toMatchObject({ message: "boom" });
  });

  it("AC1: defaults date to today when omitted (blank date on add)", async () => {
    const fake = makeFakeSupabase({ data: { id: "e1" }, error: null });

    await addExpense(fake, {
      tripId: "trip-1",
      paidBy: "user-1",
      amountCents: 4250,
      description: "Cabin",
    });

    const insertCall = fake.calls.find((c) => c.method === "insert");
    const payload = insertCall?.args[0] as Record<string, unknown>;
    expect(payload.date).toBe(todayIso());
  });

  it("AC1: defaults date to today when explicitly undefined", async () => {
    const fake = makeFakeSupabase({ data: { id: "e1" }, error: null });

    await addExpense(fake, {
      tripId: "trip-1",
      paidBy: "user-1",
      amountCents: 4250,
      description: "Cabin",
      date: undefined,
    });

    const insertCall = fake.calls.find((c) => c.method === "insert");
    const payload = insertCall?.args[0] as Record<string, unknown>;
    expect(payload.date).toBe(todayIso());
  });
});

/**
 * Fake supabase client for getTripView: three parallel `.from(table)...` chains, none of which
 * call `.single()` for trip_members/expenses (they resolve the whole array), while `trips` does.
 * Records every `.order(...)` call per table so AC6 (date desc, created_at desc tiebreak) can be
 * asserted directly against the query builder rather than inferred from output order alone.
 */
function makeTripViewFake(opts: {
  trip: Record<string, unknown>;
  members: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
}) {
  const orderCalls: Record<string, unknown[][]> = { trips: [], trip_members: [], expenses: [] };

  const from = vi.fn((table: string) => {
    const data = table === "trips" ? opts.trip : table === "trip_members" ? opts.members : opts.expenses;

    const resultPromise = Promise.resolve({ data, error: null });
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      order: (...args: unknown[]) => {
        orderCalls[table].push(args);
        return builder;
      },
      single: () => resultPromise,
      then: resultPromise.then.bind(resultPromise),
    };
    return builder;
  });

  return { from, orderCalls } as unknown as Client & { orderCalls: typeof orderCalls };
}

describe("getTripView (AC6: newest-first by date, created_at tiebreak)", () => {
  it("queries expenses ordered by date desc, then created_at desc", async () => {
    const fake = makeTripViewFake({
      trip: { id: "t1", name: "Trip", location: null, starts_on: null, ends_on: null, invite_code: "abc", completed_at: null, created_by: "u1" },
      members: [{ id: "m1", user_id: "u1", display_name: "Alex", joined_at: "2026-01-01", is_placeholder: false }],
      expenses: [],
    });

    await getTripView(fake, "t1", "u1");

    expect(fake.orderCalls.expenses).toEqual([
      ["date", { ascending: false }],
      ["created_at", { ascending: false }],
    ]);
  });

  it("formats each expense's day label via the expense's own date field (AC5)", async () => {
    const fake = makeTripViewFake({
      trip: { id: "t1", name: "Trip", location: null, starts_on: null, ends_on: null, invite_code: "abc", completed_at: null, created_by: "u1" },
      members: [{ id: "m1", user_id: "u1", display_name: "Alex", joined_at: "2026-01-01", is_placeholder: false }],
      expenses: [
        {
          id: "e1",
          paid_by: "u1",
          amount: "10.00",
          description: "Cabin",
          date: "2026-09-14",
          created_at: "2026-09-14T23:00:00Z",
        },
      ],
    });

    const view = await getTripView(fake, "t1", "u1");
    expect(view.expenses[0].day).toBe("Mon, 9/14");
  });

  it("does not feed date into settlement math (AC8: no change to settlement)", async () => {
    const fake = makeTripViewFake({
      trip: { id: "t1", name: "Trip", location: null, starts_on: null, ends_on: null, invite_code: "abc", completed_at: null, created_by: "u1" },
      members: [
        { id: "m1", user_id: "u1", display_name: "Alex", joined_at: "2026-01-01", is_placeholder: false },
        { id: "m2", user_id: "u2", display_name: "Sam", joined_at: "2026-01-02", is_placeholder: false },
      ],
      expenses: [
        { id: "e1", paid_by: "u1", amount: "100.00", description: "Cabin", date: "2026-09-01", created_at: "2026-09-01T00:00:00Z" },
        { id: "e2", paid_by: "u2", amount: "0.00", description: "Gum", date: "2020-01-01", created_at: "2026-09-14T00:00:00Z" },
      ],
    });

    const view = await getTripView(fake, "t1", "u1");
    // Balance math should reflect amounts/payers only — an old expense date (e2) must not shift it.
    expect(view.totalCents).toBe(10_000);
    expect(view.members.find((m) => m.id === "m1")!.netCents).toBe(5_000);
    expect(view.members.find((m) => m.id === "m2")!.netCents).toBe(-5_000);
  });
});

describe("getTripView (add-placeholder-members: member identity keyed off trip_members.id)", () => {
  it("gives each placeholder its own id/balance instead of collapsing on a shared null user_id", async () => {
    const fake = makeTripViewFake({
      trip: { id: "t1", name: "Trip", location: null, starts_on: null, ends_on: null, invite_code: "abc", completed_at: null, created_by: "u1" },
      members: [
        { id: "m1", user_id: "u1", display_name: "Alex", joined_at: "2026-01-01", is_placeholder: false },
        { id: "ph1", user_id: null, display_name: "Dad", joined_at: "2026-01-02", is_placeholder: true },
        { id: "ph2", user_id: null, display_name: "Dad", joined_at: "2026-01-03", is_placeholder: true },
      ],
      expenses: [
        { id: "e1", paid_by: "u1", amount: "100.01", description: "Cabin", date: "2026-09-01", created_at: "2026-09-01T00:00:00Z" },
      ],
    });

    const view = await getTripView(fake, "t1", "u1");

    const ph1 = view.members.find((m) => m.id === "ph1")!;
    const ph2 = view.members.find((m) => m.id === "ph2")!;
    expect(ph1.isPlaceholder).toBe(true);
    expect(ph2.isPlaceholder).toBe(true);
    // 10001 cents / 3 members = 3333 base + a 2-cent remainder, distributed by join order (m1,
    // then ph1) — ph1 and ph2 must land on *different* shares, which is only possible if they
    // have distinct identities (not both collapsed onto a shared null user_id).
    expect(ph1.netCents).toBe(-3334);
    expect(ph2.netCents).toBe(-3333);
    expect(view.members.find((m) => m.id === "m1")!.isPlaceholder).toBe(false);
  });

  it("translates an expense's paid_by (a user_id) to the payer's trip_members.id", async () => {
    const fake = makeTripViewFake({
      trip: { id: "t1", name: "Trip", location: null, starts_on: null, ends_on: null, invite_code: "abc", completed_at: null, created_by: "u1" },
      members: [
        { id: "m1", user_id: "u1", display_name: "Alex", joined_at: "2026-01-01", is_placeholder: false },
        { id: "ph1", user_id: null, display_name: "Dad", joined_at: "2026-01-02", is_placeholder: true },
      ],
      expenses: [
        { id: "e1", paid_by: "u1", amount: "20.00", description: "Snacks", date: "2026-09-01", created_at: "2026-09-01T00:00:00Z" },
      ],
    });

    const view = await getTripView(fake, "t1", "u1");
    expect(view.expenses[0].payer.id).toBe("m1");
    expect(view.expenses[0].paidBy).toBe("m1");
  });
});
