import { describe, expect, it } from "vitest";
import { computeBalances, simplifyDebts, type Member, type Expense } from "./settlement";

function members(...names: string[]): Member[] {
  return names.map((id, i) => ({ id, displayName: id, joinedAt: `2027-01-${String(i + 1).padStart(2, "0")}` }));
}

describe("computeBalances", () => {
  it("returns zero balances when there are no expenses", () => {
    const balances = computeBalances(members("a", "b", "c"), []);
    expect(balances.every((b) => b.paidCents === 0 && b.shareCents === 0 && b.netCents === 0)).toBe(true);
  });

  it("gives a single-member trip a net balance of zero", () => {
    const expenses: Expense[] = [{ id: "e1", paidBy: "a", amountCents: 5_000, description: "solo" }];
    const balances = computeBalances(members("a"), expenses);
    expect(balances).toEqual([{ memberId: "a", paidCents: 5_000, shareCents: 5_000, netCents: 0 }]);
  });

  it("distributes an odd-cent remainder to the earliest joiners, summing exactly to the total", () => {
    const expenses: Expense[] = [{ id: "e1", paidBy: "a", amountCents: 10_000, description: "$100 / 3" }];
    const balances = computeBalances(members("a", "b", "c"), expenses);
    expect(balances.map((b) => b.shareCents)).toEqual([3334, 3333, 3333]);
    expect(balances.reduce((sum, b) => sum + b.shareCents, 0)).toBe(10_000);
  });

  it("matches a hand-computed 5-person uneven-payment trip", () => {
    const trip = members("ana", "ben", "cleo", "dev", "mia");
    const expenses: Expense[] = [
      { id: "e1", paidBy: "ana", amountCents: 124_000, description: "Cabin" },
      { id: "e2", paidBy: "ben", amountCents: 64_500, description: "Lift tickets" },
      { id: "e3", paidBy: "cleo", amountCents: 21_480, description: "Groceries" },
      { id: "e4", paidBy: "ben", amountCents: 31_000, description: "Rentals" },
      { id: "e5", paidBy: "ana", amountCents: 18_830, description: "Dinner" },
      { id: "e6", paidBy: "dev", amountCents: 9_640, description: "Gas" },
      { id: "e7", paidBy: "mia", amountCents: 4_250, description: "Firewood" },
    ];
    const balances = computeBalances(trip, expenses);
    const byId = Object.fromEntries(balances.map((b) => [b.memberId, b]));

    expect(byId.ana.paidCents).toBe(142_830);
    expect(byId.ben.paidCents).toBe(95_500);
    expect(byId.cleo.paidCents).toBe(21_480);
    expect(byId.dev.paidCents).toBe(9_640);
    expect(byId.mia.paidCents).toBe(4_250);
    expect(balances.every((b) => b.shareCents === 54_740)).toBe(true);

    const transactions = simplifyDebts(balances);
    expect(transactions).toEqual([
      { fromMemberId: "mia", toMemberId: "ana", amountCents: 50_490 },
      { fromMemberId: "dev", toMemberId: "ana", amountCents: 37_600 },
      { fromMemberId: "dev", toMemberId: "ben", amountCents: 7_500 },
      { fromMemberId: "cleo", toMemberId: "ben", amountCents: 33_260 },
    ]);
  });

  it("a late joiner retroactively owes a share of expenses logged before they joined", () => {
    const early = members("a", "b");
    const withLateJoiner: Member[] = [...early, { id: "c", displayName: "c", joinedAt: "2027-01-05" }];
    const expenses: Expense[] = [{ id: "e1", paidBy: "a", amountCents: 9_000, description: "before c joined" }];

    const balances = computeBalances(withLateJoiner, expenses);
    expect(balances.find((b) => b.memberId === "c")?.shareCents).toBe(3_000);
  });
});

describe("simplifyDebts", () => {
  it("produces no transactions when every balance is already zero", () => {
    const balances = computeBalances(members("a", "b", "c"), []);
    expect(simplifyDebts(balances)).toEqual([]);
  });

  it("nets a simple two-person trip in one transaction", () => {
    const balances = computeBalances(members("a", "b"), [
      { id: "e1", paidBy: "a", amountCents: 4_000, description: "dinner" },
    ]);
    expect(simplifyDebts(balances)).toEqual([{ fromMemberId: "b", toMemberId: "a", amountCents: 2_000 }]);
  });

  it("never produces more than members.length - 1 transactions", () => {
    const trip = members("a", "b", "c", "d", "e");
    const expenses: Expense[] = [
      { id: "e1", paidBy: "a", amountCents: 12_345, description: "x" },
      { id: "e2", paidBy: "b", amountCents: 6_789, description: "y" },
      { id: "e3", paidBy: "c", amountCents: 1_111, description: "z" },
    ];
    const balances = computeBalances(trip, expenses);
    expect(simplifyDebts(balances).length).toBeLessThanOrEqual(trip.length - 1);
  });
});
