import type { SupabaseClient } from "@supabase/supabase-js";
import { avatarColorFor, initialsFor } from "@/lib/avatar";
import { centsToDollars, dollarsToCents } from "@/lib/currency";
import { computeBalances, simplifyDebts } from "@/lib/settlement";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export async function createTrip(
  supabase: Client,
  input: { name: string; displayName: string; location?: string; startsOn?: string; endsOn?: string },
) {
  const { data, error } = await supabase.rpc("create_trip", {
    _name: input.name,
    _display_name: input.displayName,
    _location: input.location ?? null,
    _starts_on: input.startsOn ?? null,
    _ends_on: input.endsOn ?? null,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("create_trip returned no row");
  return { tripId: row.trip_id, inviteCode: row.invite_code };
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

/** Returns the joined trip's id. */
export async function joinTrip(supabase: Client, input: { inviteCode: string; displayName: string }) {
  const { data, error } = await supabase.rpc("join_trip", {
    _invite_code: input.inviteCode,
    _display_name: input.displayName,
  });
  if (error) throw error;
  return data as string;
}

export async function completeTrip(supabase: Client, tripId: string) {
  const { error } = await supabase.rpc("complete_trip", { _trip_id: tripId });
  if (error) throw error;
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
  input: { tripId: string; paidBy: string; amountCents: number; description: string },
) {
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      trip_id: input.tripId,
      paid_by: input.paidBy,
      amount: centsToDollars(input.amountCents),
      description: input.description,
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
  input: { expenseId: string; amountCents: number; description: string },
) {
  const { data, error } = await supabase
    .from("expenses")
    .update({
      amount: centsToDollars(input.amountCents),
      description: input.description,
    })
    .eq("id", input.expenseId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Fetches every trip the current user belongs to (RLS already scopes `trips` and `trip_members`
 * to the caller's own trips), with just enough shape for a summary list: member avatars, total
 * spend, and the caller's own net balance on each trip.
 */
export async function getMyTrips(supabase: Client, currentUserId: string) {
  const tripsResult = await supabase.from("trips").select("*").order("created_at", { ascending: false });
  if (tripsResult.error) throw tripsResult.error;
  const tripRows = tripsResult.data ?? [];
  if (tripRows.length === 0) return [];

  const tripIds = tripRows.map((t) => t.id);
  const [membersResult, expensesResult] = await Promise.all([
    supabase.from("trip_members").select("*").in("trip_id", tripIds).order("joined_at", { ascending: true }),
    supabase.from("expenses").select("*").in("trip_id", tripIds),
  ]);
  if (membersResult.error) throw membersResult.error;
  if (expensesResult.error) throw expensesResult.error;

  const memberRows = membersResult.data ?? [];
  const expenseRows = expensesResult.data ?? [];

  return tripRows.map((tripRow) => {
    const tripMemberRows = memberRows.filter((m) => m.trip_id === tripRow.id);
    const tripExpenseRows = expenseRows.filter((e) => e.trip_id === tripRow.id);

    const settlementMembers = tripMemberRows.map((m) => ({
      id: m.user_id,
      displayName: m.display_name,
      joinedAt: m.joined_at,
    }));
    const settlementExpenses = tripExpenseRows.map((e) => ({
      id: e.id,
      paidBy: e.paid_by,
      amountCents: dollarsToCents(Number(e.amount)),
      description: e.description,
    }));
    const balances = computeBalances(settlementMembers, settlementExpenses);
    const yourBalance = balances.find((b) => b.memberId === currentUserId) ?? null;

    const members = tripMemberRows.map((m, i) => ({
      id: m.user_id,
      displayName: m.display_name,
      isOrganizer: m.user_id === tripRow.created_by,
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
      members,
      totalCents,
      yourNetCents: yourBalance?.netCents ?? 0,
    };
  });
}

export type MyTrip = Awaited<ReturnType<typeof getMyTrips>>[number];

function formatDayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short" });
}

/**
 * Fetches a trip's members and expenses, runs them through the settlement math, and shapes the
 * result the way the UI components consume it.
 */
export async function getTripView(supabase: Client, tripId: string, currentUserId: string) {
  const [tripResult, membersResult, expensesResult] = await Promise.all([
    supabase.from("trips").select("*").eq("id", tripId).single(),
    supabase.from("trip_members").select("*").eq("trip_id", tripId).order("joined_at", { ascending: true }),
    supabase.from("expenses").select("*").eq("trip_id", tripId).order("created_at", { ascending: false }),
  ]);

  if (tripResult.error) throw tripResult.error;
  if (membersResult.error) throw membersResult.error;
  if (expensesResult.error) throw expensesResult.error;

  const tripRow = tripResult.data;
  const memberRows = membersResult.data ?? [];
  const expenseRows = expensesResult.data ?? [];

  const settlementMembers = memberRows.map((m) => ({
    id: m.user_id,
    displayName: m.display_name,
    joinedAt: m.joined_at,
  }));
  const settlementExpenses = expenseRows.map((e) => ({
    id: e.id,
    paidBy: e.paid_by,
    amountCents: dollarsToCents(Number(e.amount)),
    description: e.description,
  }));

  const balances = computeBalances(settlementMembers, settlementExpenses);
  const balanceByMember = new Map(balances.map((b) => [b.memberId, b]));
  const settlements = simplifyDebts(balances);

  const members = memberRows.map((m, i) => {
    const balance = balanceByMember.get(m.user_id)!;
    const isOrganizer = m.user_id === tripRow.created_by;
    const memberExpenses = expenseRows.filter((e) => e.paid_by === m.user_id);
    return {
      id: m.user_id,
      displayName: m.display_name,
      joinedAt: m.joined_at,
      isOrganizer,
      initials: initialsFor(m.display_name),
      avatar: avatarColorFor(i, isOrganizer),
      paidCents: balance.paidCents,
      shareCents: balance.shareCents,
      netCents: balance.netCents,
      expenseCount: memberExpenses.length,
    };
  });
  const memberById = new Map(members.map((m) => [m.id, m]));

  const expenses = expenseRows.map((e) => ({
    id: e.id,
    paidBy: e.paid_by,
    amountCents: dollarsToCents(Number(e.amount)),
    description: e.description,
    day: formatDayLabel(e.created_at),
    payer: memberById.get(e.paid_by)!,
  }));

  const resolvedSettlements = settlements.map((s) => ({
    ...s,
    from: memberById.get(s.fromMemberId)!,
    to: memberById.get(s.toMemberId)!,
  }));

  const totalCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);
  const avgPerPersonCents = members.length > 0 ? Math.round(totalCents / members.length) : 0;

  return {
    trip: {
      id: tripRow.id,
      name: tripRow.name,
      location: tripRow.location,
      startsOn: tripRow.starts_on,
      endsOn: tripRow.ends_on,
      inviteCode: tripRow.invite_code,
      isCompleted: tripRow.completed_at !== null,
    },
    members,
    expenses,
    settlements: resolvedSettlements,
    totalCents,
    avgPerPersonCents,
    you: memberById.get(currentUserId) ?? null,
  };
}

export type TripView = NonNullable<Awaited<ReturnType<typeof getTripView>>>;
