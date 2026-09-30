"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CloseIcon } from "@/components/icons";
import {
  Button,
  Card,
  Divider,
  IconLinkButton,
  Kicker,
  LockedNotice,
  ScreenContent,
  ScreenLoading,
  TopBar,
} from "@/components/ui";
import { redirectToVerify, requireVerifiedSession } from "@/lib/auth-gate";
import { updateExpense } from "@/lib/data/trips";
import { todayIso } from "@/lib/dates";
import { LOCKED_TRIP_COPY } from "@/lib/locked-trip-copy";
import { savePendingExpenseDraft, takePendingExpenseDraft } from "@/lib/pending-action";
import { reportClientTiming, timeClient } from "@/lib/perf/timing";
import { trackEvent } from "@/lib/tracking";
import { createClient } from "@/lib/supabase/client";
import { isValidExpenseDate, isValidExpenseInput } from "@/lib/validation/expense";

/**
 * `null` while still loading/unresolved. `"editable"` is the original, unchanged payer-and-
 * unlocked case. `"readonly"` is shopping-list's Bought tap-through addition (design.md section
 * 7) — any other verified viewer, or a locked trip regardless of payer; same screen shell, every
 * field disabled, no "Save changes" button. No RLS change: `expenses`' select policy already
 * permits any verified/owner trip member to read the row, so this only widens what was
 * previously an application-layer block, not a new grant.
 */
type ViewMode = "editable" | "readonly-not-payer" | "readonly-locked";

/**
 * "Edit expense" as a sheet, reusing the exact ADR 0008 scaffold `AddExpenseSheetContent`/
 * `AddItemSheetContent` already established — same shared component, intercepted route + hard-nav
 * fallback both render it, `SheetShell`/`trip-sheet-chrome.tsx` unchanged beyond one more
 * pathname-check widening. Takes `tripId`/`expenseId` as props (rather than `useParams()`) since
 * both call sites already have them from their own route params, same reasoning as
 * `AddExpenseSheetContent`'s own doc comment. No `<Screen>` wrapper here — `SheetShell` supplies
 * the panel/background chrome, same as every other sheet content component.
 *
 * Close affordance uses `<Link href="...">` (via `IconLinkButton`), never `router.push`/`back()` —
 * same reasoning as `AddExpenseSheetContent`: reachable both via in-app interception and the
 * hard-nav fallback, where there's no guaranteed prior same-app history entry.
 */
export function EditExpenseSheetContent({ tripId: id, expenseId }: { tripId: string; expenseId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<ViewMode | null>(null);
  const [payerName, setPayerName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    trackEvent("expense_edit_start");
  }, []);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadError(null);
    const supabase = createClient();
    Promise.all([
      timeClient("edit-expense", "gating.getUser", () => supabase.auth.getUser()),
      timeClient("edit-expense", "gating.expense", () =>
        supabase.from("expenses").select("*").eq("id", expenseId).single(),
      ),
      timeClient("edit-expense", "gating.trips", () => supabase.from("trips").select("completed_at").eq("id", id).single()),
    ]).then(async ([userResult, expenseResult, tripResult]) => {
      if (cancelled) return;
      const user = userResult.data.user;
      if (!user || expenseResult.error || !expenseResult.data) {
        setLoadError("Couldn't open that expense — try again.");
        return;
      }
      const expenseRow = expenseResult.data;
      const isPayer = expenseRow.paid_by === user.id;
      const isLocked = Boolean(tripResult.data?.completed_at);

      setAmount(Number(expenseRow.amount).toFixed(2));
      setDescription(expenseRow.description);
      setDate(expenseRow.date);

      if (isPayer && !isLocked) {
        // Resume intent: if this edit was redirected out to the OTP trigger and back (design.md
        // section 4 "Resuming intent"), restore whatever was typed before the redirect instead
        // of the freshly-loaded, pre-edit values.
        const draft = takePendingExpenseDraft(expenseId);
        if (draft) {
          setAmount(draft.amount);
          setDescription(draft.description);
          setDate(draft.date);
        }
        setMode("editable");
        return;
      }

      if (isLocked) {
        setMode("readonly-locked");
        return;
      }

      // Not the payer, trip not locked — the caption needs the payer's display name (design.md
      // section 7's exact copy), fetched only in this one branch since neither other branch
      // needs it.
      const payerResult = await supabase
        .from("trip_members")
        .select("display_name")
        .eq("trip_id", id)
        .eq("user_id", expenseRow.paid_by)
        .maybeSingle();
      if (cancelled) return;
      setPayerName(payerResult.data?.display_name ?? null);
      setMode("readonly-not-payer");
    });
    return () => {
      cancelled = true;
    };
  }, [id, expenseId, reloadKey]);

  const amountCents = Math.round((parseFloat(amount || "0") || 0) * 100);

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
        redirectToVerify(router, "invitee-expense", `/trip/${id}/expense/${expenseId}/edit`);
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
      // router.push alone can land back on a stale client-cached copy of the trip page — refresh
      // reconciles the server-rendered expense list/balances with what was just saved. Same
      // pattern as add-expense-sheet-content.tsx/verify-inline.tsx.
      router.push(`/trip/${id}`);
      router.refresh();
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

  const closeHref = mode === "readonly-not-payer" || mode === "readonly-locked" ? `/trip/${id}?tab=list` : `/trip/${id}`;
  const closeButton = (
    <IconLinkButton href={closeHref} aria-label="Close">
      <CloseIcon size={18} strokeWidth={2.3} />
    </IconLinkButton>
  );

  if (loadError) {
    return (
      <ScreenContent>
        <TopBar title="Edit expense" trailing={closeButton} />
        <div className="h-6" />
        <p className="text-[15px] text-ink/70">{loadError}</p>
        <div className="h-3" />
        <Button block={false} variant="soft" className="px-5" onClick={() => setReloadKey((k) => k + 1)}>
          Try again
        </Button>
      </ScreenContent>
    );
  }

  if (mode === null) {
    return <ScreenLoading label="Loading expense…" />;
  }

  const readOnly = mode !== "editable";
  const fieldClassName = `w-full bg-transparent text-[17px] font-medium outline-none placeholder:font-normal placeholder:text-ink/40 ${
    readOnly ? "text-ink/70" : ""
  }`;

  return (
    <ScreenContent>
      <TopBar title={readOnly ? "Expense" : "Edit expense"} trailing={closeButton} />
      <div className="h-3.5" />
      {mode === "readonly-locked" ? (
        <LockedNotice>{LOCKED_TRIP_COPY.editing.long}</LockedNotice>
      ) : mode === "readonly-not-payer" ? (
        <p className="max-w-[290px] text-[14px] leading-[1.5] text-ink/[0.73]">
          Only {payerName ?? "the payer"} can edit this expense.
        </p>
      ) : (
        <p className="max-w-[290px] text-[14px] leading-[1.5] text-ink/[0.73]">
          Same equal split across everyone on the trip — just update what changed.
        </p>
      )}
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
            readOnly={readOnly}
            onChange={(e) => setAmount(e.target.value)}
            className={`text-display w-full bg-transparent text-[52px] outline-none placeholder:text-ink/20 ${
              readOnly ? "opacity-70" : ""
            }`}
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
          readOnly={readOnly}
          onChange={(e) => setDescription(e.target.value)}
          className={fieldClassName}
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
          readOnly={readOnly}
          disabled={readOnly}
          onChange={(e) => setDate(e.target.value)}
          className={fieldClassName}
        />
      </Card>
      <div className="h-4" />

      {error ? <p className="mt-3 text-[13px] text-terracotta">{error}</p> : null}
      <div className="h-4" />

      {readOnly ? null : (
        <Button variant="primary" className="text-[16px]" onClick={handleSubmit} disabled={submitting}>
          <CheckIcon size={17} strokeWidth={2.6} />
          {submitting ? "Saving…" : "Save changes"}
        </Button>
      )}
    </ScreenContent>
  );
}
