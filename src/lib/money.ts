/** Money helpers shared by the browser and the server. All amounts are integer cents. */

type Priced = { quantity: number; unitPriceCents: number };

/** PayPal rounds each line to the cent before adding, so every total here must do the same. */
export const lineTotalCents = (item: Priced) => Math.round(item.quantity * item.unitPriceCents);

export const orderTotalCents = (items: Priced[]) => items.reduce((sum, item) => sum + lineTotalCents(item), 0);

export const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
