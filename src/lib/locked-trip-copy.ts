/**
 * Single source of truth for "this trip is locked" copy (UX consistency review 2026-09-30,
 * finding #1) — previously hand-written separately in up to four places per fact. Keyed by what's
 * blocked. `long` is the full-sentence form used by `LockedNotice`/`LockedNoticeInline`; `short`
 * is the button-label form used where a full sentence won't fit (only defined where a button
 * needs it).
 */
export const LOCKED_TRIP_COPY = {
  expenses: {
    long: "This trip is locked — the organizer already settled it up, so no more expenses can be added.",
    short: "Trip is locked — no more expenses",
  },
  editing: {
    long: "This trip is locked — the organizer already settled it up, so expenses can no longer be edited.",
  },
  items: {
    long: "This trip is locked — the organizer already settled it up, so the list can't be changed anymore.",
    short: "Trip is locked — the list is read-only",
  },
  roster: {
    long: "This trip is locked — the organizer already settled it up, so the roster can't be changed.",
  },
} as const;

export type LockedTripScope = keyof typeof LOCKED_TRIP_COPY;
