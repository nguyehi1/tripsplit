// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/** Wiring smoke test for the "What kind of trip?" group on New trip. */

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock, back: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }),
}));
const createTripMock = vi.fn();
vi.mock("@/lib/data/trips", () => ({ createTrip: (...a: unknown[]) => createTripMock(...a) }));
vi.mock("@/lib/tracking", () => ({ trackEvent: vi.fn() }));

import { trackEvent } from "@/lib/tracking";
import { createDom } from "@/test/dom";
import { NewTripForm } from "./new-trip-form";

const dom = createDom();
const { flush } = dom;
const mount = (initialType?: "camping" | "airbnb" | "international") => dom.mount(<NewTripForm initialType={initialType} />);
function checkbox(label: string) {
  return Array.from(dom.container.querySelectorAll("label"))
    .find((l) => l.textContent === label)!
    .querySelector("input")!;
}
async function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function create(name = "Tahoe") {
  await type(dom.container.querySelector<HTMLInputElement>("input[placeholder='Tahoe Ski Trip']")!, name);
  const btn = Array.from(dom.container.querySelectorAll("button")).find((b) => b.textContent?.includes("Create trip"))!;
  await act(async () => btn.click());
  await flush();
}

beforeEach(() => {
  createTripMock.mockResolvedValue({ tripId: "t1", inviteCode: "c", typesStored: true });
});
afterEach(() => {
  dom.teardown();
  vi.clearAllMocks();
});

describe("New trip: What kind of trip?", () => {
  it("shows four checkboxes in a labelled group and an adaptive sentence", async () => {
    await mount();
    expect(dom.container.querySelectorAll("[role='group'] input[type='checkbox']")).toHaveLength(4);
    expect(dom.container.textContent).toContain("Your list will start empty.");
    await act(async () => checkbox("Airbnb stay").click());
    await act(async () => checkbox("International").click());
    expect(dom.container.textContent).toContain(
      "Your list will open with suggestions for an Airbnb stay and international travel, combined with no repeats.",
    );
  });

  it("creates with no type exactly as before and stays on the default tab", async () => {
    await mount();
    await create();
    expect(createTripMock.mock.calls[0][1]).toMatchObject({ types: [], otherType: undefined });
    expect(pushMock).toHaveBeenCalledWith("/trip/t1");
    expect(vi.mocked(trackEvent).mock.calls.map((c) => c[0])).toEqual(["trip_create_start", "trip_create_complete"]);
  });

  it("stores pick order, fires name-only events, and lands on the List tab", async () => {
    await mount();
    await act(async () => checkbox("International").click());
    await act(async () => checkbox("Camping").click());
    await act(async () => checkbox("Other").click());
    await type(dom.container.querySelector<HTMLInputElement>("#trip-other-type")!, "Ski weekend");
    await create();
    expect(createTripMock.mock.calls[0][1]).toMatchObject({ types: ["international", "camping"], otherType: "Ski weekend" });
    expect(pushMock).toHaveBeenCalledWith("/trip/t1?tab=list");
    const calls = vi.mocked(trackEvent).mock.calls;
    expect(calls.map((c) => c[0])).toEqual([
      "trip_create_start",
      "trip_create_complete",
      "trip_type_selected_international",
      "trip_type_selected_camping",
      "trip_type_selected_other",
    ]);
    for (const c of calls) expect(c).toHaveLength(1);
    expect(JSON.stringify(calls)).not.toContain("Ski weekend");
  });

  it("blocks submit with an inline error when Other is ticked but empty, and unticking discards the text", async () => {
    await mount();
    await act(async () => checkbox("Other").click());
    await create();
    expect(createTripMock).not.toHaveBeenCalled();
    expect(dom.container.querySelector("#trip-other-error")?.textContent).toBe("Type a trip type, or untick Other.");
    expect(dom.container.querySelector("#trip-other-type")?.getAttribute("autocomplete")).toBe("off");
    await act(async () => checkbox("Other").click());
    expect(dom.container.querySelector("#trip-other-type")).toBeNull();
    expect(dom.container.querySelector("#trip-other-error")).toBeNull();
  });

  it("shows only fixed copy when creation fails with a CHECK-style error", async () => {
    createTripMock.mockRejectedValue({ code: "23514", message: "violates trips_other_type_check", details: "Ski weekend" });
    await mount();
    await act(async () => checkbox("Other").click());
    await type(dom.container.querySelector<HTMLInputElement>("#trip-other-type")!, "Ski weekend");
    await create();
    expect(dom.container.textContent).toContain("Couldn't create the trip — try again.");
    expect(dom.container.textContent).not.toMatch(/violates|constraint|trips_other_type_check/);
    expect(pushMock).not.toHaveBeenCalled();
    expect(vi.mocked(trackEvent).mock.calls.map((c) => c[0])).toEqual(["trip_create_start"]);
  });
});

describe("New trip form: initialType pre-check", () => {
  it("renders the pre-checked tile and the one-type sentence on the very first render", async () => {
    const html = renderToStaticMarkup(<NewTripForm initialType="camping" />);
    expect(html).toContain("checked");
    expect(html).toContain("Your list will open with suggestions for camping.");
    expect(renderToStaticMarkup(<NewTripForm />)).not.toContain("checked");
  });

  it("ignores a prop that is not a catalog code", async () => {
    const html = renderToStaticMarkup(<NewTripForm initialType={"other" as never} />);
    expect(html).not.toContain("checked");
  });

  it("creates nothing on render and fires only trip_create_start", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const replaceState = vi.spyOn(window.history, "replaceState");
    await mount("camping");
    expect(createTripMock).not.toHaveBeenCalled();
    expect(vi.mocked(trackEvent).mock.calls.map((c) => c[0])).toEqual(["trip_create_start"]);
    expect(setItem).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(document.cookie).toBe("");
  });

  it("keeps pick order: the pre-checked type first, later ticks after", async () => {
    await mount("international");
    await act(async () => checkbox("Camping").click());
    await create();
    expect(createTripMock.mock.calls[0][1]).toMatchObject({ types: ["international", "camping"] });
  });

  it("unticking the pre-check sends no type", async () => {
    await mount("airbnb");
    expect(checkbox("Airbnb stay").checked).toBe(true);
    await act(async () => checkbox("Airbnb stay").click());
    await create();
    expect(createTripMock.mock.calls[0][1]).toMatchObject({ types: [] });
    expect(pushMock).toHaveBeenCalledWith("/trip/t1");
  });

  it("creating with the pre-check lands on the List tab and never puts the code in a URL", async () => {
    await mount("camping");
    await create();
    expect(createTripMock.mock.calls[0][1]).toMatchObject({ types: ["camping"] });
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/trip/t1?tab=list");
  });

  it("uses the fidelity classes: 12px padding, 1.5px border in both states, 22px spacer", async () => {
    await mount("camping");
    const labels = Array.from(dom.container.querySelectorAll("label")).filter((l) => l.querySelector("input[type=checkbox]"));
    expect(labels.length).toBe(4);
    for (const l of labels) {
      expect(l.className).toContain("p-3 ");
      expect(l.className).toContain("border-[1.5px]");
    }
    expect(dom.container.innerHTML).toContain("h-[22px]");
  });

  it("orders the form: Trip name, then the picker, then Location, then Dates, then the planner note, with 22px gaps (criterion 129)", async () => {
    await mount();
    const html = dom.container.innerHTML;
    const at = (needle: string) => html.indexOf(needle);
    expect(at("Trip name")).toBeLessThan(at("What kind of trip?"));
    expect(at("What kind of trip?")).toBeLessThan(at("Location"));
    expect(at("Location")).toBeLessThan(at("Dates"));
    expect(at("Dates")).toBeLessThan(at("You&#x27;ll be the trip") === -1 ? at("planner") : at("You&#x27;ll be the trip"));
    expect(html.match(/h-\[22px\]/g)).toHaveLength(2);
  });
});

