// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * QA coverage for shopping-list's extension of the add-expense sheet (docs/features/shopping-list,
 * requirements.md AC8/AC9/AC12, design.md sections 5/6, architecture.md section 4/section 3's
 * description-merge algorithm).
 *
 * Covers:
 *  - "From your bag" pills render only when the caller has claimed-unlogged items
 *  - toggling pills composes the description per design.md section 6's three worked examples
 *    (blank+select, typed-prefix+select, select-then-deselect)
 *  - the amount field is never touched/auto-filled by pill toggling
 *  - zero items selected -> the existing `expenses` insert path (addExpense), byte-for-byte
 *    unchanged from before this feature (AC9, "skip the list entirely")
 *  - one or more items selected -> the new `add_expense_and_log_shopping_items` RPC, with exactly
 *    the selected item ids
 *  - claimed-items fetch failure degrades to a non-blocking notice, never blocks the zero-items
 *    submit path (design.md section 5)
 */

const replaceMock = vi.fn();
const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn(), replace: replaceMock, refresh: refreshMock }),
}));

const getUserMock = vi.fn();
const insertMock = vi.fn();
const rpcMock = vi.fn();

type ClaimedFetch = { mode: "ok"; items: { id: string; description: string }[] } | { mode: "error" };

function createSupabaseMock(opts: {
  tripRow: { completed_at: string | null; created_by: string };
  memberCount?: number;
  claimed: ClaimedFetch;
  ownMemberId?: string | null;
}) {
  const memberCount = opts.memberCount ?? 2;
  return {
    auth: { getUser: getUserMock },
    rpc: rpcMock,
    from: (table: string) => {
      if (table === "trip_members") {
        return {
          select: (cols: string) => {
            const builder = {
              eq: () => builder,
              maybeSingle: () =>
                Promise.resolve({
                  data: opts.ownMemberId ? { id: opts.ownMemberId } : null,
                  error: null,
                }),
              then: (resolve: (value: { count: number }) => void) => {
                if (cols.includes("count") || cols === "id") resolve({ count: memberCount });
              },
            };
            return builder;
          },
        };
      }
      if (table === "trips") {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: opts.tripRow, error: null }) }) }) };
      }
      if (table === "shopping_list_items") {
        return {
          select: () => {
            const builder = {
              eq: () => builder,
              order: () => {
                if (opts.claimed.mode === "error") return Promise.resolve({ data: null, error: { message: "boom" } });
                return Promise.resolve({ data: opts.claimed.items, error: null });
              },
            };
            return builder;
          },
        };
      }
      if (table === "expenses") {
        return {
          insert: (row: unknown) => {
            insertMock(row);
            return { select: () => ({ single: () => Promise.resolve({ data: { id: "expense-1" }, error: null }) }) };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

let supabaseMock: ReturnType<typeof createSupabaseMock>;
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => supabaseMock,
}));

const organizerId = "owner-1";
const memberId = "m1";
const tripRow = { completed_at: null, created_by: organizerId };

async function renderAddExpenseSheetContent() {
  const { AddExpenseSheetContent } = await import("./add-expense-sheet-content");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<AddExpenseSheetContent tripId="trip-1" />);
  });
  return { container, root };
}

function flushMicrotasks(times = 15) {
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

function setValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function pillButtons(container: HTMLElement) {
  return Array.from(container.querySelectorAll('button[aria-pressed]'));
}

function clickPill(container: HTMLElement, label: string) {
  const btn = pillButtons(container).find((b) => b.textContent?.includes(label));
  if (!btn) throw new Error(`No pill found for "${label}"`);
  (btn as HTMLButtonElement).click();
}

function getFields(container: HTMLElement) {
  return {
    amount: container.querySelector<HTMLInputElement>('input[placeholder="0.00"]')!,
    description: container.querySelector<HTMLInputElement>('input[placeholder="Cabin, lift tickets, groceries…"]')!,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: organizerId, is_anonymous: false } } });
  rpcMock.mockResolvedValue({ data: { id: "expense-rpc-1" }, error: null });
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("AddExpenseSheetContent — 'From your bag' pills (design-reference Screen 4)", () => {
  it("renders no pill block when the caller has zero claimed-unlogged items", async () => {
    supabaseMock = createSupabaseMock({
      tripRow,
      claimed: { mode: "ok", items: [] },
      ownMemberId: memberId,
    });
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(container.textContent).not.toContain("From your bag");
    expect(pillButtons(container)).toHaveLength(0);

    root.unmount();
  });

  it("renders a toggle pill per claimed-unlogged item once the fetch resolves", async () => {
    supabaseMock = createSupabaseMock({
      tripRow,
      claimed: { mode: "ok", items: [{ id: "i1", description: "Firewood" }, { id: "i2", description: "Ice" }] },
      ownMemberId: memberId,
    });
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(container.textContent).toContain("From your bag");
    expect(pillButtons(container)).toHaveLength(2);
    expect(container.textContent).toContain("0 of 2 selected");

    root.unmount();
  });

  it("design.md section 6 case 1: blank field, select one pill -> description becomes just that item's name", async () => {
    supabaseMock = createSupabaseMock({
      tripRow,
      claimed: { mode: "ok", items: [{ id: "i1", description: "Firewood" }] },
      ownMemberId: memberId,
    });
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    await act(async () => {
      clickPill(container, "Firewood");
    });

    const { description } = getFields(container);
    expect(description.value).toBe("Firewood");

    root.unmount();
  });

  it("design.md section 6 case 1b: blank field, select two pills in order -> comma-joined", async () => {
    supabaseMock = createSupabaseMock({
      tripRow,
      claimed: { mode: "ok", items: [{ id: "i1", description: "Firewood" }, { id: "i2", description: "Ice" }] },
      ownMemberId: memberId,
    });
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    await act(async () => clickPill(container, "Firewood"));
    await act(async () => clickPill(container, "Ice"));

    expect(getFields(container).description.value).toBe("Firewood, Ice");

    root.unmount();
  });

  it("design.md section 6 case 2: typed prefix, then select a pill -> hand-typed text is preserved, pill appended", async () => {
    supabaseMock = createSupabaseMock({
      tripRow,
      claimed: { mode: "ok", items: [{ id: "i1", description: "Firewood" }] },
      ownMemberId: memberId,
    });
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    const { description } = getFields(container);
    await act(async () => setValue(description, "Gas for the rental car"));
    await act(async () => clickPill(container, "Firewood"));

    expect(description.value).toBe("Gas for the rental car, Firewood");

    root.unmount();
  });

  it("design.md section 6 case 3: select-then-deselect via pill tap removes only that pill's own fragment, order-preserving", async () => {
    supabaseMock = createSupabaseMock({
      tripRow,
      claimed: {
        mode: "ok",
        items: [{ id: "i1", description: "Firewood" }, { id: "i2", description: "Ice" }, { id: "i3", description: "Sunscreen" }],
      },
      ownMemberId: memberId,
    });
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    await act(async () => clickPill(container, "Firewood"));
    await act(async () => clickPill(container, "Ice"));
    await act(async () => clickPill(container, "Sunscreen"));
    expect(getFields(container).description.value).toBe("Firewood, Ice, Sunscreen");

    // Deselect the middle pill (Ice) by tapping it again.
    await act(async () => clickPill(container, "Ice"));
    expect(getFields(container).description.value).toBe("Firewood, Sunscreen");

    root.unmount();
  });

  it("toggling pills never touches the amount field (amount is always hand-typed, per AC/design.md)", async () => {
    supabaseMock = createSupabaseMock({
      tripRow,
      claimed: { mode: "ok", items: [{ id: "i1", description: "Firewood" }] },
      ownMemberId: memberId,
    });
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    const { amount } = getFields(container);
    expect(amount.value).toBe("");
    await act(async () => clickPill(container, "Firewood"));
    expect(amount.value).toBe("");

    root.unmount();
  });

  it("claimed-items fetch failure shows the non-blocking notice, no pills, and doesn't crash the form", async () => {
    supabaseMock = createSupabaseMock({ tripRow, claimed: { mode: "error" }, ownMemberId: memberId });
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(container.textContent).toContain("Couldn't load your bag — you can still add this expense the usual way.");
    expect(pillButtons(container)).toHaveLength(0);
    // The amount field must still be present/usable — the fetch failure never blocks the primary flow.
    expect(container.querySelector('input[placeholder="0.00"]')).not.toBeNull();

    root.unmount();
  });
});

describe("AddExpenseSheetContent — submission branch point (AC9: skip-the-list unchanged, AC8: RPC when items selected)", () => {
  it("zero items selected: calls the existing expenses insert (addExpense), never the shopping-list RPC", async () => {
    supabaseMock = createSupabaseMock({
      tripRow,
      claimed: { mode: "ok", items: [{ id: "i1", description: "Firewood" }] },
      ownMemberId: memberId,
    });
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    const { amount, description } = getFields(container);
    await act(async () => setValue(amount, "20.00"));
    await act(async () => setValue(description, "Coffee"));

    const submit = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Add an expense"))!;
    await act(async () => {
      submit.click();
      await flushMicrotasks();
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ trip_id: "trip-1", paid_by: organizerId, description: "Coffee" }),
    );
    expect(rpcMock).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/trip/trip-1");

    root.unmount();
  });

  it("one or more items selected: calls add_expense_and_log_shopping_items with exactly the selected item ids, never the plain insert", async () => {
    supabaseMock = createSupabaseMock({
      tripRow,
      claimed: { mode: "ok", items: [{ id: "i1", description: "Firewood" }, { id: "i2", description: "Ice" }] },
      ownMemberId: memberId,
    });
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    await act(async () => clickPill(container, "Firewood"));
    const { amount } = getFields(container);
    await act(async () => setValue(amount, "15.00"));

    const submit = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Add an expense"))!;
    await act(async () => {
      submit.click();
      await flushMicrotasks();
    });

    expect(rpcMock).toHaveBeenCalledWith(
      "add_expense_and_log_shopping_items",
      expect.objectContaining({ _trip_id: "trip-1", _item_ids: ["i1"], _amount: 15 }),
    );
    expect(insertMock).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/trip/trip-1");

    root.unmount();
  });
});
