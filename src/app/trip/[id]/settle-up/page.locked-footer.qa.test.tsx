// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDom } from "@/test/dom";

/**
 * expense-delete-and-polish criteria 35 and 36: on a locked trip the Settle-up footer drops the
 * dead muted "Trip completed" button (status card and "Create a new trip" stay); the open-trip
 * footer is unchanged.
 */

const getUserMock = vi.fn();
const getTripViewMock = vi.fn();
const completeTripMock = vi.fn();
const pushMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({ auth: { getUser: getUserMock } })),
}));
vi.mock("@/lib/data/trips", () => ({
  getTripView: (...args: unknown[]) => getTripViewMock(...args),
  completeTrip: (...args: unknown[]) => completeTripMock(...args),
}));
vi.mock("@/lib/tracking", () => ({ trackEvent: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "trip-1" }),
  useRouter: () => ({ push: pushMock }),
}));

const dom = createDom();
afterEach(() => {
  dom.teardown();
  vi.clearAllMocks();
});

const member = { id: "m1", displayName: "Alice", isPlaceholder: false, initials: "A", avatar: { bg: "#fff", fg: "#000" } };
const view = (isCompleted: boolean) => ({
  trip: { id: "trip-1", name: "Lake Tahoe", startsOn: "2026-03-05", endsOn: "2026-03-09", inviteCode: "ABC", isCompleted },
  members: [member],
  settlements: [],
  totalCents: 10000,
  avgPerPersonCents: 10000,
  you: { isOrganizer: true, paidCents: 4000, netCents: -1000 },
});

async function mount(isCompleted: boolean) {
  getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
  getTripViewMock.mockResolvedValueOnce(view(isCompleted));
  const { default: SettleUpPage } = await import("./page");
  await dom.mount(<SettleUpPage />);
  await dom.flush();
}

describe("Settle up, locked trip footer", () => {
  it("has no 'Trip completed' button; 'Create a new trip' is the only footer action; status card and Locked badge remain", async () => {
    await mount(true);
    const buttonLabels = Array.from(dom.container.querySelectorAll("button")).map((b) => b.textContent?.trim());
    expect(buttonLabels).not.toContain("Trip completed");
    expect(buttonLabels.filter((l) => /Trip complete/.test(l ?? ""))).toEqual([]);
    expect(buttonLabels).toContain("Create a new trip");
    // The status card still says it (not a button).
    expect(dom.container.textContent).toContain("Trip completed");
    expect(dom.container.textContent).toContain("Locked");
    // No muted dead button: nothing in the DOM is a button whose only job is the status wording.
    expect(dom.container.querySelectorAll("button.cursor-default, button[disabled]").length).toBe(0);
  });

  it("'Create a new trip' still goes to /trip/new", async () => {
    await mount(true);
    const create = dom.button("Create a new trip");
    create.click();
    expect(pushMock).toHaveBeenCalledWith("/trip/new");
  });

  it("open trip: the 'Trip complete' action button is still there and Create a new trip is not", async () => {
    await mount(false);
    const labels = Array.from(dom.container.querySelectorAll("button")).map((b) => b.textContent?.trim());
    expect(labels.some((l) => l === "Trip complete")).toBe(true);
    expect(labels).not.toContain("Create a new trip");
  });
});
