// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * QA coverage for AC17 (docs/features/ux-revamp/requirements.md — "Scope addition (2026-09-18,
 * post-Checkpoint 3, user request)"): the `/join` manual invite-code entry screen that replaces
 * Welcome's native `window.prompt()`. Covers the three behaviors specified: empty-input
 * validation, bare-code input, and full-link input (which must extract the same code a full
 * `/join/xxx` link would).
 */

const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn(), replace: replaceMock }),
}));

async function renderJoinPage() {
  const { default: JoinPage } = await import("./page");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<JoinPage />);
  });
  return { container, root };
}

function setValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function getInput(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>('input[placeholder="splitiful.app/join/abc123 or abc123"]')!;
}

function clickButtonWithText(container: HTMLElement, text: string) {
  const buttons = Array.from(container.querySelectorAll("button"));
  const button = buttons.find((b) => b.textContent?.includes(text));
  if (!button) throw new Error(`No button found with text "${text}" — found: ${buttons.map((b) => b.textContent).join(" | ")}`);
  button.click();
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("/join — manual invite-code entry screen (AC17)", () => {
  it("shows an inline validation error and does not navigate when the field is left empty", async () => {
    const { container, root } = await renderJoinPage();

    await act(async () => {
      clickButtonWithText(container, "Continue");
    });

    expect(container.textContent).toContain("Paste your invite link or code first.");
    expect(pushMock).not.toHaveBeenCalled();

    root.unmount();
  });

  it("navigates to /join/<code> for a bare code", async () => {
    const { container, root } = await renderJoinPage();

    setValue(getInput(container), "abc123");
    await act(async () => {
      clickButtonWithText(container, "Continue");
    });

    expect(pushMock).toHaveBeenCalledWith("/join/abc123");

    root.unmount();
  });

  it("extracts the code from a full invite link before navigating", async () => {
    const { container, root } = await renderJoinPage();

    setValue(getInput(container), "https://splitiful.app/join/xyz789?ref=email");
    await act(async () => {
      clickButtonWithText(container, "Continue");
    });

    expect(pushMock).toHaveBeenCalledWith("/join/xyz789");

    root.unmount();
  });

  it("trims whitespace around a bare code before navigating", async () => {
    const { container, root } = await renderJoinPage();

    setValue(getInput(container), "  abc123  ");
    await act(async () => {
      clickButtonWithText(container, "Continue");
    });

    expect(pushMock).toHaveBeenCalledWith("/join/abc123");

    root.unmount();
  });

  it("clears a previously-shown validation error once valid input is entered", async () => {
    const { container, root } = await renderJoinPage();

    await act(async () => {
      clickButtonWithText(container, "Continue");
    });
    expect(container.textContent).toContain("Paste your invite link or code first.");

    setValue(getInput(container), "abc123");
    await act(async () => {
      clickButtonWithText(container, "Continue");
    });

    expect(container.textContent).not.toContain("Paste your invite link or code first.");
    expect(pushMock).toHaveBeenCalledWith("/join/abc123");

    root.unmount();
  });

  it("closing via the X uses router.replace, not push, so it doesn't leave a /join entry in history", async () => {
    const { container, root } = await renderJoinPage();

    const closeButton = container.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!;
    expect(closeButton).not.toBeNull();
    await act(async () => {
      closeButton.click();
    });

    expect(replaceMock).toHaveBeenCalledWith("/");
    expect(pushMock).not.toHaveBeenCalled();

    root.unmount();
  });
});
