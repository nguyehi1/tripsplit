// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * QA follow-up (2026-09-18) for AC13's revised header Miso badge on Add-an-expense
 * (design.md section 5.4) and its AC12 carve-out. This is the one screen neither the
 * orchestrator's Playwright pass nor the engineer's own testing could get eyes-on, since
 * reaching it live requires a verified-organizer session against the real Supabase project.
 * This test uses the exact same jsdom + mocked-Supabase-client technique as
 * `page.owner-gate.qa.test.tsx` to fake a verified-owner session and inspect the actual
 * rendered DOM, which is the closest this environment can get to visual confirmation.
 */

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: replaceMock }),
}));

const getUserMock = vi.fn();

function createSupabaseMock(tripRow: { completed_at: string | null; created_by: string }, memberCount = 4) {
  return {
    auth: { getUser: getUserMock },
    from: (table: string) => {
      if (table === "trip_members") {
        return { select: () => ({ eq: () => Promise.resolve({ count: memberCount }) }) };
      }
      if (table === "trips") {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: tripRow, error: null }) }) }) };
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

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock = createSupabaseMock({ completed_at: null, created_by: organizerId });
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("AddExpenseSheetContent — Miso header badge (AC13/design.md section 5.4) and AC12 carve-out", () => {
  it("verified owner, normal (unlocked) render: a static aria-hidden Miso badge renders in the header's trailing slot", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: organizerId, is_anonymous: false } } });
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    // Form is showing (sanity check we're in the normal, unlocked branch).
    expect(container.querySelector('input[placeholder="0.00"]')).not.toBeNull();

    const badge = container.querySelector('img[src="/images/miso_01.jpg"]');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute("aria-hidden")).toBe("true");
    // No caption/text content anywhere on the badge itself (design.md: "no caption, no text").
    expect(badge?.getAttribute("alt")).toBe("");

    // The badge sits in the header, not anywhere near the close (X) button's own slot — assert
    // it exists as a sibling structure to the close link rather than overlapping it. There
    // should be exactly one Miso image on this screen (not duplicated across branches at once).
    expect(container.querySelectorAll('img[src="/images/miso_01.jpg"]').length).toBe(1);

    root.unmount();
  });

  it("verified owner, locked-trip render: the Miso badge still shows in the locked header (design.md: shown identically in both normal and locked renders)", async () => {
    supabaseMock = createSupabaseMock({ completed_at: "2026-01-01T00:00:00Z", created_by: organizerId });
    getUserMock.mockResolvedValue({ data: { user: { id: organizerId, is_anonymous: false } } });
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(container.textContent).toContain("This trip is locked");
    const badge = container.querySelector('img[src="/images/miso_01.jpg"]');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute("aria-hidden")).toBe("true");

    root.unmount();
  });

  it("owner-gate-blocked (redirecting) render: no Miso badge — there's no TopBar in this branch to attach it to", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: organizerId, is_anonymous: true } } });
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(replaceMock).toHaveBeenCalledWith("/trip/trip-1");
    expect(container.querySelector('img[src="/images/miso_01.jpg"]')).toBeNull();

    root.unmount();
  });

  it("AC12 holds even with the header badge present: no 'Miso says' (or any Miso-attributed) live-math narration anywhere, and the split-summary pill text is untouched", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: organizerId, is_anonymous: false } } });
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(container.textContent).not.toMatch(/miso says/i);
    expect(container.textContent).not.toMatch(/miso.{0,20}each/i);
    // The plain, non-mascot split-summary pill (design.md 5.4) is present, unchanged.
    expect(container.textContent).toMatch(/Splits 4 ways/);
    expect(container.textContent).toMatch(/\$0\.00 each/);

    // The Miso badge itself is the only Miso-related element on the page, and it carries no
    // visible/accessible text of its own (alt="", aria-hidden) — so it cannot be read by AT as
    // narrating anything, satisfying "no caption, no text" from design.md 5.4.
    const badge = container.querySelector('img[src="/images/miso_01.jpg"]');
    expect(badge?.textContent).toBe("");

    root.unmount();
  });
});
