// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TripSheetChrome } from "./trip-sheet-chrome";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * QA coverage for shopping-list's widening of `trip-sheet-chrome.tsx`'s `dimmed` pathname check
 * (architecture.md section 4: "`trip-sheet-chrome.tsx`'s `dimmed` check ... must be generalized to
 * also match `/add-item`"). The pre-existing `trip-sheet-chrome.qa.test.tsx` only exercises
 * `/add-expense` and an unrelated `/settle-up` negative case — it was not extended to cover the
 * new `/add-item` path, so this is a new, additive file rather than an edit to that one.
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

describe("TripSheetChrome — /add-item is treated the same as /add-expense (shopping-list, architecture.md section 4)", () => {
  it("cold load on a pathname ending in /add-item renders already dimmed/blurred/scaled", async () => {
    currentPathname = "/trip/trip-1/add-item";
    const wrapper = await renderChrome();
    expect(wrapper.style.filter).toBe("blur(3px) brightness(0.94)");
    expect(wrapper.style.transform).toBe("scale(0.965)");
  });

  it("a genuine in-app pathname change (plain trip -> add-item) flips dimmed on", async () => {
    currentPathname = "/trip/trip-1";
    const wrapper = await renderChrome();
    expect(wrapper.style.filter).toBe("none");

    currentPathname = "/trip/trip-1/add-item";
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

  it("does not treat an unrelated subroute containing 'item' as a substring (e.g. a hypothetical /trip/[id]/items list) as dimmed", async () => {
    currentPathname = "/trip/trip-1/items";
    const wrapper = await renderChrome();
    expect(wrapper.style.filter).toBe("none");
  });
});
