import type { SupabaseClient } from "@supabase/supabase-js";
import { avatarColorFor, initialsFor } from "@/lib/avatar";
import { centsToDollars } from "@/lib/currency";
import { todayIso } from "@/lib/dates";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export type ShoppingListMemberRef = {
  id: string;
  displayName: string;
  isPlaceholder: boolean;
  initials: string;
  avatar: { bg: string; fg: string };
};

export type ShoppingListItem = {
  id: string;
  description: string;
  status: "open" | "claimed" | "logged";
  /**
   * Null when the adder has since been removed from the trip (ADR 0013's trigger clears
   * `added_by` before the `trip_members` row is deleted) — a known, accepted gap, not a bug.
   */
  addedBy: ShoppingListMemberRef | null;
  claimedBy: ShoppingListMemberRef | null;
  expenseId: string | null;
};

/**
 * Shaped/grouped the same way `getTripView` already shapes its output (architecture.md section
 * 4) — not left to the UI to re-derive from raw rows. `toGet` holds both never-claimed items and
 * items claimed by someone *other* than the caller (design-reference Screen 1's "To get" card);
 * `yourBag` holds only the caller's own claimed-unlogged items (design.md section 3: "just their
 * own claimed-unlogged items"). This now matches the unclaim RPC's own permission model exactly —
 * only the claimer can unclaim (product decision superseding the original "any member can
 * unclaim" draft, see requirements.md/design.md's updated notes) — so "Your bag" is the *only*
 * place an unclaim control ever needs to appear; no other row anywhere shows one.
 */
export type ShoppingListView = {
  items: ShoppingListItem[];
  toGet: ShoppingListItem[];
  yourBag: ShoppingListItem[];
  bought: ShoppingListItem[];
  myClaimedUnloggedCount: number;
  /** The caller's own `trip_members.id`, or null if they're not a current member (shouldn't
   *  normally happen for a caller who can reach this — detail-tier RLS already requires it). */
  yourMemberId: string | null;
};

export async function getShoppingListView(
  supabase: Client,
  tripId: string,
  currentUserId: string,
): Promise<ShoppingListView> {
  const [itemsResult, membersResult] = await Promise.all([
    supabase
      .from("shopping_list_items")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true }),
    supabase.from("trip_members").select("*").eq("trip_id", tripId).order("joined_at", { ascending: true }),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (membersResult.error) throw membersResult.error;

  const itemRows = itemsResult.data ?? [];
  const memberRows = membersResult.data ?? [];

  const memberRefById = new Map<string, ShoppingListMemberRef>();
  memberRows.forEach((m, i) => {
    memberRefById.set(m.id, {
      id: m.id,
      displayName: m.display_name,
      isPlaceholder: m.is_placeholder,
      initials: initialsFor(m.display_name),
      avatar: avatarColorFor(i, false),
    });
  });

  const yourMemberId = memberRows.find((m) => m.user_id === currentUserId)?.id ?? null;

  const items: ShoppingListItem[] = itemRows.map((row) => ({
    id: row.id,
    description: row.description,
    status: row.status,
    addedBy: row.added_by ? (memberRefById.get(row.added_by) ?? null) : null,
    claimedBy: row.claimed_by ? (memberRefById.get(row.claimed_by) ?? null) : null,
    expenseId: row.expense_id,
  }));

  const toGet = items.filter(
    (i) => i.status === "open" || (i.status === "claimed" && i.claimedBy?.id !== yourMemberId),
  );
  const yourBag = items.filter((i) => i.status === "claimed" && i.claimedBy?.id === yourMemberId);
  const bought = items.filter((i) => i.status === "logged");

  return { items, toGet, yourBag, bought, myClaimedUnloggedCount: yourBag.length, yourMemberId };
}

/**
 * A plain multi-row `.insert([...])` — one PostgREST request, one statement, atomic by
 * construction (all rows succeed or the whole insert fails/rolls back). `addedBy` is the
 * caller's own `trip_members.id`; the insert RLS policy independently re-derives and checks this
 * server-side, so a client that somehow sent someone else's id would still be rejected.
 */
export async function addShoppingListItems(
  supabase: Client,
  input: { tripId: string; addedBy: string; descriptions: string[] },
): Promise<void> {
  const { error } = await supabase.from("shopping_list_items").insert(
    input.descriptions.map((description) => ({
      trip_id: input.tripId,
      added_by: input.addedBy,
      description,
    })),
  );
  if (error) throw error;
}

/** Pre-claim delete, adder-only, open-only — enforced by RLS, not just this wrapper. */
export async function deleteShoppingListItem(supabase: Client, itemId: string): Promise<void> {
  const { error } = await supabase.from("shopping_list_items").delete().eq("id", itemId);
  if (error) throw error;
}

/**
 * Claim race guarantee lives in the RPC itself (a single conditional `UPDATE`, see migration
 * 0015) — this wrapper is a thin pass-through.
 */
export async function claimShoppingListItem(supabase: Client, itemId: string): Promise<void> {
  const { error } = await supabase.rpc("claim_shopping_list_item", { _item_id: itemId });
  if (error) throw error;
}

/**
 * Claimer-only (requirements.md decision 2, superseded by a later product decision — see
 * design.md's "who can unclaim" note): the RPC itself rejects any caller whose own
 * `trip_members.id` isn't the item's current `claimed_by`, so this wrapper doesn't need to (and
 * can't meaningfully) pre-check that client-side.
 */
export async function unclaimShoppingListItem(supabase: Client, itemId: string): Promise<void> {
  const { error } = await supabase.rpc("unclaim_shopping_list_item", { _item_id: itemId });
  if (error) throw error;
}

/**
 * Wraps `add_expense_and_log_shopping_items` — used only when the add-expense sheet's submission
 * includes one or more selected shopping-list items. The zero-items case calls the existing,
 * untouched `addExpense` (`src/lib/data/trips.ts`) instead; see `add-expense-sheet-content.tsx`.
 */
export async function addExpenseWithShoppingItems(
  supabase: Client,
  input: { tripId: string; amountCents: number; description: string; date?: string; itemIds: string[] },
) {
  const { data, error } = await supabase.rpc("add_expense_and_log_shopping_items", {
    _trip_id: input.tripId,
    _amount: centsToDollars(input.amountCents),
    _description: input.description,
    _date: input.date ?? todayIso(),
    _item_ids: input.itemIds,
  });
  if (error) throw error;
  if (!data) throw new Error("add_expense_and_log_shopping_items returned no row");
  return data;
}
