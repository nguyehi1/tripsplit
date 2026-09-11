export type Member = { id: string; displayName: string; joinedAt: string };
export type Expense = { id: string; paidBy: string; amountCents: number; description: string };
export type Balance = { memberId: string; paidCents: number; shareCents: number; netCents: number };
export type Transaction = { fromMemberId: string; toMemberId: string; amountCents: number };

export function computeBalances(members: Member[], expenses: Expense[]): Balance[] {
  const totalCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);
  const sorted = [...members].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  const base = Math.floor(totalCents / sorted.length);
  const remainder = totalCents - base * sorted.length;

  const paidByMember = new Map<string, number>();
  for (const m of members) paidByMember.set(m.id, 0);
  for (const e of expenses) {
    paidByMember.set(e.paidBy, (paidByMember.get(e.paidBy) ?? 0) + e.amountCents);
  }

  return sorted.map((m, i) => {
    const shareCents = base + (i < remainder ? 1 : 0);
    const paidCents = paidByMember.get(m.id) ?? 0;
    return { memberId: m.id, paidCents, shareCents, netCents: paidCents - shareCents };
  });
}

/** Greedy largest-first settle: not provably minimal, but standard "Splitwise-style" behavior. */
export function simplifyDebts(balances: Balance[]): Transaction[] {
  const creditors = balances
    .filter((b) => b.netCents > 0)
    .map((b) => ({ id: b.memberId, amt: b.netCents }))
    .sort((a, b) => b.amt - a.amt);
  const debtors = balances
    .filter((b) => b.netCents < 0)
    .map((b) => ({ id: b.memberId, amt: -b.netCents }))
    .sort((a, b) => b.amt - a.amt);

  const txns: Transaction[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].amt, creditors[j].amt);
    if (amt > 0) txns.push({ fromMemberId: debtors[i].id, toMemberId: creditors[j].id, amountCents: amt });
    debtors[i].amt -= amt;
    creditors[j].amt -= amt;
    if (debtors[i].amt === 0) i++;
    if (creditors[j].amt === 0) j++;
  }
  return txns;
}
