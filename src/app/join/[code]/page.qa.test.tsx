// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * QA coverage for the invite-preview rework (docs/security-fix-2026-09-17-qa-report.md):
 * /join/[code] now fetches from the server-side, rate-limited /api/trip-invite/[code] route
 * instead of calling `get_trip_by_invite_code` straight from the browser via supabase.rpc.
 * Covers the loading/success/error/retry states driven by `loadError`/`reloadKey`.
 */

const useParamsMock = vi.fn(() => ({ code: "abc12345" }));
const useSearchParamsMock = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  useParams: () => useParamsMock(),
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({}),
}));

const getTripSummaryMock = vi.fn();
vi.mock("@/lib/data/trips", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/trips")>("@/lib/data/trips");
  return {
    ...actual,
    getTripSummary: (...args: unknown[]) => getTripSummaryMock(...args),
  };
});

const invite = {
  tripId: "trip-1",
  name: "Ski Trip",
  location: "Aspen",
  startsOn: "2026-01-01",
  endsOn: "2026-01-05",
  isCompleted: false,
  organizerName: "Pat",
};

const summary = {
  members: [{ id: "m1", displayName: "Pat" }],
  settlements: [],
  totalCents: 12300,
  avgPerPersonCents: 12300,
  inviteCode: "abc12345",
};

/**
 * Pure microtask flush (no `setTimeout`) so every tick stays inside `act()`'s tracked update
 * window — a `setTimeout`-based flush lets a `then()` callback's state update land in a macrotask
 * outside `act()`'s synchronous tracking, which is what produces spurious (non-fatal, but noisy)
 * "not wrapped in act(...)" warnings without indicating an actual page bug.
 */
async function flushMicrotasks(times = 30) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

/**
 * Renders the page and, within the *same* act() call, flushes the microtask queue so the
 * effect's fetch().then(...) chain (and the follow-up getTripSummary await) fully settles before
 * this resolves. Splitting render and the settle-flush across two separate act() calls leaves a
 * window between them where the fetch promise's resolution updates state outside any act
 * boundary, which is a harness artifact (spurious "not wrapped in act" warnings) rather than a
 * bug in the page itself — collapsing them into one call avoids it.
 */
async function renderJoinPage() {
  const { default: JoinTripPage } = await import("./page");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<JoinTripPage />);
    await flushMicrotasks();
  });
  return { container, root };
}

function clickButtonWithText(container: HTMLElement, text: string) {
  const buttons = Array.from(container.querySelectorAll("button"));
  const button = buttons.find((b) => b.textContent?.includes(text));
  if (!button) throw new Error(`No button found with text "${text}"`);
  button.click();
}

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  useParamsMock.mockReturnValue({ code: "abc12345" });
  useSearchParamsMock.mockReturnValue(new URLSearchParams());
  getTripSummaryMock.mockResolvedValue(summary);
});

afterEach(() => {
  document.body.innerHTML = "";
  global.fetch = originalFetch;
});

describe("/join/[code] page — fetches via /api/trip-invite/[code] instead of calling Supabase directly", () => {
  it("shows a loading state before the fetch resolves", async () => {
    let resolveFetch!: (v: unknown) => void;
    global.fetch = vi.fn(() => new Promise((resolve) => (resolveFetch = resolve))) as unknown as typeof fetch;

    const { container, root } = await renderJoinPage();
    expect(container.textContent).toContain("Loading trip…");

    await act(async () => {
      resolveFetch({ status: 200, ok: true, json: async () => invite });
      await flushMicrotasks();
    });

    root.unmount();
  });

  it("renders the trip summary on success, hitting /api/trip-invite/<code> (not Supabase directly)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => invite });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { container, root } = await renderJoinPage();

    expect(fetchMock).toHaveBeenCalledWith("/api/trip-invite/abc12345");
    expect(container.textContent).toContain("Ski Trip");
    expect(container.textContent).toContain("Pat invited you");
    expect(getTripSummaryMock).toHaveBeenCalledWith(expect.anything(), "trip-1");

    root.unmount();
  });

  it("shows a non-retryable message and no retry button on a 404 (invite code doesn't match a trip)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 404, ok: false, json: async () => ({ error: "Not found." }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { container, root } = await renderJoinPage();

    expect(container.textContent).toContain("This invite link doesn't match a trip anymore.");
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.find((b) => b.textContent?.includes("Try again"))).toBeUndefined();

    root.unmount();
  });

  it("shows a rate-limit message with a retry option on a 429", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 429, ok: false, json: async () => ({ error: "Too many requests." }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { container, root } = await renderJoinPage();

    expect(container.textContent).toContain("Too many attempts");
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.find((b) => b.textContent?.includes("Try again"))).toBeDefined();

    root.unmount();
  });

  it("shows a rate-limit message with a retry option on a 503 (rate limiter fail-closed)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 503, ok: false, json: async () => ({ error: "Service temporarily unavailable." }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { container, root } = await renderJoinPage();

    expect(container.textContent).toContain("Too many attempts");

    root.unmount();
  });

  it("shows a generic error with retry on a network/5xx failure, and retry re-fetches", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => invite });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { container, root } = await renderJoinPage();

    // The rejection is a real `Error`, so the catch handler surfaces its own message rather than
    // the generic fallback (which only applies to non-Error throws, e.g. a raw string).
    expect(container.textContent).toContain("network down");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      clickButtonWithText(container, "Try again");
      await flushMicrotasks();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Ski Trip");

    root.unmount();
  });

  it("surfaces a non-ok, non-404/429/503 status as the generic error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 500, ok: false, json: async () => ({ error: "Couldn't load this trip." }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { container, root } = await renderJoinPage();

    expect(container.textContent).toContain("Couldn't load this trip — check your connection and try again.");

    root.unmount();
  });

  it("shows the join-failure banner when redirected back with ?error=join, alongside the loaded summary", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams({ error: "join" }));
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => invite });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { container, root } = await renderJoinPage();

    expect(container.textContent).toContain("Couldn't join the trip — try again.");

    root.unmount();
  });
});
