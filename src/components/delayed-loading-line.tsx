"use client";

import { useEffect, useState } from "react";

/**
 * The delayed "still loading" reassurance line (docs/features/performance-scaling/design.md
 * section (a)): a second, visually quieter line shown beneath a blocking loading state's primary
 * text, only after `delayMs` has elapsed — never on first paint. No spinner, no percentage, no
 * countdown — same calm plain-text convention every other loading state in this app already uses.
 *
 * Used by the four existing blocking-loading states (`/trips`, `/trip/[id]`, `/join/[code]`,
 * edit-expense). `delayMs` defaults to design.md's provisional 4s threshold — flagged there as
 * something to revisit per-surface once Phase 1's real p50/p95 baseline exists, rather than
 * shipping 4s everywhere indefinitely.
 */
export function DelayedLoadingLine({ delayMs = 4000, className = "" }: { delayMs?: number; className?: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  if (!visible) return null;
  return <p className={`mt-1.5 text-[12.5px] text-ink/50 ${className}`}>Taking a little longer than usual…</p>;
}
