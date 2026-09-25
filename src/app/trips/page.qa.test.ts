import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const getMyTripsMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

/**
 * Performance-scaling Tier 1 fix (architecture.md's "/trips — two tiers"): the page now kicks off
 * its own `trips` select concurrently with `getUser()`, rather than only calling `getUser()` here
 * — so this mock needs a `.from("trips").select(...).order(...)` chain in addition to `auth`,
 * even though `getMyTrips` itself is mocked separately below and never exercises this chain for
 * real. `tripRows` defaults to empty since every test that cares about actual trip data supplies
 * it via `getMyTripsMock` instead.
 */
function createSupabaseMock(tripRows: unknown[] = []) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: tripRows, error: null })),
      })),
    })),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => createSupabaseMock()),
}));

vi.mock("@/lib/data/trips", () => ({
  getMyTrips: (...args: unknown[]) => getMyTripsMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

describe("TripsDashboardPage (smoke, via renderToStaticMarkup)", () => {
  it("renders real trip data directly in the HTML output — no client-fetch loading placeholder (AC1)", async () => {
    getMyTripsMock.mockResolvedValueOnce([
      {
        id: "trip-1",
        name: "Lake Tahoe",
        location: "Tahoe",
        startsOn: "2026-03-05",
        endsOn: "2026-03-09",
        isCompleted: false,
        createdAt: "2026-01-01",
        members: [],
        totalCents: 1000,
        yourNetCents: 0,
      },
    ]);
    const { default: TripsDashboardPage } = await import("./page");
    const el = await TripsDashboardPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Lake Tahoe");
    expect(html).not.toContain("Loading your trips");
  });

  it("groups trips into Ongoing and Completed sections", async () => {
    getMyTripsMock.mockResolvedValueOnce([
      {
        id: "trip-1",
        name: "Lake Tahoe",
        location: "Tahoe",
        startsOn: "2026-03-05",
        endsOn: "2026-03-09",
        isCompleted: false,
        createdAt: "2026-01-01",
        members: [],
        totalCents: 1000,
        yourNetCents: 0,
      },
      {
        id: "trip-2",
        name: "Big Sur",
        location: "Big Sur",
        startsOn: "2026-01-05",
        endsOn: "2026-01-09",
        isCompleted: true,
        createdAt: "2025-12-01",
        members: [],
        totalCents: 2000,
        yourNetCents: 0,
      },
    ]);
    const { default: TripsDashboardPage } = await import("./page");
    const el = await TripsDashboardPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Ongoing");
    expect(html).toContain("Completed");
    expect(html.indexOf("Ongoing")).toBeLessThan(html.indexOf("Lake Tahoe"));
    expect(html.indexOf("Completed")).toBeLessThan(html.indexOf("Big Sur"));
    expect(html.indexOf("Lake Tahoe")).toBeLessThan(html.indexOf("Big Sur"));
  });

  it("renders the empty state with a Start-a-trip CTA (AC6)", async () => {
    getMyTripsMock.mockResolvedValueOnce([]);
    const { default: TripsDashboardPage } = await import("./page");
    const el = await TripsDashboardPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("You&#x27;re not on any trips yet.");
    expect(html).toContain("Start a trip");
    expect(html).toContain('href="/trip/new"');
  });

  it("renders the inline error message on a fetch failure, not a thrown error (design.md section 4)", async () => {
    getMyTripsMock.mockRejectedValueOnce(new Error("boom"));
    const { default: TripsDashboardPage } = await import("./page");
    const el = await TripsDashboardPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Couldn&#x27;t load your trips.");
  });

  it("redirects to / when there is no user (defensive fallback)", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...createSupabaseMock(),
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });
    const { default: TripsDashboardPage } = await import("./page");
    await expect(TripsDashboardPage()).rejects.toThrow("REDIRECT:/");
  });

  it("never calls supabase.auth.getUser() from a client bundle context (module has no 'use client' directive)", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source.trimStart().startsWith('"use client"')).toBe(false);
  });
});
