// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TripSheetChrome } from "./trip-sheet-chrome";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * QA coverage for edit-expense's widening of `trip-sheet-chrome.tsx`'s `dimmed` pathname check
 * (UX consistency follow-up: edit-expense converted to a sheet, same ADR 0008 scaffold as
 * add-expense/add-item). Same additive-file convention as `trip-sheet-chrome.add-item.qa.test.tsx`
 * — a new file rather than an edit to the pre-existing `trip-sheet-chrome.qa.test.tsx`.
 */

let currentPathname = "/trip/trip-1";
vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
}));

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
});

async function renderChrome() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <TripSheetChrome>
        <div data-testid="trip-content">trip content</div>
      </TripSheetChrome>,
    );
  });
  return container!.firstElementChild as HTMLElement;
}

describe("TripSheetChrome — /expense/[expenseId]/edit is treated the same as /add-expense", () => {
  it("cold load on the edit-expense path renders already dimmed/blurred/scaled", async () => {
    currentPathname = "/trip/trip-1/expense/expense-9/edit";
    const wrapper = await renderChrome();
    expect(wrapper.style.filter).toBe("blur(3px) brightness(0.94)");
    expect(wrapper.style.transform).toBe("scale(0.965)");
  });

  it("a genuine in-app pathname change (plain trip -> edit-expense) flips dimmed on", async () => {
    currentPathname = "/trip/trip-1";
    const wrapper = await renderChrome();
    expect(wrapper.style.filter).toBe("none");

    currentPathname = "/trip/trip-1/expense/expense-9/edit";
    await act(async () => {
      root!.render(
        <TripSheetChrome>
          <div data-testid="trip-content">trip content</div>
        </TripSheetChrome>,
      );
    });

    expect(wrapper.style.filter).toBe("blur(3px) brightness(0.94)");
    expect(wrapper.style.transform).toBe("scale(0.965)");
  });

  it("does not dim an unrelated /trip/[id]/expense/[expenseId] path without a trailing /edit", async () => {
    currentPathname = "/trip/trip-1/expense/expense-9";
    const wrapper = await renderChrome();
    expect(wrapper.style.filter).toBe("none");
  });
});
