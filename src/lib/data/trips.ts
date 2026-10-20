import type { SupabaseClient } from "@supabase/supabase-js";
import { avatarColorFor, initialsFor } from "@/lib/avatar";
import { centsToDollars, dollarsToCents } from "@/lib/currency";
import { formatDayDate, todayIso } from "@/lib/dates";
import { timeAsync } from "@/lib/perf/timing";
import { computeBalances, simplifyDebts } from "@/lib/settlement";
import { ExpenseActionError, expenseActionErrorCode } from "@/lib/errors";
import { isTripType } from "@/lib/starter-suggestions";
import type { TripType } from "@/lib/starter-catalog";
import type { Database } from "@/lib/supabase/types";
import { TRIP_LIST_COLUMNS, TRIP_VIEW_COLUMNS } from "./trip-columns";

type Client = SupabaseClient<Database>;

/**
 * What `createTrip` throws. Carries only a SQLSTATE or PostgREST code, never the original
 * error's `message`, `details` or `hint`: a CHECK violation's `details` contains the whole failing
 * row (trip name, location, the typed Other text). Callers show fixed copy and must not log it.
 */
export class CreateTripError extends Error {
  readonly code: string | undefined;
  constructor(code?: string) {
    super("create_trip failed");
    this.name = "CreateTripError";
    this.code = code;
  }
}

/** PostgREST PGRST202 / Postgres 42883: the function (overload) does not exist. */
function isFunctionNotFound(code: string | undefined) {
  return code === "PGRST202" || code === "42883";
}

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

export async function createTrip(
  supabase: Client,
  input: {
    name: string;
    displayName: string;
    location?: string;
    startsOn?: string;
    endsOn?: string;
    /** Catalog types in pick order. */
    types?: TripType[];
    /** The "Other" text, already normalized and validated by the caller. */
    otherType?: string;
  },
) {
  const base = {
    _name: input.name,
    _display_name: input.displayName,
    _location: input.location ?? null,
    _starts_on: input.startsOn ?? null,
    _ends_on: input.endsOn ?? null,
  };
  const types = input.types ?? [];
  const otherType = input.otherType ?? null;

  // Nothing picked: the original five-argument call, exactly as before this feature. It works
  // with or without migration 0022.
  const wantsTypes = types.length > 0 || otherType !== null;
  let typesStored = false;
  let result = wantsTypes
    ? await supabase.rpc("create_trip", { ...base, _types: types, _other_type: otherType })
    : await supabase.rpc("create_trip", base);
  if (wantsTypes) {
    if (!result.error) {
      typesStored = true;
    } else if (isFunctionNotFound(errorCode(result.error))) {
      // Migration not applied yet (or PostgREST's schema cache not reloaded): still create the
      // trip, minus the types and the Other text. Never retried on a check violation (23514) or
      // any other error, so a rejected Other text cannot silently become a trip without it.
      result = await supabase.rpc("create_trip", base);
    }
  }
  if (result.error) throw new CreateTripError(errorCode(result.error));
  const row = result.data?.[0];
  if (!row) throw new CreateTripError();
  return { tripId: row.trip_id, inviteCode: row.invite_code, typesStored };
}

export async function getTripByInviteCode(supabase: Client, code: string) {
  const { data, error } = await supabase.rpc("get_trip_by_invite_code", { _code: code });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    tripId: row.trip_id,
    name: row.name,
    location: row.location,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    isCompleted: row.is_completed,
    organizerName: row.organizer_name,
  };
}

/**
 * Shape returned by `getTripByInviteCode`, and — as of the invite-lookup rate-limiting fix —
 * by `GET /api/trip-invite/[code]` (src/app/api/trip-invite/[code]/route.ts), which now runs
 * this function server-side instead of `/join/[code]`'s page calling it straight from the
 * browser. Exported here so that route and the page can share the type without either needing
 * a `typeof getTripByInviteCode` from a context that isn't actually calling it.
 */
export type InviteInfo = NonNullable<Awaited<ReturnType<typeof getTripByInviteCode>>>;

/** Returns the joined trip's id. */
export async function joinTrip(supabase: Client, input: { inviteCode: string; displayName: string }) {
  const { data, error } = await supabase.rpc("join_trip", {
    _invite_code: input.inviteCode,
    _display_name: input.displayName,
  });
  if (error) throw error;
  return data as string;
}

/**
 * Joins a trip by its UUID rather than its invite code (migration 0016) — for the two call
 * sites (`TripSummaryOnly`, `RemovedFromTripScreen` in `src/app/trip/[id]/page.tsx`) that only
 * ever had the trip's UUID in scope to begin with, closing the `get_trip_summary` invite-code
 * leak (docs/product/roadmap.md's invite-code-rpc-hardening entry) without changing who can join.
 */
export async function joinTripById(supabase: Client, input: { tripId: string; displayName: string }) {
  const { data, error } = await supabase.rpc("join_trip_by_id", {
    _trip_id: input.tripId,
    _display_name: input.displayName,
  });
  if (error) throw error;
  return data as string;
}

/**
 * The signed-in account's one display name (migration 0020), or null if they haven't chosen one
 * yet. Callers use this right after sign-in to decide whether to prompt for a name at all.
 */
export async function getMyDisplayName(supabase: Client): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_my_display_name");
  if (error) throw error;
  return data ?? null;
}

/** Sets the account's name on every trip they're on — verified accounts only (enforced by the RPC). */
export async function setMyDisplayName(supabase: Client, name: string) {
  const { error } = await supabase.rpc("set_my_display_name", { _name: name });
  if (error) throw error;
}

export async function completeTrip(supabase: Client, tripId: string) {
  const { error } = await supabase.rpc("complete_trip", { _trip_id: tripId });
  if (error) throw error;
}

/** Organizer-only, at most 20 per trip, blocked once the trip is completed — enforced by the RPC. */
export async function addPlaceholderMember(supabase: Client, input: { tripId: string; displayName: string }) {
  const { data, error } = await supabase.rpc("add_placeholder_member", {
    _trip_id: input.tripId,
    _display_name: input.displayName,
  });
  if (error) throw error;
  return data as string;
}

/** Organizer-only, placeholder-only (by construction of the RPC's query), blocked once the trip is completed. */
export async function renamePlaceholderMember(supabase: Client, input: { memberId: string; displayName: string }) {
  const { error } = await supabase.rpc("rename_placeholder_member", {
    _member_id: input.memberId,
    _display_name: input.displayName,
  });
  if (error) throw error;
}

/** Organizer-only, placeholder-only (by construction of the RPC's query), blocked once the trip is completed. */
export async function removePlaceholderMember(supabase: Client, memberId: string) {
  const { error } = await supabase.rpc("remove_placeholder_member", { _member_id: memberId });
  if (error) throw error;
}

/**
 * Organizer-only, real-non-placeholder-member-only, blocked once the trip is completed or if
 * targeting the organizer's own row — enforced by the RPC (`remove_trip_member`'s query
 * predicate), not just this wrapper.
 */
export async function removeTripMember(supabase: Client, memberId: string) {
  const { error } = await supabase.rpc("remove_trip_member", { _member_id: memberId });
  if (error) throw error;
}

/** Non-organizer members only, blocked once the trip is completed. Removes the caller's own row. */
export async function leaveTrip(supabase: Client, tripId: string) {
  const { error } = await supabase.rpc("leave_trip", { _trip_id: tripId });
  if (error) throw error;
}

/**
 * True if the caller is not currently a member of this trip but has a paid_by expense on it —
 * see docs/adr/0012-post-removal-detection-and-ghost-payer-rendering.md. Used to distinguish "you
 * were removed/left" from "you were never a member" on a later, independent page load.
 */
export async function wasRemovedFromTrip(supabase: Client, tripId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("was_removed_from_trip", { _trip_id: tripId });
  if (error) throw error;
  return Boolean(data);
}

export async function submitFeedback(
  supabase: Client,
  input: { userId: string; tripId?: string; rating?: "yes" | "fine" | "not_really"; comment?: string },
) {
  const { error } = await supabase.from("feedback").insert({
    user_id: input.userId,
    trip_id: input.tripId ?? null,
    rating: input.rating ?? null,
    comment: input.comment ?? null,
  });
  if (error) throw error;
}

export async function addExpense(
  supabase: Client,
  input: { tripId: string; paidBy: string; amountCents: number; description: string; date?: string },
) {
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      trip_id: input.tripId,
      paid_by: input.paidBy,
      amount: centsToDollars(input.amountCents),
      description: input.description,
      date: input.date ?? todayIso(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Deliberately has no `tripId`/`paidBy` param — both are immutable once an expense is created
 * (see migration `0006_restrict_expense_update_to_payer.sql`), and RLS's `paid_by = auth.uid()`
 * check would reject a change to either anyway. Keeping them off the signature stops a future
 * edit here from silently reintroducing a way to send them.
 */
export async function updateExpense(
  supabase: Client,
  input: { expenseId: string; amountCents: number; description: string; date: string },
) {
  const { data, error } = await supabase
    .from("expenses")
    .update({
      amount: centsToDollars(input.amountCents),
      description: input.description,
      date: input.date,
    })
    .eq("id", input.expenseId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Deletes an expense through the `delete_expense` function (migration 0024): payer only, open
 * trip only, marks the row and hides it at once; the row is erased for good shortly after. The
 * client holds no DELETE privilege on `expenses`, so there is no direct-delete fallback. Throws an
 * `ExpenseActionError` carrying only a code, never the database error.
 */
export async function deleteExpense(supabase: Client, expenseId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_expense", { _expense_id: expenseId });
  if (error) throw new ExpenseActionError(expenseActionErrorCode(error));
}

/** Brings a just-deleted expense back (server accepts it for 15 s). Same error contract as above. */
export async function undoDeleteExpense(supabase: Client, expenseId: string): Promise<void> {
  const { error } = await supabase.rpc("undo_delete_expense", { _expense_id: expenseId });
  if (error) throw new ExpenseActionError(expenseActionErrorCode(error));
}

type TripRow = Pick<
  Database["public"]["Tables"]["trips"]["Row"],
  "id" | "name" | "location" | "starts_on" | "ends_on" | "created_by" | "completed_at" | "created_at"
> &
  // Optional so older fixtures and callers without the column stay valid; read with `?? []`.
  Partial<Pick<Database["public"]["Tables"]["trips"]["Row"], "types">>;

/**
 * Fetches every trip the current user belongs to (RLS already scopes `trips` and `trip_members`
 * to the caller's own trips), with just enough shape for a summary list: member avatars, total
 * spend, and the caller's own net balance on each trip.
 *
 * `prefetchedTripRows` (performance-scaling, architecture.md's "/trips — two tiers", Tier 1) is
 * an optional pre-fetched `trips` result — when supplied, this skips its own `trips` select
 * entirely, letting the caller (`src/app/trips/page.tsx`) kick that query off concurrently with
 * its own `getUser()` call instead of waiting for this function to fetch it sequentially. Omitted
 * (every other/test call site), behavior is byte-for-byte unchanged: this fetches `trips` itself,
 * same as before.
 */
export async function getMyTrips(supabase: Client, currentUserId: string, prefetchedTripRows?: TripRow[]) {
  let tripRows: TripRow[];
  if (prefetchedTripRows) {
    tripRows = prefetchedTripRows;
  } else {
    const tripsResult = await timeAsync("my-trips", "trips", () =>
      supabase.from("trips").select(TRIP_LIST_COLUMNS).order("created_at", { ascending: false }),
    );
    if (tripsResult.error) throw tripsResult.error;
    tripRows = tripsResult.data ?? [];
  }
  if (tripRows.length === 0) return [];

  const tripIds = tripRows.map((t) => t.id);
  const [membersResult, expensesResult, shoppingItemsResult] = await Promise.all([
    timeAsync("my-trips", "trip_members", () =>
      supabase.from("trip_members").select("*").in("trip_id", tripIds).order("joined_at", { ascending: true }),
    ),
    timeAsync("my-trips", "expenses", () => supabase.from("expenses").select("*").in("trip_id", tripIds)),
    // Home's "N to get" subtitle (redesign-ui, board A): not yet bought/logged, regardless of
    // who claimed it — same `status` field `getShoppingListView` groups by, just scoped to "not
    // logged" instead of split into open/claimed.
    timeAsync("my-trips", "shopping_list_items", () =>
      supabase.from("shopping_list_items").select("trip_id, status").in("trip_id", tripIds).neq("status", "logged"),
    ),
  ]);
  if (membersResult.error) throw membersResult.error;
  if (expensesResult.error) throw expensesResult.error;
  if (shoppingItemsResult.error) throw shoppingItemsResult.error;

  const memberRows = membersResult.data ?? [];
  const expenseRows = expensesResult.data ?? [];
  const itemsToGetCountByTripId = new Map<string, number>();
  for (const row of shoppingItemsResult.data ?? []) {
    itemsToGetCountByTripId.set(row.trip_id, (itemsToGetCountByTripId.get(row.trip_id) ?? 0) + 1);
  }

  return tripRows.map((tripRow) => {
    const tripMemberRows = memberRows.filter((m) => m.trip_id === tripRow.id);
    const tripExpenseRows = expenseRows.filter((e) => e.trip_id === tripRow.id);

    // Member identity is the trip_members row id, not user_id — see ADR 0004. A placeholder's
    // user_id is null and (up to 20 per trip) not unique, so user_id can no longer double as a
    // stable per-member key.
    const userIdToMemberId = new Map(
      tripMemberRows.filter((m) => m.user_id !== null).map((m) => [m.user_id as string, m.id]),
    );

    const settlementMembers = tripMemberRows.map((m) => ({
      id: m.id,
      displayName: m.display_name,
      joinedAt: m.joined_at,
    }));
    const settlementExpenses = tripExpenseRows.map((e) => ({
      id: e.id,
      paidBy: userIdToMemberId.get(e.paid_by) ?? e.paid_by,
      amountCents: dollarsToCents(Number(e.amount)),
      description: e.description,
    }));
    const balances = computeBalances(settlementMembers, settlementExpenses);
    const yourMemberId = userIdToMemberId.get(currentUserId) ?? null;
    const yourBalance = balances.find((b) => b.memberId === yourMemberId) ?? null;

    const members = tripMemberRows.map((m, i) => ({
      id: m.id,
      displayName: m.display_name,
      isOrganizer: m.user_id === tripRow.created_by,
      isPlaceholder: m.is_placeholder,
      initials: initialsFor(m.display_name),
      avatar: avatarColorFor(i, m.user_id === tripRow.created_by),
    }));

    const totalCents = settlementExpenses.reduce((sum, e) => sum + e.amountCents, 0);

    return {
      id: tripRow.id,
      name: tripRow.name,
      location: tripRow.location,
      startsOn: tripRow.starts_on,
      endsOn: tripRow.ends_on,
      isCompleted: tripRow.completed_at !== null,
      createdAt: tripRow.created_at,
      // Catalog types in pick order, for the /trips row icon. `?? []` keeps old fixtures valid.
      types: (tripRow.types ?? []).filter(isTripType),
      members,
      totalCents,
      yourNetCents: yourBalance?.netCents ?? 0,
      itemsToGetCount: itemsToGetCountByTripId.get(tripRow.id) ?? 0,
    };
  });
}

export type MyTrip = Awaited<ReturnType<typeof getMyTrips>>[number];

/**
 * Fetches a trip's members and expenses, runs them through the settlement math, and shapes the
 * result the way the UI components consume it.
 */
export async function getTripView(supabase: Client, tripId: string, currentUserId: string) {
  const [tripResult, membersResult, expensesResult] = await Promise.all([
    timeAsync("trip-view", "trips", () => supabase.from("trips").select(TRIP_VIEW_COLUMNS).eq("id", tripId).single()),
    timeAsync("trip-view", "trip_members", () =>
      supabase.from("trip_members").select("*").eq("trip_id", tripId).order("joined_at", { ascending: true }),
    ),
    timeAsync("trip-view", "expenses", () =>
      supabase
        .from("expenses")
        .select("*")
        .eq("trip_id", tripId)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
    ),
  ]);

  if (tripResult.error) throw tripResult.error;
  if (membersResult.error) throw membersResult.error;
  if (expensesResult.error) throw expensesResult.error;

  const tripRow = tripResult.data;
  const memberRows = membersResult.data ?? [];
  const expenseRows = expensesResult.data ?? [];

  // Member identity is the trip_members row id, not user_id — see ADR 0004. A placeholder's
  // user_id is null and (up to 20 per trip) not unique, so user_id can no longer double as the
  // key for balanceByMember/memberById below. paid_by (still always a real user_id) is
  // translated through this lookup before being handed to settlement.ts.
  const userIdToMemberId = new Map(
    memberRows.filter((m) => m.user_id !== null).map((m) => [m.user_id as string, m.id]),
  );
  const memberIdForPaidBy = (paidBy: string) => userIdToMemberId.get(paidBy) ?? paidBy;

  const settlementMembers = memberRows.map((m) => ({
    id: m.id,
    displayName: m.display_name,
    joinedAt: m.joined_at,
  }));
  const settlementExpenses = expenseRows.map((e) => ({
    id: e.id,
    paidBy: memberIdForPaidBy(e.paid_by),
    amountCents: dollarsToCents(Number(e.amount)),
    description: e.description,
  }));

  const balances = computeBalances(settlementMembers, settlementExpenses);
  const balanceByMember = new Map(balances.map((b) => [b.memberId, b]));
  const settlements = simplifyDebts(balances);

  const members = memberRows.map((m, i) => {
    const balance = balanceByMember.get(m.id)!;
    const isOrganizer = m.user_id === tripRow.created_by;
    const memberExpenses = expenseRows.filter((e) => memberIdForPaidBy(e.paid_by) === m.id);
    return {
      id: m.id,
      displayName: m.display_name,
      joinedAt: m.joined_at,
      isOrganizer,
      isPlaceholder: m.is_placeholder,
      initials: initialsFor(m.display_name),
      avatar: avatarColorFor(i, isOrganizer),
      paidCents: balance.paidCents,
      shareCents: balance.shareCents,
      netCents: balance.netCents,
      expenseCount: memberExpenses.length,
    };
  });
  const memberById = new Map(members.map((m) => [m.id, m]));

  // Ghost-payer fix (docs/adr/0012-post-removal-detection-and-ghost-payer-rendering.md,
  // architecture.md's "Impact analysis — the ghost-payer bug"): a removed/left member's past
  // expenses still have a `paid_by` that no longer resolves to any *current* `trip_members` row
  // (their row is gone — this feature is what first makes that possible). Synthesize an
  // in-memory-only placeholder payer for each distinct such id so expense rendering has a
  // defined `payer` to read, without adding them to the roster (`members`) or to
  // `computeBalances`' input — they're not a share-owing party, only a display concern.
  //
  // `isRemoved` is optional (rather than a required `false` on every real member) so a current
  // member's payer object stays exactly the same shape it always was — only the synthetic ghost
  // entry ever sets it, to `true`.
  type PayerSummary = (typeof members)[number] & { isRemoved?: boolean };
  const ghostPayerById = new Map<string, PayerSummary>();
  for (const e of expenseRows) {
    const resolvedId = memberIdForPaidBy(e.paid_by);
    if (memberById.has(resolvedId) || ghostPayerById.has(resolvedId)) continue;
    ghostPayerById.set(resolvedId, {
      id: resolvedId,
      displayName: "Removed member",
      joinedAt: "",
      isOrganizer: false,
      isPlaceholder: false,
      isRemoved: true,
      initials: "?",
      avatar: { bg: "var(--color-avatar-placeholder)", fg: "var(--color-ink)" },
      paidCents: 0,
      shareCents: 0,
      netCents: 0,
      expenseCount: 0,
    });
  }
  const payerById = (id: string): PayerSummary => memberById.get(id) ?? ghostPayerById.get(id)!;

  const expenses = expenseRows.map((e) => ({
    id: e.id,
    paidBy: memberIdForPaidBy(e.paid_by),
    amountCents: dollarsToCents(Number(e.amount)),
    description: e.description,
    day: formatDayDate(e.date),
    payer: payerById(memberIdForPaidBy(e.paid_by)),
  }));

  const resolvedSettlements = settlements.map((s) => ({
    ...s,
    from: memberById.get(s.fromMemberId)!,
    to: memberById.get(s.toMemberId)!,
  }));

  const totalCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);
  const avgPerPersonCents = members.length > 0 ? Math.round(totalCents / members.length) : 0;

  const yourMemberId = userIdToMemberId.get(currentUserId) ?? null;

  return {
    trip: {
      id: tripRow.id,
      name: tripRow.name,
      location: tripRow.location,
      startsOn: tripRow.starts_on,
      endsOn: tripRow.ends_on,
      inviteCode: tripRow.invite_code,
      isCompleted: tripRow.completed_at !== null,
      // Catalog types in pick order. `?? []` keeps old fixtures and pre-0.8.0 rows valid.
      types: (tripRow.types ?? []).filter(isTripType),
    },
    members,
    expenses,
    settlements: resolvedSettlements,
    totalCents,
    avgPerPersonCents,
    you: yourMemberId ? (memberById.get(yourMemberId) ?? null) : null,
  };
}

export type TripView = NonNullable<Awaited<ReturnType<typeof getTripView>>>;

/**
 * The public, zero-auth summary tier (see docs/features/simplified-onboarding/architecture.md):
 * wraps the `get_trip_summary` RPC, which returns per-member `paid_cents`/`share_cents`
 * aggregates only — no expense line items. Shaped so `simplifyDebts` (from
 * `src/lib/settlement.ts`) can consume the balances directly, computing `netCents = paid - share`
 * in TS rather than porting the greedy-settle algorithm to SQL. Returns `null` for an unknown
 * trip id (RPC returns zero rows), matching `getTripByInviteCode`'s "not found" shape.
 *
 * No longer surfaces the trip's invite code (migration 0012 added it, migration 0016 removed
 * it — docs/product/roadmap.md's invite-code-rpc-hardening entry): handing the invite code to anyone who
 * merely has the trip's UUID collapsed the separation between the public, view-only UUID and the
 * actual join credential. The two callers that used it (`TripSummaryOnly`,
 * `RemovedFromTripScreen` in src/app/trip/[id]/page.tsx) already have the trip UUID directly, so
 * they now join via `joinTripById`/`join_trip_by_id` instead of round-tripping through the
 * invite code at all.
 */
export async function getTripSummary(supabase: Client, tripId: string) {
  const { data, error } = await supabase.rpc("get_trip_summary", { _trip_id: tripId });
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return null;

  const balances = rows.map((r) => ({
    memberId: r.member_id,
    paidCents: Number(r.paid_cents),
    shareCents: Number(r.share_cents),
    netCents: Number(r.paid_cents) - Number(r.share_cents),
  }));
  const members = rows.map((r) => ({ id: r.member_id, displayName: r.display_name }));
  const memberById = new Map(members.map((m) => [m.id, m]));

  const settlements = simplifyDebts(balances).map((s) => ({
    ...s,
    from: memberById.get(s.fromMemberId)!,
    to: memberById.get(s.toMemberId)!,
  }));

  const totalCents = balances.reduce((sum, b) => sum + b.paidCents, 0);
  const avgPerPersonCents = members.length > 0 ? Math.round(totalCents / members.length) : 0;

  return { members, settlements, totalCents, avgPerPersonCents };
}

export type TripSummary = NonNullable<Awaited<ReturnType<typeof getTripSummary>>>;
