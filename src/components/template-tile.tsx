"use client";

import Link from "next/link";
import { createElement } from "react";
import { PlusIcon } from "@/components/icons";
import { iconForTripType } from "@/components/trip-type-icons";
import { HOME_BLANK_TRIP_EVENT, homeTemplateTappedEvent } from "@/lib/starter-suggestions";
import type { TripType } from "@/lib/starter-catalog";
import { trackEvent } from "@/lib/tracking";

/**
 * The only client leaves of the home template shelf, and they exist only for the `onClick`
 * analytics call. Both are real anchors: the handler is synchronous, never `preventDefault`s and
 * never navigates itself, so modified clicks, middle clicks and open-in-new-tab behave normally
 * and a failure here can never block navigation. The event name comes from the tile's own catalog
 * `code` prop, never from the URL or the DOM, and `trackEvent` gets exactly one argument.
 */

/** Fires one name-only event; analytics must never block navigation, so errors are swallowed. */
function track(name: string | undefined) {
  try {
    if (name) trackEvent(name);
  } catch {
    // Ignored on purpose.
  }
}

/** "1 item" / "18 items" (0 does not crash). */
export function formatItemCount(n: number): string {
  return n === 1 ? "1 item" : `${n} items`;
}

export function TemplateTile({ code, label, itemCount }: { code: TripType; label: string; itemCount: number }) {
  return (
    <Link
      href={`/trip/new?type=${code}`}
      // Explicit name: Chromium puts a space around any block or absolutely positioned child, so
      // a visually hidden ", " span read as "Camping , 18 items".
      aria-label={`${label}, ${formatItemCount(itemCount)}`}
      onClick={() => track(homeTemplateTappedEvent(code))}
      className="flex h-[104px] min-w-0 cursor-pointer flex-col justify-between rounded-[20px] border border-transparent bg-white p-[14px_12px_12px] shadow-card"
    >
      <span aria-hidden="true" style={{ color: "var(--color-accent)" }}>
        {createElement(iconForTripType(code), { size: 22, strokeWidth: 2 })}
      </span>
      <span className="block min-w-0">
        <span className="block min-w-0 text-[14px] font-semibold leading-[18px] [overflow-wrap:anywhere] [hyphens:auto]">
          {label}
        </span>
        <span className="block text-[11.5px] leading-[normal] text-ink/[0.68]">{formatItemCount(itemCount)}</span>
      </span>
    </Link>
  );
}

/** The dashed "Blank trip" row below the template grid (user feedback, 2026-10-16: the three
 *  catalog tiles read as one row per board A, with "Blank trip" as its own full-width row below
 *  them, not a fourth grid tile). Same card language as `TemplateTile` but laid out as a wide row
 *  with a leading "+" icon and a subtitle instead of a square tile. Border is `border-2` at a
 *  stronger tone than the hairline token (user feedback, 2026-10-16: "make the border line a bit
 *  more obvious" — a 1px hairline-strong dash read as too faint for a tappable empty-state card). */
export function BlankTripTile() {
  return (
    <Link
      href="/trip/new"
      onClick={() => track(HOME_BLANK_TRIP_EVENT)}
      className="flex min-w-0 cursor-pointer items-center gap-3 rounded-[20px] border-2 border-dashed px-[14px] py-3 text-left"
      style={{ borderColor: "rgba(35, 28, 18, 0.28)" }}
    >
      <span
        aria-hidden="true"
        className="flex size-9 flex-none items-center justify-center rounded-full"
        style={{ background: "var(--color-accent-soft)", color: "var(--color-accent-ink)" }}
      >
        <PlusIcon size={18} strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold leading-[18px]" style={{ color: "var(--color-accent-ink)" }}>
          Blank trip
        </span>
        <span className="block text-[11.5px] leading-[normal] text-faint">Start with an empty list</span>
      </span>
    </Link>
  );
}
