"use client";

import { useEffect, useMemo, useState } from "react";
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
import { initialsFor } from "@/lib/avatar";
import { createTrip } from "@/lib/data/trips";
import { createClient } from "@/lib/supabase/client";

function lengthLabel(startsOn: string, endsOn: string) {
  const start = new Date(`${startsOn}T00:00:00`);
  const end = new Date(`${endsOn}T00:00:00`);
  const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (!Number.isFinite(days) || days < 1) return null;
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long" });
  return `${days} day${days === 1 ? "" : "s"} · ${fmt(start)} to ${fmt(end)}`;
}

export default function NewTripPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackEvent("trip_create_start");
  }, []);

  const tripLength = useMemo(
    () => (startsOn && endsOn ? lengthLabel(startsOn, endsOn) : null),
    [startsOn, endsOn],
  );

  async function handleCreate() {
    if (!name.trim() || !displayName.trim()) {
      setError("Trip name and your name are both required.");
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
      const { tripId } = await createTrip(supabase, {
        name: name.trim(),
        displayName: displayName.trim(),
        location: location.trim() || undefined,
        startsOn: startsOn || undefined,
        endsOn: endsOn || undefined,
      });
      trackEvent("trip_create_complete");
      // Best-effort — a failed confirmation email shouldn't stop the trip from being created.
      await fetch("/api/trip-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId }),
      }).catch(() => {});
      // Land directly on the trip dashboard, not the invite screen — creation and viewing are
      // both free (AC 3); reaching invite now happens by tapping "Invite" from the dashboard,
      // itself one of the two mutation triggers (design.md section 3).
      router.push(`/trip/${tripId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the trip — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen glow texture>
      <ScreenContent>
        <TopBar
          sticky
          title="New trip"
          leading={
            <IconButton onClick={() => router.back()}>
              <CloseIcon size={18} strokeWidth={2.3} />
            </IconButton>
          }
        />
        <div className="h-4" />
        {/* Miso cameo (AC13) — a miniature version of Welcome's photo-in-a-card treatment
         *  (design.md section 3), shrunk down for a form screen: `miso_01.jpg` (design.md
         *  section 6.1, "asset swap"), ~28px, tilted white frame, paired with a compact
         *  speech-bubble. Its own row, not absolutely positioned, so it can't overlap the
         *  headline or fields below it. */}
        <div className="flex items-center gap-2.5">
          <div className="rounded-[10px] bg-white p-1 shadow-card-sm" style={{ transform: "rotate(-6deg)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- no next/image config for
               public/images/* yet (architecture.md); a plain <img> is fine for this pass. */}
            <img
              src="/images/miso_01.jpg"
              alt="Miso, Splitiful's mascot dog"
              width={28}
              height={28}
              className="block size-7"
            />
          </div>
          <div className="rounded-[14px] rounded-bl-[3px] bg-white px-3 py-1.5 shadow-card-sm">
            <span className="text-[12.5px] font-medium text-ink/80">New trip? Let&apos;s get counting.</span>
          </div>
        </div>
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
        <div className="h-4" />
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
              <div className="text-[11.5px] text-ink/[0.72]">Start</div>
              <input
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                className="text-display mt-0.5 w-full bg-transparent text-[20px] outline-none"
              />
            </div>
            <div className="h-[34px] w-px bg-ink/10" />
            <div className="flex-1">
              <div className="text-[11.5px] text-ink/[0.72]">End</div>
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
              <div className="text-[12.5px] text-ink/[0.72]">{tripLength}</div>
            </>
          ) : null}
        </Card>
        <div className="h-4" />

        <Field
          label="Your name"
          hint="how others on the trip will see you"
          placeholder="e.g. Alex"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <div className="h-4" />

        <div
          className="flex items-start gap-[11px] rounded-[18px] p-4"
          style={{ background: "var(--color-terracotta-soft)" }}
        >
          <Avatar
            initials={displayName ? initialsFor(displayName) : "?"}
            color={{ bg: "var(--color-accent)", fg: "#fff" }}
            size={32}
          />
          <div className="text-[13px] leading-[1.45] text-ink/[0.72]">
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
