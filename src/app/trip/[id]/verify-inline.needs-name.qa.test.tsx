// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { readFileSync } from "node:fs";
import { createRoot, type Root } from "react-dom/client";
import { InlineVerifyWidget, TripVerificationProvider } from "./verify-inline";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * QA (migration 0020): a verified organizer who never picked a name (still the 'Organizer'
 * stand-in) gets the trip page's needs-name card.
 */

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(),
      // TripVerificationProvider subscribes to auth changes (pending Suggested-card add).
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
}));
const setMyDisplayNameMock = vi.fn();
vi.mock("@/lib/data/trips", () => ({
  getMyDisplayName: vi.fn(),
  setMyDisplayName: (...a: unknown[]) => setMyDisplayNameMock(...a),
}));

function flush(times = 10) {
  return new Promise<void>((resolve) => {
    let n = 0;
    const tick = () => (++n >= times ? resolve() : setTimeout(tick, 0));
    setTimeout(tick, 0);
  });
}

async function render(initialNeedsName: boolean) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(
      <TripVerificationProvider initialIsVerified initialNeedsName={initialNeedsName}>
        <InlineVerifyWidget />
      </TripVerificationProvider>,
    );
    await flush();
  });
  return container;
}

beforeEach(() => {
  vi.clearAllMocks();
  setMyDisplayNameMock.mockResolvedValue(undefined);
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("needs-name card (AC25)", () => {
  it("a verified organizer with no chosen name is asked for a name, and it's saved account-wide", async () => {
    const container = await render(true);
    expect(container.textContent).toContain("Almost there — what should everyone call you?");
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("");
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(input, "Daniel");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await act(async () => {
      await flush();
    });
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Continue"))!;
    await act(async () => {
      button.click();
      await flush();
    });
    expect(setMyDisplayNameMock).toHaveBeenCalledWith(expect.anything(), "Daniel");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("a verified member with a real name sees nothing", async () => {
    const container = await render(false);
    expect(container.textContent).toBe("");
  });

  it("the trip page derives it from the 'Organizer' stand-in name", () => {
    const page = readFileSync("src/app/trip/[id]/page.tsx", "utf8");
    expect(page).toContain('initialNeedsName={isVerified && you?.displayName === "Organizer"}');
  });
});
