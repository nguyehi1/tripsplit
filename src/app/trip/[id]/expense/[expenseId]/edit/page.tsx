"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckIcon, CloseIcon, LockIcon } from "@/components/icons";
import { Button, Card, Divider, IconButton, Kicker, Screen, ScreenContent, TopBar } from "@/components/ui";
import { formatCents } from "@/lib/currency";
import { updateExpense } from "@/lib/data/trips";
import { createClient } from "@/lib/supabase/client";
import { isValidExpenseInput } from "@/lib/validation/expense";

export default function EditExpensePage() {
  const router = useRouter();
  const { id, expenseId } = useParams<{ id: string; expenseId: string }>();
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [locked, setLocked] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      supabase.auth.getUser(),
      supabase.from("expenses").select("*").eq("id", expenseId).single(),
      supabase.from("trip_members").select("id", { count: "exact", head: true }).eq("trip_id", id),
      supabase.from("trips").select("completed_at").eq("id", id).single(),
    ]).then(([userResult, expenseResult, membersResult, tripResult]) => {
      if (cancelled) return;
      const user = userResult.data.user;
      if (!user || expenseResult.error || !expenseResult.data || expenseResult.data.paid_by !== user.id) {
        setLoadError("Couldn't load this expense.");
        return;
      }
      setAmount(Number(expenseResult.data.amount).toFixed(2));
      setDescription(expenseResult.data.description);
      setMemberCount(membersResult.count ?? 1);
      setLocked(Boolean(tripResult.data?.completed_at));
    });
    return () => {
      cancelled = true;
    };
  }, [id, expenseId]);

  const amountCents = Math.round((parseFloat(amount || "0") || 0) * 100);
  const splitCents = memberCount ? Math.round(amountCents / memberCount) : 0;

  async function handleSubmit() {
    if (!isValidExpenseInput(amountCents, description)) {
      setError("Enter an amount and what it was for.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const supabase = createClient();
      await updateExpense(supabase, {
        expenseId,
        amountCents,
        description: description.trim(),
      });

      router.push(`/trip/${id}`);
    } catch (e) {
      // PGRST116 ("0 rows") is how PostgREST reports an update that RLS silently excluded — the
      // shape you get when someone other than the payer (or a trip that's since been locked)
      // hits this path directly, not just a generic failure. Anything else falls through to the
      // generic message below.
      const code = e && typeof e === "object" && "code" in e ? (e as { code: string }).code : null;
      setError(
        code === "PGRST116"
          ? "You can only edit expenses you paid for."
          : "Couldn't save those changes — try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const closeButton = (
    <IconButton onClick={() => router.push(`/trip/${id}`)}>
      <CloseIcon size={18} strokeWidth={2.3} />
    </IconButton>
  );

  if (loadError) {
    return (
      <Screen>
        <ScreenContent>
          <TopBar title="Edit expense" leading={closeButton} />
          <div className="h-6" />
          <p className="text-[15px] text-ink/70">{loadError}</p>
        </ScreenContent>
      </Screen>
    );
  }

  if (locked) {
    return (
      <Screen>
        <ScreenContent>
          <TopBar title="Edit expense" leading={closeButton} />
          <div className="h-6" />
          <div
            className="flex size-[46px] items-center justify-center rounded-[16px]"
            style={{ background: "var(--color-terracotta-soft)", color: "var(--color-terracotta)" }}
          >
            <LockIcon size={22} />
          </div>
          <div className="h-4" />
          <p className="max-w-[290px] text-[14.5px] leading-[1.5] text-ink/[0.73]">
            This trip is locked — the organizer already settled it up, so expenses can no longer
            be edited.
          </p>
        </ScreenContent>
      </Screen>
    );
  }

  if (memberCount === null || locked === null) {
    return (
      <Screen>
        <ScreenContent className="pt-14">
          <p className="text-[15px] text-ink/70">Loading expense…</p>
        </ScreenContent>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenContent>
        <TopBar title="Edit expense" leading={closeButton} />
        <div className="h-3.5" />
        <p className="max-w-[290px] text-[14px] leading-[1.5] text-ink/[0.73]">
          Same equal split across everyone on the trip — just update what changed.
        </p>
        <div className="h-[18px]" />

        <Card className="p-[18px]">
          <Kicker>Amount</Kicker>
          <div className="h-1.5" />
          <div className="flex items-baseline">
            <span className="text-display text-[52px]" style={{ color: "var(--color-accent)" }}>
              $
            </span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-display w-full bg-transparent text-[52px] outline-none placeholder:text-ink/20"
              style={{ color: "var(--color-accent)" }}
            />
          </div>
          <div className="h-3.5" />
          <Divider />
          <div className="h-3.5" />
          <Kicker>What was it</Kicker>
          <div className="h-1" />
          <input
            type="text"
            placeholder="Cabin, lift tickets, groceries…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-transparent text-[17px] font-medium outline-none placeholder:font-normal placeholder:text-ink/40"
          />
        </Card>
        <div className="h-4" />

        <div
          className="flex items-center justify-between rounded-full px-5 py-3.5"
          style={{ background: "oklch(0.95 0.035 44)" }}
        >
          <span className="whitespace-nowrap text-[13.5px] text-ink/75">
            Splits {memberCount ?? "…"} ways
          </span>
          <span className="text-display whitespace-nowrap text-[22px]">
            {formatCents(splitCents)} each
          </span>
        </div>
        {error ? <p className="mt-3 text-[13px] text-terracotta">{error}</p> : null}
        <div className="h-4" />

        <Button variant="primary" className="text-[16px]" onClick={handleSubmit} disabled={submitting}>
          <CheckIcon size={17} strokeWidth={2.6} />
          {submitting ? "Saving…" : "Save changes"}
        </Button>
      </ScreenContent>
    </Screen>
  );
}
