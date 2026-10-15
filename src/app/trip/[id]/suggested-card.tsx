"use client";

import { useState } from "react";
import { PlusIcon } from "@/components/icons";
import { Kicker } from "@/components/ui";
import { suggestionKey, type Suggestion } from "@/lib/starter-suggestions";

/** Rows shown before "Show N more". More than this plus one hidden row is needed to collapse. */
const COLLAPSED_ROWS = 6;

/**
 * The "Suggested for this trip" card at the top of the List tab: starter items from the bundled
 * catalog, each with a "+" that adds that one name to the shared list. Presentational only; the
 * tab owns the data, the add handler and the pending (waiting for verification) state. The card
 * is dashed and shadowless on purpose, so it reads as "not on the list yet" next to the white
 * cards of real items.
 */
export function SuggestedCard({
  suggestions,
  unverified,
  addingName,
  waitingName,
  onAdd,
  onCancelWaiting,
}: {
  suggestions: Suggestion[];
  /** The viewer is the organizer, not yet verified: "+" leads into email verification. */
  unverified: boolean;
  /** The name whose insert is in flight, if any. */
  addingName: string | null;
  /** The name waiting for the organizer to confirm their email, if any. */
  waitingName: string | undefined;
  onAdd: (name: string) => void;
  onCancelWaiting: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Never a "Show 1 more": collapse only when more than one row would be hidden.
  const collapsible = suggestions.length > COLLAPSED_ROWS + 1;
  const visible = collapsible && !expanded ? suggestions.slice(0, COLLAPSED_ROWS) : suggestions;
  const hiddenCount = suggestions.length - visible.length;
  const waitingKey = waitingName ? suggestionKey(waitingName) : null;

  return (
    <div data-testid="suggested-card">
      <div className="flex items-baseline justify-between px-1">
        <Kicker canvas>Suggested for this trip</Kicker>
        <Kicker canvas>{unverified ? "confirm your email to add" : "tap + to add"}</Kicker>
      </div>
      <div className="h-2" />
      <div className="rounded-card border border-dashed border-ink/[0.12] py-0.5 pl-4 pr-1.5">
        {visible.map((s, i) => {
          const key = suggestionKey(s.name);
          const captionId = `suggestion-caption-${key.replace(/[^a-z0-9]+/g, "-")}`;
          const isWaiting = waitingKey === key;
          const isAdding = addingName !== null && suggestionKey(addingName) === key;
          return (
            <div
              key={key}
              className={`flex items-center gap-3 py-1 ${i === visible.length - 1 && !collapsible ? "" : "border-b border-ink/[0.08]"}`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold [overflow-wrap:anywhere]">{s.name}</div>
                <div id={captionId} className="mt-px text-[12px] text-ink/[0.72]">
                  {isAdding
                    ? "Adding…"
                    : isWaiting
                      ? "Adds after you confirm your email"
                      : `Suggested · ${s.sourceLabel}`}
                </div>
              </div>
              {isWaiting ? (
                <button
                  type="button"
                  onClick={onCancelWaiting}
                  className="flex h-11 flex-none cursor-pointer items-center px-3 text-[13px] font-medium text-ink/60"
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  data-suggestion={s.name}
                  aria-label={`Add '${s.name}' to the list`}
                  aria-describedby={captionId}
                  disabled={addingName !== null}
                  onClick={() => onAdd(s.name)}
                  className="flex size-11 flex-none cursor-pointer items-center justify-center disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span
                    className="flex size-[30px] items-center justify-center rounded-full"
                    style={{ background: "var(--color-accent-soft)", color: "var(--color-accent-ink)" }}
                  >
                    <PlusIcon size={15} strokeWidth={2.8} />
                  </span>
                </button>
              )}
            </div>
          );
        })}
        {collapsible ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={(e) => {
              const toggle = e.currentTarget;
              setExpanded((prev) => !prev);
              // Collapsing shortens the card; keep the toggle in view, clear of the sticky bars.
              setTimeout(() => toggle.scrollIntoView?.({ block: "nearest" }), 0);
            }}
            className="flex h-11 w-full cursor-pointer items-center text-[13.5px] font-semibold"
            style={{ color: "var(--color-accent-strong)" }}
          >
            {expanded ? "Show fewer" : `Show ${hiddenCount} more`}
          </button>
        ) : null}
      </div>
    </div>
  );
}
