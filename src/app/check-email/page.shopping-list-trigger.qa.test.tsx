// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * QA coverage for shopping-list's new `invitee-shopping-list` trigger on `check-email/page.tsx`
 * (architecture.md section 4: "A new `invitee-shopping-list` value is added to
 * `check-email/page.tsx`'s `Trigger` union"). `page.auth-branching.qa.test.tsx` (the existing
 * consumer test for this page) covers `invitee-expense` and the removed organizer-only triggers
 * but was not extended to cover this new value — added here as an additive file, same render
 * harness/pattern as that file, rather than editing it.
 */

const useSearchParamsMock = vi.fn(() => new URLSearchParams());
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn() }),
  useSearchParams: () => useSearchParamsMock(),
}));

const getUserMock = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: getUserMock,
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      verifyOtp: vi.fn().mockResolvedValue({ error: null }),
      signInAnonymously: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}));

const anonymousUser = { id: "anon-1", is_anonymous: true, email: null };

async function renderCheckEmail() {
  const { default: CheckEmailPage } = await import("./page");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<CheckEmailPage />);
  });
  return { container, root };
}

beforeEach(() => {
  vi.clearAllMocks();
  useSearchParamsMock.mockReturnValue(new URLSearchParams());
  getUserMock.mockResolvedValue({ data: { user: anonymousUser } });
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("check-email/page.tsx — trigger=invitee-shopping-list (shopping-list's attempt-then-redirect trigger)", () => {
  it("shows its own headline, not the generic fallback or invitee-expense's copy", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams({ trigger: "invitee-shopping-list" }));
    const { container, root } = await renderCheckEmail();

    expect(container.textContent).toContain("Confirm your email to update the shopping list.");
    expect(container.textContent).not.toContain("Confirm your email to add an expense.");
    expect(container.textContent).not.toContain("Confirm your email.");

    root.unmount();
  });

  it("an unrecognized trigger value still falls back to the generic headline (regression: isTrigger's guard still works with the new union member added)", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams({ trigger: "not-a-real-trigger" }));
    const { container, root } = await renderCheckEmail();

    expect(container.textContent).toContain("Confirm your email.");

    root.unmount();
  });
});
