/** Words shown to people for stored states. Shared by the contractor screens. */

export const EVENT_LABEL: Record<string, string> = {
  created: "Change order written",
  viewed: "Homeowner opened it",
  signed: "Signed",
  declined: "Declined",
  invoice_sent: "PayPal invoice sent",
  reminder_sent: "Payment reminder sent",
  paid: "Paid",
  webhook_verified: "PayPal confirmed payment",
};

export const STATUS_LABEL = {
  awaiting_approval: "Waiting on signature",
  approved: "Waiting on payment",
  paid: "Paid",
  declined: "Declined",
} as const;

export type OrderStatus = keyof typeof STATUS_LABEL;
