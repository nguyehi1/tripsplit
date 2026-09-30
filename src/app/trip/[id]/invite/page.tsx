"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckIcon, CloseIcon, CopyIcon, PencilIcon, PlusIcon, ShareIcon } from "@/components/icons";
import { Avatar, BottomBar, Button, Card, Kicker, LockedNoticeInline, Screen, ScreenContent, ScreenError, ScreenLoading } from "@/components/ui";
import { isUnverifiedOwner } from "@/lib/auth-gate";
import { displayNameFor } from "@/lib/avatar";
import {
  addPlaceholderMember,
  getTripView,
  leaveTrip,
  removePlaceholderMember,
  removeTripMember,
  renamePlaceholderMember,
  type TripView,
} from "@/lib/data/trips";
import { LOCKED_TRIP_COPY } from "@/lib/locked-trip-copy";
import { trackEvent } from "@/lib/tracking";
import { createClient } from "@/lib/supabase/client";

const MAX_PLACEHOLDERS = 20;

export default function TripInvitePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [userId, setUserId] = useState<string | null>(null);
  const [view, setView] = useState<TripView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removeSubmitting, setRemoveSubmitting] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Organizer-removes-a-real-member / self-leave (remove-member-access) — a parallel confirm
  // state machine to the placeholder one above, same shape (confirmRemoveId ->
  // startRemove/cancelRemove/handleRemoveConfirm). Which action a given row's confirm state means
  // ("remove" vs "leave") is derived from context at render/submit time (organizer confirming
  // someone else's row vs. a member confirming their own), not stored separately — a row can only
  // ever offer one of the two actions.
  const [confirmMemberId, setConfirmMemberId] = useState<string | null>(null);
  const [memberActionSubmitting, setMemberActionSubmitting] = useState(false);
  const [memberActionError, setMemberActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(async ({ data: { user } }) => {
        if (!user) throw new Error("Not signed in.");
        if (!cancelled) setUserId(user.id);
        const result = await getTripView(supabase, id, user.id);
        // Direct-URL guard (design.md section 4.0): the trip page hides this screen's own entry
        // point (the roster/Invite icon) from an unverified owner, but hiding a link doesn't stop
        // a typed or bookmarked URL from reaching this route directly — that must itself redirect
        // back. `view.you?.isOrganizer` is the same ownership signal the rest of this screen
        // already uses (e.g. for the placeholder controls below); a verified or unverified
        // invitee is never the owner, so this never fires for their unchanged flow.
        if (isUnverifiedOwner(user, Boolean(result?.you?.isOrganizer))) {
          router.replace(`/trip/${id}`);
          return null;
        }
        return result;
      })
      .then((result) => {
        if (!cancelled && result) setView(result);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this trip.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reloadKey]);

  async function refresh() {
    if (!userId) return;
    const supabase = createClient();
    setView(await getTripView(supabase, id, userId));
  }

  const inviteUrl = view ? `${window.location.origin}/join/${view.trip.inviteCode}` : "";

  /**
   * Copy/share and placeholder-member management (add/rename/remove) used to be gated by an
   * attempt-then-redirect-to-check-email-then-resume dance (`requireVerifiedSession` +
   * `pending-action.ts`'s now-removed `PendingInviteAction`/`PendingPlaceholderAction`). Decision
   * 12 removed that: this screen's own entry point (the trip page's roster/Invite icon) is now
   * hidden entirely until the organizer's session is verified (see
   * `src/app/trip/[id]/verify-inline.tsx`), so there is no unverified caller left to gate against
   * in practice — the RPCs themselves (migration 0010) remain independently guarded server-side
   * as defense-in-depth. See docs/features/simplified-onboarding/architecture.md's "Update:
   * hide-and-reveal replaces attempt-then-redirect for the organizer".
   */
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      trackEvent("member_invite_send");
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
        trackEvent("member_invite_send");
      } catch {
        // user cancelled — no-op
      }
    } else {
      copyLink();
    }
  }

  async function handleAdd() {
    const trimmed = addName.trim();
    if (!trimmed) {
      setAddName("");
      return;
    }
    setAddSubmitting(true);
    setAddError(null);
    try {
      const supabase = createClient();
      await addPlaceholderMember(supabase, { tripId: id, displayName: trimmed });
      trackEvent("member_placeholder_add");
      setAddName("");
      await refresh();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Couldn't add that — try again.");
    } finally {
      setAddSubmitting(false);
    }
  }

  function startRename(memberId: string, currentName: string) {
    setConfirmRemoveId(null);
    setRenamingId(memberId);
    setRenameValue(currentName);
    setRenameError(null);
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue("");
    setRenameError(null);
  }

  async function handleRenameSave(memberId: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError("Name can't be empty.");
      return;
    }
    setRenameSubmitting(true);
    setRenameError(null);
    try {
      const supabase = createClient();
      await renamePlaceholderMember(supabase, { memberId, displayName: trimmed });
      setRenamingId(null);
      setRenameValue("");
      await refresh();
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : "Couldn't save that name — try again.");
    } finally {
      setRenameSubmitting(false);
    }
  }

  function startRemove(memberId: string) {
    setRenamingId(null);
    setConfirmRemoveId(memberId);
    setRemoveError(null);
  }

  function cancelRemove() {
    setConfirmRemoveId(null);
    setRemoveError(null);
  }

  async function handleRemoveConfirm(memberId: string) {
    setRemoveSubmitting(true);
    setRemoveError(null);
    try {
      const supabase = createClient();
      await removePlaceholderMember(supabase, memberId);
      setConfirmRemoveId(null);
      await refresh();
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : "Couldn't remove them — try again.");
    } finally {
      setRemoveSubmitting(false);
    }
  }

  function startMemberAction(memberId: string) {
    setRenamingId(null);
    setConfirmRemoveId(null);
    setConfirmMemberId(memberId);
    setMemberActionError(null);
  }

  function cancelMemberAction() {
    setConfirmMemberId(null);
    setMemberActionError(null);
  }

  async function handleMemberActionConfirm(memberId: string) {
    const isSelf = memberId === view?.you?.id;
    setMemberActionSubmitting(true);
    setMemberActionError(null);
    try {
      const supabase = createClient();
      if (isSelf) {
        await leaveTrip(supabase, id);
        // The actor just lost their own access to this screen — full navigation to /trips
        // (design.md section 3 step 4), carrying the trip name for that screen's one-line
        // confirmation banner.
        router.push(`/trips?left=${encodeURIComponent(view?.trip.name ?? "")}`);
        return;
      }
      await removeTripMember(supabase, memberId);
      setConfirmMemberId(null);
      await refresh();
    } catch (e) {
      const fallback = isSelf ? "Couldn't leave the trip — try again." : "Couldn't remove them — try again.";
      setMemberActionError(e instanceof Error ? e.message : fallback);
    } finally {
      setMemberActionSubmitting(false);
    }
  }

  if (error) {
    return (
      <Screen>
        <ScreenError message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      </Screen>
    );
  }

  if (!view) {
    return (
      <Screen>
        <ScreenLoading label="Loading your trip…" />
      </Screen>
    );
  }

  const realMembers = view.members.filter((m) => !m.isPlaceholder);
  const placeholders = view.members.filter((m) => m.isPlaceholder);
  const isOrganizer = Boolean(view.you?.isOrganizer);
  const locked = view.trip.isCompleted;
  const atCap = placeholders.length >= MAX_PLACEHOLDERS;

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
          {view.trip.name}
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
            <Button variant="accent" block={false} className="h-[46px] flex-1 text-[14.5px]" onClick={copyLink}>
              <CopyIcon size={17} strokeWidth={2.2} />
              {copied ? "Copied!" : "Copy link"}
            </Button>
            <Button variant="soft" block={false} className="h-[46px] flex-1 text-[14.5px]" onClick={shareLink}>
              <ShareIcon size={17} strokeWidth={2.2} />
              Share
            </Button>
          </div>
        </Card>
        <div className="h-4" />

        <div className="flex items-baseline justify-between px-1">
          <Kicker>On the trip</Kicker>
          <Kicker>{realMembers.length === 1 ? "Just you" : `${realMembers.length} people`}</Kicker>
        </div>
        <div className="h-2" />
        {realMembers.map((member) => {
          const canRemove = isOrganizer && !member.isOrganizer && !locked;
          const canLeave = !isOrganizer && member.id === view.you?.id && !locked;
          return (
            <div key={member.id} className="mb-2.5">
              <Card className="p-[14px_18px]">
                {confirmMemberId === member.id ? (
                  canLeave ? (
                    <div>
                      <p className="text-[14px] font-semibold">Leave {view.trip.name}?</p>
                      <p className="mt-1 text-[13px] leading-[1.45] text-ink/[0.73]">
                        You&apos;ll lose access to this trip&apos;s expenses and roster. Your past
                        expenses stay in the trip exactly as they are. If you change your mind,
                        you can rejoin using the same invite link.
                      </p>
                      {memberActionError ? (
                        <p className="mt-1.5 text-[12.5px] text-terracotta">{memberActionError}</p>
                      ) : null}
                      <div className="mt-2.5 flex gap-2">
                        <Button
                          variant="soft"
                          block={false}
                          className="h-[38px] flex-1 text-[13px]"
                          onClick={cancelMemberAction}
                          disabled={memberActionSubmitting}
                        >
                          Stay
                        </Button>
                        <Button
                          variant="ghost"
                          block={false}
                          className="h-[38px] flex-1 text-[13px]"
                          style={{ color: "var(--color-terracotta)" }}
                          onClick={() => handleMemberActionConfirm(member.id)}
                          disabled={memberActionSubmitting}
                        >
                          {memberActionSubmitting ? "Leaving…" : "Leave trip"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[14px] font-semibold">
                        Remove {member.displayName} from this trip?
                      </p>
                      <p className="mt-1 text-[13px] leading-[1.45] text-ink/[0.73]">
                        They&apos;ll lose access to this trip&apos;s expenses and roster. Everyone
                        else&apos;s split will update to cover the total without them. If they
                        still have the invite link, they can rejoin the same way they joined —
                        removing them doesn&apos;t cancel the link.
                      </p>
                      {memberActionError ? (
                        <p className="mt-1.5 text-[12.5px] text-terracotta">{memberActionError}</p>
                      ) : null}
                      <div className="mt-2.5 flex gap-2">
                        <Button
                          variant="soft"
                          block={false}
                          className="h-[38px] flex-1 text-[13px]"
                          onClick={cancelMemberAction}
                          disabled={memberActionSubmitting}
                        >
                          Keep them
                        </Button>
                        <Button
                          variant="ghost"
                          block={false}
                          className="h-[38px] flex-1 text-[13px]"
                          style={{ color: "var(--color-terracotta)" }}
                          onClick={() => handleMemberActionConfirm(member.id)}
                          disabled={memberActionSubmitting}
                        >
                          {memberActionSubmitting ? "Removing…" : "Remove"}
                        </Button>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="flex items-center gap-[11px]">
                    <Avatar initials={member.initials} color={member.avatar} />
                    <div className="flex-1">
                      <div className="text-[15px] font-semibold">{member.displayName}</div>
                      <div className="mt-px text-[12px] text-ink/[0.72]">
                        {member.isOrganizer ? "Organizer" : "Member"}
                        {member.id === view.you?.id ? " · you" : ""}
                      </div>
                    </div>
                    {canRemove ? (
                      <button
                        type="button"
                        title="Remove"
                        onClick={() => startMemberAction(member.id)}
                        className="flex size-9 flex-none cursor-pointer items-center justify-center rounded-full text-ink/60"
                      >
                        <CloseIcon size={15} strokeWidth={2.2} />
                      </button>
                    ) : null}
                    {canLeave ? (
                      <button
                        type="button"
                        onClick={() => startMemberAction(member.id)}
                        className="flex-none cursor-pointer text-[13px] font-semibold text-ink/60"
                      >
                        Leave trip
                      </button>
                    ) : null}
                  </div>
                )}
              </Card>
            </div>
          );
        })}
        {realMembers.length === 1 ? (
          <div className="flex items-center gap-[11px] rounded-[22px] border-[1.5px] border-dashed border-ink/20 px-[18px] py-3.5">
            <span className="flex size-9 flex-none items-center justify-center rounded-full bg-ink/[0.06] text-ink/[0.68]">
              <PlusIcon size={18} strokeWidth={2.2} />
            </span>
            <div className="text-[13.5px] text-ink/[0.72]">Waiting on everyone else</div>
          </div>
        ) : null}

        {isOrganizer || placeholders.length > 0 ? (
          <>
            <div className="h-5" />
            <div className="flex items-baseline justify-between px-1">
              <Kicker>Placeholders</Kicker>
              <Kicker>{isOrganizer ? `${placeholders.length}/${MAX_PLACEHOLDERS}` : `${placeholders.length}`}</Kicker>
            </div>
            <div className="h-2" />

            {placeholders.map((member) => (
              <div key={member.id} className="mb-2.5">
                <Card className="p-[14px_18px]">
                  {confirmRemoveId === member.id ? (
                    <div>
                      <p className="text-[13.5px] leading-[1.4] text-ink/80">
                        Remove {displayNameFor(member.displayName, true)}? This changes everyone&apos;s split.
                      </p>
                      {removeError ? <p className="mt-1.5 text-[12.5px] text-terracotta">{removeError}</p> : null}
                      <div className="mt-2.5 flex gap-2">
                        <Button
                          variant="soft"
                          block={false}
                          className="h-[38px] flex-1 text-[13px]"
                          onClick={cancelRemove}
                          disabled={removeSubmitting}
                        >
                          Keep them
                        </Button>
                        <Button
                          variant="ghost"
                          block={false}
                          className="h-[38px] flex-1 text-[13px]"
                          style={{ color: "var(--color-terracotta)" }}
                          onClick={() => handleRemoveConfirm(member.id)}
                          disabled={removeSubmitting}
                        >
                          {removeSubmitting ? "Removing…" : "Remove"}
                        </Button>
                      </div>
                    </div>
                  ) : renamingId === member.id ? (
                    <div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onFocus={(e) => e.target.scrollIntoView({ block: "center" })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameSave(member.id);
                            if (e.key === "Escape") cancelRename();
                          }}
                          className="h-[42px] flex-1 rounded-[12px] bg-ink/[0.05] px-3 text-[15px] font-semibold outline-none"
                        />
                        <button
                          type="button"
                          title="Save"
                          onClick={() => handleRenameSave(member.id)}
                          disabled={renameSubmitting || !renameValue.trim()}
                          className="flex size-9 flex-none cursor-pointer items-center justify-center rounded-full bg-ink text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <CheckIcon size={16} strokeWidth={2.6} />
                        </button>
                        <button
                          type="button"
                          title="Cancel"
                          onClick={cancelRename}
                          disabled={renameSubmitting}
                          className="flex size-9 flex-none cursor-pointer items-center justify-center rounded-full bg-ink/[0.06] text-ink/70"
                        >
                          <CloseIcon size={16} strokeWidth={2.4} />
                        </button>
                      </div>
                      {renameError ? <p className="mt-1.5 text-[12.5px] text-terracotta">{renameError}</p> : null}
                    </div>
                  ) : (
                    <div className="flex items-center gap-[11px]">
                      <Avatar initials={member.initials} color={member.avatar} />
                      <div className="flex-1">
                        <div className="text-[15px] font-semibold">
                          {displayNameFor(member.displayName, true)}
                        </div>
                        <div className="mt-px text-[12px] text-ink/[0.72]">Placeholder</div>
                        {isOrganizer && !locked ? (
                          <div className="mt-1 text-[11.5px] leading-[1.4] text-ink/60">
                            Remove this once {member.displayName} joins for real — Splitiful
                            won&apos;t do it automatically.
                          </div>
                        ) : null}
                      </div>
                      {isOrganizer && !locked ? (
                        <div className="flex flex-none gap-1.5">
                          <button
                            type="button"
                            title="Rename"
                            onClick={() => startRename(member.id, member.displayName)}
                            className="flex size-9 cursor-pointer items-center justify-center rounded-full text-ink/60"
                          >
                            <PencilIcon size={15} strokeWidth={2.2} />
                          </button>
                          <button
                            type="button"
                            title="Remove"
                            onClick={() => startRemove(member.id)}
                            className="flex size-9 cursor-pointer items-center justify-center rounded-full text-ink/60"
                          >
                            <CloseIcon size={15} strokeWidth={2.2} />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </Card>
              </div>
            ))}

            {isOrganizer ? (
              locked ? (
                <LockedNoticeInline>{LOCKED_TRIP_COPY.roster.long}</LockedNoticeInline>
              ) : atCap ? (
                <div className="flex items-center justify-center rounded-[22px] bg-ink/[0.06] px-[18px] py-3.5 text-center text-[13.5px] text-ink/60">
                  {MAX_PLACEHOLDERS}/{MAX_PLACEHOLDERS} placeholders — remove one to add another
                </div>
              ) : addOpen ? (
                <Card className="p-[14px_18px]">
                  <Kicker>Name</Kicker>
                  <div className="h-1.5" />
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      autoFocus
                      enterKeyHint="done"
                      placeholder="e.g. Dad, Aunt Lin, Jordan"
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      onFocus={(e) => e.target.scrollIntoView({ block: "center" })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAdd();
                      }}
                      className="h-[42px] flex-1 rounded-[12px] bg-ink/[0.05] px-3 text-[15px] font-medium outline-none placeholder:font-normal placeholder:text-ink/45"
                    />
                    <Button
                      variant="primary"
                      block={false}
                      className="h-[42px] px-4 text-[13.5px]"
                      onClick={handleAdd}
                      disabled={addSubmitting || !addName.trim()}
                    >
                      {addSubmitting ? "Adding…" : "Add"}
                    </Button>
                  </div>
                  {addError ? <p className="mt-2 text-[12.5px] text-terracotta">{addError}</p> : null}
                </Card>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="flex w-full cursor-pointer items-center gap-[11px] rounded-[22px] border-[1.5px] border-dashed border-ink/20 px-[18px] py-3.5 text-left"
                >
                  <span className="flex size-9 flex-none items-center justify-center rounded-full bg-ink/[0.06] text-ink/[0.68]">
                    <PlusIcon size={18} strokeWidth={2.2} />
                  </span>
                  <div className="text-[13.5px] text-ink/[0.72]">Add a placeholder member</div>
                </button>
              )
            ) : null}
          </>
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
