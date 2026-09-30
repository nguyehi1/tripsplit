// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * QA follow-up fix (docs/features/simplified-onboarding/design.md section 4.0): "an unverified
 * owner hitting `/trip/[id]/add-expense` directly must itself redirect back to `/trip/[id]`." The
 * trip page only ever hides this route's own entry point (the BottomBar button) — it doesn't stop
 * a typed/bookmarked URL from reaching this screen directly, so the guard has to live here too.
 * Not a security test (RLS + migration 0010/0011 already block the mutation regardless) — this
 * only proves the specified redirect-on-direct-hit behavior, and that it does NOT fire for an
 * invitee, verified or not.
 *
 * Rewritten for ux-revamp (ADR 0008): `add-expense/page.tsx` stopped being a plain client
 * component once it needed to render the full (async, Server-Component-shaped)
 * dashboard-plus-sheet output for the hard-nav-fallback case (AC8), so it can no longer be
 * synchronously `root.render()`'d the way this test used to. Every assertion below is unchanged
 * from before — only the target moved to `AddExpenseSheetContent`, the relocated client
 * component both the intercepted sheet and the hard-nav fallback now share (ADR 0008 point 5).
 */

const replaceMock = vi.fn();
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn(), replace: replaceMock }),
}));

const getUserMock = vi.fn();

type TripsQueryResult =
  | { mode: "ok"; tripRow: { completed_at: string | null; created_by: string } }
  | { mode: "error" }
  | { mode: "reject" };

function createSupabaseMock(trips: TripsQueryResult, memberCount = 2) {
  return {
    auth: { getUser: getUserMock },
    from: (table: string) => {
      if (table === "trip_members") {
        // Supports both existing call shapes this gating effect makes: the plain member-count
        // select (`.select("id", {count:"exact",head:true}).eq(...)`, awaited directly — a
        // thenable object works the same way `Promise.resolve({count})` did before) and
        // shopping-list's new own-member-id lookup (`.select("id").eq(...).eq(...).maybeSingle()`,
        // resolved to "no row" here since none of these tests exercise the claimed-items block).
        return {
          select: () => {
            const builder = {
              eq: () => builder,
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
              then: (resolve: (value: { count: number }) => void) => resolve({ count: memberCount }),
            };
            return builder;
          },
        };
      }
      if (table === "trips") {
        return {
          select: () => ({
            eq: () => ({
              single: () => {
                if (trips.mode === "ok") return Promise.resolve({ data: trips.tripRow, error: null });
                if (trips.mode === "error") return Promise.resolve({ data: null, error: { message: "RLS denied" } });
                return Promise.reject(new Error("network error"));
              },
            }),
          }),
        };
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
const otherUserId = "invitee-1";
const tripRow = { completed_at: null, created_by: organizerId };

async function renderAddExpenseSheetContent() {
  const { AddExpenseSheetContent } = await import("../add-expense-sheet-content");
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
  supabaseMock = createSupabaseMock({ mode: "ok", tripRow });
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("AddExpenseSheetContent — direct-URL owner gate (design.md 4.0)", () => {
  it("unverified owner hitting the URL directly is redirected back to /trip/[id], form never renders", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: organizerId, is_anonymous: true } } });
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(replaceMock).toHaveBeenCalledWith("/trip/trip-1");
    expect(container.textContent).not.toContain("Add an expense");
    expect(container.querySelector('input[placeholder="0.00"]')).toBeNull();

    root.unmount();
  });

  it("verified owner is not redirected — the form renders normally", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: organizerId, is_anonymous: false } } });
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(replaceMock).not.toHaveBeenCalled();
    expect(container.querySelector('input[placeholder="0.00"]')).not.toBeNull();

    root.unmount();
  });

  it("unverified invitee (not the owner) is not redirected — their existing gate-at-submit flow is unchanged", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: otherUserId, is_anonymous: true } } });
    const { container, root } = await renderAddExpenseSheetContent();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(replaceMock).not.toHaveBeenCalled();
    expect(container.querySelector('input[placeholder="0.00"]')).not.toBeNull();

    root.unmount();
  });

  // Pre-push review fix: the `trips` query erroring/coming back empty (RLS denial, transient
  // failure) must not silently evaluate `isOwner` to `false` and let the gate fail open for an
  // actual unverified owner hitting this exact failure mode.
  describe("fail-closed when the ownership-determining query is ambiguous", () => {
    it("unverified session, trips query returns a postgrest error: fails closed, redirected", async () => {
      supabaseMock = createSupabaseMock({ mode: "error" });
      getUserMock.mockResolvedValue({ data: { user: { id: organizerId, is_anonymous: true } } });
      const { container, root } = await renderAddExpenseSheetContent();
      await act(async () => {
        await flushMicrotasks();
      });

      expect(replaceMock).toHaveBeenCalledWith("/trip/trip-1");
      expect(container.querySelector('input[placeholder="0.00"]')).toBeNull();

      root.unmount();
    });

    it("unverified session, trips query rejects outright (network error): fails closed via .catch, redirected", async () => {
      supabaseMock = createSupabaseMock({ mode: "reject" });
      getUserMock.mockResolvedValue({ data: { user: { id: organizerId, is_anonymous: true } } });
      const { container, root } = await renderAddExpenseSheetContent();
      await act(async () => {
        await flushMicrotasks();
      });

      expect(replaceMock).toHaveBeenCalledWith("/trip/trip-1");
      expect(container.querySelector('input[placeholder="0.00"]')).toBeNull();

      root.unmount();
    });

    it("verified session, trips query errors: NOT redirected — the ambiguity only matters for an unverified session", async () => {
      supabaseMock = createSupabaseMock({ mode: "error" });
      getUserMock.mockResolvedValue({ data: { user: { id: organizerId, is_anonymous: false } } });
      const { container, root } = await renderAddExpenseSheetContent();
      await act(async () => {
        await flushMicrotasks();
      });

      expect(replaceMock).not.toHaveBeenCalled();
      expect(container.querySelector('input[placeholder="0.00"]')).not.toBeNull();

      root.unmount();
    });
  });
});
