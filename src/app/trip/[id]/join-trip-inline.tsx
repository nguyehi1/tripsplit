"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field } from "@/components/ui";
import { getMyDisplayName } from "@/lib/data/trips";
import { createClient } from "@/lib/supabase/client";

/**
 * The "browser already remembers you" join path (2026-10-01 follow-up to migration 0016): a
 * visitor who already has a verified, non-anonymous session — Supabase's own persisted session,
 * not a bespoke "remembered" flag — shouldn't be sent through the full email+OTP dance just to
 * join a trip they're not yet a member of. They're already who they say they are; all that's
 * missing is a display name for *this* trip (the app has no global profile name, only a
 * per-trip `trip_members.display_name`), so this renders one field (skipped when the account already has a name — migration 0020) and a button that calls the
 * same `join_trip_by_id` path `/api/join` already exposes, with no OTP step at all.
 *
 * Used by both `TripSummaryOnly` (a verified user who opened a bare `/trip/<uuid>` link they're
 * not on yet) and `RemovedFromTripScreen` (always a verified user, by that screen's own
 * precondition) in `src/app/trip/[id]/page.tsx`. A visitor with no session, or only an anonymous
 * one, still goes through `/check-email?joinTripId=<id>` — unchanged.
 */
export function JoinTripInline({ tripId, cta = "Join trip" }: { tripId: string; cta?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  // The account's existing name (migration 0020); undefined while loading, null if none yet. The
  // name field shows until one is found, so first paint (and SSR) never hides it.
  const [existingName, setExistingName] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    getMyDisplayName(createClient())
      .then(setExistingName)
      .catch(() => setExistingName(null));
  }, []);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin() {
    const displayName = existingName ?? name.trim();
    if (!displayName) {
      setError("Enter your name first.");
      return;
    }
    setError(null);
    setJoining(true);
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, displayName }),
      });
      if (!res.ok) {
        // Our own copy only: the route's error body can carry raw database text.
        setError(
          res.status === 429
            ? "Too many attempts — wait a moment and try again."
            : "Couldn't join the trip — try again.",
        );
        setJoining(false);
        return;
      }
      router.push(`/trip/${tripId}`);
      router.refresh();
    } catch {
      setError("Couldn't join the trip — try again.");
      setJoining(false);
    }
  }

  return (
    <div>
      {existingName ? (
        <p className="text-[13px] text-ink/[0.72]">
          Joining as <strong className="font-semibold">{existingName}</strong>
        </p>
      ) : (
        <Field
          label="Your name"
          placeholder="e.g. Cleo"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      )}
      {error ? <p className="mt-2 text-[13px] text-terracotta">{error}</p> : null}
      <div className="h-2.5" />
      <Button variant="accent" className="text-[14px]" block={false} onClick={handleJoin} disabled={joining}>
        {joining ? "Joining…" : cta}
      </Button>
    </div>
  );
}
