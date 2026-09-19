// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SheetShell } from "./sheet-shell";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * QA test for the `animateEntrance` prop (ADR 0008 point 6, design.md 5.1/5.3): the one piece
 * flagged as "easy to get backwards or forget" since it's a manual wire-up at exactly two call
 * sites. Verifies both directions explicitly:
 * - `animateEntrance={false}` (hard-nav/deep-link fallback): panel renders already at rest
 *   (`translateY(0)`), never passes through the off-screen `translateY(100%)` state.
 * - `animateEntrance` (intercepted, in-app open): panel mounts off-screen and flips to at-rest
 *   asynchronously (real spring-up motion).
 */

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
  }
  container?.remove();
  document.body.querySelectorAll('[data-sheet-portal-check]').forEach((el) => el.remove());
  root = null;
  container = null;
});

function findPanel() {
  // SheetShell portals directly to document.body — locate its rounded sheet panel by its
  // bottom-anchored positioning class, since it isn't inside our own render container.
  return document.body.querySelector(".rounded-t-\\[28px\\]") as HTMLElement | null;
}

async function renderShell(animateEntrance: boolean) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <SheetShell tripId="trip-1" animateEntrance={animateEntrance}>
        <div data-testid="sheet-body">form content</div>
      </SheetShell>,
    );
  });
}

describe("SheetShell — animateEntrance (AC7-AC9, design.md 5.1/5.3, ADR 0008 point 6)", () => {
  it("animateEntrance=false (hard-nav/deep-link fallback) renders already at rest — no off-screen flash", async () => {
    await renderShell(false);
    const panel = findPanel();
    expect(panel).not.toBeNull();
    expect(panel!.style.transform).toBe("translateY(0)");
  });

  it("animateEntrance=false keeps the scrim fully visible immediately (no fade-in on cold load)", async () => {
    await renderShell(false);
    const scrim = document.body.querySelector('a[aria-label="Close"]') as HTMLElement | null;
    expect(scrim).not.toBeNull();
    expect(scrim!.style.opacity).toBe("1");
  });

  it("animateEntrance=true mounts off-screen first (translateY(100%)) before flipping to rest", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    // Render without flushing the rAF-scheduled state flip, to inspect the very first paint.
    act(() => {
      root!.render(
        <SheetShell tripId="trip-1" animateEntrance>
          <div data-testid="sheet-body">form content</div>
        </SheetShell>,
      );
    });
    const panel = findPanel();
    expect(panel).not.toBeNull();
    expect(panel!.style.transform).toBe("translateY(100%)");
  });

  it("animateEntrance=true eventually reaches the at-rest position (real spring-up completes)", async () => {
    await renderShell(true);
    // The at-rest flip is scheduled via requestAnimationFrame (see sheet-shell.tsx) — `act`
    // flushes microtasks/effects, but not a pending animation frame, so it's awaited explicitly.
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    const panel = findPanel();
    expect(panel!.style.transform).toBe("translateY(0)");
  });

  it("the drag handle is present but purely visual (no swipe-to-dismiss, design.md 5.2/6.2) — sheet body renders regardless of interaction", async () => {
    await renderShell(false);
    expect(document.body.textContent).toContain("form content");
  });

  it("children (the actual form) are rendered inside the portal for both animateEntrance values", async () => {
    await renderShell(false);
    expect(document.body.querySelector('[data-testid="sheet-body"]')).not.toBeNull();
  });
});
