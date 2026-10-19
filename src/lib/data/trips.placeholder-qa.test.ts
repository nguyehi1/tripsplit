import { describe, expect, it, vi } from "vitest";
import {
  addPlaceholderMember,
  getMyTrips,
  getTripView,
  removePlaceholderMember,
  renamePlaceholderMember,
} from "./trips";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

/**
 * QA regression/coverage suite for the add-placeholder-members feature.
 * Focus areas per the architect's risk callouts:
 *  - settlement math correctness with placeholders (full share, $0 paid, no cross-placeholder
 *    balance collisions)
 *  - getMyTrips (not just getTripView) also uses trip_members.id as identity
 *  - the three RPC client wrappers send exactly the params/shape the RPCs expect and rethrow
 *    backend errors (organizer-only / placeholder-only / cap / locked-trip rejections) untouched
 *  - zero-placeholder trips are unaffected by the identity-key change (regression)
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

/**
 * Fake for getMyTrips: trips.select().order(), trip_members.select().in().order(),
 * expenses.select().in(), shopping_list_items.select().in().neq() ("N to get", redesign-ui
 * follow-up — empty here since this file's own assertions are about placeholder-member identity
 * keys, not the shopping-list count).
 */
function makeMyTripsFake(opts: {
  trips: Record<string, unknown>[];
  members: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
}) {
  const from = vi.fn((table: string) => {
    const data =
      table === "trips" ? opts.trips : table === "trip_members" ? opts.members : table === "expenses" ? opts.expenses : [];
    const resultPromise = Promise.resolve({ data, error: null });
    const builder: Record<string, unknown> = {
      select: () => builder,
      order: () => resultPromise, // trips ends the chain here
      in: () => builder, // trip_members/expenses/shopping_list_items continue with .in().order()/.in().neq()/just .in()
      neq: () => resultPromise, // shopping_list_items ends with .in().neq()
      then: resultPromise.then.bind(resultPromise),
    };
    return builder;
  });
  return { from } as unknown as Client;
}

describe("placeholder RPC client wrappers (thin pass-through + error rethrow)", () => {
  it("addPlaceholderMember calls add_placeholder_member with the trip id and trimmed-by-caller name", async () => {
    const fake = makeRpcFake({ data: "new-member-id", error: null });
    const id = await addPlaceholderMember(fake, { tripId: "t1", displayName: "Dad" });
    expect(fake.calls).toEqual([{ name: "add_placeholder_member", args: { _trip_id: "t1", _display_name: "Dad" } }]);
    expect(id).toBe("new-member-id");
  });

  it("addPlaceholderMember rethrows the backend's cap-exceeded error untouched", async () => {
    const fake = makeRpcFake({
      data: null,
      error: { message: "This trip already has 20 placeholders — the most this feature supports. Remove one first." },
    });
    await expect(addPlaceholderMember(fake, { tripId: "t1", displayName: "21st" })).rejects.toMatchObject({
      message: expect.stringContaining("20 placeholders"),
    });
  });

  it("addPlaceholderMember rethrows the backend's organizer/lock rejection untouched", async () => {
    const fake = makeRpcFake({
      data: null,
      error: { message: "only the trip organizer can add a placeholder to an open trip" },
    });
    await expect(addPlaceholderMember(fake, { tripId: "t1", displayName: "X" })).rejects.toMatchObject({
      message: expect.stringContaining("organizer"),
    });
  });

  it("renamePlaceholderMember calls rename_placeholder_member with member id + new name", async () => {
    const fake = makeRpcFake({ data: null, error: null });
    await renamePlaceholderMember(fake, { memberId: "ph1", displayName: "Dad Jr" });
    expect(fake.calls).toEqual([
      { name: "rename_placeholder_member", args: { _member_id: "ph1", _display_name: "Dad Jr" } },
    ]);
  });

  it("renamePlaceholderMember rethrows a not-found/not-organizer/locked error (e.g. targeting a real member's id)", async () => {
    const fake = makeRpcFake({
      data: null,
      error: { message: "placeholder not found, you are not the organizer, or the trip is locked" },
    });
    await expect(renamePlaceholderMember(fake, { memberId: "real-member-id", displayName: "Hacked" })).rejects.toMatchObject(
      { message: expect.stringContaining("not the organizer") },
    );
  });

  it("removePlaceholderMember calls remove_placeholder_member with only the member id", async () => {
    const fake = makeRpcFake({ data: null, error: null });
    await removePlaceholderMember(fake, "ph1");
    expect(fake.calls).toEqual([{ name: "remove_placeholder_member", args: { _member_id: "ph1" } }]);
  });

  it("removePlaceholderMember rethrows a not-found/not-organizer/locked error", async () => {
    const fake = makeRpcFake({
      data: null,
      error: { message: "placeholder not found, you are not the organizer, or the trip is locked" },
    });
    await expect(removePlaceholderMember(fake, "real-member-id")).rejects.toMatchObject({
      message: expect.stringContaining("locked"),
    });
  });
});

describe("getTripView: settlement math correctness with placeholders (AC9)", () => {
  it("a single placeholder counts as one full share, contributes $0 paid, and owes its full share", async () => {
    const fake = makeTripViewFake({
      trip: { id: "t1", name: "Trip", location: null, starts_on: null, ends_on: null, invite_code: "abc", completed_at: null, created_by: "u1" },
      members: [
        { id: "m1", user_id: "u1", display_name: "Alex", joined_at: "2026-01-01", is_placeholder: false },
        { id: "ph1", user_id: null, display_name: "Dad", joined_at: "2026-01-02", is_placeholder: true },
      ],
      expenses: [{ id: "e1", paid_by: "u1", amount: "100.00", description: "Cabin", date: "2026-09-01", created_at: "2026-09-01T00:00:00Z" }],
    });

    const view = await getTripView(fake, "t1", "u1");
    const placeholder = view.members.find((m) => m.id === "ph1")!;
    const alex = view.members.find((m) => m.id === "m1")!;

    expect(placeholder.paidCents).toBe(0);
    expect(placeholder.shareCents).toBe(5_000);
    expect(placeholder.netCents).toBe(-5_000);
    expect(alex.paidCents).toBe(10_000);
    expect(alex.netCents).toBe(5_000);

    // Settlement direction: the placeholder must be the one who "owes" (from side), never the "to" side.
    expect(view.settlements).toEqual([{ fromMemberId: "ph1", toMemberId: "m1", amountCents: 5_000, from: expect.anything(), to: expect.anything() }]);
    expect(view.settlements[0].from.id).toBe("ph1");
    expect(view.settlements[0].from.isPlaceholder).toBe(true);
    expect(view.settlements[0].to.isPlaceholder).toBe(false);
  });

  it("three placeholders with zero expenses each get their own correct, non-colliding equal share", async () => {
    const fake = makeTripViewFake({
      trip: { id: "t1", name: "Trip", location: null, starts_on: null, ends_on: null, invite_code: "abc", completed_at: null, created_by: "u1" },
      members: [
        { id: "m1", user_id: "u1", display_name: "Alex", joined_at: "2026-01-01", is_placeholder: false },
        { id: "ph1", user_id: null, display_name: "Kid A", joined_at: "2026-01-02", is_placeholder: true },
        { id: "ph2", user_id: null, display_name: "Kid A", joined_at: "2026-01-03", is_placeholder: true }, // duplicate name, allowed
        { id: "ph3", user_id: null, display_name: "Kid B", joined_at: "2026-01-04", is_placeholder: true },
      ],
      expenses: [{ id: "e1", paid_by: "u1", amount: "400.00", description: "Cabin", date: "2026-09-01", created_at: "2026-09-01T00:00:00Z" }],
    });

    const view = await getTripView(fake, "t1", "u1");
    // 40000 cents / 4 members = exactly 10000 each, no remainder — every placeholder should be
    // identical and independent, not one shared/collapsed balance object.
    const placeholders = view.members.filter((m) => m.isPlaceholder);
    expect(placeholders).toHaveLength(3);
    for (const p of placeholders) {
      expect(p.paidCents).toBe(0);
      expect(p.shareCents).toBe(10_000);
      expect(p.netCents).toBe(-10_000);
    }
    // Distinct ids/objects — not the same object/reference reused for all three.
    expect(new Set(placeholders.map((p) => p.id)).size).toBe(3);

    // 3 separate transactions from each placeholder to Alex.
    expect(view.settlements).toHaveLength(3);
    expect(view.settlements.every((s) => s.amountCents === 10_000 && s.to.id === "m1")).toBe(true);
    expect(new Set(view.settlements.map((s) => s.from.id))).toEqual(new Set(["ph1", "ph2", "ph3"]));
  });

  it("removing a placeholder (simulated by omission) immediately recomputes the remaining members' shares (AC13)", async () => {
    const withPlaceholder = makeTripViewFake({
      trip: { id: "t1", name: "Trip", location: null, starts_on: null, ends_on: null, invite_code: "abc", completed_at: null, created_by: "u1" },
      members: [
        { id: "m1", user_id: "u1", display_name: "Alex", joined_at: "2026-01-01", is_placeholder: false },
        { id: "m2", user_id: "u2", display_name: "Sam", joined_at: "2026-01-02", is_placeholder: false },
        { id: "ph1", user_id: null, display_name: "Dad", joined_at: "2026-01-03", is_placeholder: true },
      ],
      expenses: [{ id: "e1", paid_by: "u1", amount: "90.00", description: "Cabin", date: "2026-09-01", created_at: "2026-09-01T00:00:00Z" }],
    });
    const beforeView = await getTripView(withPlaceholder, "t1", "u1");
    expect(beforeView.members.find((m) => m.id === "m2")!.shareCents).toBe(3_000); // 9000 / 3

    const withoutPlaceholder = makeTripViewFake({
      trip: { id: "t1", name: "Trip", location: null, starts_on: null, ends_on: null, invite_code: "abc", completed_at: null, created_by: "u1" },
      members: [
        { id: "m1", user_id: "u1", display_name: "Alex", joined_at: "2026-01-01", is_placeholder: false },
        { id: "m2", user_id: "u2", display_name: "Sam", joined_at: "2026-01-02", is_placeholder: false },
      ],
      expenses: [{ id: "e1", paid_by: "u1", amount: "90.00", description: "Cabin", date: "2026-09-01", created_at: "2026-09-01T00:00:00Z" }],
    });
    const afterView = await getTripView(withoutPlaceholder, "t1", "u1");
    expect(afterView.members.find((m) => m.id === "m2")!.shareCents).toBe(4_500); // 9000 / 2, live-recomputed
  });

  it("regression: a trip with zero placeholders behaves exactly as before (real members only)", async () => {
    const fake = makeTripViewFake({
      trip: { id: "t1", name: "Trip", location: null, starts_on: null, ends_on: null, invite_code: "abc", completed_at: null, created_by: "u1" },
      members: [
        { id: "m1", user_id: "u1", display_name: "Alex", joined_at: "2026-01-01", is_placeholder: false },
        { id: "m2", user_id: "u2", display_name: "Sam", joined_at: "2026-01-02", is_placeholder: false },
      ],
      expenses: [{ id: "e1", paid_by: "u2", amount: "50.00", description: "Gas", date: "2026-09-01", created_at: "2026-09-01T00:00:00Z" }],
    });
    const view = await getTripView(fake, "t1", "u1");
    expect(view.members.every((m) => m.isPlaceholder === false)).toBe(true);
    expect(view.you?.id).toBe("m1");
    expect(view.you?.netCents).toBe(-2_500);
    expect(view.settlements).toEqual([
      { fromMemberId: "m1", toMemberId: "m2", amountCents: 2_500, from: expect.anything(), to: expect.anything() },
    ]);
  });
});

describe("getMyTrips: identity-key fix applies here too, not just getTripView", () => {
  it("does not collapse multiple placeholders' balances on My Trips list", async () => {
    const fake = makeMyTripsFake({
      trips: [{ id: "t1", name: "Ski trip", location: null, starts_on: null, ends_on: null, completed_at: null, created_by: "u1", created_at: "2026-01-01T00:00:00Z" }],
      members: [
        { id: "m1", trip_id: "t1", user_id: "u1", display_name: "Alex", joined_at: "2026-01-01", is_placeholder: false },
        { id: "ph1", trip_id: "t1", user_id: null, display_name: "Kid", joined_at: "2026-01-02", is_placeholder: true },
        { id: "ph2", trip_id: "t1", user_id: null, display_name: "Kid", joined_at: "2026-01-03", is_placeholder: true },
      ],
      expenses: [{ id: "e1", trip_id: "t1", paid_by: "u1", amount: "30.00", description: "Snacks" }],
    });

    const trips = await getMyTrips(fake, "u1");
    expect(trips).toHaveLength(1);
    const trip = trips[0];
    expect(trip.members).toHaveLength(3);
    expect(new Set(trip.members.map((m) => m.id)).size).toBe(3); // no id collisions
    expect(trip.members.filter((m) => m.isPlaceholder)).toHaveLength(2);
    // Alex paid $30 across 3 members -> 1000 each; Alex's yourNetCents should be +2000, not
    // corrupted by placeholder id collisions in the balances map.
    expect(trip.yourNetCents).toBe(2_000);
  });

  it("regression: My Trips for a trip with only real members is unaffected", async () => {
    const fake = makeMyTripsFake({
      trips: [{ id: "t1", name: "Trip", location: null, starts_on: null, ends_on: null, completed_at: null, created_by: "u1", created_at: "2026-01-01T00:00:00Z" }],
      members: [
        { id: "m1", trip_id: "t1", user_id: "u1", display_name: "Alex", joined_at: "2026-01-01", is_placeholder: false },
        { id: "m2", trip_id: "t1", user_id: "u2", display_name: "Sam", joined_at: "2026-01-02", is_placeholder: false },
      ],
      expenses: [{ id: "e1", trip_id: "t1", paid_by: "u2", amount: "20.00", description: "Coffee" }],
    });
    const trips = await getMyTrips(fake, "u1");
    expect(trips[0].yourNetCents).toBe(-1_000);
    expect(trips[0].members.every((m) => !m.isPlaceholder)).toBe(true);
  });
});
