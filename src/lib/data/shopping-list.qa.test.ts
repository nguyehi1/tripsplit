import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  addExpenseWithShoppingItems,
  addShoppingListItems,
  claimShoppingListItem,
  deleteShoppingListItem,
  getShoppingListView,
  unclaimShoppingListItem,
} from "./shopping-list";

type Client = SupabaseClient<Database>;

/**
 * QA coverage for shopping-list (docs/features/shopping-list) — `src/lib/data/shopping-list.ts`.
 * Focus areas per the QA brief:
 *  - getShoppingListView's open/yourBag/bought grouping and myClaimedUnloggedCount (AC1, AC2, AC9,
 *    AC-badge)
 *  - a claim/add belonging to a member row no longer present (ADR 0013's accepted "ghost"
 *    null-out) degrades to a null ref rather than throwing
 *  - the RPC wrappers send exactly the params the backend RPCs expect and rethrow backend errors
 *    (claim race loss, claimer-only rejection) untouched, matching the placeholder-RPC test
 *    file's own established convention
 */

function makeItemsAndMembersFake(opts: { items: Record<string, unknown>[]; members: Record<string, unknown>[] }) {
  const from = vi.fn((table: string) => {
    const data = table === "shopping_list_items" ? opts.items : opts.members;
    const resultPromise = Promise.resolve({ data, error: null });
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      order: () => resultPromise,
      then: resultPromise.then.bind(resultPromise),
    };
    return builder;
  });
  return { from } as unknown as Client;
}

const member = (id: string, displayName: string, isPlaceholder = false) => ({
  id,
  user_id: isPlaceholder ? null : `user-${id}`,
  display_name: displayName,
  is_placeholder: isPlaceholder,
  joined_at: "2026-01-01",
});

describe("getShoppingListView — grouping (To get / Your bag / Bought)", () => {
  it("an open item and an item claimed by someone else both land in toGet; only the viewer's own claims land in yourBag", async () => {
    const members = [member("m1", "You"), member("m2", "Bob")];
    const fake = makeItemsAndMembersFake({
      members,
      items: [
        { id: "i1", trip_id: "t1", description: "Firewood", added_by: "m1", claimed_by: null, status: "open", expense_id: null },
        { id: "i2", trip_id: "t1", description: "Ice", added_by: "m2", claimed_by: "m2", status: "claimed", expense_id: null },
        { id: "i3", trip_id: "t1", description: "Sunscreen", added_by: "m1", claimed_by: "m1", status: "claimed", expense_id: null },
      ],
    });

    const view = await getShoppingListView(fake, "t1", "user-m1");

    expect(view.toGet.map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(view.yourBag.map((i) => i.id)).toEqual(["i3"]);
    expect(view.bought).toEqual([]);
    expect(view.myClaimedUnloggedCount).toBe(1);
    expect(view.yourMemberId).toBe("m1");
  });

  it("logged items land only in bought, never in toGet or yourBag, regardless of who claimed them", async () => {
    const members = [member("m1", "You")];
    const fake = makeItemsAndMembersFake({
      members,
      items: [{ id: "i1", trip_id: "t1", description: "Firewood", added_by: "m1", claimed_by: "m1", status: "logged", expense_id: "e1" }],
    });

    const view = await getShoppingListView(fake, "t1", "user-m1");
    expect(view.bought.map((i) => i.id)).toEqual(["i1"]);
    expect(view.toGet).toEqual([]);
    expect(view.yourBag).toEqual([]);
    expect(view.myClaimedUnloggedCount).toBe(0);
    expect(view.bought[0].expenseId).toBe("e1");
  });

  it("badge count is exactly the viewer's own claimed-unlogged count, 0 when they have none (AC: badge absent at 0)", async () => {
    const members = [member("m1", "You"), member("m2", "Bob")];
    const fake = makeItemsAndMembersFake({
      members,
      items: [{ id: "i1", trip_id: "t1", description: "Ice", added_by: "m2", claimed_by: "m2", status: "claimed", expense_id: null }],
    });
    const view = await getShoppingListView(fake, "t1", "user-m1");
    expect(view.myClaimedUnloggedCount).toBe(0);
  });

  it("a viewer who isn't a current trip_members row (e.g. mid-removal race) gets yourMemberId null and nothing misclassified into yourBag", async () => {
    const members = [member("m2", "Bob")];
    const fake = makeItemsAndMembersFake({
      members,
      items: [{ id: "i1", trip_id: "t1", description: "Ice", added_by: "m2", claimed_by: "m2", status: "claimed", expense_id: null }],
    });
    const view = await getShoppingListView(fake, "t1", "user-not-a-member");
    expect(view.yourMemberId).toBeNull();
    expect(view.yourBag).toEqual([]);
    expect(view.toGet.map((i) => i.id)).toEqual(["i1"]);
  });
});

describe("getShoppingListView — ADR 0013 accepted gap: a removed member's claim/add reference degrades to null, not a throw", () => {
  it("claimed_by/added_by pointing at a member id no longer present in trip_members resolves to a null ref, doesn't crash the shape", async () => {
    const members = [member("m1", "You")];
    const fake = makeItemsAndMembersFake({
      members,
      // "ph-gone" no longer exists in `members` — simulates the accepted "ghost payer"-style gap
      // architecture.md documents for a logged item whose claimer was later removed.
      items: [{ id: "i1", trip_id: "t1", description: "Firewood", added_by: null, claimed_by: "ph-gone", status: "logged", expense_id: "e1" }],
    });
    const view = await getShoppingListView(fake, "t1", "user-m1");
    expect(view.items[0].addedBy).toBeNull();
    expect(view.items[0].claimedBy).toBeNull();
  });
});

describe("getShoppingListView — placeholder members never surface as claimants", () => {
  it("a placeholder trip_members row present in the roster is never the one classified as the viewer's own claim, even by coincidence of matching ids", async () => {
    // Placeholders always have user_id: null (ADR 0004), so they can never equal a real
    // currentUserId — this test pins that the shaping logic doesn't special-case around that
    // invariant in a way that would accidentally match a placeholder by id alone.
    const members = [member("m1", "You"), member("ph1", "Dad", true)];
    const fake = makeItemsAndMembersFake({
      members,
      items: [{ id: "i1", trip_id: "t1", description: "Cooler", added_by: "m1", claimed_by: null, status: "open", expense_id: null }],
    });
    const view = await getShoppingListView(fake, "t1", "user-m1");
    expect(view.yourMemberId).toBe("m1");
    expect(view.yourMemberId).not.toBe("ph1");
  });
});

describe("shopping-list.ts RPC/write wrappers — thin pass-through + error rethrow (matches trips.ts placeholder-wrapper convention)", () => {
  function makeRpcFake(result: { data: unknown; error: unknown }) {
    const calls: { name: string; args: unknown }[] = [];
    const rpc = vi.fn((name: string, args: unknown) => {
      calls.push({ name, args });
      return Promise.resolve(result);
    });
    return { rpc, calls } as unknown as Client & { calls: typeof calls };
  }

  it("claimShoppingListItem calls claim_shopping_list_item with only the item id", async () => {
    const fake = makeRpcFake({ data: null, error: null });
    await claimShoppingListItem(fake, "item-1");
    expect(fake.calls).toEqual([{ name: "claim_shopping_list_item", args: { _item_id: "item-1" } }]);
  });

  it("claimShoppingListItem rethrows a lost-race rejection untouched (AC3)", async () => {
    const fake = makeRpcFake({ data: null, error: { message: "item was already claimed, deleted, or the trip is locked" } });
    await expect(claimShoppingListItem(fake, "item-1")).rejects.toMatchObject({
      message: expect.stringContaining("already claimed"),
    });
  });

  it("unclaimShoppingListItem calls unclaim_shopping_list_item with only the item id (no member id passed client-side)", async () => {
    const fake = makeRpcFake({ data: null, error: null });
    await unclaimShoppingListItem(fake, "item-1");
    expect(fake.calls).toEqual([{ name: "unclaim_shopping_list_item", args: { _item_id: "item-1" } }]);
  });

  it("unclaimShoppingListItem rethrows a claimer-only rejection untouched (AC4)", async () => {
    const fake = makeRpcFake({ data: null, error: { message: "item was not claimed by you, already logged, or the trip is locked" } });
    await expect(unclaimShoppingListItem(fake, "item-1")).rejects.toMatchObject({
      message: expect.stringContaining("not claimed by you"),
    });
  });

  it("addExpenseWithShoppingItems calls add_expense_and_log_shopping_items with the full item id array and dollar-converted amount", async () => {
    const fake = makeRpcFake({ data: { id: "e1" }, error: null });
    await addExpenseWithShoppingItems(fake, {
      tripId: "t1",
      amountCents: 4250,
      description: "Firewood, Ice",
      date: "2026-09-20",
      itemIds: ["i1", "i2"],
    });
    expect(fake.calls).toEqual([
      {
        name: "add_expense_and_log_shopping_items",
        args: { _trip_id: "t1", _amount: 42.5, _description: "Firewood, Ice", _date: "2026-09-20", _item_ids: ["i1", "i2"] },
      },
    ]);
  });

  it("addExpenseWithShoppingItems rethrows the atomic-RPC's staleness rejection untouched (AC6)", async () => {
    const fake = makeRpcFake({
      data: null,
      error: { message: "one or more selected items are no longer claimed by you — refresh and try again" },
    });
    await expect(
      addExpenseWithShoppingItems(fake, { tripId: "t1", amountCents: 100, description: "x", itemIds: ["i1"] }),
    ).rejects.toMatchObject({ message: expect.stringContaining("no longer claimed by you") });
  });

  it("addShoppingListItems inserts one row per non-empty description, all tagged with the same addedBy", async () => {
    const insertMock = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const from = vi.fn(() => ({ insert: insertMock }));
    const fake = { from } as unknown as Client;
    await addShoppingListItems(fake, { tripId: "t1", addedBy: "m1", descriptions: ["Firewood", "Ice"] });
    expect(insertMock).toHaveBeenCalledWith([
      { trip_id: "t1", added_by: "m1", description: "Firewood" },
      { trip_id: "t1", added_by: "m1", description: "Ice" },
    ]);
  });

  it("deleteShoppingListItem issues a plain delete scoped by id, relying on RLS for adder/open-only enforcement", async () => {
    const eqMock = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const deleteMock = vi.fn(() => ({ eq: eqMock }));
    const from = vi.fn(() => ({ delete: deleteMock }));
    const fake = { from } as unknown as Client;
    await deleteShoppingListItem(fake, "item-1");
    expect(eqMock).toHaveBeenCalledWith("id", "item-1");
  });
});
