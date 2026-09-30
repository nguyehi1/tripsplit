"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type TripTab = "expenses" | "details" | "list";

/**
 * Lifts `TripTabs`'s active-tab state out to a shared context (shopping-list, design.md section
 * 1: "the BottomBar capsule becomes tab-aware") so `page.tsx`'s `BottomBar` — a sibling of
 * `TripTabs` in the tree, not a descendant — can render "Add an expense" vs. "Add an item"
 * without either component needing to be restructured into the other. Same context-for-shared-
 * client-state shape as `TripVerificationProvider` (`verify-inline.tsx`).
 */
type TripTabContextValue = {
  tab: TripTab;
  setTab: (tab: TripTab) => void;
};

const TripTabContext = createContext<TripTabContextValue | null>(null);

export function TripTabProvider({ initialTab, children }: { initialTab: TripTab; children: ReactNode }) {
  const [tab, setTab] = useState<TripTab>(initialTab);
  return <TripTabContext.Provider value={{ tab, setTab }}>{children}</TripTabContext.Provider>;
}

export function useTripTab(): TripTabContextValue {
  const ctx = useContext(TripTabContext);
  if (!ctx) {
    throw new Error("useTripTab must be used within a TripTabProvider");
  }
  return ctx;
}
