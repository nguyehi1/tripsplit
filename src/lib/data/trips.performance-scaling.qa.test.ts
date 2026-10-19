import { describe, expect, it, vi } from "vitest";
import { getMyTrips } from "./trips";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

/**
 * QA coverage for performance-scaling's Tier 1 `/trips` fix (architecture.md's "/trips — two
 * tiers"): `getMyTrips`'s new optional `prefetchedTripRows` parameter. Focus:
 *  - when rows are supplied, `getMyTrips` must not perform its own `trips` select at all (that's
 *    the entire point of the fix — letting the caller fetch it concurrently with `getUser()`
 *    instead of sequentially before this function even starts) — a wiring/behavior assertion, not
 *    just a "the mock didn't throw" smoke test.
 *  - when rows are omitted, behavior is byte-for-byte the pre-existing self-fetch path (regression
 *    guard for every other/test call site named in architecture.md's impact analysis).
 *  - split/settlement output (yourNetCents, member balances) is identical whether the `trips` rows
 *    arrive via self-fetch or via the caller — the fix must be pure call-ordering, never a
 *    computation change.
 */

function makeMyTripsFake(opts: {
  trips: Record<string, unknown>[];
  members: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
}) {
  const tripsSelectCalls: unknown[] = [];
  const from = vi.fn((table: string) => {
    // "N to get" (redesign-ui follow-up): `getMyTrips` also queries `shopping_list_items` via
    // `.select(...).in(...).neq("status", "logged")` — empty here since this file's own
    // assertions are about `trips`/`trip_members`/`expenses` wiring, not the shopping-list count.
    const data =
      table === "trip_members" ? opts.members : table === "expenses" ? opts.expenses : table === "trips" ? opts.trips : [];
    const resultPromise = Promise.resolve({ data, error: null });
    const builder: Record<string, unknown> = {
      select: (...args: unknown[]) => {
        if (table === "trips") tripsSelectCalls.push(args);
        return builder;
      },
      order: () => resultPromise, // trips ends the chain here
      in: () => builder, // trip_members/expenses/shopping_list_items continue with .in().order()/.in().neq()/just .in()
      neq: () => resultPromise, // shopping_list_items ends with .in().neq()
      then: resultPromise.then.bind(resultPromise),
    };
    return builder;
  });
  return { from, tripsSelectCalls } as unknown as Client & { tripsSelectCalls: unknown[] };
}

const tripRow = {
  id: "t1",
  name: "Ski trip",
  location: null,
  starts_on: null,
  ends_on: null,
  invite_code: "ABC12345",
  completed_at: null,
  created_by: "u1",
  created_at: "2026-01-01T00:00:00Z",
};
const memberRows = [
  { id: "m1", trip_id: "t1", user_id: "u1", display_name: "Alex", joined_at: "2026-01-01", is_placeholder: false },
  { id: "m2", trip_id: "t1", user_id: "u2", display_name: "Sam", joined_at: "2026-01-02", is_placeholder: false },
];
const expenseRows = [{ id: "e1", trip_id: "t1", paid_by: "u2", amount: "20.00", description: "Coffee" }];

describe("getMyTrips: prefetchedTripRows (performance-scaling Tier 1)", () => {
  it("never calls its own trips select when prefetchedTripRows is supplied", async () => {
    const fake = makeMyTripsFake({ trips: [tripRow], members: memberRows, expenses: expenseRows });
    await getMyTrips(fake, "u1", [tripRow]);
    expect(fake.tripsSelectCalls).toHaveLength(0);
    // trip_members/expenses are still fetched for real.
    expect(fake.from).toHaveBeenCalledWith("trip_members");
    expect(fake.from).toHaveBeenCalledWith("expenses");
    expect(fake.from).not.toHaveBeenCalledWith("trips");
  });

  it("still performs its own trips select when prefetchedTripRows is omitted (every other/existing call site, byte-for-byte unchanged)", async () => {
    const fake = makeMyTripsFake({ trips: [tripRow], members: memberRows, expenses: expenseRows });
    await getMyTrips(fake, "u1");
    expect(fake.tripsSelectCalls.length).toBeGreaterThan(0);
    expect(fake.from).toHaveBeenCalledWith("trips");
  });

  it("returns byte-for-byte identical balances/output whether trips rows are self-fetched or supplied by the caller (split-calc regression)", async () => {
    const selfFetch = makeMyTripsFake({ trips: [tripRow], members: memberRows, expenses: expenseRows });
    const prefetched = makeMyTripsFake({ trips: [tripRow], members: memberRows, expenses: expenseRows });

    const viaSelfFetch = await getMyTrips(selfFetch, "u1");
    const viaPrefetched = await getMyTrips(prefetched, "u1", [tripRow]);

    expect(viaPrefetched).toEqual(viaSelfFetch);
    expect(viaSelfFetch[0].yourNetCents).toBe(-1_000);
  });

  it("an empty prefetchedTripRows array short-circuits to [] without querying trip_members/expenses (edge case: user genuinely has zero trips)", async () => {
    const fake = makeMyTripsFake({ trips: [], members: [], expenses: [] });
    const result = await getMyTrips(fake, "u1", []);
    expect(result).toEqual([]);
    expect(fake.from).not.toHaveBeenCalledWith("trip_members");
    expect(fake.from).not.toHaveBeenCalledWith("expenses");
  });
});
