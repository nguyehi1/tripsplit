// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

const trackEventMock = vi.fn();
vi.mock("@/lib/tracking", () => ({ trackEvent: (...a: unknown[]) => trackEventMock(...a) }));
const createClientMock = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createClient: (...a: unknown[]) => createClientMock(...a) }));

import { STARTER_TYPES } from "@/lib/starter-catalog";
import { createDom } from "@/test/dom";
import { TemplateShelf } from "./template-shelf";

const dom = createDom();
const mount = () => dom.mount(<TemplateShelf />);

function click(el: Element) {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  act(() => {
    el.dispatchEvent(event);
  });
  return event;
}

afterEach(() => {
  dom.teardown();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("template tiles: analytics on tap only", () => {
  it("fires nothing on render and touches no network, Supabase, storage or cookie", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await mount();
    expect(trackEventMock).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(createClientMock).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("a tile tap fires exactly one name-only event from its own catalog code, without preventing default", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await mount();
    for (const type of STARTER_TYPES) {
      trackEventMock.mockClear();
      const link = dom.container.querySelector(`a[href="/trip/new?type=${type.code}"]`)!;
      const event = click(link);
      expect(trackEventMock).toHaveBeenCalledTimes(1);
      expect(trackEventMock.mock.calls[0]).toEqual([`home_template_tapped_${type.code}`]);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(createClientMock).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("the event name does not depend on the page URL", async () => {
    window.history.replaceState(null, "", "/?type=international&utm_source=x");
    await mount();
    click(dom.container.querySelector('a[href="/trip/new?type=camping"]')!);
    expect(trackEventMock.mock.calls[0]).toEqual(["home_template_tapped_camping"]);
    window.history.replaceState(null, "", "/");
  });

  it("'Blank trip' fires home_blank_trip_tapped once with no other argument", async () => {
    await mount();
    // BlankTripTile is now a wide row with a subtitle ("Start with an empty list"), not a bare
    // "Blank trip" text node — match on href instead of exact textContent (design-audit follow-up,
    // 2026-10-16: catalog tiles in one row, "Blank trip" as its own dashed row below).
    const blank = dom.container.querySelector('a[href="/trip/new"]')!;
    expect(blank.textContent).toContain("Blank trip");
    expect(blank.getAttribute("href")).toBe("/trip/new");
    const event = click(blank);
    expect(trackEventMock.mock.calls).toEqual([["home_blank_trip_tapped"]]);
    expect(event.defaultPrevented).toBe(false);
  });

  it("a throwing trackEvent does not stop the click", async () => {
    trackEventMock.mockImplementation(() => {
      throw new Error("analytics down");
    });
    await mount();
    const link = dom.container.querySelector('a[href="/trip/new?type=airbnb"]')!;
    const outer = vi.fn();
    dom.container.addEventListener("click", outer);
    const event = click(link);
    expect(outer).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
