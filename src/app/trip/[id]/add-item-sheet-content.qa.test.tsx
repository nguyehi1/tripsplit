// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * QA coverage for shopping-list's "Add an item" sheet (docs/features/shopping-list, AC1,
 * requirements.md Screen 3, design.md section 4) — `add-item-sheet-content.tsx`.
 */

const replaceMock = vi.fn();
const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn(), replace: replaceMock, refresh: refreshMock }),
}));

const getUserMock = vi.fn();
const insertMock = vi.fn();

function createSupabaseMock(tripRow: { completed_at: string | null; created_by: string }, memberId: string | null = "m1") {
  return {
    auth: { getUser: getUserMock },
    from: (table: string) => {
      if (table === "trip_members") {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: memberId ? { id: memberId } : null, error: null }) }) }) }) };
      }
      if (table === "trips") {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: tripRow, error: null }) }) }) };
      }
      if (table === "shopping_list_items") {
        return { insert: (rows: unknown) => { insertMock(rows); return Promise.resolve({ data: null, error: null }); } };
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

async function renderAddItemSheetContent() {
  const { AddItemSheetContent } = await import("./add-item-sheet-content");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<AddItemSheetContent tripId="trip-1" />);
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


function getSubmitButton(container: HTMLElement) {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.includes("Add") && !b.textContent?.includes("another"),
  )!;
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock = createSupabaseMock(tripRow);
  getUserMock.mockResolvedValue({ data: { user: { id: organizerId, is_anonymous: false } } });
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("AddItemSheetContent — submit gating at zero (AC1/design.md section 4)", () => {
  it("submit button is disabled and reads 'Add an item' when every field is blank", async () => {
    const { container, root } = await renderAddItemSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });
    const submit = getSubmitButton(container);
    expect(submit.textContent).toContain("Add an item");
    expect(submit.disabled).toBe(true);

    await act(async () => {
      submit.click();
      await flushMicrotasks();
    });
    expect(insertMock).not.toHaveBeenCalled();

    root.unmount();
  });

  it("typing into the first field enables submit and updates the count label", async () => {
    const { container, root } = await renderAddItemSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });
    const input = container.querySelector<HTMLInputElement>('input[placeholder="Firewood, sunscreen, ice…"]')!;
    await act(async () => setValue(input, "Firewood"));

    const submit = getSubmitButton(container);
    expect(submit.disabled).toBe(false);
    expect(submit.textContent).toContain("Add 1 to list");

    root.unmount();
  });

  it("blank-only fields (whitespace) don't count toward the submit-enabled total", async () => {
    const { container, root } = await renderAddItemSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });
    const input = container.querySelector<HTMLInputElement>('input[placeholder="Firewood, sunscreen, ice…"]')!;
    await act(async () => setValue(input, "   "));

    const submit = getSubmitButton(container);
    expect(submit.disabled).toBe(true);
    expect(submit.textContent).toContain("Add an item");

    root.unmount();
  });
});

describe("AddItemSheetContent — multi-item add-another (AC1: one or more items in a single submission)", () => {
  it("'+ Add another item' appends a new blank field, and submitting sends only the non-empty, trimmed descriptions", async () => {
    const { container, root } = await renderAddItemSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    const addAnother = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Add another item"))!;
    await act(async () => addAnother.click());

    const inputs = container.querySelectorAll<HTMLInputElement>('input[placeholder="Firewood, sunscreen, ice…"]');
    expect(inputs).toHaveLength(2);
    await act(async () => setValue(inputs[0], "Firewood"));
    await act(async () => setValue(inputs[1], "  Ice  "));

    const submit = getSubmitButton(container);
    expect(submit.textContent).toContain("Add 2 to list");
    await act(async () => {
      submit.click();
      await flushMicrotasks();
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith([
      { trip_id: "trip-1", added_by: "m1", description: "Firewood" },
      { trip_id: "trip-1", added_by: "m1", description: "Ice" },
    ]);
    expect(pushMock).toHaveBeenCalledWith("/trip/trip-1?tab=list");
    expect(refreshMock).toHaveBeenCalledTimes(1);

    root.unmount();
  });

  it("the '+ Add another item' affordance disappears once the soft field cap (8) is reached", async () => {
    const { container, root } = await renderAddItemSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });
    const addAnother = () => Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Add another item"));

    for (let i = 0; i < 7; i++) {
      const btn = addAnother();
      expect(btn).not.toBeUndefined();
      await act(async () => btn!.click());
    }
    expect(container.querySelectorAll('input[placeholder="Firewood, sunscreen, ice…"]')).toHaveLength(8);
    expect(addAnother()).toBeUndefined();

    root.unmount();
  });
});

describe("AddItemSheetContent — gating parity with add-expense sheet", () => {
  it("unverified owner hitting the URL directly is redirected back to /trip/[id], form never renders", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: organizerId, is_anonymous: true } } });
    const { container, root } = await renderAddItemSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });
    expect(replaceMock).toHaveBeenCalledWith("/trip/trip-1");
    expect(container.querySelector('input[placeholder="Firewood, sunscreen, ice…"]')).toBeNull();
    root.unmount();
  });

  it("locked trip renders the locked-state copy instead of the form", async () => {
    supabaseMock = createSupabaseMock({ completed_at: "2026-01-01T00:00:00Z", created_by: organizerId });
    getUserMock.mockResolvedValue({ data: { user: { id: organizerId, is_anonymous: false } } });
    const { container, root } = await renderAddItemSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });
    expect(container.textContent).toContain("the list can't be changed anymore");
    expect(container.querySelector('input[placeholder="Firewood, sunscreen, ice…"]')).toBeNull();
    root.unmount();
  });
});
