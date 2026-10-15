// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createDom, makeView } from "@/test/dom";

/**
 * QA: bounds on the pending Suggested-card add (criterion 26, ADR 0015): TTL, sign-out, leaving
 * the List tab, a completed trip, and cancel. Each must end with NO insert after verification.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const insertMock = vi.fn();
let authListener: ((event: string) => void) | null = null;
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1", is_anonymous: verifiedSession ? false : true } } }),
      getSession: async () => ({ data: { session: { user: { id: "user-1" } } } }),
      onAuthStateChange: (cb: (event: string) => void) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    from: (table: string) => {
      if (table === "shopping_list_items") return { insert: (rows: unknown) => insertMock(rows) };
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));
vi.mock("@/lib/tracking", () => ({ trackEvent: vi.fn() }));

import { ShoppingListTab } from "./shopping-list-tab";
import { TripVerificationProvider, useTripVerification } from "./verify-inline";

let verifiedSession = false;

const list = makeView([]);

function VerifyButton() {
  const { markVerified } = useTripVerification();
  return <button onClick={markVerified}>test-verify</button>;
}

function Harness({ isCompleted = false }: { isCompleted?: boolean }) {
  const [showList, setShowList] = useState(true);
  return (
    <TripVerificationProvider initialIsVerified={false}>
      <VerifyButton />
      <button onClick={() => setShowList(false)}>leave-tab</button>
      {showList ? (
        <ShoppingListTab tripId="t1" isCompleted={isCompleted} shoppingList={list} onRefresh={async () => list} tripTypes={["camping"]} />
      ) : null}
    </TripVerificationProvider>
  );
}

const dom = createDom();
const { mount, flush, button } = dom;

async function tapTent() {
  await act(async () => button("Add 'Campsite fee' to the list").click());
  await flush();
}
async function verify() {
  verifiedSession = true;
  await act(async () => button("test-verify").click());
  await flush();
  await flush();
}

beforeEach(() => {
  insertMock.mockResolvedValue({ error: null });
  verifiedSession = false;
  authListener = null;
});
afterEach(() => {
  dom.teardown();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("pending suggestion replay bounds", () => {
  it("drops a pending add older than 10 minutes", async () => {
    await mount(<Harness />);
    const now = Date.now();
    await tapTent();
    const spy = vi.spyOn(Date, "now").mockReturnValue(now + 10 * 60 * 1000 + 5000);
    await verify();
    spy.mockRestore();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("drops a pending add after SIGNED_OUT", async () => {
    await mount(<Harness />);
    await tapTent();
    await act(async () => authListener?.("SIGNED_OUT"));
    await verify();
    expect(authListener).not.toBeNull();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("drops a pending add when the List tab is left before verifying", async () => {
    await mount(<Harness />);
    await tapTent();
    await act(async () => button("leave-tab").click());
    await verify();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("does not replay on a completed trip", async () => {
    await mount(<Harness isCompleted />);
    expect(dom.container.textContent).not.toContain("Suggested for this trip");
    await verify();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("does replay inside the TTL (control)", async () => {
    await mount(<Harness />);
    await tapTent();
    await verify();
    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});
