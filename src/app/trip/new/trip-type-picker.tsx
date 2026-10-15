"use client";

import { useEffect, useRef, type Ref } from "react";
import { CheckIcon, PencilIcon } from "@/components/icons";
import { iconForTripType, type TripTypeIcon } from "@/components/trip-type-icons";
import { Field, Kicker } from "@/components/ui";
import { OTHER_TILE_LABEL, STARTER_TYPES, type TripType } from "@/lib/starter-catalog";
import { sentencePhrases } from "@/lib/starter-suggestions";
import { OTHER_TYPE_MAX_LENGTH } from "@/lib/validation/trip-type";

const NEAR_LIMIT = 25;

function Tile({
  label,
  icon: Icon,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  icon: TripTypeIcon;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`relative flex min-h-[88px] cursor-pointer flex-col justify-between rounded-[20px] border-[1.5px] p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-accent)] ${
        checked
          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
          : "border-ink/[0.12] bg-white"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={onChange} />
      <div className="flex items-start justify-between">
        {/* Border width is 1.5px in both states, so a tile never changes size on toggle. */}
        <span
          className={checked ? undefined : "text-ink/[0.74]"}
          style={checked ? { color: "var(--color-accent-ink)" } : undefined}
        >
          <Icon size={22} strokeWidth={2} />
        </span>
        {/* The state circle changes shape (empty ring to filled check), so state is not color alone. */}
        <span
          aria-hidden="true"
          className={`flex size-5 items-center justify-center rounded-full ${
            checked ? "text-white" : "border-[1.8px] border-ink/50"
          }`}
          style={checked ? { background: "var(--color-accent)" } : undefined}
        >
          {checked ? <CheckIcon size={11} strokeWidth={3.4} /> : null}
        </span>
      </div>
      <span className="text-[14px] font-semibold">{label}</span>
    </label>
  );
}

/**
 * The "What kind of trip?" group on New trip: the catalog types plus Other, with Other's typed
 * label. Controlled by the page, which owns pick order and the Other text (component state
 * only: never the URL, storage or an event). The Other block is not rendered while unchecked,
 * so its text cannot be submitted.
 */
export function TripTypePicker({
  selected,
  onToggle,
  otherChecked,
  onToggleOther,
  otherText,
  onOtherText,
  otherError,
  otherInputRef,
  disabled,
}: {
  /** Checked catalog types in pick order. */
  selected: TripType[];
  onToggle: (code: TripType) => void;
  otherChecked: boolean;
  onToggleOther: () => void;
  otherText: string;
  onOtherText: (value: string) => void;
  otherError: string | null;
  otherInputRef: Ref<HTMLInputElement>;
  disabled: boolean;
}) {
  const otherBlockRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Keep the revealed input clear of the sticky bottom bar. Focus stays on the checkbox.
    if (otherChecked) otherBlockRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [otherChecked]);

  const phrases = sentencePhrases(selected);
  const sentence =
    selected.length === 0
      ? "Your list will start empty. Pick a type to get suggestions you can tap to add."
      : `Your list will open with suggestions for ${phrases}${selected.length > 1 ? ", combined with no repeats." : "."}`;

  const length = otherText.length;
  const describedBy = ["trip-other-help", "trip-other-count", otherError ? "trip-other-error" : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <div className="flex items-baseline justify-between px-1">
        <Kicker canvas>
          <span id="trip-kind-label">What kind of trip?</span>
        </Kicker>
        <span id="trip-kind-hint" className="text-[12px] text-ink/[0.68]">
          Pick any, or none
        </span>
      </div>
      <div className="h-2.5" />
      <div
        role="group"
        aria-labelledby="trip-kind-label"
        aria-describedby="trip-kind-hint"
        className="grid grid-cols-2 gap-2"
      >
        {STARTER_TYPES.map((type) => (
          <Tile
            key={type.code}
            label={type.label}
            icon={iconForTripType(type.code)}
            checked={selected.includes(type.code)}
            disabled={disabled}
            onChange={() => onToggle(type.code)}
          />
        ))}
        <Tile
          label={OTHER_TILE_LABEL}
          icon={PencilIcon}
          checked={otherChecked}
          disabled={disabled}
          onChange={onToggleOther}
        />
      </div>
      <p aria-live="polite" className="mt-2.5 px-1 text-[12.5px] leading-[1.45] text-ink/[0.74]">
        {sentence}
      </p>

      {otherChecked ? (
        <div ref={otherBlockRef} className="mt-4">
          <Field
            id="trip-other-type"
            label="Your trip type"
            placeholder="Ski weekend"
            value={otherText}
            onChange={(e) => onOtherText(e.target.value)}
            maxLength={OTHER_TYPE_MAX_LENGTH}
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="done"
            readOnly={disabled}
            aria-describedby={describedBy}
            aria-invalid={otherError ? true : undefined}
            ref={otherInputRef}
            inputClassName={otherError ? "ring-[1.5px] ring-terracotta" : ""}
          />
          <div className="mt-1.5 flex items-start justify-between gap-3 px-1">
            <p id="trip-other-help" className="text-[12px] text-ink/[0.68]">
              Saved with this trip. Please don&apos;t include names or personal details.
            </p>
            <span
              id="trip-other-count"
              className={`flex-none text-[12px] tabular-nums text-ink/[0.68] ${
                length >= OTHER_TYPE_MAX_LENGTH ? "font-semibold" : ""
              }`}
            >
              {length}/{OTHER_TYPE_MAX_LENGTH}
              <span className="sr-only"> characters</span>
            </span>
          </div>
          {/* Announces only near and at the limit, never on every keystroke. */}
          <div role="status" className="sr-only">
            {length >= OTHER_TYPE_MAX_LENGTH
              ? `Limit reached, ${OTHER_TYPE_MAX_LENGTH} of ${OTHER_TYPE_MAX_LENGTH}`
              : length >= NEAR_LIMIT
                ? `${OTHER_TYPE_MAX_LENGTH - NEAR_LIMIT} characters left`
                : ""}
          </div>
          {otherError ? (
            <p id="trip-other-error" role="alert" className="mt-1.5 px-1 text-[12.5px] text-terracotta">
              {otherError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
