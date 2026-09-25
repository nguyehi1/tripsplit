import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * QA coverage for performance-scaling's `/trip/[id]` fix (architecture.md's "/trip/[id] —
 * parallelize getTripSummary/getTripView"): `getUser()` and `getTripSummary()` now run
 * concurrently via `Promise.all`, and `getTripView` is only attempted afterward, once `user` is
 * known. The hard constraint under test (design.md section (c)'s flagged risk): a verified member
 * must NEVER be shown the unverified-visitor summary tier, even transiently — and an
 * invalid/not-found trip id must fail gracefully, not crash or misroute.
 */

const getTripViewMock = vi.fn();
const getTripSummaryMock = vi.fn();
const getUserMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: (...args: unknown[]) => getUserMock(...args) },
  })),
}));

vi.mock("@/lib/data/trips", () => ({
  getTripView: (...args: unknown[]) => getTripViewMock(...args),
  getTripSummary: (...args: unknown[]) => getTripSummaryMock(...args),
}));

const baseView = {
  trip: {
    id: "trip-1",
    name: "Lake Tahoe",
    location: "Tahoe",
    startsOn: "2026-03-05",
    endsOn: "2026-03-09",
    inviteCode: "ABC123",
    isCompleted: false,
  },
  members: [
    {
      id: "m1",
      displayName: "Alice",
      joinedAt: "2026-01-01",
      isOrganizer: true,
      isPlaceholder: false,
      initials: "A",
      avatar: { bg: "#fff", fg: "#000" },
      paidCents: 1000,
      shareCents: 500,
      netCents: 500,
      expenseCount: 1,
    },
  ],
  expenses: [] as unknown[],
  settlements: [],
  totalCents: 1000,
  avgPerPersonCents: 1000,
  you: null,
};

const baseSummary = {
  members: [{ id: "m1", displayName: "Alice" }],
  settlements: [],
  totalCents: 1000,
  avgPerPersonCents: 1000,
  inviteCode: "abc123",
};

function callPage(overrides: { tab?: string } = {}) {
  return import("./page").then(({ default: TripDashboardPage }) =>
    TripDashboardPage({
      params: Promise.resolve({ id: "trip-1" }),
      searchParams: Promise.resolve(overrides),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("renderTripDashboard: no visible-tier race from parallelizing getUser()/getTripSummary()", () => {
  it("a verified member (getTripView succeeds) always renders full detail, never the summary-only upsell copy, even when getTripSummary resolves after getUser()", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1", is_anonymous: false } } });
    // Summary resolves slower than getUser() would — since both are behind the same Promise.all
    // await, the render must still wait for both, atomically, before doing anything.
    getTripSummaryMock.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(baseSummary), 5)),
    );
    getTripViewMock.mockResolvedValueOnce(baseView);

    const el = await callPage();
    const html = renderToStaticMarkup(el);

    expect(html).toContain("Lake Tahoe");
    expect(html).not.toContain("Trip summary");
    expect(html).not.toContain("Want the full expense list?");
  });

  it("a verified member always renders full detail even when getUser() resolves after getTripSummary()", async () => {
    getUserMock.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: { user: { id: "u1", is_anonymous: false } } }), 5)),
    );
    getTripSummaryMock.mockResolvedValueOnce(baseSummary);
    getTripViewMock.mockResolvedValueOnce(baseView);

    const el = await callPage();
    const html = renderToStaticMarkup(el);

    expect(html).toContain("Lake Tahoe");
    expect(html).not.toContain("Trip summary");
    expect(html).not.toContain("Want the full expense list?");
  });

  it("an unverified visitor with no session at all never triggers getTripView (would be a wasted/incorrect query) and sees only the summary tier", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    getTripSummaryMock.mockResolvedValueOnce(baseSummary);

    const el = await callPage();
    const html = renderToStaticMarkup(el);

    expect(getTripViewMock).not.toHaveBeenCalled();
    expect(html).toContain("Trip summary");
    expect(html).not.toContain("Lake Tahoe");
  });

  it("an unverified anonymous-session visitor whose getTripView is RLS-denied sees the summary tier, not an error, not full detail", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "anon-1", is_anonymous: true } } });
    getTripSummaryMock.mockResolvedValueOnce(baseSummary);
    getTripViewMock.mockResolvedValueOnce(null);

    const el = await callPage();
    const html = renderToStaticMarkup(el);

    expect(html).toContain("Trip summary");
    expect(html).not.toContain("Lake Tahoe");
  });
});

describe("renderTripDashboard: invalid/not-found trip id (architecture.md's flagged 'minor tradeoff')", () => {
  it("does not attempt getTripView at all when getTripSummary comes back null (bad id) — no crash, no wrong redirect, and actually avoids the extra query cost architecture.md flagged as a possible tradeoff", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1", is_anonymous: false } } });
    getTripSummaryMock.mockResolvedValueOnce(null);

    const el = await callPage();
    const html = renderToStaticMarkup(el);

    expect(getTripViewMock).not.toHaveBeenCalled();
    expect(html).toContain("Couldn&#x27;t load this trip");
  });

  it("does not attempt getTripView when getTripSummary itself throws (bad id / RLS denial surfaced as an error)", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "u1", is_anonymous: false } } });
    getTripSummaryMock.mockRejectedValueOnce(new Error("bad trip id"));

    const el = await callPage();
    const html = renderToStaticMarkup(el);

    expect(getTripViewMock).not.toHaveBeenCalled();
    expect(html).toContain("Couldn&#x27;t load this trip");
  });
});
