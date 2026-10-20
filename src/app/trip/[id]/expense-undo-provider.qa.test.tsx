// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpenseActionError } from "@/lib/errors";
import { createDom } from "@/test/dom";
import { useExpenseUndo } from "./expense-undo-provider";

/**
 * QA coverage for the Undo toast (expense-delete-and-polish design.md section 3, criteria 2, 3, 5,
 * 6 UI side, 13, 32, 33): 10-second cosmetic timer, Undo flow and every fixed message, single
 * toast, hidden off the trip page but deadline kept, no double Undo, name-only analytics, always
 * mounted polite status region.
 */

const refreshMock = vi.fn();
// A tiny external store so a test can "navigate" and the provider re-renders.
const nav = vi.hoisted(() => {
  let path = "/trip/trip-1";
  const subs = new Set<() => void>();
  return {
    get: () => path,
    set: (p: string) => {
      path = p;
      subs.forEach((s) => s());
    },
    subscribe: (cb: () => void) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
});
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useRouter: () => ({ push: vi.fn(), refresh: refreshMock }),
    usePathname: () => useSyncExternalStore(nav.subscribe, nav.get, nav.get),
    useParams: () => ({ id: "trip-1" }),
  };
});

const deleteExpenseMock = vi.fn();
const undoDeleteExpenseMock = vi.fn();
vi.mock("@/lib/data/trips", () => ({
  deleteExpense: (...a: unknown[]) => deleteExpenseMock(...a),
  undoDeleteExpense: (...a: unknown[]) => undoDeleteExpenseMock(...a),
}));
const trackEventMock = vi.fn();
vi.mock("@/lib/tracking", () => ({ trackEvent: (...a: unknown[]) => trackEventMock(...a) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

const dom = createDom();

function Probe({ id }: { id: string }) {
  const { requestDelete } = useExpenseUndo();
  return (
    <button type="button" data-testid={`del-${id}`} onClick={() => void requestDelete(id).catch(() => {})}>
      del-{id}
    </button>
  );
}

async function mountProvider() {
  const { ExpenseUndoProvider } = await import("./expense-undo-provider");
  await dom.mount(
    <ExpenseUndoProvider>
      <Probe id="e1" />
      <Probe id="e2" />
    </ExpenseUndoProvider>,
  );
}

const click = (el: Element | undefined) =>
  act(async () => {
    (el as HTMLElement).click();
    await Promise.resolve();
  });
const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const probe = (id: string) => dom.container.querySelector(`[data-testid="del-${id}"]`)!;
const undoBtn = () => dom.button("Undo");
// Visible pill only (the sr-only status region keeps its announcement for ~10s by design).
const text = () => dom.container.querySelector(".fixed")?.textContent ?? "";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  nav.set("/trip/trip-1");
  deleteExpenseMock.mockResolvedValue(undefined);
  undoDeleteExpenseMock.mockResolvedValue(undefined);
});
afterEach(() => {
  dom.teardown();
  vi.useRealTimers();
});

describe("Undo toast", () => {
  it("always renders a polite status region, empty before any delete", async () => {
    await mountProvider();
    const region = dom.container.querySelector('[role="status"]');
    expect(region).not.toBeNull();
    expect(region?.className).toContain("sr-only");
    expect(region?.textContent).toBe("");
  });

  it("shows 'Expense deleted' + Undo after a delete, with no expense name/amount/id, then disappears after 10 seconds", async () => {
    await mountProvider();
    await click(probe("e1"));
    expect(text()).toContain("Expense deleted");
    expect(undoBtn()).toBeTruthy();
    expect(text()).not.toContain("e1​"); // sanity: no id leak formatting
    expect(dom.container.querySelector('[role="status"]')?.textContent).toBe("Expense deleted. Undo is available for a few seconds.");
    await tick(9_900);
    expect(undoBtn()).toBeTruthy();
    await tick(200);
    expect(undoBtn()).toBeFalsy();
    expect(text()).not.toMatch(/Expense deleted(?!\.)/);
  });

  it("Undo calls the RPC wrapper once with the right id, tracks the name-only event, refreshes and says 'Expense restored'", async () => {
    await mountProvider();
    await click(probe("e1"));
    await click(undoBtn());
    expect(undoDeleteExpenseMock).toHaveBeenCalledTimes(1);
    expect(undoDeleteExpenseMock.mock.calls[0][1]).toBe("e1");
    expect(trackEventMock).toHaveBeenCalledWith("expense_undo_complete");
    expect(trackEventMock.mock.calls.find((c) => c[0] === "expense_undo_complete")).toHaveLength(1);
    expect(refreshMock).toHaveBeenCalled();
    expect(text()).toContain("Expense restored");
    expect(undoBtn()).toBeFalsy();
    await tick(3_100);
    expect(text()).not.toContain("Expense restored");
  });

  it("a second tap while Undo is in flight sends no second request ('Restoring…', no button)", async () => {
    let release: () => void = () => {};
    undoDeleteExpenseMock.mockReturnValue(new Promise<void>((r) => (release = r)));
    await mountProvider();
    await click(probe("e1"));
    const btn = undoBtn();
    await click(btn);
    expect(text()).toContain("Restoring…");
    expect(undoBtn()).toBeFalsy();
    await click(btn); // stale reference
    expect(undoDeleteExpenseMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
      await Promise.resolve();
    });
  });

  it.each(["undo_unavailable", "not_allowed"] as const)(
    "server refusal (%s) shows the single too-late line, no button, refreshes the list, and clears after ~6s",
    async (code) => {
      undoDeleteExpenseMock.mockRejectedValue(new ExpenseActionError(code));
      await mountProvider();
      await click(probe("e1"));
      await click(undoBtn());
      expect(text()).toContain("Couldn't undo — it's too late, or the trip was locked.");
      expect(undoBtn()).toBeFalsy();
      expect(refreshMock).toHaveBeenCalled();
      expect(trackEventMock).not.toHaveBeenCalledWith("expense_undo_complete");
      await tick(6_100);
      expect(text()).not.toContain("too late");
    },
  );

  it("function-missing shows 'Undo isn't available right now.'", async () => {
    undoDeleteExpenseMock.mockRejectedValue(new ExpenseActionError("unavailable"));
    await mountProvider();
    await click(probe("e1"));
    await click(undoBtn());
    expect(text()).toContain("Undo isn't available right now.");
    expect(undoBtn()).toBeFalsy();
  });

  it.each(["unknown", "rate_limited"] as const)(
    "no-code failure (%s) shows the connection line and keeps Undo while time remains",
    async (code) => {
      undoDeleteExpenseMock.mockRejectedValueOnce(new ExpenseActionError(code));
      await mountProvider();
      await click(probe("e1"));
      await tick(2_000);
      await click(undoBtn());
      expect(text()).toContain("Couldn't undo — check your connection and try again.");
      expect(undoBtn()).toBeTruthy();
      await click(undoBtn()); // retry succeeds
      expect(text()).toContain("Expense restored");
    },
  );

  it("a raw non-ExpenseActionError rejection is treated as unknown, never shown", async () => {
    undoDeleteExpenseMock.mockRejectedValue(Object.assign(new Error("pg: secret detail"), { code: "XX000" }));
    await mountProvider();
    await click(probe("e1"));
    await click(undoBtn());
    expect(text()).not.toContain("secret");
    expect(text()).toContain("check your connection");
  });

  it("a new delete replaces the current toast: Undo then targets the newest expense only", async () => {
    await mountProvider();
    await click(probe("e1"));
    await click(probe("e2"));
    expect(dom.container.querySelectorAll("button").length).toBe(3); // two probes + one Undo
    await click(undoBtn());
    expect(undoDeleteExpenseMock).toHaveBeenCalledTimes(1);
    expect(undoDeleteExpenseMock.mock.calls[0][1]).toBe("e2");
  });

  it("a failed delete shows no toast", async () => {
    deleteExpenseMock.mockRejectedValue(new ExpenseActionError("not_allowed"));
    await mountProvider();
    await click(probe("e1"));
    expect(undoBtn()).toBeFalsy();
    expect(text()).not.toContain("Expense deleted");
  });

  it("is hidden off the trip page but keeps its deadline; reappears if back inside 10s, gone after", async () => {
    await mountProvider();
    await click(probe("e1"));
    expect(undoBtn()).toBeTruthy();

    await tick(3_000);
    await act(async () => nav.set("/trip/trip-1/settle-up"));
    expect(undoBtn()).toBeFalsy(); // hidden on settle-up although a toast is pending

    await tick(3_000);
    await act(async () => nav.set("/trip/trip-1")); // back at 6s: still inside the 10s
    expect(undoBtn()).toBeTruthy();
    await click(undoBtn());
    expect(undoDeleteExpenseMock).toHaveBeenCalledTimes(1);
  });

  it("coming back to the trip page after the 10 seconds shows nothing", async () => {
    await mountProvider();
    await click(probe("e1"));
    await act(async () => nav.set("/trip/trip-1/invite"));
    await tick(10_500);
    await act(async () => nav.set("/trip/trip-1"));
    expect(undoBtn()).toBeFalsy();
    expect(text()).not.toContain("Expense deleted");
  });

  it("hidden while a sheet route is open (edit sheet path)", async () => {
    await mountProvider();
    await click(probe("e1"));
    await act(async () => nav.set("/trip/trip-1/expense/e1/edit"));
    expect(undoBtn()).toBeFalsy();
  });

  it("toast container is pointer-events-none with only the pill interactive, and not aria-hidden", async () => {
    await mountProvider();
    await click(probe("e1"));
    const wrapper = undoBtn().closest(".fixed") as HTMLElement;
    expect(wrapper.className).toContain("pointer-events-none");
    expect(wrapper.className).toContain("bottom-[106px]");
    expect(wrapper.getAttribute("aria-hidden")).toBeNull();
    expect((undoBtn().parentElement as HTMLElement).className).toContain("pointer-events-auto");
  });

  it("copy never makes a backup / erased-everywhere / only-you claim (criterion 32)", async () => {
    undoDeleteExpenseMock.mockRejectedValue(new ExpenseActionError("undo_unavailable"));
    await mountProvider();
    await click(probe("e1"));
    const waiting = text();
    await click(undoBtn());
    for (const t of [waiting, text()]) {
      expect(t).not.toMatch(/backup|all systems|only you|forever|permanently/i);
    }
  });
});
