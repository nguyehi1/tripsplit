"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckIcon, CopyIcon, PlusIcon, ShareIcon } from "@/components/icons";
import { Avatar, BottomBar, Button, Card, Kicker, Screen, ScreenContent } from "@/components/ui";
import { getTripView, type TripView } from "@/lib/data/trips";
import { createClient } from "@/lib/supabase/client";

export default function TripInvitePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [view, setView] = useState<TripView | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(async ({ data: { user } }) => {
        if (!user) throw new Error("Not signed in.");
        return getTripView(supabase, id, user.id);
      })
      .then((result) => {
        if (!cancelled) setView(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  const inviteUrl = view ? `${window.location.origin}/join/${view.trip.inviteCode}` : "";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — no-op
    }
  }

  async function shareLink() {
    if (navigator.share) {
      try {
        await navigator.share({ title: view?.trip.name, url: inviteUrl });
      } catch {
        // user cancelled — no-op
      }
    } else {
      copyLink();
    }
  }

  return (
    <Screen>
      <ScreenContent className="pt-5">
        <div
          className="flex size-[46px] items-center justify-center rounded-[16px] text-white"
          style={{ background: "var(--color-accent)" }}
        >
          <CheckIcon size={24} strokeWidth={2.4} />
        </div>
        <div className="h-[18px]" />
        <h1 className="text-display text-[32px]">
          {view?.trip.name ?? "Your trip"}
          <br />
          is live.
        </h1>
        <div className="h-3" />
        <p className="max-w-[295px] text-[14.5px] leading-[1.5] text-ink/[0.73]">
          Send this link to everyone coming. They add their name, and they&apos;re in.
        </p>
        <div className="h-5" />

        <Card className="p-4">
          <Kicker>Invite link</Kicker>
          <div className="h-[9px]" />
          <div className="rounded-[14px] bg-ink/[0.05] px-[15px] py-[13px] text-[13.5px] font-medium leading-[1.4] break-all">
            {inviteUrl.replace(/^https?:\/\//, "") || "…"}
          </div>
          <div className="h-3" />
          <div className="flex gap-2">
            <Button
              variant="accent"
              block={false}
              className="h-[46px] flex-1 text-[14.5px]"
              onClick={copyLink}
              disabled={!view}
            >
              <CopyIcon size={17} strokeWidth={2.2} />
              {copied ? "Copied!" : "Copy link"}
            </Button>
            <Button
              variant="soft"
              block={false}
              className="h-[46px] flex-1 text-[14.5px]"
              onClick={shareLink}
              disabled={!view}
            >
              <ShareIcon size={17} strokeWidth={2.2} />
              Share
            </Button>
          </div>
        </Card>
        <div className="h-4" />

        <div className="flex items-baseline justify-between px-1">
          <Kicker>On the trip</Kicker>
          <Kicker>
            {view ? (view.members.length === 1 ? "Just you" : `${view.members.length} people`) : "…"}
          </Kicker>
        </div>
        <div className="h-2" />
        {view?.members.map((member) => (
          <div key={member.id} className="mb-2.5">
            <Card className="flex items-center gap-[11px] p-[14px_18px]">
              <Avatar initials={member.initials} color={member.avatar} />
              <div className="flex-1">
                <div className="text-[15px] font-semibold">{member.displayName}</div>
                <div className="mt-px text-[12px] text-ink/[0.72]">
                  {member.isOrganizer ? "Organizer" : "Member"}
                  {member.id === view.you?.id ? " · you" : ""}
                </div>
              </div>
            </Card>
          </div>
        ))}
        {view && view.members.length === 1 ? (
          <div className="flex items-center gap-[11px] rounded-[22px] border-[1.5px] border-dashed border-ink/20 px-[18px] py-3.5">
            <span className="flex size-9 flex-none items-center justify-center rounded-full bg-ink/[0.06] text-ink/[0.68]">
              <PlusIcon size={18} strokeWidth={2.2} />
            </span>
            <div className="text-[13.5px] text-ink/[0.72]">Waiting on everyone else</div>
          </div>
        ) : null}
      </ScreenContent>
      <BottomBar>
        <Button variant="primary" className="h-[54px] text-[15.5px]" onClick={() => router.push(`/trip/${id}`)}>
          Go to the trip
        </Button>
      </BottomBar>
    </Screen>
  );
}
