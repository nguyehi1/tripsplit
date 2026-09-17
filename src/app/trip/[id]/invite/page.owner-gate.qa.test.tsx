// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * QA follow-up fix (docs/features/simplified-onboarding/design.md section 4.0): "an unverified
 * owner hitting /trip/[id]/add-expense directly must itself redirect back to /trip/[id]" — the
 * same requirement applies to the invite screen (the other hidden entry point: the roster/Invite
 * icon). The trip page only hides the icon; it doesn't stop a direct URL hit, so this screen
 * guards itself using `view.you?.isOrganizer` (already computed by `getTripView`) plus the
 * session's anonymity, via the shared `isUnverifiedOwner` helper. Not a security test — RLS
 * already blocks the underlying mutations regardless of what this screen renders.
 */

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "trip-1" }),
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
}));

const getUserMock = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getUser: getUserMock } }),
}));

import type { TripView } from "@/lib/data/trips";

const getTripViewMock = vi.fn<(...args: unknown[]) => Promise<TripView>>();
vi.mock("@/lib/data/trips", () => ({
  getTripView: (...args: unknown[]) => getTripViewMock(...args),
}));

function makeView(overrides: { isOrganizer: boolean }): TripView {
  return {
    trip: {
      id: "trip-1",
      name: "Ski trip",
      location: null,
      startsOn: null,
      endsOn: null,
      inviteCode: "abc123",
      isCompleted: false,
    },
    members: [],
    expenses: [],
    settlements: [],
    totalCents: 0,
    avgPerPersonCents: 0,
    you: { id: "member-1", isOrganizer: overrides.isOrganizer } as unknown as TripView["you"],
  } as unknown as TripView;
}

async function renderInvite() {
  const { default: TripInvitePage } = await import("./page");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<TripInvitePage />);
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
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("invite/page.tsx — direct-URL owner gate (design.md 4.0)", () => {
  it("unverified owner hitting the URL directly is redirected back to /trip/[id], invite screen never renders", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "owner-1", is_anonymous: true } } });
    getTripViewMock.mockResolvedValue(makeView({ isOrganizer: true }));

    const { container, root } = await renderInvite();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(replaceMock).toHaveBeenCalledWith("/trip/trip-1");
    expect(container.textContent).not.toContain("Invite link");

    root.unmount();
  });

  it("verified owner is not redirected — the invite screen renders normally", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "owner-1", is_anonymous: false } } });
    getTripViewMock.mockResolvedValue(makeView({ isOrganizer: true }));

    const { container, root } = await renderInvite();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(replaceMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Invite link");

    root.unmount();
  });

  it("unverified invitee (not the owner) is not redirected — their own flow is unchanged", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "member-2", is_anonymous: true } } });
    getTripViewMock.mockResolvedValue(makeView({ isOrganizer: false }));

    const { container, root } = await renderInvite();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(replaceMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Invite link");

    root.unmount();
  });

  // Pre-push review fix (add-expense/page.tsx): the equivalent gate there could fail open when
  // its ownership-determining query errored ambiguously. Unlike add-expense, this screen derives
  // ownership from `getTripView`, which itself throws on any underlying query error/empty row
  // (src/lib/data/trips.ts) rather than resolving with `data: null` — so a failure here is never
  // ambiguous: it always lands in the outer `.catch`, which shows an error and never reaches the
  // `isUnverifiedOwner` check or renders the invite screen's content, for anyone including the
  // actual unverified owner. This test confirms that's still true (no equivalent fail-open gap).
  it("getTripView failing (RLS denial, transient error) never renders the invite screen — fails closed already, even for the owner", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "owner-1", is_anonymous: true } } });
    getTripViewMock.mockRejectedValue(new Error("RLS denied"));

    const { container, root } = await renderInvite();
    await act(async () => {
      await flushMicrotasks();
    });

    expect(container.textContent).not.toContain("Invite link");
    expect(container.textContent).toContain("Couldn't load this trip.");

    root.unmount();
  });
});
