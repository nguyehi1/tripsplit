import { describe, expect, it, vi } from "vitest";
import { getTripSummary } from "./trips";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

/**
 * QA coverage for the simplified-onboarding feature's public summary tier
 * (`get_trip_summary` RPC wrapper). Focus areas per the architect's risk callouts:
 *  - shape: `paid_cents`/`share_cents` -> `netCents` computed in TS, handed straight to
 *    `simplifyDebts` unchanged (architecture.md's "Data model changes" section)
 *  - "not found" (RPC returns zero rows) mirrors `getTripByInviteCode`'s null shape
 *  - RPC errors are rethrown, not swallowed (so page-level try/catch collapses them into the
 *    "couldn't load" branch, same as every other data-layer function here)
 */

/**
 * Pre-push review fix 1: `get_trip_summary` (migration 0012) now also returns `invite_code`, so
 * `getTripSummary` must surface it as `inviteCode` — this is what lets `TripSummaryOnly`
 * (src/app/trip/[id]/page.tsx) build a `/check-email?invite=<code>` link for a bare `/trip/[id]`
 * visitor, closing the verify-but-never-join loop.
 */

function makeRpcFake(result: { data: unknown; error: unknown }) {
  const calls: { name: string; args: unknown }[] = [];
  const rpc = vi.fn((name: string, args: unknown) => {
    calls.push({ name, args });
    return Promise.resolve(result);
  });
  return { rpc, calls } as unknown as Client & { calls: typeof calls };
}

describe("getTripSummary", () => {
  it("calls get_trip_summary with the trip id and computes net from paid/share", async () => {
    const fake = makeRpcFake({
      data: [
        { member_id: "m1", display_name: "Alex", paid_cents: 10_000, share_cents: 5_000, invite_code: "abc123" },
        { member_id: "m2", display_name: "Sam", paid_cents: 0, share_cents: 5_000, invite_code: "abc123" },
      ],
      error: null,
    });

    const summary = await getTripSummary(fake, "t1");

    expect(fake.calls).toEqual([{ name: "get_trip_summary", args: { _trip_id: "t1" } }]);
    expect(summary).not.toBeNull();
    expect(summary!.totalCents).toBe(10_000);
    expect(summary!.avgPerPersonCents).toBe(5_000);
    expect(summary!.inviteCode).toBe("abc123");
    // Alex is owed $50, Sam owes $50 — simplifyDebts should resolve this to one transaction.
    expect(summary!.settlements).toEqual([
      { fromMemberId: "m2", toMemberId: "m1", amountCents: 5_000, from: expect.anything(), to: expect.anything() },
    ]);
    expect(summary!.settlements[0].from.displayName).toBe("Sam");
    expect(summary!.settlements[0].to.displayName).toBe("Alex");
  });

  it("returns null for an unknown trip id (RPC returns zero rows), matching getTripByInviteCode's shape", async () => {
    const fake = makeRpcFake({ data: [], error: null });
    const summary = await getTripSummary(fake, "does-not-exist");
    expect(summary).toBeNull();
  });

  it("rethrows an RPC error rather than swallowing it", async () => {
    const fake = makeRpcFake({ data: null, error: { message: "division by zero" } });
    await expect(getTripSummary(fake, "t1")).rejects.toMatchObject({ message: "division by zero" });
  });

  it("a trip with no expenses yet returns zero balances and no settlements, not a crash", async () => {
    const fake = makeRpcFake({
      data: [
        { member_id: "m1", display_name: "Alex", paid_cents: 0, share_cents: 0 },
        { member_id: "m2", display_name: "Sam", paid_cents: 0, share_cents: 0 },
      ],
      error: null,
    });
    const summary = await getTripSummary(fake, "t1");
    expect(summary!.totalCents).toBe(0);
    expect(summary!.settlements).toEqual([]);
  });
});
