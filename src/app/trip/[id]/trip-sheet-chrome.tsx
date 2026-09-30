"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

// Matches .../expense/<any-id>/edit — the edit-expense sheet's URL shape (a dynamic expenseId
// segment between two fixed ones), unlike add-expense/add-item's fixed final segment.
const EDIT_EXPENSE_PATH = /\/expense\/[^/]+\/edit$/;

function isAddExpensePath(pathname: string): boolean {
  // Widened for shopping-list's "Add an item" sheet (architecture.md section 4), then again for
  // "Edit expense" becoming a sheet (UX consistency follow-up) — the same dim/blur/scale
  // receding-behind-the-sheet effect must trigger for each, reusing the exact ADR 0008 scaffold.
  return pathname.endsWith("/add-expense") || pathname.endsWith("/add-item") || EDIT_EXPENSE_PATH.test(pathname);
}

/**
 * Drives the trip view's dim/blur/scale "receding behind the sheet" effect (design.md sections
 * 5.1-5.3, ADR 0008 point 6) off the real, observable pathname — true whether `/add-expense` was
 * reached by client-side interception or a hard navigation, since only the rendered tree differs
 * between those two, not the URL. `dimmed` is initialized synchronously from the first render's
 * pathname (so a cold load on `/trip/[id]/add-expense` paints already-dimmed, no transition to
 * play) and only updated afterwards, in a `useEffect` keyed on `pathname` (so a genuine in-app
 * open/close *does* transition). This is the "no entrance-animation replay on cold load" half of
 * §5.3's resolution for the background — the sheet panel's own entrance is handled separately by
 * `SheetShell`'s `animateEntrance` prop, since its component instance can't rely on this same
 * before/after comparison (see ADR 0008 point 6).
 */
export function TripSheetChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [dimmed, setDimmed] = useState(() => isAddExpensePath(pathname));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDimmed(isAddExpensePath(pathname));
  }, [pathname]);

  return (
    <div
      className="relative min-h-screen"
      style={{
        filter: dimmed ? "blur(3px) brightness(0.94)" : "none",
        transform: dimmed ? "scale(0.965)" : "scale(1)",
        transformOrigin: "top center",
        transition: `filter var(--duration-sheet) var(--ease-spring), transform var(--duration-sheet) var(--ease-spring)`,
      }}
    >
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-40"
        style={{
          background: "var(--color-scrim)",
          opacity: dimmed ? 1 : 0,
          transition: "opacity var(--duration-sheet) var(--ease-spring)",
        }}
      />
    </div>
  );
}
