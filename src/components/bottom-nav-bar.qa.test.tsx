import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TripTabProvider } from "@/app/trip/[id]/trip-tab-context";

/**
 * QA coverage for the unified bottom bar component itself (requirements.md item 2 / AC3;
 * design.md §5) — measurements, active/inactive states, and the three call shapes
 * (`HomeNavBar`, `TripNavBar`, `NavBarShell`).
 */

let currentPathname = "/trips";
vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
}));

describe("BottomNavBar measurements (AC3)", () => {
  it("HomeNavBar matches the handoff's bar/tab measurements: 24px icons, 11px labels, 52px tabs, 8/20px padding, hairline + blur", async () => {
    currentPathname = "/trips";
    const { HomeNavBar } = await import("./bottom-nav-bar");
    const html = renderToStaticMarkup(<HomeNavBar />);
    expect(html).toContain("border-t border-hairline");
    expect(html).toContain("backdrop-blur-[16px]");
    expect(html).toContain("pt-2"); // 8px top padding
    expect(html).toContain("pb-[max(20px,env(safe-area-inset-bottom))]"); // 20px bottom + safe area
    expect(html).toContain("h-[52px]");
    expect(html).toMatch(/width="24" height="24"/);
    expect(html).toContain("text-[11px]");
    expect(html).toContain('style="background:var(--color-nav-bar)"');
  });

  it("marks exactly the tab matching the current pathname active, with the 56x3px accent line, bold label, and heavier icon stroke", async () => {
    currentPathname = "/trips";
    const { HomeNavBar } = await import("./bottom-nav-bar");
    const html = renderToStaticMarkup(<HomeNavBar />);
    // Exactly one active-line marker and one bold/accent-text label.
    expect(html.match(/h-\[3px\] w-14/g)).toHaveLength(1);
    expect(html.match(/font-bold text-accent-text/g)).toHaveLength(1);
    expect(html).toMatch(/stroke-width="2\.5"[^>]*class="text-accent-text"[\s\S]*?<\/svg><span class="text-\[11px\] leading-none font-bold text-accent-text">Trips/);
    // Inactive tabs: regular weight label, lighter stroke.
    expect(html.match(/stroke-width="2" /g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("HomeNavBar marks 'New trip' active on /trip/new and 'You' active on /you", async () => {
    const { HomeNavBar } = await import("./bottom-nav-bar");
    currentPathname = "/trip/new";
    const newTripHtml = renderToStaticMarkup(<HomeNavBar />);
    expect(newTripHtml).toMatch(/font-bold text-accent-text">New trip/);

    currentPathname = "/you";
    const youHtml = renderToStaticMarkup(<HomeNavBar />);
    expect(youHtml).toMatch(/font-bold text-accent-text">You/);
  });

  it("TripNavBar's 'Trips' tab is never active (one level down, not a tab root) and the other three read TripTabProvider state", async () => {
    const { TripNavBar } = await import("./bottom-nav-bar");
    const html = renderToStaticMarkup(
      <TripTabProvider initialTab="expenses">
        <TripNavBar tripId="trip-1" />
      </TripTabProvider>,
    );
    expect(html).toContain('href="/trips"');
    // Only "Expenses" (the initial tab) is bold/active; "Trips" is not.
    expect(html.match(/font-bold text-accent-text/g)).toHaveLength(1);
    expect(html).toMatch(/font-bold text-accent-text">Expenses/);
    expect(html).not.toMatch(/font-bold text-accent-text">Trips/);
  });

  it("NavBarShell renders the same visual shell with no tabs — just the caller's children", async () => {
    const { NavBarShell } = await import("./bottom-nav-bar");
    const html = renderToStaticMarkup(
      <NavBarShell>
        <button type="button">Go to the trip</button>
      </NavBarShell>,
    );
    expect(html).toContain("border-t border-hairline");
    expect(html).toContain("backdrop-blur-[16px]");
    expect(html).toContain("Go to the trip");
    expect(html).not.toContain('aria-label="Primary"');
    expect(html).not.toContain("text-accent-text");
  });
});
