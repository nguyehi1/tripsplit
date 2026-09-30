"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloseIcon, LockIcon, PlusIcon } from "@/components/icons";
import { Button, IconLinkButton, ScreenContent, TopBar } from "@/components/ui";
import { isUnverifiedOwner, requireVerifiedSession } from "@/lib/auth-gate";
import { addShoppingListItems } from "@/lib/data/shopping-list";
import { createClient } from "@/lib/supabase/client";

const MAX_FIELDS = 8;

/**
 * The "Add an item" sheet (design-reference Screen 3, design.md section 4) — reuses the exact
 * ADR 0008 scaffold `AddExpenseSheetContent` already established (shared component, intercepted
 * route + hard-nav fallback both render it, `SheetShell`/`trip-sheet-chrome.tsx` unchanged beyond
 * the one pathname-check widening). Supports one or more items in a single, atomic submission
 * (`addShoppingListItems`'s plain multi-row insert — architecture.md section 4).
 */
export function AddItemSheetContent({ tripId: id }: { tripId: string }) {
  const router = useRouter();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [locked, setLocked] = useState<boolean | null>(null);
  const [ownerGateBlocked, setOwnerGateBlocked] = useState(false);
  const [values, setValues] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(async ({ data: { user } }) => {
        if (cancelled) return;
        const [membersResult, tripResult] = await Promise.all([
          user
            ? supabase.from("trip_members").select("id").eq("trip_id", id).eq("user_id", user.id).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase.from("trips").select("completed_at, created_by").eq("id", id).single(),
        ]);
        if (cancelled) return;
        // Same direct-URL guard as add-expense-sheet-content.tsx (design.md section 4.0):
        // hiding this screen's entry point (the tab-aware BottomBar FAB) doesn't stop a typed or
        // bookmarked URL from reaching this route directly.
        const isOwner = tripResult.error || !tripResult.data ? true : user?.id === tripResult.data.created_by;
        if (isUnverifiedOwner(user, isOwner)) {
          setOwnerGateBlocked(true);
          router.replace(`/trip/${id}`);
          return;
        }
        setMemberId(membersResult.data?.id ?? null);
        setLocked(Boolean(tripResult.data?.completed_at));
      })
      .catch(() => {
        if (cancelled) return;
        setOwnerGateBlocked(true);
        router.replace(`/trip/${id}`);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const nonEmpty = values.map((v) => v.trim()).filter((v) => v.length > 0);

  function updateValue(i: number, value: string) {
    setValues((prev) => prev.map((v, idx) => (idx === i ? value : v)));
  }

  function clearValue(i: number) {
    updateValue(i, "");
  }

  function addField() {
    setValues((prev) => (prev.length >= MAX_FIELDS ? prev : [...prev, ""]));
  }

  async function handleSubmit() {
    if (nonEmpty.length === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!(await requireVerifiedSession(supabase, user))) {
        const next = encodeURIComponent(`/trip/${id}?tab=list`);
        router.push(`/check-email?trigger=invitee-shopping-list&next=${next}&back=${next}`);
        return;
      }
      if (!memberId) throw new Error("Couldn't add those — try again.");

      await addShoppingListItems(supabase, { tripId: id, addedBy: memberId, descriptions: nonEmpty });

      router.push(`/trip/${id}?tab=list`);
      router.refresh();
    } catch {
      setError("Couldn't add those — try again.");
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
          title="Add an item"
          leading={
            <IconLinkButton href={`/trip/${id}?tab=list`} aria-label="Close">
              <CloseIcon size={18} strokeWidth={2.3} />
            </IconLinkButton>
          }
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
          This trip is locked — the organizer already settled it up, so the list can&apos;t be
          changed anymore.
        </p>
      </ScreenContent>
    );
  }

  return (
    <ScreenContent>
      <TopBar
        title="Add an item"
        leading={
          <IconLinkButton href={`/trip/${id}?tab=list`} aria-label="Close">
            <CloseIcon size={18} strokeWidth={2.3} />
          </IconLinkButton>
        }
        trailing={<span className="text-[12px] text-ink/70">everyone sees them</span>}
      />
      <div className="h-3.5" />

      {values.map((value, i) => (
        <div key={i} className="mb-2.5 flex items-center gap-2 rounded-[18px] bg-white px-[18px]">
          <input
            type="text"
            enterKeyHint={i === values.length - 1 ? "done" : "next"}
            placeholder="Firewood, sunscreen, ice…"
            value={value}
            onChange={(e) => updateValue(i, e.target.value)}
            className="h-[54px] flex-1 bg-transparent text-[16px] font-medium outline-none placeholder:font-normal placeholder:text-ink/50"
          />
          {value ? (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => clearValue(i)}
              className="flex size-9 flex-none cursor-pointer items-center justify-center rounded-full text-ink/40"
            >
              <CloseIcon size={15} strokeWidth={2.2} />
            </button>
          ) : null}
        </div>
      ))}

      {values.length < MAX_FIELDS ? (
        <button
          type="button"
          onClick={addField}
          className="flex w-full cursor-pointer items-center gap-[11px] rounded-[18px] border-[1.5px] border-dashed border-ink/20 px-[18px] py-3.5 text-left"
        >
          <span className="flex size-8 flex-none items-center justify-center rounded-full bg-ink/[0.06] text-ink/[0.68]">
            <PlusIcon size={16} strokeWidth={2.2} />
          </span>
          <span className="text-[13.5px] text-ink/[0.72]">Add another item</span>
        </button>
      ) : null}

      {error ? <p className="mt-3 text-[13px] text-terracotta">{error}</p> : null}
      <div className="h-5" />

      <Button
        variant={nonEmpty.length === 0 ? "muted" : "primary"}
        className="text-[16px]"
        onClick={handleSubmit}
        disabled={submitting || nonEmpty.length === 0}
      >
        <PlusIcon size={19} strokeWidth={2.6} />
        {submitting ? "Adding…" : nonEmpty.length === 0 ? "Add an item" : `Add ${nonEmpty.length} to list`}
      </Button>
    </ScreenContent>
  );
}
