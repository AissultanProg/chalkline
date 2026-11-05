type Countable = { status: string; totalCents: number };

export type Totals = {
  paidCents: number;
  paidCount: number;
  owedCents: number;
  owedCount: number;
  unsignedCents: number;
  unsignedCount: number;
  orderCount: number;
};

/** Adds up change orders by where the money stands. Declined orders are counted but carry no money. */
export function totalsFor(orders: Countable[]): Totals {
  const t: Totals = { paidCents: 0, paidCount: 0, owedCents: 0, owedCount: 0, unsignedCents: 0, unsignedCount: 0, orderCount: orders.length };
  for (const o of orders) {
    if (o.status === "paid") {
      t.paidCents += o.totalCents;
      t.paidCount += 1;
    } else if (o.status === "approved") {
      t.owedCents += o.totalCents;
      t.owedCount += 1;
    } else if (o.status === "awaiting_approval") {
      t.unsignedCents += o.totalCents;
      t.unsignedCount += 1;
    }
  }
  return t;
}
