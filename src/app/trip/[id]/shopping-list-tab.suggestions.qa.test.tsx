// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { ShoppingListView } from "@/lib/data/shopping-list";
import { createDom, makeView } from "@/test/dom";

/**
 * Wiring smoke test for the Suggested card with the REAL TripVerificationProvider: the unverified
 * organizer's "+" makes no database call and is replayed exactly once after verification (ADR
 * 0015), and a verified member's "+" inserts one catalog name.
 */

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: refreshMock }),
}));

const insertMock = vi.fn();
let sessionUserId = "user-1";
let isAnonymous = true;
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: sessionUserId, is_anonymous: isAnonymous } } }),
      getSession: async () => ({ data: { session: { user: { id: sessionUserId } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: (table: string) => {
      if (table === "shopping_list_items") return { insert: (rows: unknown) => insertMock(rows) };
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

vi.mock("@/lib/tracking", () => ({ trackEvent: vi.fn() }));

import { STARTER_TYPES } from "@/lib/starter-catalog";
import { trackEvent } from "@/lib/tracking";
import { ShoppingListTab } from "./shopping-list-tab";
import { InlineVerifyWidget, TripVerificationProvider, useTripVerification } from "./verify-inline";

const view = makeView;

function Harness({ verified, types, list }: { verified: boolean; types: string[]; list: ShoppingListView }) {
  return (
    <TripVerificationProvider initialIsVerified={verified}>
      <InlineVerifyWidget />
      <VerifyButton />
      <ShoppingListTab tripId="t1" isCompleted={false} shoppingList={list} onRefresh={async () => list} tripTypes={types} />
    </TripVerificationProvider>
  );
}

function VerifyButton() {
  const { markVerified } = useTripVerification();
  return <button onClick={markVerified}>test-verify</button>;
}

const dom = createDom();
const { mount, flush, button } = dom;

beforeEach(() => {
  insertMock.mockResolvedValue({ error: null });
  sessionUserId = "user-1";
  isAnonymous = true;
});
afterEach(() => {
  dom.teardown();
  vi.clearAllMocks();
});

describe("Suggested card wiring", () => {
  it("shows no card without a catalog type, and hides the card's names from the list", async () => {
    await mount(<Harness verified types={[]} list={view([])} />);
    expect(dom.container.textContent).not.toContain("Suggested for this trip");
    expect(dom.container.textContent).toContain("Nothing on the list yet.");
  });

  it("shows the card above an empty list, 6 rows with a Show more toggle, minus names already on the list", async () => {
    await mount(<Harness verified types={["camping"]} list={view(["campsite fee"])} />);
    expect(dom.container.textContent).toContain("Suggested for this trip");
    expect(dom.container.querySelector("[data-suggestion='Campsite fee']")).toBeNull();
    expect(dom.container.querySelectorAll("button[data-suggestion]")).toHaveLength(6);
    // Derived from the catalog (the owner edits it by hand): one name is already on the list.
    const camping = STARTER_TYPES.find((t) => t.code === "camping")!;
    expect(button(`Show ${camping.items.length - 1 - 6} more`)).toBeTruthy();
    expect(dom.container.textContent).toContain("Suggested · Camping");
  });

  it("a verified member's + inserts exactly one catalog name", async () => {
    isAnonymous = false;
    await mount(<Harness verified types={["airbnb"]} list={view([])} />);
    await act(async () => button("Add 'Toilet paper' to the list").click());
    await flush();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toEqual([{ trip_id: "t1", added_by: "m1", description: "Toilet paper" }]);
    expect(trackEvent).toHaveBeenCalledWith("suggestion_add_complete");
  });

  it("an unverified organizer's + makes no insert, shows the pending headline, and Cancel clears it", async () => {
    await mount(<Harness verified={false} types={["camping"]} list={view([])} />);
    await act(async () => button("Add 'Campsite fee' to the list").click());
    await flush();
    expect(insertMock).not.toHaveBeenCalled();
    expect(dom.container.textContent).toContain("Confirm your email to add 'Campsite fee' to the list.");
    expect(dom.container.textContent).toContain("Adds after you confirm your email");
    await act(async () => button("Cancel adding 'Campsite fee'").click());
    expect(dom.container.textContent).not.toContain("Adds after you confirm your email");
    expect(dom.container.textContent).toContain("Confirm your email to start adding expenses");
  });

  it("replays the tapped item exactly once after verification, as the same account", async () => {
    await mount(<Harness verified={false} types={["camping"]} list={view([])} />);
    await act(async () => button("Add 'Campsite fee' to the list").click());
    await flush();
    isAnonymous = false; // the OTP step upgraded the same account
    await act(async () => button("test-verify").click());
    await flush();
    await flush();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toEqual([{ trip_id: "t1", added_by: "m1", description: "Campsite fee" }]);
    expect(refreshMock).toHaveBeenCalled();
  });

  it("drops the replay when the session belongs to a different account", async () => {
    await mount(<Harness verified={false} types={["camping"]} list={view([])} />);
    await act(async () => button("Add 'Campsite fee' to the list").click());
    await flush();
    isAnonymous = false;
    sessionUserId = "someone-else";
    await act(async () => button("test-verify").click());
    await flush();
    await flush();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("drops the replay if the item was added meanwhile", async () => {
    let list = view([]);
    function H() {
      return (
        <TripVerificationProvider initialIsVerified={false}>
          <VerifyButton />
          <ShoppingListTab tripId="t1" isCompleted={false} shoppingList={list} onRefresh={async () => view(["Campsite fee"])} tripTypes={["camping"]} />
        </TripVerificationProvider>
      );
    }
    await mount(<H />);
    await act(async () => button("Add 'Campsite fee' to the list").click());
    await flush();
    isAnonymous = false;
    await act(async () => button("test-verify").click());
    await flush();
    await flush();
    expect(insertMock).not.toHaveBeenCalled();
    list = view([]);
  });

  it("puts the Suggested card at the END of the list content (after To get), 18px below it (criterion 124)", async () => {
    await mount(<Harness verified types={["camping"]} list={view(["Existing item"])} />);
    const text = dom.container.textContent!;
    expect(text.indexOf("To get")).toBeLessThan(text.indexOf("Suggested for this trip"));
    expect(text.indexOf("Existing item")).toBeLessThan(text.indexOf("Suggested for this trip"));
    expect(dom.container.querySelector("[data-testid='suggested-card']")!.parentElement!.firstElementChild!.className).toContain("h-[18px]");
  });

  it("on an empty list the card sits alone under 'Nothing on the list yet.'", async () => {
    await mount(<Harness verified types={["camping"]} list={view([])} />);
    const text = dom.container.textContent!;
    expect(text.indexOf("Nothing on the list yet.")).toBeLessThan(text.indexOf("Suggested for this trip"));
    expect(text).not.toContain("To get");
  });

  it("shows the success notice as a floating bar above the bottom bar, not inline above the card", async () => {
    isAnonymous = false;
    await mount(<Harness verified types={["airbnb"]} list={view([])} />);
    await act(async () => button("Add 'Toilet paper' to the list").click());
    await flush();
    const notice = dom.container.querySelector(".fixed.bottom-\\[106px\\]")!;
    expect(notice.textContent).toContain("Added 'Toilet paper' — everyone on the trip can see it.");
    expect(notice.className).toContain("pointer-events-none");
    expect(dom.container.querySelector("[data-testid='suggested-card']")!.parentElement!.textContent).not.toContain("everyone on the trip can see it");
  });

  it("moves focus to the next '+' once the add has finished and the row is gone", async () => {
    isAnonymous = false;
    let list = view([]);
    function H() {
      return (
        <TripVerificationProvider initialIsVerified>
          <ShoppingListTab
            tripId="t1"
            isCompleted={false}
            shoppingList={list}
            onRefresh={async () => {
              list = view(["Toilet paper"]);
              return list;
            }}
            tripTypes={["airbnb"]}
          />
        </TripVerificationProvider>
      );
    }
    await mount(<H />);
    await act(async () => button("Add 'Toilet paper' to the list").click());
    await flush();
    await flush();
    await flush();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Add 'Paper towels' to the list");
  });

  it("a second add within 4s keeps its own notice for a full 4s (one restartable timer)", async () => {
    isAnonymous = false;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await mount(<Harness verified types={["airbnb"]} list={view([])} />);
      const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));
      await act(async () => button("Add 'Toilet paper' to the list").click());
      await settle();
      expect(dom.container.textContent).toContain("Added 'Toilet paper'");
      await act(async () => void (await vi.advanceTimersByTimeAsync(3000)));
      await act(async () => button("Add 'Paper towels' to the list").click());
      await settle();
      // 5s after the first add, 2s after the second: the first timer must not have hidden it.
      await act(async () => void (await vi.advanceTimersByTimeAsync(2000)));
      expect(dom.container.textContent).toContain("Added 'Paper towels'");
      await act(async () => void (await vi.advanceTimersByTimeAsync(2100)));
      expect(dom.container.textContent).not.toContain("Added 'Paper towels'");
    } finally {
      vi.useRealTimers();
    }
  });
});

