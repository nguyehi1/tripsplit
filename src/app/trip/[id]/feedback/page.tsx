"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRightIcon, CloseIcon, MehIcon, ThumbsDownIcon, ThumbsUpIcon } from "@/components/icons";
import { BottomBar, Button, Card, IconButton, Kicker, Screen, ScreenContent, TopBar } from "@/components/ui";
import { submitFeedback } from "@/lib/data/trips";
import { createClient } from "@/lib/supabase/client";

const RATINGS = [
  { value: "yes", label: "Yes", Icon: ThumbsUpIcon },
  { value: "fine", label: "It's fine", Icon: MehIcon },
  { value: "not_really", label: "Not really", Icon: ThumbsDownIcon },
] as const;

const MAX_LENGTH = 500;

export default function FeedbackPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [rating, setRating] = useState<(typeof RATINGS)[number]["value"] | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setError(null);
    setSubmitting(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      await submitFeedback(supabase, {
        userId: user.id,
        tripId: id,
        rating: rating ?? undefined,
        comment: comment.trim() || undefined,
      });
      router.push(`/trip/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send feedback — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <ScreenContent>
        <TopBar
          title="Feedback"
          leading={
            <IconButton onClick={() => router.push(`/trip/${id}`)}>
              <CloseIcon size={18} strokeWidth={2.3} />
            </IconButton>
          }
        />
        <div className="h-[18px]" />
        <h1 className="text-display text-[28px]">
          How&apos;s Splitiful
          <br />
          treating you?
        </h1>
        <div className="h-5" />

        <Card className="p-[18px]">
          <Kicker>Do you like the app?</Kicker>
          <div className="h-3" />
          <div className="flex gap-2">
            {RATINGS.map(({ value, label, Icon }) => {
              const selected = rating === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  className="flex h-[76px] flex-1 cursor-pointer flex-col items-center justify-center gap-[7px] rounded-[16px] text-[12.5px]"
                  style={{
                    background: selected ? "oklch(0.95 0.04 88)" : "rgba(35,28,18,0.05)",
                    color: selected ? "oklch(0.34 0.08 80)" : "rgba(35,28,18,0.73)",
                  }}
                >
                  <Icon size={22} />
                  {label}
                </button>
              );
            })}
          </div>
        </Card>
        <div className="h-3.5" />

        <Card className="p-[18px]">
          <Kicker>Anything you&apos;d change?</Kicker>
          <div className="h-2.5" />
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, MAX_LENGTH))}
            placeholder="Splitting unequally would help — one of us didn't ski…"
            className="min-h-[104px] w-full resize-none rounded-[14px] bg-ink/[0.05] p-[15px] text-[14px] leading-[1.5] text-ink outline-none placeholder:text-ink/[0.72]"
          />
          <div className="h-2" />
          <div className="text-right text-[11.5px] text-ink/[0.68]">
            {comment.length} / {MAX_LENGTH}
          </div>
        </Card>
        {error ? <p className="mt-3 text-[13px] text-terracotta">{error}</p> : null}
      </ScreenContent>
      <BottomBar>
        <Button variant="primary" className="text-[16px]" onClick={handleSend} disabled={submitting}>
          {submitting ? "Sending…" : "Send feedback"}
          {submitting ? null : <ArrowRightIcon size={18} strokeWidth={2.4} />}
        </Button>
      </BottomBar>
    </Screen>
  );
}
