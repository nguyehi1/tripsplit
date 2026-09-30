"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The add-expense sheet's chrome (scrim + spring-up panel) — ADR 0008 points 3 and 6. Used
 * identically by the intercepted route (`@sheet/(.)add-expense/page.tsx`, `animateEntrance`)
 * and the hard-nav fallback (`add-expense/page.tsx`, not animated). No drag-to-dismiss physics
 * (design.md sections 5.2/6.2, resolved) — the handle is a static visual affordance only;
 * dismissal is tap-scrim, the close (X) inside `children`, or the browser back button (free,
 * AC9, once the route is actually intercepted).
 *
 * Portals to `document.body` (engineering addition, not called out in ADR 0008's text): the
 * hard-nav fallback (`add-expense/page.tsx`) necessarily renders this component *inside* the
 * same `children` subtree that `trip-sheet-chrome.tsx` dims via CSS `transform`/`filter` (there's
 * no separate parallel slot available on a hard navigation — see that file's module comment).
 * Both `transform` and `filter` on an ancestor make it the containing block for `position: fixed`
 * descendants and paint the filter across the whole subtree, which would visibly blur/scale this
 * sheet along with the backdrop it's supposed to sit crisply on top of. Portaling out of that
 * subtree keeps the sheet unaffected in both the hard-nav and intercepted cases, without
 * duplicating the dim logic.
 */
export function SheetShell({
  tripId,
  animateEntrance,
  children,
}: {
  tripId: string;
  /** `true` only at the intercepted route's call site — see ADR 0008 point 6 for why this can't
   *  be inferred from a mount-lifecycle effect alone (a cold load would replay it identically). */
  animateEntrance: boolean;
  children: ReactNode;
}) {
  const [atRest, setAtRest] = useState(!animateEntrance);
  const [mounted, setMounted] = useState(false);

  // Runs before the browser paints the hydrated result, so there's no visible flash of a
  // missing sheet on a hard-nav'd cold load — see the module comment above.
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!animateEntrance) return;
    const raf = requestAnimationFrame(() => setAtRest(true));
    return () => cancelAnimationFrame(raf);
  }, [animateEntrance]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <Link
        href={`/trip/${tripId}`}
        aria-label="Close"
        className="absolute inset-0"
        style={{
          background: "var(--color-scrim)",
          opacity: atRest ? 1 : 0,
          transition: "opacity var(--duration-sheet) var(--ease-spring)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-t-[28px] text-ink"
        style={{
          maxHeight: "calc(100dvh - 48px)",
          background: "var(--surface-sheet)",
          backdropFilter: "blur(34px) saturate(1.5)",
          WebkitBackdropFilter: "blur(34px) saturate(1.5)",
          boxShadow: "var(--shadow-capsule)",
          transform: atRest ? "translateY(0)" : "translateY(100%)",
          transition: "transform var(--duration-sheet) var(--ease-spring)",
        }}
      >
        <div aria-hidden className="mx-auto mt-2.5 h-1 w-9 flex-none rounded-full bg-ink/15" />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
