import { describe, expect, it, vi } from "vitest";
import { getTripView, leaveTrip, removeTripMember, wasRemovedFromTrip } from "./trips";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

/**
 * QA coverage for remove-member-access (docs/features/remove-member-access/).
 * Focus areas per the architect's risk callouts:
 *  - removeTripMember/leaveTrip/wasRemovedFromTrip are thin RPC wrappers sending exactly the
 *    shape the RPCs expect, and rethrow backend rejections untouched (AC7, AC9, AC10, AC15).
 *  - The ghost-payer fix in getTripView: a removed member's past expenses must resolve to a
 *    defined, non-crashing payer object, excluded from the roster and from computeBalances'
 *    input (AC5, AC6, AC13, AC16, and the architect-flagged ghost-payer bug).
 */

function makeRpcFake(result: { data: unknown; error: unknown }) {
  const calls: { name: string; args: unknown }[] = [];
  const rpc = vi.fn((name: string, args: unknown) => {
    calls.push({ name, args });
    return Promise.resolve(result);
  });
  return { rpc, calls } as unknown as Client & { calls: typeof calls };
}

function makeTripViewFake(opts: {
  trip: Record<string, unknown>;
  members: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
}) {
  const from = vi.fn((table: string) => {
    const data = table === "trips" ? opts.trip : table === "trip_members" ? opts.members : opts.expenses;
    const resultPromise = Promise.resolve({ data, error: null });
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      single: () => resultPromise,
      then: resultPromise.then.bind(resultPromise),
    };
    return builder;
  });
  return { from } as unknown as Client;
}

describe("remove/leave RPC client wrappers (thin pass-through + error rethrow)", () => {
  it("removeTripMember calls remove_trip_member with only the member id", async () => {
    const fake = makeRpcFake({ data: null, error: null });
    await removeTripMember(fake, "m2");
    expect(fake.calls).toEqual([{ name: "remove_trip_member", args: { _member_id: "m2" } }]);
  });

  it("removeTripMember rethrows the backend's rejection untouched (non-organizer, self-target, or locked trip)", async () => {
    const fake = makeRpcFake({
      data: null,
      error: {
        message:
          "member not found, you are not the organizer, the trip is locked, or that member can't be removed this way",
      },
    });
    await expect(removeTripMember(fake, "self-id")).rejects.toMatchObject({
      message: expect.stringContaining("not the organizer"),
    });
  });

  it("leaveTrip calls leave_trip with only the trip id", async () => {
    const fake = makeRpcFake({ data: null, error: null });
    await leaveTrip(fake, "t1");
    expect(fake.calls).toEqual([{ name: "leave_trip", args: { _trip_id: "t1" } }]);
  });

  it("leaveTrip rethrows the backend's rejection untouched (organizer or locked trip)", async () => {
    const fake = makeRpcFake({
      data: null,
      error: { message: "you are not a member of this trip, you are the organizer, or the trip is locked" },
    });
    await expect(leaveTrip(fake, "t1")).rejects.toMatchObject({
      message: expect.stringContaining("the organizer"),
    });
  });

  it("wasRemovedFromTrip calls was_removed_from_trip with the trip id and coerces the RPC result to boolean", async () => {
    const fakeTrue = makeRpcFake({ data: true, error: null });
    expect(await wasRemovedFromTrip(fakeTrue, "t1")).toBe(true);
    expect(fakeTrue.calls).toEqual([{ name: "was_removed_from_trip", args: { _trip_id: "t1" } }]);

    const fakeFalse = makeRpcFake({ data: false, error: null });
    expect(await wasRemovedFromTrip(fakeFalse, "t1")).toBe(false);

    const fakeNull = makeRpcFake({ data: null, error: null });
    expect(await wasRemovedFromTrip(fakeNull, "t1")).toBe(false);
  });

  it("wasRemovedFromTrip rethrows RPC errors", async () => {
    const fake = makeRpcFake({ data: null, error: { message: "boom" } });
    await expect(wasRemovedFromTrip(fake, "t1")).rejects.toMatchObject({ message: "boom" });
  });
});

describe("getTripView: ghost-payer fix for a removed member's past expenses (AC5, AC6, AC13, AC16)", () => {
  it("does not crash and synthesizes a ghost payer when an expense's paid_by no longer resolves to any current member", async () => {
    const fake = makeTripViewFake({
      trip: {
        id: "t1",
        name: "Trip",
        location: null,
        starts_on: null,
        ends_on: null,
        invite_code: "abc",
        completed_at: null,
        created_by: "u1",
      },
      members: [
        // u2 was removed — their trip_members row is gone, but their expense remains (AC5, AC16).
        { id: "m1", user_id: "u1", display_name: "Alex", joined_at: "2026-01-01", is_placeholder: false },
        { id: "m3", user_id: "u3", display_name: "Sam", joined_at: "2026-01-02", is_placeholder: false },
      ],
      expenses: [
        {
          id: "e1",
          paid_by: "u2",
          amount: "90.00",
          description: "Removed member's dinner",
          date: "2026-09-01",
          created_at: "2026-09-01T00:00:00Z",
        },
        {
          id: "e2",
          paid_by: "u1",
          amount: "30.00",
          description: "Snacks",
          date: "2026-09-02",
          created_at: "2026-09-02T00:00:00Z",
        },
      ],
    });

    // Must not throw (this was the architect-flagged crash: `expense.payer.initials` on undefined).
    const view = await getTripView(fake, "t1", "u1");

    const ghostExpense = view.expenses.find((e) => e.id === "e1")!;
    expect(ghostExpense.payer).toBeDefined();
    expect(ghostExpense.payer.isRemoved).toBe(true);
    expect(ghostExpense.payer.displayName).toBe("Removed member");
    // amount/description unchanged (AC5, AC16) — untouched ledger row.
    expect(ghostExpense.amountCents).toBe(9_000);
    expect(ghostExpense.description).toBe("Removed member's dinner");

    const normalExpense = view.expenses.find((e) => e.id === "e2")!;
    expect(normalExpense.payer.isRemoved).toBeUndefined();
    expect(normalExpense.payer.displayName).toBe("Alex");
  });

  it("does not add the ghost payer to the roster (members array) returned for the Details tab", async () => {
    const fake = makeTripViewFake({
      trip: {
        id: "t1",
        name: "Trip",
        location: null,
        starts_on: null,
        ends_on: null,
        invite_code: "abc",
        completed_at: null,
        created_by: "u1",
      },
      members: [{ id: "m1", user_id: "u1", display_name: "Alex", joined_at: "2026-01-01", is_placeholder: false }],
      expenses: [
        {
          id: "e1",
          paid_by: "removed-user-id",
          amount: "40.00",
          description: "Gas",
          date: "2026-09-01",
          created_at: "2026-09-01T00:00:00Z",
        },
      ],
    });

    const view = await getTripView(fake, "t1", "u1");
    expect(view.members).toHaveLength(1);
    expect(view.members.map((m) => m.id)).toEqual(["m1"]);
  });

  it("the ghost payer does not become a share-owing member — remaining members' shares are computed over only current members (AC6)", async () => {
    const fake = makeTripViewFake({
      trip: {
        id: "t1",
        name: "Trip",
        location: null,
        starts_on: null,
        ends_on: null,
        invite_code: "abc",
        completed_at: null,
        created_by: "u1",
      },
      members: [
        { id: "m1", user_id: "u1", display_name: "Alex", joined_at: "2026-01-01", is_placeholder: false },
        { id: "m3", user_id: "u3", display_name: "Sam", joined_at: "2026-01-02", is_placeholder: false },
      ],
      expenses: [
        {
          id: "e1",
          paid_by: "removed-user-id",
          amount: "100.00",
          description: "Cabin, paid before removal",
          date: "2026-09-01",
          created_at: "2026-09-01T00:00:00Z",
        },
      ],
    });

    const view = await getTripView(fake, "t1", "u1");
    // Total ($100) still counts toward the trip total and is divided across the 2 *current*
    // members only ($50 each) — the removed member's spend counts toward the total but they are
    // not a share-owing party post-removal.
    expect(view.totalCents).toBe(10_000);
    expect(view.avgPerPersonCents).toBe(5_000);
    const alex = view.members.find((m) => m.id === "m1")!;
    const sam = view.members.find((m) => m.id === "m3")!;
    expect(alex.shareCents).toBe(5_000);
    expect(sam.shareCents).toBe(5_000);
    // Neither current member's paidCents credits the ghost's spend to them.
    expect(alex.paidCents).toBe(0);
    expect(sam.paidCents).toBe(0);
  });

  it("multiple expenses from the same removed payer collapse into a single ghost entry (not duplicated)", async () => {
    const fake = makeTripViewFake({
      trip: {
        id: "t1",
        name: "Trip",
        location: null,
        starts_on: null,
        ends_on: null,
        invite_code: "abc",
        completed_at: null,
        created_by: "u1",
      },
      members: [{ id: "m1", user_id: "u1", display_name: "Alex", joined_at: "2026-01-01", is_placeholder: false }],
      expenses: [
        { id: "e1", paid_by: "gone-user", amount: "10.00", description: "A", date: "2026-09-01", created_at: "2026-09-01T00:00:00Z" },
        { id: "e2", paid_by: "gone-user", amount: "20.00", description: "B", date: "2026-09-02", created_at: "2026-09-02T00:00:00Z" },
      ],
    });

    const view = await getTripView(fake, "t1", "u1");
    const payer1 = view.expenses.find((e) => e.id === "e1")!.payer;
    const payer2 = view.expenses.find((e) => e.id === "e2")!.payer;
    expect(payer1.id).toBe(payer2.id);
    expect(payer1).toEqual(payer2);
  });

  it("regression: a trip where every paid_by resolves to a current member is unaffected (no ghost entries)", async () => {
    const fake = makeTripViewFake({
      trip: {
        id: "t1",
        name: "Trip",
        location: null,
        starts_on: null,
        ends_on: null,
        invite_code: "abc",
        completed_at: null,
        created_by: "u1",
      },
      members: [
        { id: "m1", user_id: "u1", display_name: "Alex", joined_at: "2026-01-01", is_placeholder: false },
        { id: "m2", user_id: "u2", display_name: "Sam", joined_at: "2026-01-02", is_placeholder: false },
      ],
      expenses: [
        { id: "e1", paid_by: "u2", amount: "50.00", description: "Gas", date: "2026-09-01", created_at: "2026-09-01T00:00:00Z" },
      ],
    });
    const view = await getTripView(fake, "t1", "u1");
    expect(view.expenses.every((e) => e.payer.isRemoved === undefined)).toBe(true);
  });
});
