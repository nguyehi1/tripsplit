// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * QA re-verification (email-invites F1 fix, 2026-10-10). The F1 fix introduced `errorMessage(e)`,
 * which now reads the message off supabase-js's plain-object errors, and the fix switched this
 * pre-existing screen to it. Before, the plain object fell through to the generic copy; now the raw
 * database text reaches the user.
 *
 * Realistic path: the organizer locks the trip while a member has the add-expense sheet open. The
 * direct `expenses` insert is then refused by RLS (migration 0005). On PostgreSQL 17 the message
 * is exactly `new row violates row-level security policy for table "expenses"` (code 42501), which
 * QA reproduced. That is internal text, and it isn't actionable for the person who sees it.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const getUserMock = vi.fn();
const RLS_ERROR = {
  code: "42501",
  details: null,
  hint: null,
  message: 'new row violates row-level security policy for table "expenses"',
};

const supabaseMock = {
  auth: { getUser: getUserMock },
  from: (table: string) => {
    if (table === "trip_members") {
      return {
        select: () => {
          const builder = {
            eq: () => builder,
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            then: (resolve: (value: { count: number }) => void) => resolve({ count: 2 }),
          };
          return builder;
        },
      };
    }
    if (table === "trips") {
      return {
        select: () => ({
          eq: () => ({ single: () => Promise.resolve({ data: { completed_at: null, created_by: "owner-1" }, error: null }) }),
        }),
      };
    }
    if (table === "expenses") {
      return { insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: RLS_ERROR }) }) }) };
    }
    throw new Error(`Unexpected table ${table}`);
  },
};
vi.mock("@/lib/supabase/client", () => ({ createClient: () => supabaseMock }));

function flush(times = 10) {
  return new Promise<void>((resolve) => {
    let n = 0;
    const tick = () => (++n >= times ? resolve() : setTimeout(tick, 0));
    setTimeout(tick, 0);
  });
}

function setValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: "owner-1", is_anonymous: false } } });
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("AddExpenseSheetContent — database errors shown to the user", () => {
  it("doesn't show raw RLS text when the insert is refused (e.g. the trip was locked meanwhile)", async () => {
    const { AddExpenseSheetContent } = await import("./add-expense-sheet-content");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(<AddExpenseSheetContent tripId="trip-1" />);
      await flush();
    });
    setValue(container.querySelector<HTMLInputElement>('input[placeholder="0.00"]')!, "10.00");
    setValue(container.querySelector<HTMLInputElement>('input[placeholder="Cabin, lift tickets, groceries…"]')!, "Snacks");
    await act(async () => {
      [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Add an expense"))!.click();
      await flush();
    });

    expect(container.textContent).not.toContain("row-level security");
    expect(container.textContent).not.toContain('table "expenses"');
    root.unmount();
  });
});
