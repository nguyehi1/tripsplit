// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TripSheetChrome } from "./trip-sheet-chrome";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * QA test for ux-revamp AC7-AC9 / design.md sections 5.1-5.3 / ADR 0008 point 6: the background
 * dim/blur/scale wrapper around `children`. Covers:
 * - Cold load (direct hit / refresh) on `/add-expense` paints already-dimmed, no replay.
 * - Cold load on the plain trip view paints undimmed.
 * - A genuine in-app pathname change (soft navigation) DOES transition the dim on/off — this is
 *   what makes the "one continuous motion" behavior real rather than accidentally suppressing all
 *   dimming.
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
  // The wrapper is the outer <div> TripSheetChrome renders around children + scrim.
  return container!.firstElementChild as HTMLElement;
}

describe("TripSheetChrome — background dim/blur/scale (AC7-AC9, design.md 5.1-5.3)", () => {
  it("cold load on a pathname ending in /add-expense renders already dimmed/blurred/scaled (no replayed entrance, design.md 5.3)", async () => {
    currentPathname = "/trip/trip-1/add-expense";
    const wrapper = await renderChrome();
    expect(wrapper.style.filter).toBe("blur(3px) brightness(0.94)");
    expect(wrapper.style.transform).toBe("scale(0.965)");
  });

  it("cold load on the plain trip view renders undimmed", async () => {
    currentPathname = "/trip/trip-1";
    const wrapper = await renderChrome();
    expect(wrapper.style.filter).toBe("none");
    expect(wrapper.style.transform).toBe("scale(1)");
  });

  it("children always render regardless of dim state (never unmounted/replaced)", async () => {
    currentPathname = "/trip/trip-1/add-expense";
    await renderChrome();
    expect(container!.querySelector('[data-testid="trip-content"]')).not.toBeNull();
  });

  it("a genuine in-app pathname change (plain trip -> add-expense) flips dimmed on, not just on cold load", async () => {
    currentPathname = "/trip/trip-1";
    const wrapper = await renderChrome();
    expect(wrapper.style.filter).toBe("none");

    currentPathname = "/trip/trip-1/add-expense";
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

  it("a genuine in-app pathname change back to the plain trip view flips dimmed off", async () => {
    currentPathname = "/trip/trip-1/add-expense";
    const wrapper = await renderChrome();
    expect(wrapper.style.filter).toBe("blur(3px) brightness(0.94)");

    currentPathname = "/trip/trip-1";
    await act(async () => {
      root!.render(
        <TripSheetChrome>
          <div data-testid="trip-content">trip content</div>
        </TripSheetChrome>,
      );
    });

    expect(wrapper.style.filter).toBe("none");
    expect(wrapper.style.transform).toBe("scale(1)");
  });

  it("does not treat an unrelated subroute (e.g. settle-up) as the add-expense path", async () => {
    currentPathname = "/trip/trip-1/settle-up";
    const wrapper = await renderChrome();
    expect(wrapper.style.filter).toBe("none");
  });
});
