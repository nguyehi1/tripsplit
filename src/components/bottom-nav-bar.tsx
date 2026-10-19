"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  DollarSignIcon,
  InfoIcon,
  ListIcon,
  MapPinIcon,
  PlusIcon,
  UserIcon,
} from "@/components/icons";
import { useTripTab, type TripTab } from "@/app/trip/[id]/trip-tab-context";

type IconComponent = (props: { size?: number; strokeWidth?: number; className?: string }) => ReactNode;

export type NavTab = {
  key: string;
  href: string;
  label: string;
  icon: IconComponent;
  isActive: boolean;
  /** When set, tapping this tab calls this instead of navigating (the in-trip sub-tabs, which
   *  select local state rather than changing route — see `TripNavBar` below). */
  onClick?: () => void;
};

/**
 * The unified bottom bar (requirements.md item 2; design.md §5) — a new shared component, not a
 * restyle of `FabBar`/`TabSwitch`/`BottomBar` (all three predate it and had no tab-strip
 * behavior). Takes a closed-set `tabs` config so the active-line/icon-weight/label-weight
 * treatment is one implementation, not re-derived per screen. `NavBarShell` below reuses the same
 * visual shell with no tab set at all, for Settle up/Trip complete/Invite (design.md §4.5).
 */
export function BottomNavBar({ tabs }: { tabs: readonly NavTab[] }) {
  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-10 flex border-t border-hairline px-5 pt-2 pb-[max(20px,env(safe-area-inset-bottom))] backdrop-blur-[16px]"
      style={{ background: "var(--color-nav-bar)" }}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const inner = (
          <>
            {tab.isActive ? (
              // 56×3px, 9px above the bar's top edge, rounded at its bottom (bar-facing)
              // corners — design.md §5's one admittedly-ambiguous-from-prose geometry call.
              <span
                aria-hidden
                className="absolute -top-[9px] left-1/2 h-[3px] w-14 -translate-x-1/2 rounded-b-[2px]"
                style={{ background: "var(--color-accent)" }}
              />
            ) : null}
            <Icon
              size={24}
              strokeWidth={tab.isActive ? 2.5 : 2}
              className={tab.isActive ? "text-accent-text" : "text-muted"}
            />
            <span
              className={`text-[11px] leading-none ${
                tab.isActive ? "font-bold text-accent-text" : "font-normal text-muted"
              }`}
            >
              {tab.label}
            </span>
          </>
        );
        const className = "relative flex h-[52px] flex-1 flex-col items-center justify-center gap-1";
        return tab.onClick ? (
          <button key={tab.key} type="button" onClick={tab.onClick} className={`cursor-pointer ${className}`}>
            {inner}
          </button>
        ) : (
          <Link key={tab.key} href={tab.href} className={className}>
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Home/You tab set — Trips, New trip, You (design.md §5 variant 1). Mounted on `/trips`,
 * `/trip/new`, and `/you`; replaces `FabBar` outright on `/trips` (same destination, reached via
 * a tab instead of a floating pill — architecture.md §2.1/§3.1).
 */
export function HomeNavBar() {
  const pathname = usePathname();
  const active: "trips" | "new-trip" | "you" = pathname.startsWith("/trip/new")
    ? "new-trip"
    : pathname.startsWith("/you")
      ? "you"
      : "trips";
  const tabs: NavTab[] = [
    { key: "trips", href: "/trips", label: "Trips", icon: MapPinIcon, isActive: active === "trips" },
    { key: "new-trip", href: "/trip/new", label: "New trip", icon: PlusIcon, isActive: active === "new-trip" },
    { key: "you", href: "/you", label: "You", icon: UserIcon, isActive: active === "you" },
  ];
  return <BottomNavBar tabs={tabs} />;
}

const IN_TRIP_TAB_ICON: Record<TripTab, IconComponent> = {
  expenses: DollarSignIcon,
  details: InfoIcon,
  list: ListIcon,
};

/**
 * In-trip tab set — Trips, Expenses, Details, List (design.md §5 variant 2). "Trips" navigates
 * back to `/trips` (never active here); Expenses/Details/List read and drive the same
 * `TripTabProvider` state `TabSwitch` used to — this bar **replaces** that segmented control as
 * the selection mechanism (design.md §4.4), it isn't a second, parallel selector.
 */
export function TripNavBar({ tripId }: { tripId: string }) {
  const { tab, setTab } = useTripTab();
  const subTabs: TripTab[] = ["expenses", "details", "list"];
  const labels: Record<TripTab, string> = { expenses: "Expenses", details: "Details", list: "List" };
  const tabs: NavTab[] = [
    { key: "trips", href: "/trips", label: "Trips", icon: MapPinIcon, isActive: false },
    ...subTabs.map((t) => ({
      key: t,
      href: `/trip/${tripId}?tab=${t}`,
      label: labels[t],
      icon: IN_TRIP_TAB_ICON[t],
      isActive: tab === t,
      onClick: () => setTab(t),
    })),
  ];
  return <BottomNavBar tabs={tabs} />;
}

/**
 * Same Trips/Expenses/Details/List tab set as `TripNavBar`, for screens that are their own route
 * rather than a tab inside the trip dashboard's already-mounted `TripTabProvider` — Settle up,
 * Trip complete, Invite (user feedback, 2026-10-16: these get the real tab strip, not just the
 * bar's shell). Every tab is a plain link back into the trip (no `onClick`/context dependency,
 * since there's no live tab state here to drive), and none renders as active — none of the four
 * tabs corresponds to the screen the visitor is actually on.
 */
export function TripNavBarStatic({ tripId }: { tripId: string }) {
  const subTabs: TripTab[] = ["expenses", "details", "list"];
  const labels: Record<TripTab, string> = { expenses: "Expenses", details: "Details", list: "List" };
  const tabs: NavTab[] = [
    { key: "trips", href: "/trips", label: "Trips", icon: MapPinIcon, isActive: false },
    ...subTabs.map((t) => ({
      key: t,
      href: `/trip/${tripId}?tab=${t}`,
      label: labels[t],
      icon: IN_TRIP_TAB_ICON[t],
      isActive: false,
    })),
  ];
  return <BottomNavBar tabs={tabs} />;
}

/**
 * Visual shell only, no tab set — Settle up, Trip complete, Invite (design.md §4.5, §5 variant
 * 3). Same fill/blur/hairline/height/padding as the tab-bearing bar above, wrapping each screen's
 * existing single contextual action/caption; content/layout on those three screens is otherwise
 * untouched by this feature. (design.md is explicit and "Resolved" that these three do not gain a
 * tab set at all — not even one with no tab marked active — so this intentionally has no `tabs`
 * prop, unlike `TripNavBar`.)
 */
export function NavBarShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky bottom-0 z-10 border-t border-hairline px-5 pt-2 pb-[max(20px,env(safe-area-inset-bottom))] backdrop-blur-[16px]"
      style={{ background: "var(--color-nav-bar)" }}
    >
      {children}
    </div>
  );
}
