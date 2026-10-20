// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpenseActionError } from "@/lib/errors";
import { createDom } from "@/test/dom";

/**
 * QA coverage for expense-delete-and-polish criteria 1, 2, 7, 11, 13, 15 (UI side) on
 * `EditExpenseSheetContent`: the Delete control only exists for the payer on an open trip (hidden,
 * never disabled, decided from loaded data), the in-flight state disables both buttons, every
 * failure shows the one neutral line, the unverified session is sent to verify with nothing
 * deleted, and a zero-row read (deleted / erased / never existed) shows the not-found state with
 * no retry.
 */

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn(), replace: vi.fn(), refresh: refreshMock }),
}));

const getUserMock = vi.fn();
const updateExpenseMock = vi.fn();
const deleteExpenseMock = vi.fn();
vi.mock("@/lib/data/trips", () => ({
  updateExpense: (...args: unknown[]) => updateExpenseMock(...args),
  deleteExpense: (...args: unknown[]) => deleteExpenseMock(...args),
  undoDeleteExpense: vi.fn(),
}));

const trackEventMock = vi.fn();
vi.mock("@/lib/tracking", () => ({ trackEvent: (...a: unknown[]) => trackEventMock(...a) }));

type Opts = {
  expense: { data: unknown; error: { code?: string; message?: string } | null };
  isLocked?: boolean;
};

function supabaseFor(opts: Opts) {
  return {
    auth: { getUser: getUserMock },
    from: (table: string) => {
      if (table === "expenses") {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve(opts.expense) }) }) };
      }
      if (table === "trips") {
        return {
          select: () => ({
            eq: () => ({ single: () => Promise.resolve({ data: { completed_at: opts.isLocked ? "2026-01-01" : null }, error: null }) }),
          }),
        };
      }
      if (table === "trip_members") {
        const builder = {
          eq: () => builder,
          maybeSingle: () => Promise.resolve({ data: { display_name: "Alex" }, error: null }),
        };
        return { select: () => builder };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

let supabaseMock: ReturnType<typeof supabaseFor>;
vi.mock("@/lib/supabase/client", () => ({ createClient: () => supabaseMock }));

const dom = createDom();
const row = { paid_by: "payer-1", amount: "42.00", description: "Firewood", date: "2026-09-20" };

async function mountSheet(opts: Opts, userId = "payer-1", isAnonymous = false) {
  getUserMock.mockResolvedValue({ data: { user: { id: userId, is_anonymous: isAnonymous } } });
  supabaseMock = supabaseFor(opts);
  const { EditExpenseSheetContent } = await import("./edit-expense-sheet-content");
  await dom.mount(<EditExpenseSheetContent tripId="trip-1" expenseId="exp-1" />);
  await dom.flush();
  await dom.flush();
}

const deleteButton = () => dom.button("Delete expense");

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => dom.teardown());

describe("Delete control visibility (criteria 1 and 7)", () => {
  it("payer on an open trip sees the Delete icon button, with Save still present", async () => {
    await mountSheet({ expense: { data: row, error: null } });
    expect(deleteButton()).toBeTruthy();
    expect(dom.button("Save changes")).toBeTruthy();
    expect(dom.container.textContent).not.toContain("brought back");
  });

  it("a non-payer gets no Delete control at all (hidden, not disabled)", async () => {
    await mountSheet({ expense: { data: row, error: null } }, "someone-else");
    expect(deleteButton()).toBeFalsy();
    expect(dom.container.textContent).not.toContain("Delete expense");
    expect(dom.container.textContent).toContain("Only Alex can edit this expense.");
  });

  it("the payer on a locked trip gets no Delete control", async () => {
    await mountSheet({ expense: { data: row, error: null }, isLocked: true });
    expect(deleteButton()).toBeFalsy();
    expect(dom.container.textContent).not.toContain("Delete expense");
    expect(dom.container.textContent).toContain("This trip is locked");
  });
});

describe("Delete flow (criteria 2, 13)", () => {
  it("success: calls deleteExpense with only the id, tracks the name-only event, goes back to the trip and refreshes", async () => {
    deleteExpenseMock.mockResolvedValue(undefined);
    await mountSheet({ expense: { data: row, error: null } });
    await import("react").then(({ act }) =>
      act(async () => {
        deleteButton().click();
        await new Promise((r) => setTimeout(r, 0));
      }),
    );
    expect(deleteExpenseMock).toHaveBeenCalledTimes(1);
    expect(deleteExpenseMock.mock.calls[0][1]).toBe("exp-1");
    expect(deleteExpenseMock.mock.calls[0]).toHaveLength(2);
    expect(trackEventMock).toHaveBeenCalledWith("expense_delete_complete");
    expect(trackEventMock.mock.calls.filter((c) => c[0] === "expense_delete_complete")[0]).toHaveLength(1);
    expect(pushMock).toHaveBeenCalledWith("/trip/trip-1");
    expect(refreshMock).toHaveBeenCalled();
    expect(updateExpenseMock).not.toHaveBeenCalled();
  });

  it("in flight: both Delete and Save are disabled and a second tap sends no second request", async () => {
    const { act } = await import("react");
    let release: () => void = () => {};
    deleteExpenseMock.mockReturnValue(new Promise<void>((r) => (release = r)));
    await mountSheet({ expense: { data: row, error: null } });
    await act(async () => {
      deleteButton().click();
      await new Promise((r) => setTimeout(r, 0));
    });
    const pending = dom.button("Deleting…") as HTMLButtonElement;
    expect(pending).toBeTruthy();
    expect(pending.disabled).toBe(true);
    expect((dom.button("Save changes") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      pending.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(deleteExpenseMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 0));
    });
  });

  it.each(["not_allowed", "undo_unavailable", "rate_limited", "unavailable", "unknown"] as const)(
    "failure code %s shows the one neutral line, re-enables the buttons and never navigates",
    async (code) => {
      const { act } = await import("react");
      deleteExpenseMock.mockRejectedValue(new ExpenseActionError(code));
      await mountSheet({ expense: { data: row, error: null } });
      await act(async () => {
        deleteButton().click();
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(dom.container.textContent).toContain("Couldn't delete that expense. Please try again.");
      expect((deleteButton() as HTMLButtonElement).disabled).toBe(false);
      expect((dom.button("Save changes") as HTMLButtonElement).disabled).toBe(false);
      expect(pushMock).not.toHaveBeenCalled();
      expect(trackEventMock).not.toHaveBeenCalledWith("expense_delete_complete");
    },
  );

  it("a raw (non-ExpenseActionError) rejection never leaks its text into the UI", async () => {
    const { act } = await import("react");
    deleteExpenseMock.mockRejectedValue(Object.assign(new Error("db secret: relation expenses"), { code: "XX000" }));
    await mountSheet({ expense: { data: row, error: null } });
    await act(async () => {
      deleteButton().click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(dom.container.textContent).toContain("Couldn't delete that expense. Please try again.");
    expect(dom.container.textContent).not.toContain("secret");
  });

  it("an unverified (anonymous) session is sent to verify and nothing is deleted", async () => {
    const { act } = await import("react");
    await mountSheet({ expense: { data: row, error: null } }, "payer-1", true);
    await act(async () => {
      deleteButton().click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(deleteExpenseMock).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(String(pushMock.mock.calls[0][0])).toContain("/check-email?trigger=invitee-expense");
  });
});

describe("Opening a deleted or missing expense (criterion 11)", () => {
  it("PGRST116 shows the not-found state with Back to trip and no Try again, no contents", async () => {
    await mountSheet({ expense: { data: null, error: { code: "PGRST116", message: "0 rows" } } });
    expect(dom.container.textContent).toContain("This expense isn't available anymore.");
    const back = Array.from(dom.container.querySelectorAll("a")).find((a) => a.textContent?.includes("Back to trip"));
    expect(back?.getAttribute("href")).toBe("/trip/trip-1");
    expect(dom.container.textContent).not.toContain("Try again");
    expect(dom.container.textContent).not.toContain("deleted");
    expect(deleteButton()).toBeFalsy();
    expect(dom.container.textContent).not.toContain("Firewood");
  });

  it("a network failure (no code) keeps the generic error with Try again", async () => {
    await mountSheet({ expense: { data: null, error: { message: "Failed to fetch" } } });
    expect(dom.container.textContent).toContain("Couldn't open that expense — try again.");
    expect(dom.container.textContent).toContain("Try again");
    expect(dom.container.textContent).not.toContain("isn't available anymore");
  });
});
