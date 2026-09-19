// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * QA follow-up (bug-fix verification pass, 2026-09-18) for two changes made together to
 * `AddExpenseSheetContent`'s `handleSubmit`:
 *
 * 1. A dynamic, field-specific validation message on the early-return branch (previously a single
 *    generic string regardless of which field(s) were actually missing) — pure component logic,
 *    fully testable in jsdom.
 * 2. A `router.refresh()` call added right after the success-path `router.push('/trip/[id]')`, to
 *    fix a reported bug where a saved expense didn't visually appear (stale client router cache).
 *    This file only asserts that `refresh()` is actually invoked after a successful submit, as a
 *    regression guard against the call being removed/reordered again — it CANNOT verify that
 *    `router.refresh()` actually invalidates Next.js's client router cache in a real browser, since
 *    jsdom/Vitest has no real App Router client cache to observe. That property needs a real
 *    browser/manual check (see docs/features/ux-revamp/qa-report.md's "Bug-fix verification" section
 *    for the residual gap this leaves).
 */

const replaceMock = vi.fn();
const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn(), replace: replaceMock, refresh: refreshMock }),
}));

const getUserMock = vi.fn();
const insertMock = vi.fn();

function createSupabaseMock(tripRow: { completed_at: string | null; created_by: string }, memberCount = 2) {
  return {
    auth: { getUser: getUserMock },
    from: (table: string) => {
      if (table === "trip_members") {
        return { select: () => ({ eq: () => Promise.resolve({ count: memberCount }) }) };
      }
      if (table === "trips") {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: tripRow, error: null }) }) }) };
      }
      if (table === "expenses") {
        return {
          insert: (row: unknown) => {
            insertMock(row);
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: "expense-1" }, error: null }),
              }),
            };
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

function setValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function clickButtonWithText(container: HTMLElement, text: string) {
  const buttons = Array.from(container.querySelectorAll("button"));
  const button = buttons.find((b) => b.textContent?.includes(text));
  if (!button) throw new Error(`No button found with text "${text}" — found: ${buttons.map((b) => b.textContent).join(" | ")}`);
  button.click();
}

function getFields(container: HTMLElement) {
  return {
    amount: container.querySelector<HTMLInputElement>('input[placeholder="0.00"]')!,
    description: container.querySelector<HTMLInputElement>('input[placeholder="Cabin, lift tickets, groceries…"]')!,
    date: container.querySelector<HTMLInputElement>('input[type="date"]')!,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock = createSupabaseMock(tripRow);
  getUserMock.mockResolvedValue({ data: { user: { id: organizerId, is_anonymous: false } } });
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("AddExpenseSheetContent — dynamic validation message", () => {
  it("missing amount only: names just the amount", async () => {
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    const { description } = getFields(container);
    setValue(description, "Groceries");
    // amount left blank, date defaults to today (valid)

    await act(async () => {
      clickButtonWithText(container, "Add an expense");
      await flushMicrotasks();
    });

    expect(container.textContent).toContain("Enter an amount.");
    expect(container.textContent).not.toContain("what it was for");
    expect(container.textContent).not.toContain("a valid date");
    expect(pushMock).not.toHaveBeenCalled();

    root.unmount();
  });

  it("missing description only: names just the description", async () => {
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    const { amount } = getFields(container);
    setValue(amount, "42.00");
    // description left blank, date defaults to today (valid)

    await act(async () => {
      clickButtonWithText(container, "Add an expense");
      await flushMicrotasks();
    });

    expect(container.textContent).toContain("Enter what it was for.");
    expect(container.textContent).not.toContain("an amount");
    expect(container.textContent).not.toContain("a valid date");
    expect(pushMock).not.toHaveBeenCalled();

    root.unmount();
  });

  it("invalid (future) date only: names just the date", async () => {
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    const { amount, description, date } = getFields(container);
    setValue(amount, "10.00");
    setValue(description, "Snacks");
    setValue(date, "2099-01-01");

    await act(async () => {
      clickButtonWithText(container, "Add an expense");
      await flushMicrotasks();
    });

    expect(container.textContent).toContain("Enter a valid date (today or earlier).");
    expect(container.textContent).not.toContain("Enter an amount");
    expect(container.textContent).not.toContain("what it was for.");
    expect(pushMock).not.toHaveBeenCalled();

    root.unmount();
  });

  it("multiple missing fields (amount + description): lists both, comma-joined, in field order", async () => {
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });
    // Leave amount and description both blank; date defaults to today (valid).

    await act(async () => {
      clickButtonWithText(container, "Add an expense");
      await flushMicrotasks();
    });

    expect(container.textContent).toContain("Enter an amount, what it was for.");
    expect(container.textContent).not.toContain("a valid date");
    expect(pushMock).not.toHaveBeenCalled();

    root.unmount();
  });

  it("all three fields missing/invalid: lists all three, comma-joined", async () => {
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    const { date } = getFields(container);
    setValue(date, "2099-01-01");
    // amount and description left blank

    await act(async () => {
      clickButtonWithText(container, "Add an expense");
      await flushMicrotasks();
    });

    expect(container.textContent).toContain("Enter an amount, what it was for, a valid date (today or earlier).");
    expect(pushMock).not.toHaveBeenCalled();

    root.unmount();
  });

  it("valid input clears a previously-shown validation message and submits", async () => {
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    // First trigger the error...
    await act(async () => {
      clickButtonWithText(container, "Add an expense");
      await flushMicrotasks();
    });
    expect(container.textContent).toContain("Enter an amount, what it was for.");

    // ...then fill in valid values and resubmit.
    const { amount, description } = getFields(container);
    setValue(amount, "20.00");
    setValue(description, "Coffee");

    await act(async () => {
      clickButtonWithText(container, "Add an expense");
      await flushMicrotasks();
    });

    expect(container.textContent).not.toContain("Enter an amount");
    expect(pushMock).toHaveBeenCalledWith("/trip/trip-1");

    root.unmount();
  });
});

describe("AddExpenseSheetContent — router.refresh() after a successful submit (bug-fix regression guard)", () => {
  it("calls router.push('/trip/[id]') followed by router.refresh() exactly once each on success", async () => {
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    const { amount, description } = getFields(container);
    setValue(amount, "15.50");
    setValue(description, "Tolls");

    await act(async () => {
      clickButtonWithText(container, "Add an expense");
      await flushMicrotasks();
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/trip/trip-1");
    expect(refreshMock).toHaveBeenCalledTimes(1);

    // This only proves both calls happen, in this order, from the success path — it cannot
    // prove `router.refresh()` actually invalidates a real Next.js client router cache, since
    // jsdom has no such cache to observe. See qa-report.md for the residual manual-verification
    // gap this leaves.
    const pushOrder = pushMock.mock.invocationCallOrder[0];
    const refreshOrder = refreshMock.mock.invocationCallOrder[0];
    expect(pushOrder).toBeLessThan(refreshOrder);

    root.unmount();
  });

  it("does NOT call router.refresh() when submit fails validation (early-return path)", async () => {
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });
    // Leave all fields invalid/blank.

    await act(async () => {
      clickButtonWithText(container, "Add an expense");
      await flushMicrotasks();
    });

    expect(pushMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();

    root.unmount();
  });
});
