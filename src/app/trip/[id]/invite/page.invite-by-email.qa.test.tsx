// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * "Invite by email" on the roster: an email field and an Invite button. Tapping it opens the
 * organizer's own mail app via mailto: immediately. Splitiful sends nothing, stores nothing and
 * makes no server call; there is no name field and no placeholder is added.
 */

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "trip-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1", is_anonymous: false } } }) } }),
}));

const addPlaceholderMemberMock = vi.fn();
const setMyDisplayNameMock = vi.fn();
let view: unknown;
const getTripViewMock = vi.fn(() => Promise.resolve(view));
vi.mock("@/lib/data/trips", () => ({
  getTripView: () => getTripViewMock(),
  addPlaceholderMember: (...a: unknown[]) => addPlaceholderMemberMock(...a),
  setMyDisplayName: (...a: unknown[]) => setMyDisplayNameMock(...a),
  leaveTrip: vi.fn(),
  removePlaceholderMember: vi.fn(),
  removeTripMember: vi.fn(),
  renamePlaceholderMember: vi.fn(),
}));

function member(over: Record<string, unknown> = {}) {
  return {
    id: "m1", displayName: "Olivia", joinedAt: "2026-01-01", isOrganizer: true, isPlaceholder: false,
    initials: "O", avatar: { bg: "#fff", fg: "#000" }, ...over,
  };
}
function makeView(over: { you?: Record<string, unknown>; completed?: boolean } = {}) {
  const you = member(over.you);
  return {
    trip: { id: "trip-1", name: "Lake Tahoe", location: null, startsOn: null, endsOn: null, inviteCode: "ab12cd34", isCompleted: over.completed ?? false },
    members: [you], expenses: [], settlements: [], totalCents: 0, avgPerPersonCents: 0, you,
  };
}

const hrefSet = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  view = makeView();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { origin: "https://splitiful.app", set href(v: string) { hrefSet(v); } },
  });
});
afterEach(() => {
  document.body.innerHTML = "";
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

async function render() {
  const { default: Page } = await import("./page");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<Page />);
    await flush();
    await flush();
  });
  return { container, root };
}
function setValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
const emailInput = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[aria-label="Their email"]')!;
const inviteButton = (c: HTMLElement) => [...c.querySelectorAll("button")].find((b) => b.textContent === "Invite")!;
/** A synchronous tap: nothing is awaited between the click and the assertion. */
function tapInviteSync(c: HTMLElement) {
  act(() => {
    inviteButton(c).click();
  });
}

describe("Invite by email card", () => {
  it("shows an email-only field (16px) and an Invite button, with no name field or notes", async () => {
    const { container, root } = await render();
    expect(container.textContent).toContain("Invite by email");
    expect(emailInput(container).className).toContain("text-[16px]");
    expect(container.querySelector('input[aria-label="Their name (optional)"]')).toBeNull();
    expect(container.textContent).not.toContain("Name (optional)");
    expect(container.textContent).not.toContain("Splitiful doesn't send anything");
    expect(container.textContent).not.toContain("Only invite people who know you");
    root.unmount();
  });

  it("is hidden from non-organizers and on a completed trip", async () => {
    view = makeView({ you: { isOrganizer: false } });
    let r = await render();
    expect(r.container.textContent).not.toContain("Invite by email");
    r.root.unmount();
    document.body.innerHTML = "";
    view = makeView({ completed: true });
    r = await render();
    expect(r.container.textContent).not.toContain("Invite by email");
    r.root.unmount();
  });

  it("asks for a real name first while the organizer is still the 'Organizer' stand-in", async () => {
    view = makeView({ you: { displayName: "Organizer" } });
    const { container, root } = await render();
    expect(container.textContent).toContain("What should everyone call you?");
    expect(emailInput(container)).toBeNull();
    root.unmount();
  });

  it("Invite stays disabled until an email is typed", async () => {
    const { container, root } = await render();
    expect(inviteButton(container).disabled).toBe(true);
    await act(async () => setValue(emailInput(container), "dad@gmail.com"));
    expect(inviteButton(container).disabled).toBe(false);
    root.unmount();
  });

  it("opens the exact mailto: synchronously on tap, greeting 'Hi there,' with the shared join link", async () => {
    const { container, root } = await render();
    await act(async () => setValue(emailInput(container), "dad@gmail.com"));
    tapInviteSync(container);
    expect(hrefSet).toHaveBeenCalledTimes(1);
    const url = hrefSet.mock.calls[0][0] as string;
    expect(url.startsWith("mailto:dad@gmail.com?subject=")).toBe(true);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("subject")).toBe("Olivia invited you to Lake Tahoe on Splitiful");
    expect(params.get("body")).toBe(
      "Hi there,\r\n\r\nI'm using Splitiful to split costs for Lake Tahoe. Join here:\r\nhttps://splitiful.app/join/ab12cd34\r\n\r\nOlivia",
    );
    root.unmount();
  });

  it("opens on Enter in the email field too, and clears the field", async () => {
    const { container, root } = await render();
    await act(async () => setValue(emailInput(container), "dad@gmail.com"));
    act(() => {
      emailInput(container).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(hrefSet).toHaveBeenCalledTimes(1);
    expect(emailInput(container).value).toBe("");
    root.unmount();
  });

  it("makes no server call at all: no fetch, no placeholder, no extra trip reload", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container, root } = await render();
    const loadsBefore = getTripViewMock.mock.calls.length;
    await act(async () => setValue(emailInput(container), "dad@gmail.com"));
    tapInviteSync(container);
    await act(async () => {
      await flush();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(addPlaceholderMemberMock).not.toHaveBeenCalled();
    expect(getTripViewMock.mock.calls.length).toBe(loadsBefore);
    vi.unstubAllGlobals();
    root.unmount();
  });

  it("rejects an invalid address inline and opens nothing", async () => {
    const { container, root } = await render();
    for (const bad of ["not-an-email", "x<victim@gmail.com>", "a@b.com,c@d.com"]) {
      await act(async () => setValue(emailInput(container), bad));
      tapInviteSync(container);
      expect(container.textContent).toContain("That doesn't look like an email address.");
    }
    expect(hrefSet).not.toHaveBeenCalled();
    expect(addPlaceholderMemberMock).not.toHaveBeenCalled();
    root.unmount();
  });

  it("clears the error as soon as the email is edited", async () => {
    const { container, root } = await render();
    await act(async () => setValue(emailInput(container), "nope"));
    tapInviteSync(container);
    expect(container.textContent).toContain("That doesn't look like an email address.");
    await act(async () => setValue(emailInput(container), "nope2"));
    expect(container.textContent).not.toContain("That doesn't look like an email address.");
    root.unmount();
  });
});
