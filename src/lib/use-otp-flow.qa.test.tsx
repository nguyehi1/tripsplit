// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useOtpFlow } from "./use-otp-flow";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * QA coverage for the single highest-risk, explicitly-unverified piece of the
 * simplified-onboarding feature (see docs/adr/0006-anonymous-auth-and-otp-linking-for-onboarding.md
 * and architecture.md's "OTP confirmation: sign-in vs. linking"): the fork inside `useOtpFlow`
 * (`src/lib/use-otp-flow.ts`) between
 *   - an anonymous session -> supabase.auth.updateUser({ email }) then
 *     verifyOtp({ email, token, type: "email_change" })  (anonymous-to-permanent linking)
 *   - no/permanent session -> supabase.auth.signInWithOtp({ email }) then
 *     verifyOtp({ email, token, type: "email" })          (today's unchanged sign-in path)
 *
 * This used to live inline in `src/app/check-email/page.tsx`; architecture.md's "Shared OTP
 * logic" section (Decision 12 follow-up) had it extracted into this hook so
 * `check-email/page.tsx` and the trip page's inline organizer widget
 * (`src/app/trip/[id]/verify-inline.tsx`) share exactly one implementation. This test exercises
 * the hook directly (not a page that happens to use it) — a regression here (e.g. someone
 * "simplifying" the branch away) would fail immediately, in one place, regardless of which
 * consumer is rendered.
 *
 * There is no live/staging Supabase project available to this repo (per ADR 0006), so this test
 * cannot prove Supabase's server-side linking behavior itself — only that the hook calls exactly
 * the right method, with exactly the right params, in the right order, for both callers.
 */

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

/** A minimal harness exposing the hook's send/confirm calls as buttons, driven directly — same
 * pattern the previous page-level test used, just against the hook instead of a full screen. */
function Harness({ skipToCode = false }: { skipToCode?: boolean }) {
  const otp = useOtpFlow({ initialEmail: skipToCode ? "target@example.com" : "", skipToCode });
  return (
    <div>
      <input aria-label="email" value={otp.email} onChange={(e) => otp.setEmail(e.target.value)} />
      <input aria-label="code" value={otp.code} onChange={(e) => otp.setCode(e.target.value)} />
      <button onClick={() => otp.sendCode(otp.email)}>Send me a sign-in code</button>
      <button onClick={() => otp.confirmCode(otp.code)}>Confirm code</button>
    </div>
  );
}

async function renderHarness(props: { skipToCode?: boolean } = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<Harness {...props} />);
  });
  return { container, root };
}

function setValue(container: HTMLElement, label: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
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
  if (!button) throw new Error(`No button found with text "${text}"`);
  button.click();
}

beforeEach(() => {
  vi.clearAllMocks();
  updateUserMock.mockResolvedValue({ error: null });
  signInWithOtpMock.mockResolvedValue({ error: null });
  verifyOtpMock.mockResolvedValue({ error: null });
  signInAnonymouslyMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useOtpFlow — send-code branching (anonymous-to-permanent linking fork)", () => {
  it("anonymous session: sendCode calls updateUser({ email }), never signInWithOtp", async () => {
    getUserMock.mockResolvedValue({ data: { user: anonymousUser } });
    const { container, root } = await renderHarness();

    setValue(container, "email", "organizer@example.com");
    await act(async () => {
      clickButtonWithText(container, "Send me a sign-in code");
      await flushMicrotasks();
    });

    expect(updateUserMock).toHaveBeenCalledTimes(1);
    expect(updateUserMock).toHaveBeenCalledWith({ email: "organizer@example.com" });
    expect(signInWithOtpMock).not.toHaveBeenCalled();

    root.unmount();
  });

  it("no session at all: sendCode creates an anonymous session first, then calls updateUser — never signInWithOtp", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    getUserMock.mockResolvedValue({ data: { user: anonymousUser } });
    const { container, root } = await renderHarness();

    setValue(container, "email", "invitee@example.com");
    await act(async () => {
      clickButtonWithText(container, "Send me a sign-in code");
      await flushMicrotasks();
    });

    expect(signInAnonymouslyMock).toHaveBeenCalledTimes(1);
    expect(updateUserMock).toHaveBeenCalledTimes(1);
    expect(updateUserMock).toHaveBeenCalledWith({ email: "invitee@example.com" });
    expect(signInWithOtpMock).not.toHaveBeenCalled();

    root.unmount();
  });

  it("already-permanent session: takes signInWithOtp, not updateUser", async () => {
    getUserMock.mockResolvedValue({ data: { user: permanentUser } });
    const { container, root } = await renderHarness();

    setValue(container, "email", "already@example.com");
    await act(async () => {
      clickButtonWithText(container, "Send me a sign-in code");
      await flushMicrotasks();
    });

    expect(signInWithOtpMock).toHaveBeenCalledTimes(1);
    expect(updateUserMock).not.toHaveBeenCalled();

    root.unmount();
  });
});

describe("useOtpFlow — confirm-code branching (verifyOtp `type` fork)", () => {
  it("anonymous session: confirmCode calls verifyOtp with type 'email_change'", async () => {
    getUserMock.mockResolvedValue({ data: { user: anonymousUser } });
    const { container, root } = await renderHarness({ skipToCode: true });

    setValue(container, "code", "123456");
    await act(async () => {
      clickButtonWithText(container, "Confirm code");
      await flushMicrotasks();
    });

    expect(verifyOtpMock).toHaveBeenCalledTimes(1);
    expect(verifyOtpMock).toHaveBeenCalledWith({
      email: "target@example.com",
      token: "123456",
      type: "email_change",
    });

    root.unmount();
  });

  it("permanent session: confirmCode calls verifyOtp with type 'email' (unchanged existing path)", async () => {
    getUserMock.mockResolvedValue({ data: { user: permanentUser } });
    const { container, root } = await renderHarness({ skipToCode: true });

    setValue(container, "code", "654321");
    await act(async () => {
      clickButtonWithText(container, "Confirm code");
      await flushMicrotasks();
    });

    expect(verifyOtpMock).toHaveBeenCalledWith({
      email: "target@example.com",
      token: "654321",
      type: "email",
    });

    root.unmount();
  });

  it("no session at all: confirmCode calls verifyOtp with type 'email' (returning-visitor sign-in)", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { container, root } = await renderHarness({ skipToCode: true });

    setValue(container, "code", "111111");
    await act(async () => {
      clickButtonWithText(container, "Confirm code");
      await flushMicrotasks();
    });

    expect(verifyOtpMock).toHaveBeenCalledWith({
      email: "target@example.com",
      token: "111111",
      type: "email",
    });

    root.unmount();
  });
});
