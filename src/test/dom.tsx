import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ShoppingListItem, ShoppingListView } from "@/lib/data/shopping-list";

/**
 * Shared scaffolding for jsdom component tests (not a test file: its name does not match vitest's
 * `*.test.*` include). A test file still declares `// @vitest-environment jsdom` and its own
 * `vi.mock` blocks (those are hoisted per file); everything else lives here.
 */

// Tells React that `act()` is in use, so state updates in tests do not warn.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/** One mounted tree per test: `mount`, `flush`, `button(label)`, `container`, and `teardown()` for afterEach. */
export function createDom() {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  return {
    get container() {
      return container!;
    },
    async mount(el: React.ReactElement) {
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
      await act(async () => {
        root!.render(el);
      });
    },
    /** Lets pending promises and zero-delay timers settle inside `act`. */
    flush: () =>
      act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      }),
    /** A button by exact aria-label or exact text. */
    button: (label: string) =>
      Array.from(container!.querySelectorAll("button")).find(
        (b) => b.getAttribute("aria-label") === label || b.textContent === label,
      )!,
    teardown() {
      act(() => root?.unmount());
      container?.remove();
      root = container = null;
    },
  };
}

export function makeItem(description: string, i = 0): ShoppingListItem {
  return { id: `i${i}`, description, status: "open", addedBy: null, claimedBy: null, expenseId: null };
}

/** A shopping-list view whose open items have the given descriptions. */
export function makeView(descriptions: string[]): ShoppingListView {
  const items = descriptions.map(makeItem);
  return { items, toGet: items, yourBag: [], bought: [], yourMemberId: "m1" };
}
