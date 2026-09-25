"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloseIcon, LockIcon, PlusIcon } from "@/components/icons";
import { Button, Card, Divider, IconLinkButton, Kicker, ScreenContent, TopBar } from "@/components/ui";
import { isUnverifiedOwner, requireVerifiedSession } from "@/lib/auth-gate";
import { formatCents } from "@/lib/currency";
import { addExpense } from "@/lib/data/trips";
import { todayIso } from "@/lib/dates";
import { savePendingExpenseDraft, takePendingExpenseDraft } from "@/lib/pending-action";
import { reportClientTiming, timeClient } from "@/lib/perf/timing";
import { trackEvent } from "@/lib/tracking";
import { createClient } from "@/lib/supabase/client";
import { isValidExpenseDate, isValidExpenseInput } from "@/lib/validation/expense";

/**
 * The add-expense form/gating logic (ADR 0008 point 5) — relocated unchanged (AC10) from the old
 * standalone `add-expense/page.tsx` route so it can be shared, as-is, by both the intercepted
 * sheet (`@sheet/(.)add-expense/page.tsx`) and the hard-nav/deep-link fallback
 * (`add-expense/page.tsx`, via `renderTripDashboard`'s `sheet` slot). `tripId` is passed as a
 * prop (rather than read via `useParams`) since both call sites already have it from their own
 * route params.
 *
 * All three "close" affordances below (normal, locked, owner-gate-blocked branches) use
 * `<Link href="/trip/[id]">` (via `IconLinkButton`), never `router.back()` — this component is
 * reachable both via in-app interception (where "back" and "the fixed trip URL" are equivalent)
 * and via the hard-nav fallback (where there's no guaranteed prior same-app history entry).
 */
/**
 * Miso header badge (AC13, design.md section 5.4) — a static, textless presence in the sheet
 * header's trailing slot, opposite the close (X). Purely decorative (`aria-hidden`), spatially
 * and functionally separate from the amount field and split-summary pill below, so it never
 * narrates or restates the per-person split amount (AC12's carve-out for a non-narrating
 * placement). Shown identically in both the normal and locked-trip header renders.
 */
function MisoBadge() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- no next/image config for public/images/* yet (architecture.md); a plain <img> is fine for this pass.
    <img
      src="/images/miso_01.jpg"
      alt=""
      aria-hidden="true"
      width={26}
      height={26}
      className="block size-[26px] flex-none shadow-card-sm"
    />
  );
}

export function AddExpenseSheetContent({ tripId: id }: { tripId: string }) {
  const router = useRouter();
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [locked, setLocked] = useState<boolean | null>(null);
  const [ownerGateBlocked, setOwnerGateBlocked] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayIso());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackEvent("expense_add_start");
  }, []);

  // Resume intent: if this add-expense attempt was redirected out to the OTP trigger and back
  // (see design.md section 4 "Resuming intent"), restore whatever was typed before the redirect
  // instead of leaving the form blank.
  useEffect(() => {
    const draft = takePendingExpenseDraft(id);
    if (draft) {
      // Restoring from sessionStorage, an external system unreadable during the initial render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAmount(draft.amount);
      setDescription(draft.description);
      setDate(draft.date);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      timeClient("add-expense", "gating.getUser", () => supabase.auth.getUser()),
      timeClient("add-expense", "gating.trip_members", () =>
        supabase.from("trip_members").select("id", { count: "exact", head: true }).eq("trip_id", id),
      ),
      timeClient("add-expense", "gating.trips", () =>
        supabase.from("trips").select("completed_at, created_by").eq("id", id).single(),
      ),
    ])
      .then(([userResult, membersResult, tripResult]) => {
        if (cancelled) return;
        const user = userResult.data.user;
        // Direct-URL guard (design.md section 4.0): the trip page hides this screen's own entry
        // point (the BottomBar's "Add an expense" button) from an unverified owner, but hiding a
        // link doesn't stop a typed or bookmarked URL from reaching this route directly — that must
        // itself redirect back. An invitee (verified or not) is never the trip's owner, so this
        // never fires for their unchanged flow — see `isUnverifiedOwner`.
        //
        // Fail closed (pre-push review fix): if the trips query errored or came back empty (RLS
        // denial, transient failure), `tripResult.data` is null/undefined and the ownership
        // comparison below would otherwise silently resolve to `false` — treating an unverified
        // owner hitting this exact failure mode as "not the owner" and letting the gate never
        // fire. Since we can't determine ownership in that case, treat it as "could be the
        // unverified owner" instead.
        const isOwner = tripResult.error || !tripResult.data ? true : user?.id === tripResult.data.created_by;
        if (isUnverifiedOwner(user, isOwner)) {
          setOwnerGateBlocked(true);
          router.replace(`/trip/${id}`);
          return;
        }
        setMemberCount(membersResult.count ?? 1);
        setLocked(Boolean(tripResult.data?.completed_at));
      })
      .catch(() => {
        // Same fail-closed reasoning as above, for the case where the queries themselves reject
        // (network error, etc.) rather than resolving with a postgrest error — we have no signal
        // at all here, so redirect to be safe rather than rendering the form.
        if (cancelled) return;
        setOwnerGateBlocked(true);
        router.replace(`/trip/${id}`);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const amountCents = Math.round((parseFloat(amount || "0") || 0) * 100);
  const splitCents = memberCount ? Math.round(amountCents / memberCount) : 0;

  async function handleSubmit() {
    if (!isValidExpenseInput(amountCents, description) || (date && !isValidExpenseDate(date))) {
      const missing: string[] = [];
      if (amountCents <= 0) missing.push("an amount");
      if (description.trim().length === 0) missing.push("what it was for");
      if (date && !isValidExpenseDate(date)) missing.push("a valid date (today or earlier)");
      setError(`Enter ${missing.join(", ")}.`);
      return;
    }
    setError(null);
    setSubmitting(true);
    // Click-to-navigate span (performance-scaling ADR 0010): the client-perceived total for this
    // submit, from click to the point the app hands off to the trip page's own render.
    const navigateSpanStart = performance.now();
    try {
      const supabase = createClient();

      // Performance-scaling architecture.md's "Add/edit-expense" fix (1): this used to call
      // `supabase.auth.getUser()` twice back-to-back — once inside `requireVerifiedSession`, then
      // again immediately after just to read `user.id` for `paidBy` — two identical, back-to-back
      // client-to-Supabase-Auth round trips doing the same lookup. Fetching `user` once and
      // passing it into `requireVerifiedSession` removes the redundant second call with no
      // behavior change.
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // The mutation gate (simplified-onboarding): adding an expense is the trigger, not
      // viewing/filling out this screen — see docs/features/simplified-onboarding/design.md
      // section 4. The organizer only gets here once they've already typed the whole expense.
      if (!(await requireVerifiedSession(supabase, user))) {
        savePendingExpenseDraft(id, { amount, description, date });
        const next = encodeURIComponent(`/trip/${id}/add-expense`);
        router.push(`/check-email?trigger=invitee-expense&next=${next}&back=${next}`);
        return;
      }
      if (!user) throw new Error("Not signed in.");

      await timeClient("add-expense", "addExpense", () =>
        addExpense(supabase, {
          tripId: id,
          paidBy: user.id,
          amountCents,
          description: description.trim(),
          date: date || undefined,
        }),
      );

      trackEvent("expense_add_complete");
      reportClientTiming("add-expense", "clickToNavigate", performance.now() - navigateSpanStart);
      // router.push alone can land back on a stale client-cached copy of the trip page (the user
      // was just there moments ago, before opening this sheet) — refresh reconciles the server-
      // rendered expense list/balances with what was just inserted. Same pattern as verify-inline.tsx.
      router.push(`/trip/${id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that expense — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (ownerGateBlocked) {
    return (
      <ScreenContent className="pt-14">
        <p className="text-[15px] text-ink/70">Redirecting…</p>
      </ScreenContent>
    );
  }

  if (locked) {
    return (
      <ScreenContent>
        <TopBar
          title="Add an expense"
          leading={
            <IconLinkButton href={`/trip/${id}`} aria-label="Close">
              <CloseIcon size={18} strokeWidth={2.3} />
            </IconLinkButton>
          }
          trailing={<MisoBadge />}
        />
        <div className="h-6" />
        <div
          className="flex size-[46px] items-center justify-center rounded-[16px]"
          style={{ background: "var(--color-terracotta-soft)", color: "var(--color-terracotta)" }}
        >
          <LockIcon size={22} />
        </div>
        <div className="h-4" />
        <p className="max-w-[290px] text-[14.5px] leading-[1.5] text-ink/[0.73]">
          This trip is locked — the organizer already settled it up, so no more expenses can be
          added.
        </p>
      </ScreenContent>
    );
  }

  return (
    <ScreenContent>
      <TopBar
        title="Add an expense"
        leading={
          <IconLinkButton href={`/trip/${id}`} aria-label="Close">
            <CloseIcon size={18} strokeWidth={2.3} />
          </IconLinkButton>
        }
        trailing={<MisoBadge />}
      />
      <div className="h-3.5" />
      <p className="max-w-[290px] text-[14px] leading-[1.5] text-ink/[0.73]">
        Splits equally across everyone on the trip. You only log what{" "}
        <strong className="font-semibold">you</strong> paid for.
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
        <Kicker>
          Date
          <span className="font-normal normal-case tracking-normal text-ink/60"> — optional, defaults to today</span>
        </Kicker>
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
        style={{ background: "var(--color-terracotta-soft)" }}
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
        <PlusIcon size={19} strokeWidth={2.6} />
        {submitting ? "Adding…" : "Add an expense"}
      </Button>
    </ScreenContent>
  );
}
