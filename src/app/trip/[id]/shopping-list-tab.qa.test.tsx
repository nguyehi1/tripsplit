// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ShoppingListItem, ShoppingListView } from "@/lib/data/shopping-list";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * QA coverage for shopping-list's List tab (docs/features/shopping-list) — `shopping-list-tab.tsx`.
 * Focus areas per the QA brief:
 *  - claim-race-lost UI message (AC3's UI half; the DB-layer half is covered by the migration's
 *    own .qa.test.ts)
 *  - unclaim control appears ONLY in "Your bag" rows (the viewer's own claims), never on a
 *    claimed-by-someone-else "To get" row (design.md section 3's superseded-decision note)
 *  - pre-claim delete is adder-only and disappears the instant an item is claimed by anyone,
 *    including the adder (AC5)
 *  - gating: unverified and locked-trip both render every circle/×/delete as inert (a plain
 *    non-interactive element, not a disabled button) rather than merely UI-disabled
 *  - lifecycle: a "Bought" (logged) row is a tap-through link to its expense, never has a claim
 *    or unclaim control
 */

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn(), replace: vi.fn() }),
}));

const getUserMock = vi.fn();
const claimRpcMock = vi.fn();
const unclaimRpcMock = vi.fn();
const deleteEqMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: getUserMock },
    rpc: (name: string, args: unknown) => {
      if (name === "claim_shopping_list_item") return claimRpcMock(args);
      if (name === "unclaim_shopping_list_item") return unclaimRpcMock(args);
      throw new Error(`Unexpected rpc ${name}`);
    },
    from: (table: string) => {
      if (table === "shopping_list_items") {
        return { delete: () => ({ eq: (col: string, val: string) => deleteEqMock(col, val) }) };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

// Minimal stand-in for verify-inline.tsx's TripVerificationProvider — shopping-list-tab.tsx only
// consumes `useTripVerification()`'s `verified` boolean, so a matching context shape here avoids
// pulling in the real provider's OTP-flow dependencies.
vi.mock("./verify-inline", () => {
  let currentVerified = true;
  return {
    __setVerified: (v: boolean) => {
      currentVerified = v;
    },
    useTripVerification: () => ({ verified: currentVerified, markVerified: vi.fn() }),
  };
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
  }
  container?.remove();
  root = null;
  container = null;
  vi.clearAllMocks();
});

function member(id: string, displayName: string): ShoppingListItem["addedBy"] {
  return { id, displayName, isPlaceholder: false, initials: displayName.slice(0, 2).toUpperCase(), avatar: { bg: "#fff", fg: "#000" } };
}

function makeItem(overrides: Partial<ShoppingListItem>): ShoppingListItem {
  return {
    id: "i1",
    description: "Firewood",
    status: "open",
    addedBy: member("m1", "You"),
    claimedBy: null,
    expenseId: null,
    ...overrides,
  };
}

function makeView(items: ShoppingListItem[], yourMemberId = "m1"): ShoppingListView {
  const toGet = items.filter((i) => i.status === "open" || (i.status === "claimed" && i.claimedBy?.id !== yourMemberId));
  const yourBag = items.filter((i) => i.status === "claimed" && i.claimedBy?.id === yourMemberId);
  const bought = items.filter((i) => i.status === "logged");
  return { items, toGet, yourBag, bought, yourMemberId };
}

async function renderTab(opts: {
  shoppingList: ShoppingListView | null;
  isCompleted?: boolean;
  verified?: boolean;
}) {
  const verifyModule = (await import("./verify-inline")) as unknown as { __setVerified: (v: boolean) => void };
  verifyModule.__setVerified(opts.verified ?? true);
  const { ShoppingListTab } = await import("./shopping-list-tab");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const onRefresh = vi.fn(async () => opts.shoppingList);
  await act(async () => {
    root!.render(
      <ShoppingListTab tripId="trip-1" isCompleted={opts.isCompleted ?? false} shoppingList={opts.shoppingList} onRefresh={onRefresh} />,
    );
  });
  return { container: container!, onRefresh };
}

function flushMicrotasks(times = 10) {
  return new Promise<void>((resolve) => {
    let n = 0;
    function tick() {
      n += 1;
      if (n >= times) resolve();
      else setTimeout(tick, 0);
    }
    setTimeout(tick, 0);
  });
}

beforeEach(() => {
  getUserMock.mockResolvedValue({ data: { user: { id: "user-m1", is_anonymous: false } } });
  claimRpcMock.mockResolvedValue({ data: null, error: null });
  unclaimRpcMock.mockResolvedValue({ data: null, error: null });
  deleteEqMock.mockResolvedValue({ data: null, error: null });
});

describe("ShoppingListTab — lifecycle rendering (open / claimed-by-other / your bag / bought)", () => {
  it("an open item shows a claim circle; a claimed-by-other item shows an avatar + '{name}'s got this'", async () => {
    const view = makeView([
      makeItem({ id: "i1", description: "Firewood", status: "open" }),
      makeItem({ id: "i2", description: "Ice", status: "claimed", claimedBy: member("m2", "Bob") }),
    ]);
    const { container } = await renderTab({ shoppingList: view });

    expect(container.querySelector(`button[aria-label="Claim 'Firewood'"]`)).not.toBeNull();
    expect(container.textContent).toContain("Bob's got this");
    expect(container.querySelector(`button[aria-label="Claim 'Ice'"]`)).toBeNull();
  });

  it("Your bag renders only the viewer's own claimed-unlogged items, with an Unclaim control", async () => {
    const view = makeView([
      makeItem({ id: "i1", description: "Sunscreen", status: "claimed", claimedBy: member("m1", "You") }),
      makeItem({ id: "i2", description: "Ice", status: "claimed", claimedBy: member("m2", "Bob") }),
    ]);
    const { container } = await renderTab({ shoppingList: view });

    expect(container.textContent).toContain("Your bag");
    expect(container.querySelector(`button[aria-label="Unclaim 'Sunscreen'"]`)).not.toBeNull();
    // No unclaim control anywhere for Bob's claim, even though it's visible in "To get".
    expect(container.querySelector(`button[aria-label="Unclaim 'Ice'"]`)).toBeNull();
  });

  it("a logged (Bought) item is a tap-through link to its expense, with no claim/unclaim control anywhere on the row", async () => {
    const view = makeView([makeItem({ id: "i1", description: "Firewood", status: "logged", claimedBy: member("m1", "You"), expenseId: "e1" })]);
    const { container } = await renderTab({ shoppingList: view });

    const link = container.querySelector('a[href="/trip/trip-1/expense/e1/edit"]');
    expect(link).not.toBeNull();
    expect(container.querySelector(`button[aria-label="Claim 'Firewood'"]`)).toBeNull();
    expect(container.querySelector(`button[aria-label="Unclaim 'Firewood'"]`)).toBeNull();
  });
});

describe("ShoppingListTab — pre-claim delete (AC5): adder-only, disappears once claimed", () => {
  it("shows a delete control on an open item the viewer added", async () => {
    const view = makeView([makeItem({ id: "i1", description: "Firewood", status: "open", addedBy: member("m1", "You") })]);
    const { container } = await renderTab({ shoppingList: view });
    expect(container.querySelector(`button[aria-label="Delete 'Firewood'"]`)).not.toBeNull();
  });

  it("does NOT show a delete control on an open item someone else added", async () => {
    const view = makeView([makeItem({ id: "i1", description: "Firewood", status: "open", addedBy: member("m2", "Bob") })]);
    const { container } = await renderTab({ shoppingList: view });
    expect(container.querySelector(`button[aria-label="Delete 'Firewood'"]`)).toBeNull();
  });

  it("does NOT show a delete control once the item is claimed, even if the viewer is both adder and claimer", async () => {
    const view = makeView([
      makeItem({ id: "i1", description: "Firewood", status: "claimed", addedBy: member("m1", "You"), claimedBy: member("m1", "You") }),
    ]);
    const { container } = await renderTab({ shoppingList: view });
    expect(container.querySelector(`button[aria-label="Delete 'Firewood'"]`)).toBeNull();
  });

  it("clicking delete shows an inline confirm, and confirming calls the delete RPC/RLS path", async () => {
    const view = makeView([makeItem({ id: "i1", description: "Firewood", status: "open", addedBy: member("m1", "You") })]);
    const { container } = await renderTab({ shoppingList: view });

    const deleteBtn = container.querySelector<HTMLButtonElement>(`button[aria-label="Delete 'Firewood'"]`)!;
    await act(async () => deleteBtn.click());
    expect(container.textContent).toContain(`Delete "Firewood"?`);

    const confirmBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Delete")!;
    await act(async () => {
      confirmBtn.click();
      await flushMicrotasks();
    });

    expect(deleteEqMock).toHaveBeenCalledWith("id", "i1");
  });
});

describe("ShoppingListTab — claim race lost (AC3 UI half, design.md section 9)", () => {
  it("shows 'Too slow — {name} already grabbed that.' when the claim RPC rejects and a refresh shows someone else now holds it", async () => {
    claimRpcMock.mockResolvedValue({ data: null, error: { message: "item was already claimed, deleted, or the trip is locked" } });
    const initial = makeView([makeItem({ id: "i1", description: "Firewood", status: "open" })]);
    const afterRace = makeView([makeItem({ id: "i1", description: "Firewood", status: "claimed", claimedBy: member("m2", "Bob") })]);

    const verifyModule = (await import("./verify-inline")) as unknown as { __setVerified: (v: boolean) => void };
    verifyModule.__setVerified(true);
    const { ShoppingListTab } = await import("./shopping-list-tab");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onRefresh = vi.fn(async () => afterRace);
    await act(async () => {
      root!.render(<ShoppingListTab tripId="trip-1" isCompleted={false} shoppingList={initial} onRefresh={onRefresh} />);
    });

    const claimBtn = container.querySelector<HTMLButtonElement>(`button[aria-label="Claim 'Firewood'"]`)!;
    await act(async () => {
      claimBtn.click();
      await flushMicrotasks();
    });

    expect(container.textContent).toContain("Too slow — Bob already grabbed that.");
  });
});

describe("ShoppingListTab — gating (unverified organizer / locked trip both render controls as genuinely inert)", () => {
  it("verified=false: the claim circle is not a <button> at all (no aria-label, no click handler)", async () => {
    const view = makeView([makeItem({ id: "i1", description: "Firewood", status: "open" })]);
    const { container } = await renderTab({ shoppingList: view, verified: false });
    expect(container.querySelector(`button[aria-label="Claim 'Firewood'"]`)).toBeNull();
    // The circle visual still renders (browsable, not hidden) — just not interactive.
    expect(container.textContent).toContain("Firewood");
  });

  it("verified=false: no delete control on the viewer's own open item", async () => {
    const view = makeView([makeItem({ id: "i1", description: "Firewood", status: "open", addedBy: member("m1", "You") })]);
    const { container } = await renderTab({ shoppingList: view, verified: false });
    expect(container.querySelector(`button[aria-label="Delete 'Firewood'"]`)).toBeNull();
  });

  it("verified=false: no unclaim control in Your bag", async () => {
    const view = makeView([makeItem({ id: "i1", description: "Sunscreen", status: "claimed", claimedBy: member("m1", "You") })]);
    const { container } = await renderTab({ shoppingList: view, verified: false });
    expect(container.querySelector(`button[aria-label="Unclaim 'Sunscreen'"]`)).toBeNull();
  });

  it("locked trip (isCompleted=true): claim/unclaim/delete controls all absent even for a verified viewer", async () => {
    const view = makeView([
      makeItem({ id: "i1", description: "Firewood", status: "open", addedBy: member("m1", "You") }),
      makeItem({ id: "i2", description: "Sunscreen", status: "claimed", claimedBy: member("m1", "You") }),
    ]);
    const { container } = await renderTab({ shoppingList: view, isCompleted: true, verified: true });
    expect(container.querySelector(`button[aria-label="Claim 'Firewood'"]`)).toBeNull();
    expect(container.querySelector(`button[aria-label="Delete 'Firewood'"]`)).toBeNull();
    expect(container.querySelector(`button[aria-label="Unclaim 'Sunscreen'"]`)).toBeNull();
    // Still browsable.
    expect(container.textContent).toContain("Firewood");
    expect(container.textContent).toContain("Sunscreen");
  });
});

describe("ShoppingListTab — empty states", () => {
  it("all-empty list shows 'Nothing on the list yet' copy", async () => {
    const { container } = await renderTab({ shoppingList: makeView([]) });
    expect(container.textContent).toContain("Nothing on the list yet");
  });

  it("failed shopping-list load (null view) shows the terse error copy, no crash", async () => {
    const { container } = await renderTab({ shoppingList: null });
    expect(container.textContent).toContain("Couldn't load the list — try again in a moment.");
  });

  it("'To get' empty but 'Bought' populated: shows the 'All caught up' line", async () => {
    const view = makeView([makeItem({ id: "i1", description: "Firewood", status: "logged", claimedBy: member("m1", "You"), expenseId: "e1" })]);
    const { container } = await renderTab({ shoppingList: view });
    expect(container.textContent).toContain("All caught up — nothing left to grab.");
  });
});
