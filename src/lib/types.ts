/** A single priced line on a change order. Money is kept in integer cents. */
export type LineItem = {
  description: string;
  quantity: number;
  unit: "HOURS" | "QUANTITY" | "AMOUNT";
  unitPriceCents: number;
};

/** The structured change order the AI produces from a contractor's voice memo + photos. */
export type ChangeOrder = {
  summary: string; // plain-English scope for the homeowner
  items: LineItem[];
  homeowner: { name: string; email: string };
  contractor: { businessName: string; email: string };
  originalTranscript?: string; // what the contractor actually said (any language)
};

export type InvoiceStatus =
  | "DRAFT"
  | "SENT"
  | "SCHEDULED"
  | "PAID"
  | "MARKED_AS_PAID"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_PAID"
  | "PARTIALLY_REFUNDED"
  | "MARKED_AS_REFUNDED"
  | "UNPAID"
  | "PAYMENT_PENDING";

export type InvoiceSummary = {
  id: string;
  status: InvoiceStatus;
  totalCents: number;
  payerUrl: string | null;
};
