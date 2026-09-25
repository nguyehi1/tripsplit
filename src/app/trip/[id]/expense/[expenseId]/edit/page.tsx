"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckIcon, CloseIcon, LockIcon } from "@/components/icons";
import { Button, Card, Divider, IconButton, Kicker, Screen, ScreenContent, TopBar } from "@/components/ui";
import { DelayedLoadingLine } from "@/components/delayed-loading-line";
import { requireVerifiedSession } from "@/lib/auth-gate";
import { formatCents } from "@/lib/currency";
import { updateExpense } from "@/lib/data/trips";
import { todayIso } from "@/lib/dates";
import { savePendingExpenseDraft, takePendingExpenseDraft } from "@/lib/pending-action";
import { reportClientTiming, timeClient } from "@/lib/perf/timing";
import { trackEvent } from "@/lib/tracking";
import { createClient } from "@/lib/supabase/client";
import { isValidExpenseDate, isValidExpenseInput } from "@/lib/validation/expense";

export default function EditExpensePage() {
  const router = useRouter();
  const { id, expenseId } = useParams<{ id: string; expenseId: string }>();
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [locked, setLocked] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackEvent("expense_edit_start");
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      timeClient("edit-expense", "gating.getUser", () => supabase.auth.getUser()),
      timeClient("edit-expense", "gating.expense", () =>
        supabase.from("expenses").select("*").eq("id", expenseId).single(),
      ),
      timeClient("edit-expense", "gating.trip_members", () =>
        supabase.from("trip_members").select("id", { count: "exact", head: true }).eq("trip_id", id),
      ),
      timeClient("edit-expense", "gating.trips", () => supabase.from("trips").select("completed_at").eq("id", id).single()),
    ]).then(([userResult, expenseResult, membersResult, tripResult]) => {
      if (cancelled) return;
      const user = userResult.data.user;
      if (!user || expenseResult.error || !expenseResult.data || expenseResult.data.paid_by !== user.id) {
        setLoadError("Couldn't load this expense.");
        return;
      }
      // Resume intent: if this edit was redirected out to the OTP trigger and back (design.md
      // section 4 "Resuming intent"), restore whatever was typed before the redirect instead of
      // the freshly-loaded, pre-edit values.
      const draft = takePendingExpenseDraft(expenseId);
      setAmount(draft?.amount ?? Number(expenseResult.data.amount).toFixed(2));
      setDescription(draft?.description ?? expenseResult.data.description);
      setDate(draft?.date ?? expenseResult.data.date);
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
    if (!isValidExpenseInput(amountCents, description) || !date || !isValidExpenseDate(date)) {
      setError("Enter an amount, what it was for, and a valid date (today or earlier).");
      return;
    }
    setError(null);
    setSubmitting(true);
    // Click-to-navigate span (performance-scaling ADR 0010): the client-perceived total for this
    // submit, from click to the point the app hands off to the trip page's own render.
    const navigateSpanStart = performance.now();
    try {
      const supabase = createClient();

      // The mutation gate (simplified-onboarding) — see the add-expense screen's identical
      // comment. Saving is the trigger, not viewing/editing the form.
      if (!(await requireVerifiedSession(supabase))) {
        savePendingExpenseDraft(expenseId, { amount, description, date });
        const next = encodeURIComponent(`/trip/${id}/expense/${expenseId}/edit`);
        router.push(`/check-email?trigger=invitee-expense&next=${next}&back=${next}`);
        return;
      }

      await timeClient("edit-expense", "updateExpense", () =>
        updateExpense(supabase, {
          expenseId,
          amountCents,
          description: description.trim(),
          date,
        }),
      );

      trackEvent("expense_edit_complete");
      reportClientTiming("edit-expense", "clickToNavigate", performance.now() - navigateSpanStart);
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
          <DelayedLoadingLine />
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
          <div className="h-3.5" />
          <Divider />
          <div className="h-3.5" />
          <Kicker>Date</Kicker>
          <div className="h-1" />
          <input
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-transparent text-[17px] font-medium outline-none"
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
