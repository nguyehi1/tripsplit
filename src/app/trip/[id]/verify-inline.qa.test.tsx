// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  InlineVerifyWidget,
  TripVerificationProvider,
  VerifiedActionIcons,
  VerifiedBottomBarContent,
} from "./verify-inline";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Core behavior test for the organizer's hide-until-verified + inline OTP widget (Decisions
 * 12–13; see docs/features/simplified-onboarding/design.md section 4 and
 * architecture.md's "Update: hide-and-reveal replaces attempt-then-redirect for the organizer").
 * Exercises the full cycle: hidden-when-unverified -> inline widget shown -> email sent -> code
 * confirmed -> buttons revealed, mocking supabase.auth the same way the OTP-fork tests do.
 */

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const getUserMock = vi.fn();
const updateUserMock = vi.fn();
const verifyOtpMock = vi.fn();
const signInAnonymouslyMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: getUserMock,
      updateUser: updateUserMock,
      verifyOtp: verifyOtpMock,
      signInAnonymously: signInAnonymouslyMock,
    },
  }),
}));

const anonymousUser = { id: "anon-1", is_anonymous: true, email: null };

function Harness({ initialIsVerified }: { initialIsVerified: boolean }) {
  return (
    <TripVerificationProvider initialIsVerified={initialIsVerified}>
      <div>
        <VerifiedActionIcons tripId="trip-1" />
        <InlineVerifyWidget />
        <VerifiedBottomBarContent>
          <button>Add an expense</button>
        </VerifiedBottomBarContent>
      </div>
    </TripVerificationProvider>
  );
}

async function renderHarness(initialIsVerified: boolean) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<Harness initialIsVerified={initialIsVerified} />);
  });
  return { container, root };
}

function setValue(input: HTMLInputElement, value: string) {
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
  verifyOtpMock.mockResolvedValue({ error: null });
  signInAnonymouslyMock.mockResolvedValue({ error: null });
  getUserMock.mockResolvedValue({ data: { user: anonymousUser } });
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("trip page mutation gate — hide-until-verified + inline OTP", () => {
  it("initially verified: renders the action icons and BottomBar content, no CTA widget", async () => {
    const { container, root } = await renderHarness(true);

    expect(container.textContent).toContain("Add an expense");
    expect(container.querySelector('[title="Trip roster"]')).not.toBeNull();
    expect(container.querySelector('[title="Settle up"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Confirm your email");

    root.unmount();
  });

  it("unverified: hides the action icons and BottomBar content, shows the inline CTA", async () => {
    const { container, root } = await renderHarness(false);

    expect(container.textContent).not.toContain("Add an expense");
    expect(container.querySelector('[title="Trip roster"]')).toBeNull();
    expect(container.querySelector('[title="Settle up"]')).toBeNull();
    expect(container.textContent).toContain("Confirm your email to start adding expenses or inviting others.");

    root.unmount();
  });

  it("full cycle: send email -> confirm code -> buttons reveal, without waiting on router.refresh()", async () => {
    const { container, root } = await renderHarness(false);

    const emailInput = container.querySelector<HTMLInputElement>("#verify-email")!;
    setValue(emailInput, "organizer@example.com");
    await act(async () => {
      clickButtonWithText(container, "Send me a sign-in code");
      await flushMicrotasks();
    });

    // Anonymous session (the pre-verification owner) — must upgrade in place via updateUser, per
    // the same linking fork used everywhere else.
    expect(updateUserMock).toHaveBeenCalledWith({ email: "organizer@example.com" });
    expect(container.textContent).toContain("Enter it below");

    const codeInput = container.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!;
    setValue(codeInput, "123456");
    await act(async () => {
      clickButtonWithText(container, "Confirm code");
      await flushMicrotasks();
    });

    expect(verifyOtpMock).toHaveBeenCalledWith({
      email: "organizer@example.com",
      token: "123456",
      type: "email_change",
    });

    // Brief "You're verified." success state before the buttons reappear (design.md 4.2).
    expect(container.textContent).toContain("You're verified.");
    expect(container.textContent).not.toContain("Add an expense");

    // The success window (~900ms) elapses, flipping local `verified` state immediately — the
    // architecture-recommended approach is to not block the reveal on router.refresh()'s network
    // round trip, though it's still called to reconcile the rest of the page in the background.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 950));
    });

    expect(container.textContent).toContain("Add an expense");
    expect(container.querySelector('[title="Trip roster"]')).not.toBeNull();
    expect(container.querySelector('[title="Settle up"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Confirm your email");
    expect(refreshMock).toHaveBeenCalledTimes(1);

    root.unmount();
  });
});
