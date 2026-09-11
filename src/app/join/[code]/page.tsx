"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRightIcon, DollarSignIcon } from "@/components/icons";
import { BottomBar, Button, Field, Screen, ScreenContent } from "@/components/ui";
import { initialsFor } from "@/lib/avatar";
import { getTripByInviteCode } from "@/lib/data/trips";
import { formatDateRange } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";

type InviteInfo = NonNullable<Awaited<ReturnType<typeof getTripByInviteCode>>>;

export default function JoinTripPage() {
  const router = useRouter();
  const { code } = useParams<{ code: string }>();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTripByInviteCode(createClient(), code)
      .then((result) => {
        if (cancelled) return;
        if (!result) setLoadError("This invite link doesn't match a trip anymore.");
        else setInvite(result);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Couldn't load this invite.");
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function handleJoin() {
    if (!name.trim() || !email.trim()) {
      setError("Your name and email are both required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const supabase = createClient();
      const redirectUrl = new URL(`/join/${code}/callback`, window.location.origin);
      redirectUrl.searchParams.set("name", name.trim());
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectUrl.toString() },
      });
      if (authError) {
        setError(authError.message);
        return;
      }
      const back = encodeURIComponent(`/join/${code}`);
      router.push(`/check-email?email=${encodeURIComponent(email.trim())}&back=${back}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send a sign-in link — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <Screen>
        <ScreenContent className="pt-14">
          <p className="text-[15px] text-ink/70">{loadError}</p>
        </ScreenContent>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenContent className="pt-3.5">
        <div className="rounded-[22px] p-5 text-white" style={{ background: "var(--color-accent)" }}>
          <div className="flex items-center gap-[9px]">
            <span className="flex size-7 items-center justify-center rounded-full bg-white/[0.22] text-[10px] font-semibold">
              {invite ? initialsFor(invite.organizerName ?? "?") : "…"}
            </span>
            <span className="text-[12.5px] opacity-85">
              {invite?.organizerName ? `${invite.organizerName} invited you` : "You're invited"}
            </span>
          </div>
          <div className="h-3.5" />
          <div className="text-display text-[30px]">{invite?.name ?? "Loading trip…"}</div>
          <div className="h-2.5" />
          <div className="flex gap-3.5 text-[13px] opacity-85">
            {invite ? (
              <>
                {formatDateRange(invite.startsOn, invite.endsOn) ? (
                  <span>{formatDateRange(invite.startsOn, invite.endsOn)}</span>
                ) : null}
                {invite.location ? <span>{invite.location}</span> : null}
              </>
            ) : null}
          </div>
        </div>
        <div className="h-[18px]" />
        <h1 className="text-display text-[24px]">
          Add your name
          <br />
          to join.
        </h1>
        <div className="h-[18px]" />

        <Field
          label="Your name"
          placeholder="e.g. Cleo"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="h-4" />
        <Field
          label="Email"
          type="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error ? <p className="mt-2 text-[13px] text-terracotta">{error}</p> : null}
        <div className="h-4" />

        <div
          className="flex items-start gap-[11px] rounded-[18px] p-4"
          style={{ background: "oklch(0.95 0.04 88)" }}
        >
          <span
            className="flex size-8 flex-none items-center justify-center rounded-full bg-white"
            style={{ color: "oklch(0.38 0.08 80)" }}
          >
            <DollarSignIcon size={17} strokeWidth={2.2} />
          </span>
          <div className="text-[13px] leading-[1.45] text-ink/[0.72]">
            Everything on this trip splits equally. You&apos;ll log what you pay for.
          </div>
        </div>
      </ScreenContent>
      <BottomBar>
        <Button variant="primary" className="text-[16px]" onClick={handleJoin} disabled={submitting || !invite}>
          {submitting ? "Sending…" : "Join the trip"}
          {submitting ? null : <ArrowRightIcon size={18} strokeWidth={2.4} />}
        </Button>
      </BottomBar>
    </Screen>
  );
}
