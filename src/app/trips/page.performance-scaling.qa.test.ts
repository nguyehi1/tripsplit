import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * QA coverage for performance-scaling's `/trips` Tier 1 fix (architecture.md's "/trips — two
 * tiers"): the page now kicks off its own `trips` select concurrently with `getUser()`, and passes
 * the fetched rows into `getMyTrips` so it skips its own (otherwise redundant) `trips` select.
 * The engineer's own updated `page.qa.test.ts` mocks the `trips`/`select`/`order` chain but never
 * asserts `getMyTrips` is actually called with those rows — this file closes that gap: verifying
 * the real wiring, not just that the mock shape satisfies the page's calls.
 */

const getMyTripsMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

const tripsSelectResult = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => tripsSelectResult()),
      })),
    })),
  })),
}));

vi.mock("@/lib/data/trips", () => ({
  getMyTrips: (...args: unknown[]) => getMyTripsMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  getMyTripsMock.mockResolvedValue([]);
});

describe("TripsDashboardPage: real wiring of the prefetched trips rows into getMyTrips", () => {
  it("passes the exact rows fetched by the page's own trips select into getMyTrips (not undefined, not a stale/empty placeholder)", async () => {
    const fetchedRows = [{ id: "t1", name: "Real Row From The Page's Own Select" }];
    tripsSelectResult.mockResolvedValueOnce({ data: fetchedRows, error: null });

    const { default: TripsDashboardPage } = await import("./page");
    await TripsDashboardPage();

    expect(getMyTripsMock).toHaveBeenCalledTimes(1);
    expect(getMyTripsMock).toHaveBeenCalledWith(expect.anything(), "user-1", fetchedRows);
  });

  it("passes an empty array (not undefined/null) into getMyTrips when the user genuinely has zero trips", async () => {
    tripsSelectResult.mockResolvedValueOnce({ data: [], error: null });

    const { default: TripsDashboardPage } = await import("./page");
    await TripsDashboardPage();

    expect(getMyTripsMock).toHaveBeenCalledWith(expect.anything(), "user-1", []);
  });

  it("passes [] (not null) into getMyTrips when the trips select resolves with a null data field", async () => {
    tripsSelectResult.mockResolvedValueOnce({ data: null, error: null });

    const { default: TripsDashboardPage } = await import("./page");
    await TripsDashboardPage();

    expect(getMyTripsMock).toHaveBeenCalledWith(expect.anything(), "user-1", []);
  });

  it("shows the inline error state and never calls getMyTrips when the page's own trips select itself errors", async () => {
    tripsSelectResult.mockResolvedValueOnce({ data: null, error: new Error("db down") });

    const { default: TripsDashboardPage } = await import("./page");
    const el = await TripsDashboardPage();
    const html = renderToStaticMarkup(el);

    expect(getMyTripsMock).not.toHaveBeenCalled();
    expect(html).toContain("Couldn&#x27;t load your trips.");
  });
});
