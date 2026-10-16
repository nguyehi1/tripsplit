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
 * - Cold load (direct hit / refresh) on each sheet path paints already-dimmed, no replay.
 * - Cold load on the plain trip view paints undimmed.
 * - A genuine in-app pathname change (soft navigation) DOES transition the dim on/off — this is
 *   what makes the "one continuous motion" behavior real rather than accidentally suppressing all
 *   dimming.
 *
 * `dimmed`'s pathname check was widened twice after this file was first written — once for
 * shopping-list's `/add-item` (architecture.md section 4) and once for edit-expense's
 * `/expense/[expenseId]/edit` (same ADR 0008 sheet scaffold as add-expense/add-item) — each
 * originally landed as its own additive file rather than an edit to this one. They're merged back
 * in here as one parametrized suite per path, since all three exercise the same `dimmed` check and
 * only differ in which pathname they assert against.
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

async function rerenderChrome() {
  await act(async () => {
    root!.render(
      <TripSheetChrome>
        <div data-testid="trip-content">trip content</div>
      </TripSheetChrome>,
    );
  });
}

describe("TripSheetChrome — background dim/blur/scale (AC7-AC9, design.md 5.1-5.3)", () => {
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

  it("a genuine in-app pathname change back to the plain trip view flips dimmed off", async () => {
    currentPathname = "/trip/trip-1/add-expense";
    const wrapper = await renderChrome();
    expect(wrapper.style.filter).toBe("blur(3px) brightness(0.94)");

    currentPathname = "/trip/trip-1";
    await rerenderChrome();

    expect(wrapper.style.filter).toBe("none");
    expect(wrapper.style.transform).toBe("scale(1)");
  });
});

const dimmedPathCases = [
  {
    label: "/add-expense",
    dimmedPath: "/trip/trip-1/add-expense",
    changeDescription: "plain trip -> add-expense",
    negative: { label: "settle-up", path: "/trip/trip-1/settle-up" },
  },
  {
    label: "/add-item (shopping-list, architecture.md section 4)",
    dimmedPath: "/trip/trip-1/add-item",
    changeDescription: "plain trip -> add-item",
    negative: {
      label: "an unrelated subroute containing 'item' as a substring (e.g. a hypothetical /trip/[id]/items list)",
      path: "/trip/trip-1/items",
    },
  },
  {
    label: "/expense/[expenseId]/edit (edit-expense)",
    dimmedPath: "/trip/trip-1/expense/expense-9/edit",
    changeDescription: "plain trip -> edit-expense",
    negative: {
      label: "an unrelated /trip/[id]/expense/[expenseId] path without a trailing /edit",
      path: "/trip/trip-1/expense/expense-9",
    },
  },
];

describe.each(dimmedPathCases)("TripSheetChrome — $label is treated the same as a sheet path", ({ dimmedPath, changeDescription, negative }) => {
  it("cold load renders already dimmed/blurred/scaled (no replayed entrance, design.md 5.3)", async () => {
    currentPathname = dimmedPath;
    const wrapper = await renderChrome();
    expect(wrapper.style.filter).toBe("blur(3px) brightness(0.94)");
    expect(wrapper.style.transform).toBe("scale(0.965)");
  });

  it(`a genuine in-app pathname change (${changeDescription}) flips dimmed on, not just on cold load`, async () => {
    currentPathname = "/trip/trip-1";
    const wrapper = await renderChrome();
    expect(wrapper.style.filter).toBe("none");

    currentPathname = dimmedPath;
    await rerenderChrome();

    expect(wrapper.style.filter).toBe("blur(3px) brightness(0.94)");
    expect(wrapper.style.transform).toBe("scale(0.965)");
  });

  it(`does not treat ${negative.label} as dimmed`, async () => {
    currentPathname = negative.path;
    const wrapper = await renderChrome();
    expect(wrapper.style.filter).toBe("none");
  });
});
