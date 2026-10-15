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
        types: [],
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
        types: [],
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
        types: [],
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

  it("renders the first-run card for zero trips, with the shelf and the pill (criteria 77, 79)", async () => {
    getMyTripsMock.mockResolvedValueOnce([]);
    const { default: TripsDashboardPage } = await import("./page");
    const html = renderToStaticMarkup(await TripsDashboardPage());
    expect(html).toContain("No trips yet");
    expect(html).toContain("Pick a template above and your list starts with the basics. Your trips will show up here.");
    expect(html.match(/>Your trips</g)).toHaveLength(1);
    expect(html).not.toContain("You&#x27;re not on any trips yet.");
    expect(html).not.toContain("Start a trip");
    expect(html).toContain("Start from a template");
    expect(html).toContain('href="/trip/new?type=camping"');
    expect(html).toMatch(/<a[^>]*href="\/trip\/new"[^>]*>(<svg[^>]*>.*?<\/svg>)?New trip<\/a>/);
  });

  it("has an h1 'Trips', no top-bar plus, the Feedback link, and the shelf before the trips (criterion 74)", async () => {
    getMyTripsMock.mockResolvedValueOnce([
      {
        id: "trip-1",
        name: "Lake Tahoe",
        location: "Tahoe",
        startsOn: "2026-03-05",
        endsOn: "2026-03-09",
        isCompleted: false,
        createdAt: "2026-01-01",
        types: [],
        members: [],
        totalCents: 1000,
        yourNetCents: 0,
      },
    ]);
    const { default: TripsDashboardPage } = await import("./page");
    const html = renderToStaticMarkup(await TripsDashboardPage());
    expect(html).toMatch(/<h1[^>]*>Trips<\/h1>/);
    expect(html).not.toContain("Your trips");
    expect(html).toContain('title="Send feedback"');
    expect(html).not.toContain('title="New trip"');
    expect(html.indexOf("Start from a template")).toBeLessThan(html.indexOf("Ongoing"));
    // Tab order: Feedback, Blank trip, tiles, trips, pill.
    const order = ["/feedback", ">Blank trip<", "?type=camping", "/trip/trip-1", ">New trip<"].map((x) => html.indexOf(x));
    expect(order).toEqual([...order].sort((x, y) => x - y));
    expect(order.every((i) => i >= 0)).toBe(true);
  });

  it("uses the flat fab pill on a FabBar and leaves the capsule material alone (criterion 77)", async () => {
    getMyTripsMock.mockResolvedValueOnce([]);
    const { default: TripsDashboardPage } = await import("./page");
    const html = renderToStaticMarkup(await TripsDashboardPage());
    expect(html).toContain("color-mix(in_srgb,var(--color-ink)_90%,transparent)");
    expect(html).not.toContain("backdrop-blur-xl");
    expect(html).not.toContain("animate-capsule-in");
  });

  it("makes no privacy or security claim near the shelf (criteria 96, 116)", async () => {
    getMyTripsMock.mockResolvedValueOnce([]);
    const { default: TripsDashboardPage } = await import("./page");
    const html = renderToStaticMarkup(await TripsDashboardPage()).toLowerCase();
    for (const banned of ["nothing is saved", "no sign-up", "don&#x27;t track", "we don't track", "private"]) {
      expect(html).not.toContain(banned);
    }
  });

  it("renders the inline error message on a fetch failure, not a thrown error (design.md section 4)", async () => {
    getMyTripsMock.mockRejectedValueOnce(new Error("boom"));
    const { default: TripsDashboardPage } = await import("./page");
    const el = await TripsDashboardPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Couldn&#x27;t load your trips.");
    // The shelf and the pill still show, and there is no first-run card.
    expect(html).toContain("Start from a template");
    expect(html).not.toContain("No trips yet");
  });

  describe("trip rows (Revision 4, design.md 16.1)", () => {
    const row = (over: Record<string, unknown> = {}) => ({
      id: "trip-1",
      name: "Lake Tahoe",
      location: null,
      startsOn: "2026-02-14",
      endsOn: "2026-02-17",
      isCompleted: false,
      createdAt: "2026-01-01",
      types: ["camping"],
      members: [{ id: "m1", displayName: "A", isOrganizer: true, isPlaceholder: false, initials: "A", avatar: { bg: "#000", fg: "#fff" } }],
      totalCents: 24000,
      yourNetCents: -1240,
      ...over,
    });
    const render = async (rows: unknown[]) => {
      getMyTripsMock.mockResolvedValueOnce(rows);
      const { default: TripsDashboardPage } = await import("./page");
      return renderToStaticMarkup(await TripsDashboardPage());
    };

    it("drops the 'Trip' pill and the avatar stack on every row, and keeps name, dates, people, total and balance", async () => {
      const html = await render([row(), row({ id: "trip-2", name: "Big Sur", isCompleted: true, yourNetCents: 0 })]);
      expect(html).not.toMatch(/>Trip<\/span>/);
      expect(html).not.toContain("rounded-full px-[10px] py-[4px] text-[11px] font-semibold\" style=\"background:oklch(0.95 0.04 88)");
      expect(html).not.toContain("rounded-full border-2");
      expect(html).toContain("Lake Tahoe");
      expect(html).toContain("Feb 14–17 · 1 person · $240.00");
      expect(html).toContain("You owe $12.40");
      expect(html).toContain("Locked");
      expect(html).toContain("Settled up");
    });

    it("uses the compact rhythm: Card px-4 py-1, rows py-3.5 with a 40px icon square, 15px/600 body-font name", async () => {
      const html = await render([row(), row({ id: "trip-2", name: "Second" })]);
      expect(html).toContain("rounded-card bg-white shadow-card px-4 py-1");
      expect(html).toContain("py-3.5");
      expect(html).toContain("size-10 flex-none");
      expect(html).toContain("text-[15px] font-semibold leading-5");
      expect(html).not.toContain("text-display text-[22px]");
    });

    it("draws a 15% ink divider between rows only, none after the last", async () => {
      const html = await render([row(), row({ id: "trip-2", name: "Second" }), row({ id: "trip-3", name: "Third" })]);
      expect(html.match(/border-b border-ink\/\[0\.15\]/g)).toHaveLength(2);
      expect(html).not.toContain("divide-y");
      expect(html).not.toContain("border-ink/[0.07]");
    });

    it("skips an absent date without a stray separator, and says 'No expenses yet' instead of $0.00", async () => {
      const html = await render([row({ startsOn: null, endsOn: null, totalCents: 0, yourNetCents: 0, members: [] })]);
      expect(html).toContain("0 people · No expenses yet");
      expect(html).not.toContain("$0.00");
      expect(html).not.toContain("> · ");
    });

    it("shows dates across months compactly", async () => {
      const html = await render([row({ startsOn: "2026-12-28", endsOn: "2027-01-02" })]);
      expect(html).toContain("Dec 28 – Jan 2");
    });

    it("keeps the subtitle on the full width: balance on the name line (ongoing), Locked pill there (completed) with the balance on a third line", async () => {
      const ongoing = await render([row({ yourNetCents: 5000 })]);
      // Ongoing: once on the name line (>=360px) and once as the third line (<360px).
      expect(ongoing).toContain("hidden flex-none text-right text-[12.5px] leading-5 min-[360px]:block");
      expect(ongoing).toContain("min-[360px]:hidden");
      expect(ongoing.match(/You&#x27;re owed \$50\.00/g)).toHaveLength(2);
      const done = await render([row({ isCompleted: true, yourNetCents: 5000 })]);
      expect(done).toContain("Locked");
      expect(done.match(/You&#x27;re owed \$50\.00/g)).toHaveLength(1);
      expect(done).not.toContain("min-[360px]:hidden");
    });

    it("uses the first catalog type's icon, and a neutral pin when there is none", async () => {
      const withType = await render([row({ types: ["airbnb"] })]);
      const without = await render([row({ types: [] })]);
      expect(withType).toContain("M15 21v-8");
      expect(without).toContain("M20 10c0 6-8 12-8 12");
    });

    it("keeps a 10px gap under each kicker and 26px between Ongoing and Completed", async () => {
      const html = await render([row(), row({ id: "trip-2", name: "Done", isCompleted: true })]);
      expect(html).toContain("h-[26px]");
      expect(html).toMatch(/Ongoing<\/div><div class="h-2\.5">/);
      expect(html).toMatch(/Completed<\/div><div class="h-2\.5">/);
    });
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
