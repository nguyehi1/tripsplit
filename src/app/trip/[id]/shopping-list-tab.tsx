"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CloseIcon } from "@/components/icons";
import { Avatar, Button, Card, Kicker } from "@/components/ui";
import { redirectToVerify, requireVerifiedSession } from "@/lib/auth-gate";
import {
  addShoppingListItems,
  claimShoppingListItem,
  deleteShoppingListItem,
  unclaimShoppingListItem,
  type ShoppingListItem,
  type ShoppingListView,
} from "@/lib/data/shopping-list";
import { LOCKED_TRIP_COPY } from "@/lib/locked-trip-copy";
import { deriveSuggestions, suggestionKey, SUGGESTION_ADD_EVENT } from "@/lib/starter-suggestions";
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/tracking";
import { SuggestedCard } from "./suggested-card";
import { useTripVerification } from "./verify-inline";

const UNEXPECTED_COPY = "Couldn't do that — try refreshing the page.";

/** Reused for every claim/unclaim/delete/add attempt (architecture.md section 4) — matches
 *  `add-expense-sheet-content.tsx`'s existing attempt-then-redirect pattern exactly, with its own
 *  `invitee-shopping-list` trigger/copy on `check-email/page.tsx`. Returns `true` if the caller
 *  should proceed with the mutation, `false` if it already redirected. */
async function gateOrRedirect(router: ReturnType<typeof useRouter>, tripId: string): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (await requireVerifiedSession(supabase, user)) return true;
  redirectToVerify(router, "invitee-shopping-list", `/trip/${tripId}?tab=list`);
  return false;
}

function Caption({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={id} className="mt-px text-[12px] text-ink/[0.72]">
      {children}
    </div>
  );
}

// Row components are declared at module scope (not nested inside `ShoppingListTab`) so their
// component identity stays stable across re-renders — a component defined inside another
// component's body gets a fresh identity every render, which would make React unmount/remount
// every row (losing focus/transition state) on every claim/unclaim/delete. All per-row behavior
// is passed in as props instead of captured via closure.

function ToGetRow({
  item,
  isLast,
  verified,
  isCompleted,
  yourMemberId,
  pendingId,
  confirmDeleteId,
  deleteSubmitting,
  deleteError,
  onClaim,
  onStartDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  item: ShoppingListItem;
  isLast: boolean;
  verified: boolean;
  isCompleted: boolean;
  yourMemberId: string | null;
  pendingId: string | null;
  confirmDeleteId: string | null;
  deleteSubmitting: boolean;
  deleteError: string | null;
  onClaim: (item: ShoppingListItem) => void;
  onStartDelete: (itemId: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (item: ShoppingListItem) => void;
}) {
  const captionId = `shopping-item-caption-${item.id}`;
  const claimedByOther = item.status === "claimed";
  const canDelete = !claimedByOther && verified && !isCompleted && item.addedBy?.id === yourMemberId;
  const isConfirming = confirmDeleteId === item.id;

  return (
    <div className={`${isLast ? "" : "border-b border-ink/[0.07]"} ${claimedByOther ? "-mx-4 bg-ink/[0.04] px-4" : ""}`}>
      {isConfirming ? (
        <div className="py-[11px]">
          <p className="text-[13.5px] leading-[1.4] text-ink/80">Delete &quot;{item.description}&quot;?</p>
          {deleteError ? <p className="mt-1.5 text-[12.5px] text-terracotta">{deleteError}</p> : null}
          <div className="mt-2.5 flex gap-2">
            <Button
              variant="soft"
              block={false}
              className="h-[38px] flex-1 text-[13px]"
              onClick={onCancelDelete}
              disabled={deleteSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="ghost"
              block={false}
              className="h-[38px] flex-1 text-[13px]"
              style={{ color: "var(--color-terracotta)" }}
              onClick={() => onConfirmDelete(item)}
              disabled={deleteSubmitting}
            >
              {deleteSubmitting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 py-[11px]">
          {claimedByOther ? (
            <span aria-hidden="true">
              <Avatar initials={item.claimedBy!.initials} color={item.claimedBy!.avatar} size={24} />
            </span>
          ) : verified && !isCompleted ? (
            <button
              type="button"
              aria-label={`Claim '${item.description}'`}
              aria-describedby={captionId}
              disabled={pendingId === item.id}
              onClick={() => onClaim(item)}
              className="-m-2.5 flex size-11 flex-none cursor-pointer items-center justify-center disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="size-6 rounded-full border-[1.8px] border-ink/[0.26]" />
            </button>
          ) : (
            <span className="flex size-6 flex-none items-center justify-center">
              <span className="size-6 rounded-full border-[1.8px] border-ink/[0.26]" />
            </span>
          )}
          <div className={`min-w-0 flex-1 ${claimedByOther ? "opacity-[0.82]" : ""}`}>
            <div className="truncate text-[15px] font-semibold">{item.description}</div>
            <Caption id={captionId}>
              {claimedByOther
                ? `${item.claimedBy?.displayName ?? "Someone"}'s got this`
                : `${item.addedBy?.displayName ?? "Someone"} added`}
            </Caption>
          </div>
          {canDelete ? (
            <button
              type="button"
              aria-label={`Delete '${item.description}'`}
              onClick={() => onStartDelete(item.id)}
              className="-m-2.5 flex size-11 flex-none cursor-pointer items-center justify-center text-ink/50"
            >
              <CloseIcon size={15} strokeWidth={2.2} />
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function BagRow({
  item,
  isLast,
  verified,
  isCompleted,
  pendingId,
  onUnclaim,
}: {
  item: ShoppingListItem;
  isLast: boolean;
  verified: boolean;
  isCompleted: boolean;
  pendingId: string | null;
  onUnclaim: (item: ShoppingListItem) => void;
}) {
  const captionId = `shopping-bag-caption-${item.id}`;
  const canUnclaim = verified && !isCompleted;
  return (
    <div className={`flex items-center gap-3 py-[11px] ${isLast ? "" : "border-b border-ink/[0.07]"}`}>
      {canUnclaim ? (
        <button
          type="button"
          aria-label={`Unclaim '${item.description}'`}
          aria-describedby={captionId}
          disabled={pendingId === item.id}
          onClick={() => onUnclaim(item)}
          className="-m-2.5 flex size-11 flex-none cursor-pointer items-center justify-center disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Avatar initials={item.claimedBy!.initials} color={item.claimedBy!.avatar} size={24} />
        </button>
      ) : (
        <span aria-hidden="true">
          <Avatar initials={item.claimedBy!.initials} color={item.claimedBy!.avatar} size={24} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{item.description}</div>
        <Caption id={captionId}>{item.addedBy?.displayName ?? "Someone"} added</Caption>
      </div>
    </div>
  );
}

function BoughtRow({ item, isLast, tripId }: { item: ShoppingListItem; isLast: boolean; tripId: string }) {
  const payerName = item.claimedBy?.displayName ?? "someone";
  const content = (
    <div className={`flex items-center gap-3 py-[11px] ${isLast ? "" : "border-b border-ink/[0.07]"}`}>
      {item.claimedBy ? <Avatar initials={item.claimedBy.initials} color={item.claimedBy.avatar} size={24} /> : null}
      <div className="min-w-0 flex-1 opacity-60">
        <div className="truncate text-[15px] font-medium line-through decoration-[1.5px]">{item.description}</div>
      </div>
    </div>
  );
  if (!item.expenseId) return content;
  return (
    <Link
      href={`/trip/${tripId}/expense/${item.expenseId}/edit`}
      aria-label={`Bought by ${payerName} — tap to view the expense`}
      className="block cursor-pointer"
    >
      {content}
    </Link>
  );
}

export function ShoppingListTab({
  tripId,
  isCompleted,
  shoppingList,
  onRefresh,
  tripTypes = [],
}: {
  tripId: string;
  isCompleted: boolean;
  shoppingList: ShoppingListView | null;
  onRefresh: () => Promise<ShoppingListView | null>;
  /** The trip's catalog types in pick order; empty for older trips and Other-only trips. */
  tripTypes?: readonly string[];
}) {
  const router = useRouter();
  const { verified, pendingItem, setPendingItem, cancelPendingItem, takePendingItem, requestVerification } =
    useTripVerification();

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [raceMessage, setRaceMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Suggested card state. `pendingItem` (the tap waiting for email verification) lives in the
  // verification provider, not here, because the inline widget above the tabs must read it too.
  const [addingName, setAddingName] = useState<string | null>(null);
  const [addedName, setAddedName] = useState<string | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const cardAreaRef = useRef<HTMLDivElement>(null);
  const toGetHeadingRef = useRef<HTMLDivElement>(null);
  // Which suggestion to focus after the card re-renders (the tapped button unmounts).
  const focusAfterAddRef = useRef<string | "heading" | null>(null);

  // Leaving the List tab (this component unmounting) drops a waiting add.
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      cancelPendingItem?.();
      if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Replay: once the organizer is fully verified, add the one item they tapped. See ADR 0015.
  useEffect(() => {
    if (!verified) return;
    const slot = takePendingItem?.();
    if (!slot) return;
    void (async () => {
      // Every drop below is silent: nothing is added unless every check passes.
      if (isCompleted) return;
      const fresh = await onRefresh();
      if (!fresh?.yourMemberId) return;
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      // Same account that tapped, and verified: signing in to a different existing account swaps
      // the session without a SIGNED_OUT, so the item must not be added under it.
      if (!user || user.id !== slot.userId || !(await requireVerifiedSession(supabase, user))) return;
      // Still a current suggestion? Another member or tab may have added it meanwhile. This also
      // means the inserted text is always a catalog name, never an arbitrary in-memory string.
      const target = deriveSuggestions(
        tripTypes,
        fresh.items.map((i) => i.description),
      ).find((s) => suggestionKey(s.name) === suggestionKey(slot.name));
      if (!target) return;
      await addSuggestion(target.name, fresh.yourMemberId, supabase, true);
    })();
    // Runs only when `verified` flips; the slot is read-and-cleared above so this fires once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified]);

  useEffect(() => {
    const target = focusAfterAddRef.current;
    // Wait until the add has finished: every "+" is disabled while one is in flight, and a
    // disabled button cannot take focus.
    if (!target || addingName) return;
    focusAfterAddRef.current = null;
    if (target === "heading") {
      toGetHeadingRef.current?.focus();
    } else {
      Array.from(cardAreaRef.current?.querySelectorAll<HTMLButtonElement>("button[data-suggestion]") ?? [])
        .find((b) => b.dataset.suggestion === target)
        ?.focus();
    }
  });

  if (!shoppingList) {
    return <p className="px-1 text-[13.5px] text-ink/60">Couldn&apos;t load the list — try again in a moment.</p>;
  }

  const { toGet, yourBag, bought, yourMemberId } = shoppingList;
  const allEmpty = shoppingList.items.length === 0;
  // Derived on every render from the trip's types and what is already on the list (any status);
  // nothing is stored per suggestion. Hidden on a completed trip, where the list is frozen.
  const suggestions = isCompleted
    ? []
    : deriveSuggestions(
        tripTypes,
        shoppingList.items.map((i) => i.description),
      );

  /** Inserts one catalog name through the normal add path; the insert policy is the real gate. */
  async function addSuggestion(
    name: string,
    addedBy: string,
    supabase: ReturnType<typeof createClient>,
    replayed = false,
  ) {
    setAddingName(name);
    setAddedName(null);
    setSuggestionError(null);
    try {
      await addShoppingListItems(supabase, { tripId, addedBy, descriptions: [name] });
      trackEvent(SUGGESTION_ADD_EVENT);
      await onRefresh();
      // markVerified started a server refresh a moment earlier; a later one makes sure its result
      // cannot overwrite the post-insert list with a stale one.
      if (replayed) {
        router.refresh();
        // The widget is at the top of the page; bring the card (now without the added row) back.
        setTimeout(() => cardAreaRef.current?.scrollIntoView?.({ block: "nearest" }), 0);
      }
      setAddedName(name);
      // One timer: a second add within 4s restarts it instead of the first hiding the new notice.
      if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
      addedTimerRef.current = setTimeout(() => setAddedName(null), 4000);
    } catch {
      focusAfterAddRef.current = null;
      await onRefresh();
      setSuggestionError(
        isCompleted
          ? LOCKED_TRIP_COPY.items.long
          : typeof navigator !== "undefined" && navigator.onLine === false
            ? `Couldn't add '${name}' — check your connection and try again.`
            : `Couldn't add '${name}' — try again.`,
      );
    } finally {
      setAddingName(null);
    }
  }

  async function handleSuggestionAdd(name: string) {
    if (addingName) return;
    setSuggestionError(null);
    // Move focus to the neighbouring "+" (or the "To get" heading if the card empties) once the
    // tapped row has gone.
    const index = suggestions.findIndex((s) => s.name === name);
    focusAfterAddRef.current =
      suggestions.length <= 1 ? "heading" : (suggestions[index + 1] ?? suggestions[index - 1]).name;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!(await requireVerifiedSession(supabase, user))) {
      // The organizer, before verifying (an unverified non-owner never reaches this tab). No
      // database call and no redirect: remember the one tapped name in memory and open the
      // inline verification widget; it is added after they confirm their email.
      focusAfterAddRef.current = null;
      setPendingItem?.(name);
      requestVerification?.();
      return;
    }
    if (!shoppingList?.yourMemberId) {
      focusAfterAddRef.current = null;
      setSuggestionError(`Couldn't add '${name}' — try again.`);
      return;
    }
    await addSuggestion(name, shoppingList.yourMemberId, supabase);
  }

  async function withGate(itemId: string, kind: "claim" | "unclaim", run: () => Promise<void>) {
    if (pendingId) return;
    setPendingId(itemId);
    setRaceMessage(null);
    setActionError(null);
    try {
      const proceed = await gateOrRedirect(router, tripId);
      if (!proceed) return;
      await run();
      await onRefresh();
    } catch {
      const fresh = await onRefresh();
      const freshItem = fresh?.items.find((i) => i.id === itemId);
      // "Too slow — {name} already grabbed that." (design.md section 9) is scoped to a *claim*
      // attempt losing a race to another claimer — not a generic "someone else's claim changed"
      // signal, so it's never shown for an unclaim failure.
      if (
        kind === "claim" &&
        freshItem &&
        freshItem.status === "claimed" &&
        freshItem.claimedBy &&
        freshItem.claimedBy.id !== yourMemberId
      ) {
        setRaceMessage(`Too slow — ${freshItem.claimedBy.displayName} already grabbed that.`);
        setTimeout(() => setRaceMessage(null), 2500);
      } else {
        setActionError(isCompleted ? LOCKED_TRIP_COPY.items.long : UNEXPECTED_COPY);
      }
    } finally {
      setPendingId(null);
    }
  }

  async function handleClaim(item: ShoppingListItem) {
    await withGate(item.id, "claim", async () => {
      const supabase = createClient();
      await claimShoppingListItem(supabase, item.id);
    });
  }

  async function handleUnclaim(item: ShoppingListItem) {
    await withGate(item.id, "unclaim", async () => {
      const supabase = createClient();
      await unclaimShoppingListItem(supabase, item.id);
    });
  }

  function startDelete(itemId: string) {
    setConfirmDeleteId(itemId);
    setDeleteError(null);
  }

  function cancelDelete() {
    setConfirmDeleteId(null);
    setDeleteError(null);
  }

  async function handleDeleteConfirm(item: ShoppingListItem) {
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const proceed = await gateOrRedirect(router, tripId);
      if (!proceed) return;
      const supabase = createClient();
      await deleteShoppingListItem(supabase, item.id);
      setConfirmDeleteId(null);
      await onRefresh();
    } catch {
      const fresh = await onRefresh();
      const stillThere = fresh?.toGet.some((i) => i.id === item.id && i.status === "open");
      setDeleteError(stillThere ? (isCompleted ? LOCKED_TRIP_COPY.items.long : UNEXPECTED_COPY) : "Couldn't delete that — try again.");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  const card =
    suggestions.length > 0 ? (
      <div ref={cardAreaRef} className="pb-0.5">
        {/* 18px above the card (canvas C spacer): after the last list card, or after "Nothing on the
            list yet." on an empty list. */}
        <div className="h-[18px]" />
        {suggestionError ? (
          <>
            <p className="text-[13px] text-terracotta">{suggestionError}</p>
            <div className="h-3" />
          </>
        ) : null}
        <SuggestedCard
          suggestions={suggestions}
          unverified={!verified}
          addingName={addingName}
          waitingName={pendingItem}
          onAdd={handleSuggestionAdd}
          onCancelWaiting={() => cancelPendingItem?.()}
        />
      </div>
    ) : null;
  // The success notice floats above the bottom bar instead of sitting inline: the card is now at
  // the bottom of the page, and an inline pill above it would push every row down under the
  // thumb at the moment of the next "+" tap (design.md 16.2). The polite status line announces it.
  const floatingNotice = addedName ? (
    <div className="pointer-events-none fixed bottom-[106px] left-1/2 z-10 w-full max-w-md -translate-x-1/2 px-5" aria-hidden="true">
      <p
        className="mx-auto w-fit max-w-full rounded-[14px] px-3.5 py-2.5 text-[13px] font-medium text-white"
        style={{ background: "color-mix(in srgb, var(--color-ink) 90%, transparent)" }}
      >
        Added &apos;{addedName}&apos; — everyone on the trip can see it.
      </p>
    </div>
  ) : null;
  // Screen-reader confirmation of an add (the visible notice is aria-hidden to avoid a double announce).
  const addAnnouncement = (
    <div role="status" className="sr-only">
      {addingName ? `Adding ${addingName}…` : addedName ? `Added ${addedName} to the list.` : ""}
    </div>
  );

  if (allEmpty) {
    return (
      <>
        {addAnnouncement}
        {floatingNotice}
        <div className="px-1">
          <p className="text-[13px] text-ink/60">Nothing on the list yet.</p>
        </div>
        {card}
      </>
    );
  }

  return (
    <>
      {addAnnouncement}
      {floatingNotice}
      {raceMessage ? (
        <>
          <p className="rounded-[14px] bg-ink/[0.06] px-3.5 py-2.5 text-[13px] font-medium text-ink/80">
            {raceMessage}
          </p>
          <div className="h-3" />
        </>
      ) : null}
      {actionError ? (
        <>
          <p className="text-[13px] text-terracotta">{actionError}</p>
          <div className="h-3" />
        </>
      ) : null}

      {yourBag.length > 0 ? (
        <>
          <div className="flex items-baseline justify-between px-1">
            <Kicker>Your bag</Kicker>
          </div>
          <div className="h-2" />
          <Card className="px-4 py-[3px]">
            {yourBag.map((item, i) => (
              <BagRow
                key={item.id}
                item={item}
                isLast={i === yourBag.length - 1}
                verified={verified}
                isCompleted={isCompleted}
                pendingId={pendingId}
                onUnclaim={handleUnclaim}
              />
            ))}
          </Card>
          <div className="h-3.5" />
        </>
      ) : null}

      <div className="flex items-baseline justify-between px-1">
        <div ref={toGetHeadingRef} tabIndex={-1} className="outline-none">
          <Kicker>To get</Kicker>
        </div>
        <Kicker>tap a circle to grab it</Kicker>
      </div>
      <div className="h-2" />
      <Card className="px-4 py-[3px]">
        {toGet.length === 0 ? (
          <p className="py-3.5 text-[13.5px] text-ink/60">All caught up — nothing left to grab.</p>
        ) : (
          toGet.map((item, i) => (
            <ToGetRow
              key={item.id}
              item={item}
              isLast={i === toGet.length - 1}
              verified={verified}
              isCompleted={isCompleted}
              yourMemberId={yourMemberId}
              pendingId={pendingId}
              confirmDeleteId={confirmDeleteId}
              deleteSubmitting={deleteSubmitting}
              deleteError={deleteError}
              onClaim={handleClaim}
              onStartDelete={startDelete}
              onCancelDelete={cancelDelete}
              onConfirmDelete={handleDeleteConfirm}
            />
          ))
        )}
      </Card>

      {bought.length > 0 ? (
        <>
          <div className="h-3.5" />
          <div className="flex items-baseline justify-between px-1">
            <Kicker>Bought</Kicker>
          </div>
          <div className="h-2" />
          <Card className="px-4 py-[3px]">
            {bought.map((item, i) => (
              <BoughtRow key={item.id} item={item} isLast={i === bought.length - 1} tripId={tripId} />
            ))}
          </Card>
        </>
      ) : null}

      {card}
    </>
  );
}
