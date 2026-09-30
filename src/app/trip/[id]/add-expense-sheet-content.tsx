"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CloseIcon, PlusIcon } from "@/components/icons";
import { Button, Card, Divider, IconLinkButton, Kicker, LockedNotice, ScreenContent, TopBar } from "@/components/ui";
import { isUnverifiedOwner, redirectToVerify, requireVerifiedSession } from "@/lib/auth-gate";
import { addExpenseWithShoppingItems } from "@/lib/data/shopping-list";
import { addExpense } from "@/lib/data/trips";
import { todayIso } from "@/lib/dates";
import { LOCKED_TRIP_COPY } from "@/lib/locked-trip-copy";
import { savePendingExpenseDraft, takePendingExpenseDraft } from "@/lib/pending-action";
import { reportClientTiming, timeClient } from "@/lib/perf/timing";
import { trackEvent } from "@/lib/tracking";
import { createClient } from "@/lib/supabase/client";
import { isValidExpenseDate, isValidExpenseInput } from "@/lib/validation/expense";

type ClaimedItem = { id: string; description: string };
/** A pill's tracked, appended fragment — design.md section 6's merge algorithm. `itemId` (not
 *  text-matching) is the single source of truth for "which items are selected," per
 *  architecture.md section 3's explicit requirement that `selectedItemIds` be tracked
 *  independently of the text field, since it's exactly the array passed to
 *  `addExpenseWithShoppingItems`. */
type PillFragment = { itemId: string; name: string };

function composeDescription(handTyped: string, fragments: PillFragment[]): string {
  if (fragments.length === 0) return handTyped;
  const joined = fragments.map((f) => f.name).join(", ");
  return handTyped.length > 0 ? `${handTyped}, ${joined}` : joined;
}

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
export function AddExpenseSheetContent({ tripId: id }: { tripId: string }) {
  const router = useRouter();
  const [locked, setLocked] = useState<boolean | null>(null);
  const [ownerGateBlocked, setOwnerGateBlocked] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayIso());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The "From your bag" block (design-reference Screen 4, design.md sections 5/6) — the
  // description field's hand-typed prefix and the ordered, per-item-id-tracked pill fragments
  // appended after it. `description` itself stays the single controlled input value, always kept
  // equal to `composeDescription(handTyped, fragments)` by every setter below.
  const [handTyped, setHandTyped] = useState("");
  const [fragments, setFragments] = useState<PillFragment[]>([]);
  const [claimedItems, setClaimedItems] = useState<ClaimedItem[] | null>(null);
  const [claimedItemsError, setClaimedItemsError] = useState(false);
  const [showClaimedItemsSkeleton, setShowClaimedItemsSkeleton] = useState(false);

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
      setHandTyped(draft.description);
      setDate(draft.date);
    }
  }, [id]);

  // Design.md section 5's "loading claimed items" state: no skeleton for the first ~1s (most
  // loads resolve well within that), only shown if the fetch below is still unresolved past it.
  useEffect(() => {
    const timer = setTimeout(() => setShowClaimedItemsSkeleton(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    // Performance-scaling architecture.md's "Add/edit-expense" fix (1), extended here
    // (architecture.md section 4): `user` is resolved first, then member count / trip lock /
    // "my claimed-unlogged items on this trip" fetch concurrently — the last two keyed off
    // `user.id`. The existing ownership/redirect/lock logic below this point is otherwise
    // untouched, only reordered.
    timeClient("add-expense", "gating.getUser", () => supabase.auth.getUser())
      .then(async (userResult) => {
        if (cancelled) return;
        const user = userResult.data.user;

        const [tripResult, claimedResult] = await Promise.all([
          timeClient("add-expense", "gating.trips", () =>
            supabase.from("trips").select("completed_at, created_by").eq("id", id).single(),
          ),
          user
            ? timeClient("add-expense", "gating.own_member_id", () =>
                supabase.from("trip_members").select("id").eq("trip_id", id).eq("user_id", user.id).maybeSingle(),
              )
            : Promise.resolve({ data: null, error: null }),
        ]);
        if (cancelled) return;

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
        setLocked(Boolean(tripResult.data?.completed_at));

        // "From your bag" (design-reference Screen 4): RLS's existing select policy already
        // permits reading the caller's own claimed-unlogged items directly — no RPC needed, same
        // as every other read in this app. A fetch failure degrades to the non-blocking "Couldn't
        // load your bag" line (design.md section 5) rather than ever blocking this form — kept in
        // its own try/catch so it can never trip the outer fail-closed owner-gate redirect below.
        try {
          const ownMemberId = claimedResult.data?.id ?? null;
          if (!ownMemberId) {
            setClaimedItems([]);
            return;
          }
          const itemsResult = await timeClient("add-expense", "gating.claimed_items", () =>
            supabase
              .from("shopping_list_items")
              .select("id, description")
              .eq("trip_id", id)
              .eq("status", "claimed")
              .eq("claimed_by", ownMemberId)
              .order("created_at", { ascending: true }),
          );
          if (cancelled) return;
          if (itemsResult.error) throw itemsResult.error;
          setClaimedItems(itemsResult.data ?? []);
        } catch {
          if (cancelled) return;
          setClaimedItemsError(true);
          setClaimedItems([]);
        }
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

  /**
   * Design.md section 6's resolved merge algorithm. `description` is always kept equal to
   * `composeDescription(handTyped, fragments)`; a manual edit either falls within the hand-typed
   * prefix (the common case — just update `handTyped`, fragments untouched) or disturbs the
   * pill-owned suffix, in which case every currently-tracked fragment is detached and the whole
   * field becomes ordinary free text (rule 3) — see the module comment on `PillFragment` for why
   * per-fragment-precise detection of *which single* pill was touched is out of scope here.
   */
  function handleDescriptionChange(nextValue: string) {
    if (fragments.length === 0) {
      setHandTyped(nextValue);
      setDescription(nextValue);
      return;
    }
    const suffix = description.slice(handTyped.length);
    if (nextValue.length >= suffix.length && nextValue.slice(nextValue.length - suffix.length) === suffix) {
      setHandTyped(nextValue.slice(0, nextValue.length - suffix.length));
      setDescription(nextValue);
      return;
    }
    setFragments([]);
    setHandTyped(nextValue);
    setDescription(nextValue);
  }

  function togglePill(item: ClaimedItem) {
    const isSelected = fragments.some((f) => f.itemId === item.id);
    const nextFragments = isSelected
      ? fragments.filter((f) => f.itemId !== item.id)
      : [...fragments, { itemId: item.id, name: item.description }];
    setFragments(nextFragments);
    setDescription(composeDescription(handTyped, nextFragments));
  }

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
        redirectToVerify(router, "invitee-expense", `/trip/${id}/add-expense`);
        return;
      }
      if (!user) throw new Error("Not signed in.");

      // Zero selected shopping-list items -> the existing addExpense call, byte-for-byte
      // unchanged (requirements' "skip the list continues to work unchanged" AC, satisfied by
      // construction here rather than by testing after the fact — architecture.md section 4).
      // One or more selected -> the atomic add_expense_and_log_shopping_items RPC instead.
      const selectedItemIds = fragments.map((f) => f.itemId);
      if (selectedItemIds.length === 0) {
        await timeClient("add-expense", "addExpense", () =>
          addExpense(supabase, {
            tripId: id,
            paidBy: user.id,
            amountCents,
            description: description.trim(),
            date: date || undefined,
          }),
        );
      } else {
        await timeClient("add-expense", "addExpenseWithShoppingItems", () =>
          addExpenseWithShoppingItems(supabase, {
            tripId: id,
            amountCents,
            description: description.trim(),
            date: date || undefined,
            itemIds: selectedItemIds,
          }),
        );
      }

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
          trailing={
            <IconLinkButton href={`/trip/${id}`} aria-label="Close">
              <CloseIcon size={18} strokeWidth={2.3} />
            </IconLinkButton>
          }
        />
        <div className="h-6" />
        <LockedNotice>{LOCKED_TRIP_COPY.expenses.long}</LockedNotice>
      </ScreenContent>
    );
  }

  return (
    <ScreenContent>
      <TopBar
        title="Add an expense"
        trailing={
          <IconLinkButton href={`/trip/${id}`} aria-label="Close">
            <CloseIcon size={18} strokeWidth={2.3} />
          </IconLinkButton>
        }
      />
      <div className="h-3.5" />
      <p className="max-w-[290px] text-[14px] leading-[1.5] text-ink/[0.73]">
        Splits equally across everyone on the trip. You only log what{" "}
        <strong className="font-semibold">you</strong> paid for.
      </p>
      <div className="h-[18px]" />

      {claimedItemsError ? (
        <>
          <p className="text-[13px] text-ink/60">
            Couldn&apos;t load your bag — you can still add this expense the usual way.
          </p>
          <div className="h-4" />
        </>
      ) : claimedItems === null ? (
        showClaimedItemsSkeleton ? (
          <>
            <Kicker>From your bag</Kicker>
            <div className="h-2" />
            <div className="flex gap-2">
              <div className="h-9 w-24 animate-pulse rounded-full bg-ink/[0.06]" />
              <div className="h-9 w-20 animate-pulse rounded-full bg-ink/[0.06]" />
            </div>
            <div className="h-4" />
          </>
        ) : null
      ) : claimedItems.length === 0 ? null : (
        <>
          <div className="flex items-baseline justify-between">
            <Kicker>From your bag</Kicker>
            <Kicker>
              {fragments.length} of {claimedItems.length} selected
            </Kicker>
          </div>
          <div className="h-2" />
          <div className="flex flex-wrap gap-2">
            {claimedItems.map((item) => {
              const selected = fragments.some((f) => f.itemId === item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={submitting}
                  onClick={() => togglePill(item)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
                    selected ? "bg-accent text-white" : "bg-ink/[0.06] text-ink/80"
                  }`}
                >
                  {selected ? <CheckIcon size={13} strokeWidth={3} /> : null}
                  {item.description}
                </button>
              );
            })}
          </div>
          <div className="h-4" />
        </>
      )}

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
          onChange={(e) => handleDescriptionChange(e.target.value)}
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

      {error ? <p className="mt-3 text-[13px] text-terracotta">{error}</p> : null}
      <div className="h-4" />

      <Button variant="primary" className="text-[16px]" onClick={handleSubmit} disabled={submitting}>
        <PlusIcon size={19} strokeWidth={2.6} />
        {submitting ? "Adding…" : "Add an expense"}
      </Button>
    </ScreenContent>
  );
}
