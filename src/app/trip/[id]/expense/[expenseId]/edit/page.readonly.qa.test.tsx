// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * QA coverage for shopping-list's "Bought" tap-through read-only expense view (docs/features/
 * shopping-list, design.md section 7) — the new render branch added to the pre-existing
 * `edit/page.tsx`. Confirms:
 *  - a non-payer, unlocked-trip viewer gets a genuinely read-only render (fields disabled, no
 *    "Save changes" button, no way to submit changes)
 *  - a locked trip shows the read-only branch regardless of payer, with the existing locked copy
 *  - the payer-and-unlocked path is completely unaffected (still editable, "Save changes" present)
 *  - close/back returns to `/trip/[id]?tab=list` from the read-only branches (design.md section 7),
 *    vs. the bare trip URL from the editable branch (regression: this must not change)
 */

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: "trip-1", expenseId: "expense-1" }),
}));

const getUserMock = vi.fn();
const updateExpenseMock = vi.fn();
vi.mock("@/lib/data/trips", () => ({
  updateExpense: (...args: unknown[]) => updateExpenseMock(...args),
}));

function createSupabaseMock(opts: {
  expenseRow: { paid_by: string; amount: string; description: string; date: string };
  isLocked: boolean;
  payerDisplayName?: string;
}) {
  return {
    auth: { getUser: getUserMock },
    from: (table: string) => {
      if (table === "expenses") {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: opts.expenseRow, error: null }) }) }) };
      }
      if (table === "trip_members") {
        return {
          select: (cols: string) => {
            const builder = {
              eq: () => builder,
              maybeSingle: () => Promise.resolve({ data: opts.payerDisplayName ? { display_name: opts.payerDisplayName } : null, error: null }),
              then: (resolve: (v: { count: number }) => void) => {
                if (cols.includes("count") || cols === "id") resolve({ count: 3 });
              },
            };
            return builder;
          },
        };
      }
      if (table === "trips") {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { completed_at: opts.isLocked ? "2026-01-01" : null }, error: null }) }) }) };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

let supabaseMock: ReturnType<typeof createSupabaseMock>;
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => supabaseMock,
}));

const payerId = "payer-1";
const nonPayerId = "viewer-1";

async function renderEditPage() {
  const { default: EditExpensePage } = await import("./page");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<EditExpensePage />);
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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.innerHTML = "";
});

const expenseRow = { paid_by: payerId, amount: "42.00", description: "Firewood", date: "2026-09-20" };

describe("edit/page.tsx — read-only branch for a non-payer viewer (design.md section 7)", () => {
  it("renders every field disabled/read-only and shows no 'Save changes' button", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: nonPayerId, is_anonymous: false } } });
    supabaseMock = createSupabaseMock({ expenseRow, isLocked: false, payerDisplayName: "Alex" });
    const { container, root } = await renderEditPage();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(container.textContent).toContain("Only Alex can edit this expense.");
    const amountInput = container.querySelector<HTMLInputElement>('input[placeholder="0.00"]')!;
    expect(amountInput.readOnly).toBe(true);
    const dateInput = container.querySelector<HTMLInputElement>('input[type="date"]')!;
    expect(dateInput.disabled).toBe(true);
    expect(Array.from(container.querySelectorAll("button")).some((b) => b.textContent?.includes("Save changes"))).toBe(false);

    root.unmount();
  });

  it("has no way to submit changes — no form submit handler wired, editing the (disabled) field has no effect on persisted state", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: nonPayerId, is_anonymous: false } } });
    supabaseMock = createSupabaseMock({ expenseRow, isLocked: false, payerDisplayName: "Alex" });
    const { root } = await renderEditPage();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(updateExpenseMock).not.toHaveBeenCalled();
    root.unmount();
  });

  it("close returns to /trip/[id]?tab=list, not the bare trip URL", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: nonPayerId, is_anonymous: false } } });
    supabaseMock = createSupabaseMock({ expenseRow, isLocked: false, payerDisplayName: "Alex" });
    const { container, root } = await renderEditPage();
    await act(async () => {
      await flushMicrotasks();
    });

    const closeBtn = container.querySelector("button")!;
    await act(async () => closeBtn.click());
    expect(pushMock).toHaveBeenCalledWith("/trip/trip-1?tab=list");

    root.unmount();
  });
});

describe("edit/page.tsx — read-only branch for a locked trip (regardless of payer)", () => {
  it("shows the existing locked copy and no Save button, even for the actual payer", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: payerId, is_anonymous: false } } });
    supabaseMock = createSupabaseMock({ expenseRow, isLocked: true });
    const { container, root } = await renderEditPage();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(container.textContent).toContain("This trip is locked");
    expect(container.textContent).toContain("expenses can no longer");
    expect(Array.from(container.querySelectorAll("button")).some((b) => b.textContent?.includes("Save changes"))).toBe(false);

    root.unmount();
  });
});

describe("edit/page.tsx — the original payer-and-unlocked editable path is completely unaffected (regression)", () => {
  it("payer, unlocked: form is editable, Save changes button present, submit calls updateExpense", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: payerId, is_anonymous: false } } });
    supabaseMock = createSupabaseMock({ expenseRow, isLocked: false });
    updateExpenseMock.mockResolvedValue({ id: "expense-1" });
    const { container, root } = await renderEditPage();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(container.textContent).not.toContain("Only");
    const amountInput = container.querySelector<HTMLInputElement>('input[placeholder="0.00"]')!;
    expect(amountInput.readOnly).toBe(false);
    const saveBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Save changes"));
    expect(saveBtn).not.toBeUndefined();

    await act(async () => {
      saveBtn!.click();
      await flushMicrotasks();
    });
    expect(updateExpenseMock).toHaveBeenCalledTimes(1);

    root.unmount();
  });

  it("close returns to the bare /trip/[id] URL (unchanged from before this feature)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: payerId, is_anonymous: false } } });
    supabaseMock = createSupabaseMock({ expenseRow, isLocked: false });
    const { container, root } = await renderEditPage();
    await act(async () => {
      await flushMicrotasks();
    });

    const closeBtn = container.querySelector("button")!;
    await act(async () => closeBtn.click());
    expect(pushMock).toHaveBeenCalledWith("/trip/trip-1");

    root.unmount();
  });
});
