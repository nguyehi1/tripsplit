"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, CalendarIcon, CloseIcon } from "@/components/icons";
import { trackEvent } from "@/lib/tracking";
import {
  Avatar,
  BottomBar,
  Button,
  Card,
  Divider,
  Field,
  IconButton,
  Kicker,
  Screen,
  ScreenContent,
  TopBar,
} from "@/components/ui";
import { createTrip } from "@/lib/data/trips";
import { createClient } from "@/lib/supabase/client";
import type { TripType } from "@/lib/starter-catalog";
import { isTripType, TRIP_TYPE_OTHER_EVENT, tripTypeSelectedEvent } from "@/lib/starter-suggestions";
import { OTHER_TYPE_PROBLEM_COPY, validateOtherType } from "@/lib/validation/trip-type";
import { TripTypePicker } from "./trip-type-picker";

function lengthLabel(startsOn: string, endsOn: string) {
  const start = new Date(`${startsOn}T00:00:00`);
  const end = new Date(`${endsOn}T00:00:00`);
  const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (!Number.isFinite(days) || days < 1) return null;
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long" });
  return `${days} day${days === 1 ? "" : "s"} · ${fmt(start)} to ${fmt(end)}`;
}

/**
 * The New trip form. `initialType` is the already-validated `?type=` code from the server wrapper
 * in `page.tsx` (or undefined): it is read once, into the initial state, so the first paint
 * already shows the tile checked. Nothing is created, stored or tracked because of it.
 */
export function NewTripForm({ initialType }: { initialType?: TripType } = {}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Checked catalog types, in pick order (the order is what gets stored). Component state only:
  // none of this, least of all the Other text, goes to the URL, storage, an event or a log.
  const [types, setTypes] = useState<TripType[]>(() => (isTripType(initialType) ? [initialType] : []));
  const [otherChecked, setOtherChecked] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [otherError, setOtherError] = useState<string | null>(null);
  const otherInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    trackEvent("trip_create_start");
  }, []);

  const tripLength = useMemo(
    () => (startsOn && endsOn ? lengthLabel(startsOn, endsOn) : null),
    [startsOn, endsOn],
  );

  function toggleType(code: TripType) {
    setTypes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  function toggleOther() {
    // Unticking discards the text and any error; ticking again starts empty.
    setOtherText("");
    setOtherError(null);
    setOtherChecked((prev) => !prev);
  }

  function changeOtherText(value: string) {
    setOtherText(value);
    if (otherError && validateOtherType(value).ok) setOtherError(null);
  }

  async function handleCreate() {
    let otherType: string | undefined;
    if (otherChecked) {
      const result = validateOtherType(otherText);
      if (result.ok) {
        otherType = result.value;
        setOtherError(null);
      } else {
        setOtherError(OTHER_TYPE_PROBLEM_COPY[result.problem]);
      }
    }
    const otherInvalid = otherChecked && otherType === undefined;
    if (!name.trim()) {
      setError("Give the trip a name first.");
      return;
    }
    if (otherInvalid) {
      otherInputRef.current?.focus();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const supabase = createClient();
      // First-time visitor with no session at all (simplified-onboarding): start an anonymous
      // session before creating the trip, so RLS ownership (`trips.created_by = auth.uid()`)
      // has a real, server-backed user id to attach to from the moment of creation — no email
      // required yet. A second visit in the same browser (session already anonymous or
      // upgraded) skips this and reuses the existing session (AC 4 — "Create your first trip"
      // never enforces a one-trip limit). See docs/features/simplified-onboarding/architecture.md.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        const { error: anonError } = await supabase.auth.signInAnonymously();
        if (anonError) throw anonError;
      }
      const { tripId, typesStored } = await createTrip(supabase, {
        name: name.trim(),
        // No name asked here (migration 0020): the organizer picks one when they confirm their
        // email, or keeps the one their account already has.
        displayName: "",
        location: location.trim() || undefined,
        startsOn: startsOn || undefined,
        endsOn: endsOn || undefined,
        types,
        otherType,
      });
      trackEvent("trip_create_complete");
      // Name-only events, one per stored type, and only if the types were really stored (the
      // fallback for an unmigrated database drops them). The Other text is never sent.
      if (typesStored) {
        for (const code of types) {
          const event = tripTypeSelectedEvent(code);
          if (event) trackEvent(event);
        }
        if (otherType !== undefined) trackEvent(TRIP_TYPE_OTHER_EVENT);
      }
      // Best-effort — a failed confirmation email shouldn't stop the trip from being created.
      await fetch("/api/trip-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId }),
      }).catch(() => {});
      // Land directly on the trip dashboard, not the invite screen — creation and viewing are
      // both free (AC 3); reaching invite now happens by tapping "Invite" from the dashboard,
      // itself one of the two mutation triggers (design.md section 3).
      // With a catalog type stored, land on the List tab so the Suggested card is the first thing seen.
      router.push(typesStored && types.length > 0 ? `/trip/${tripId}?tab=list` : `/trip/${tripId}`);
    } catch {
      setError("Couldn't create the trip — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen glow texture>
      <ScreenContent padding="px-4">
        <TopBar
          sticky
          stickyInsetClassName="-mx-4 px-4"
          title="New trip"
          leading={
            <IconButton onClick={() => router.back()}>
              <CloseIcon size={18} strokeWidth={2.3} />
            </IconButton>
          }
        />
        <div className="h-4" />
        <h1 className="text-display text-[30px]">
          What are we
          <br />
          calling it?
        </h1>
        <div className="h-[18px]" />

        <Field
          label="Trip name"
          placeholder="Tahoe Ski Trip"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="h-[22px]" />

        <TripTypePicker
          selected={types}
          onToggle={toggleType}
          otherChecked={otherChecked}
          onToggleOther={toggleOther}
          otherText={otherText}
          onOtherText={changeOtherText}
          otherError={otherError}
          otherInputRef={otherInputRef}
          disabled={submitting}
        />
        <div className="h-[22px]" />
        <Field
          label="Location"
          hint="optional"
          placeholder="Lake Tahoe, CA"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <div className="h-4" />

        <Kicker>Dates</Kicker>
        <div className="h-1.5" />
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-[11.5px] text-muted">Start</div>
              <input
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                className="text-display mt-0.5 w-full bg-transparent text-[20px] outline-none"
              />
            </div>
            <div className="h-[34px] w-px bg-ink/10" />
            <div className="flex-1">
              <div className="text-[11.5px] text-muted">End</div>
              <input
                type="date"
                value={endsOn}
                min={startsOn || undefined}
                onChange={(e) => setEndsOn(e.target.value)}
                className="text-display mt-0.5 w-full bg-transparent text-[20px] outline-none"
              />
            </div>
            <span
              className="flex size-9 flex-none items-center justify-center rounded-[12px]"
              style={{ background: "var(--color-accent-soft)", color: "var(--color-accent-deep)" }}
            >
              <CalendarIcon size={19} />
            </span>
          </div>
          {tripLength ? (
            <>
              <div className="h-3" />
              <Divider />
              <div className="h-3" />
              <div className="text-[12.5px] text-muted">{tripLength}</div>
            </>
          ) : null}
        </Card>
        <div className="h-4" />

        <div
          className="flex items-start gap-[11px] rounded-[18px] p-4"
          style={{ background: "var(--color-terracotta-soft)" }}
        >
          <Avatar
            initials="?"
            color={{ bg: "var(--color-accent)", fg: "#fff" }}
            size={32}
          />
          <div className="text-[13px] leading-[1.45] text-muted">
            You&apos;ll be the trip&apos;s planner — you invite people and you decide when the
            trip is complete.
          </div>
        </div>
        {error ? <p className="mt-3 text-[13px] text-terracotta">{error}</p> : null}
      </ScreenContent>
      <BottomBar>
        <Button variant="capsule" className="text-[16px]" onClick={handleCreate} disabled={submitting}>
          {submitting ? "Creating…" : "Create trip"}
          {submitting ? null : <ArrowRightIcon size={18} strokeWidth={2.4} />}
        </Button>
      </BottomBar>
    </Screen>
  );
}
