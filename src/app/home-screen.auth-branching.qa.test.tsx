// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * QA coverage for fix #2 (see the QA follow-up on simplified-onboarding): `HomeScreen`'s
 * `SignInForm.sendLink()` — reached via `/?signin=1` — must not blindly call
 * `signInWithOtp({ email })` while a stale anonymous session is active on this browser (e.g. an
 * abandoned trip-creation attempt). If it did, `/check-email`'s `confirm()` would independently
 * re-derive `isAnonymous` from that still-anonymous session and call `verifyOtp` with
 * `type: "email_change"` for a code that was actually sent via `signInWithOtp`
 * (`type: "email"`) — a mismatch that fails confirmation.
 *
 * The fix: `sendLink()` checks for an active anonymous session first and signs it out before
 * calling `signInWithOtp`, so the code is always sent (and later confirmed) via the plain
 * sign-in path with no ambiguity. This test proves, against the real component, that
 * `signOut()` is called exactly when an anonymous session exists, and never otherwise, and that
 * `signInWithOtp` always fires after it (not before, and not skipped).
 */

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn() }),
}));

const getUserMock = vi.fn();
const signOutMock = vi.fn();
const signInWithOtpMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: getUserMock,
      signOut: signOutMock,
      signInWithOtp: signInWithOtpMock,
    },
  }),
}));

const anonymousUser = { id: "anon-1", is_anonymous: true, email: null };
const permanentUser = { id: "perm-1", is_anonymous: false, email: "already@example.com" };

async function renderSignInForm() {
  const { HomeScreen } = await import("./home-screen");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<HomeScreen showSignIn />);
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
      if (n >= times) {
        resolve();
      } else {
        setTimeout(tick, 0);
      }
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
  signOutMock.mockResolvedValue({ error: null });
  signInWithOtpMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("home-screen SignInForm.sendLink() — stale anonymous session handling", () => {
  it("signs out a stale anonymous session before calling signInWithOtp", async () => {
    getUserMock.mockResolvedValue({ data: { user: anonymousUser } });
    const { container, root } = await renderSignInForm();

    typeEmail(container, "organizer@example.com");
    await act(async () => {
      clickButtonWithText(container, "Send me a sign-in code");
      await flushMicrotasks();
    });

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(signInWithOtpMock).toHaveBeenCalledTimes(1);
    expect(signInWithOtpMock).toHaveBeenCalledWith({ email: "organizer@example.com" });

    // signOut must complete before signInWithOtp fires, not race it — otherwise the anonymous
    // session could still be active when the OTP send actually happens.
    const signOutOrder = signOutMock.mock.invocationCallOrder[0];
    const otpOrder = signInWithOtpMock.mock.invocationCallOrder[0];
    expect(signOutOrder).toBeLessThan(otpOrder);

    root.unmount();
  });

  it("does not call signOut when no session exists", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { container, root } = await renderSignInForm();

    typeEmail(container, "fresh@example.com");
    await act(async () => {
      clickButtonWithText(container, "Send me a sign-in code");
      await flushMicrotasks();
    });

    expect(signOutMock).not.toHaveBeenCalled();
    expect(signInWithOtpMock).toHaveBeenCalledTimes(1);
    expect(signInWithOtpMock).toHaveBeenCalledWith({ email: "fresh@example.com" });

    root.unmount();
  });

  it("does not call signOut when the existing session is already permanent", async () => {
    getUserMock.mockResolvedValue({ data: { user: permanentUser } });
    const { container, root } = await renderSignInForm();

    typeEmail(container, "already@example.com");
    await act(async () => {
      clickButtonWithText(container, "Send me a sign-in code");
      await flushMicrotasks();
    });

    expect(signOutMock).not.toHaveBeenCalled();
    expect(signInWithOtpMock).toHaveBeenCalledTimes(1);

    root.unmount();
  });
});
