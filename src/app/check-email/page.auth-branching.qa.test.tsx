// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Thin consumer test for `check-email/page.tsx`. The anonymous-to-permanent linking fork itself
 * (isAnonymous -> updateUser/verifyOtp({type:"email_change"}) vs. signInWithOtp/verifyOtp
 * ({type:"email"})) is now implemented once in `useOtpFlow` (`src/lib/use-otp-flow.ts`) and
 * exhaustively covered there — see `src/lib/use-otp-flow.qa.test.tsx`. This file only proves this
 * page still wires into that hook correctly (renders the right screen, calls through to the right
 * Supabase method for its two phases) rather than re-testing the branch matrix a second time.
 */

const useSearchParamsMock = vi.fn(() => new URLSearchParams());
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn() }),
  useSearchParams: () => useSearchParamsMock(),
}));

const getUserMock = vi.fn();
const updateUserMock = vi.fn();
const signInWithOtpMock = vi.fn();
const verifyOtpMock = vi.fn();
const signInAnonymouslyMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: getUserMock,
      updateUser: updateUserMock,
      signInWithOtp: signInWithOtpMock,
      verifyOtp: verifyOtpMock,
      signInAnonymously: signInAnonymouslyMock,
    },
  }),
}));

const anonymousUser = { id: "anon-1", is_anonymous: true, email: null };
const permanentUser = { id: "perm-1", is_anonymous: false, email: "already@example.com" };

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

function typeEmail(container: HTMLElement, value: string) {
  const input = container.querySelector<HTMLInputElement>("#email")!;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
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

function clickButtonWithText(container: HTMLElement, text: string) {
  const buttons = Array.from(container.querySelectorAll("button"));
  const button = buttons.find((b) => b.textContent?.includes(text));
  if (!button) throw new Error(`No button found with text "${text}" — found: ${buttons.map((b) => b.textContent).join(" | ")}`);
  button.click();
}

beforeEach(() => {
  vi.clearAllMocks();
  updateUserMock.mockResolvedValue({ error: null });
  signInWithOtpMock.mockResolvedValue({ error: null });
  verifyOtpMock.mockResolvedValue({ error: null });
  signInAnonymouslyMock.mockResolvedValue({ error: null });
  useSearchParamsMock.mockReturnValue(new URLSearchParams());
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("check-email/page.tsx — wired into the shared useOtpFlow hook", () => {
  it("anonymous session: tapping 'Send me a sign-in code' reaches updateUser via the hook", async () => {
    getUserMock.mockResolvedValue({ data: { user: anonymousUser } });
    const { container, root } = await renderCheckEmail();

    typeEmail(container, "organizer@example.com");
    await act(async () => {
      clickButtonWithText(container, "Send me a sign-in code");
      await flushMicrotasks();
    });

    expect(updateUserMock).toHaveBeenCalledWith({ email: "organizer@example.com" });
    expect(signInWithOtpMock).not.toHaveBeenCalled();

    root.unmount();
  });

  it("trigger=invitee-expense (the invitee add/edit-expense redirect's real call site) shows the add-expense headline, not the generic fallback", async () => {
    getUserMock.mockResolvedValue({ data: { user: anonymousUser } });
    useSearchParamsMock.mockReturnValue(new URLSearchParams({ trigger: "invitee-expense" }));
    const { container, root } = await renderCheckEmail();

    // `invitee-expense` is a valid, recognized `Trigger` (unlike the removed organizer-only
    // triggers) — it must reach its own headline, not the unrecognized-trigger fallback.
    expect(container.textContent).toContain("Confirm your email to add an expense.");

    root.unmount();
  });

  it("no `trigger`/`invite` param + email in the URL: skips straight to the code phase, drops the removed organizer-only triggers", async () => {
    getUserMock.mockResolvedValue({ data: { user: permanentUser } });
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams({ email: "already@example.com", trigger: "add-expense" }),
    );
    const { container, root } = await renderCheckEmail();

    // "add-expense" is no longer a recognized Trigger (Decision 12 removed the organizer-only
    // triggers) — it should fall back to the generic headline, not the old per-trigger copy.
    expect(container.textContent).toContain("Enter your");
    expect(container.textContent).not.toContain("to save this expense");

    const codeInput = container.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(codeInput, "654321");
    codeInput.dispatchEvent(new Event("input", { bubbles: true }));

    await act(async () => {
      clickButtonWithText(container, "Confirm code");
      await flushMicrotasks();
    });

    expect(verifyOtpMock).toHaveBeenCalledWith({
      email: "already@example.com",
      token: "654321",
      type: "email",
    });

    root.unmount();
  });

  /**
   * Pre-push review fix 1 (simplified-onboarding): confirming code only ever joins the caller as
   * a trip_members row via /api/join when an `invite` param is present (handleConfirm). Before
   * the fix, TripSummaryOnly's bare-`/trip/[id]` "See full details" link never set `invite`, so a
   * visitor following it would verify successfully but never actually join — landing right back
   * on the same summary screen in a permanent loop. This proves the two branches this depends on:
   * `invite` present -> /api/join is called and its trip is navigated to; `invite` absent -> the
   * old (still-supported) plain-verify path is unaffected.
   */
  describe("handleConfirm's invite-gated /api/join call (the loop-fix mechanism)", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("invite param present (e.g. now supplied by the bare /trip/[id] summary link): calls /api/join and navigates to the welcome screen", async () => {
      getUserMock.mockResolvedValue({ data: { user: anonymousUser } });
      verifyOtpMock.mockResolvedValue({ error: null });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ tripId: "trip-1" }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      useSearchParamsMock.mockReturnValue(
        new URLSearchParams({ email: "visitor@example.com", invite: "abc123", name: "Cleo" }),
      );

      const { container, root } = await renderCheckEmail();
      const codeInput = container.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(codeInput, "111111");
      codeInput.dispatchEvent(new Event("input", { bubbles: true }));

      await act(async () => {
        clickButtonWithText(container, "Confirm code");
        await flushMicrotasks();
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/join",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ inviteCode: "abc123", displayName: "Cleo" }),
        }),
      );
      expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("/join/abc123/welcome"));

      root.unmount();
    });

    it("no invite param: confirming does NOT call /api/join and navigates straight to `next` instead", async () => {
      getUserMock.mockResolvedValue({ data: { user: anonymousUser } });
      verifyOtpMock.mockResolvedValue({ error: null });
      const fetchMock = vi.fn();
      global.fetch = fetchMock as unknown as typeof fetch;
      useSearchParamsMock.mockReturnValue(
        new URLSearchParams({ email: "visitor@example.com", next: "/trip/trip-1" }),
      );

      const { container, root } = await renderCheckEmail();
      const codeInput = container.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(codeInput, "222222");
      codeInput.dispatchEvent(new Event("input", { bubbles: true }));

      await act(async () => {
        clickButtonWithText(container, "Confirm code");
        await flushMicrotasks();
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(pushMock).toHaveBeenCalledWith("/trip/trip-1");

      root.unmount();
    });
  });
});
