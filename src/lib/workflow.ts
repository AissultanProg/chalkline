import "server-only";
import { createInvoice, deleteInvoice, getInvoice, sendInvoice, sendReminder } from "./paypal";
import { addEvent, getChangeOrder, getJob, markPaid, markInvoiceSent, markSigned, saveInvoiceId, type ChangeOrderRecord, type OrderSummary } from "./repo";

const PAID = new Set(["PAID", "MARKED_AS_PAID"]);

export class WorkflowError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * Homeowner approves: store signature + audit data, THEN create and send the PayPal invoice.
 * No signature, no invoice.
 */
export async function approveAndInvoice(id: string, signer: { name: string; png: string; ip: string; agent: string }): Promise<ChangeOrderRecord> {
  const co = await getChangeOrder(id);
  if (!co) throw new WorkflowError("Change order not found", 404);

  const signed = await markSigned(id, signer);
  if (!signed) throw new WorkflowError("This change order was already answered.", 409);

  return issueInvoice(id);
}

const issuing = new Set<string>();

/**
 * Creates and sends the invoice for a signed change order.
 * Safe to run again after a PayPal failure: it picks up where it stopped and never makes a second invoice.
 */
export async function issueInvoice(id: string): Promise<ChangeOrderRecord> {
  if (issuing.has(id)) throw new WorkflowError("The invoice is already being sent.", 409);
  issuing.add(id);
  try {
    const co = await getChangeOrder(id);
    if (!co) throw new WorkflowError("Change order not found", 404);
    if (co.status !== "approved") throw new WorkflowError("Only a signed, unpaid change order can be invoiced.", 409);
    if (co.payerUrl) return co; // already sent

    const job = await getJob(co.jobId);
    if (!job) throw new WorkflowError("Job not found", 404);

    let invoiceId = co.invoiceId;
    let needsSending = true;

    if (invoiceId) {
      needsSending = (await getInvoice(invoiceId)).status === "DRAFT";
    } else {
      const signedOn = new Date(co.signedAt!).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" });
      const draft = await createInvoice(
        {
          summary:
            `Change order #${co.number}: ${co.title}\n\n${co.summary}\n\n` +
            `Approved and signed by ${co.signerName} on ${signedOn} (PT) via Chalkline. Signed record: ${co.id}`,
          items: co.items,
          homeowner: { name: job.homeownerName, email: job.homeownerEmail || process.env.PAYPAL_SANDBOX_PERSONAL_EMAIL! },
          contractor: { businessName: job.businessName, email: process.env.PAYPAL_SANDBOX_BUSINESS_EMAIL! },
          originalTranscript: co.memoLanguage !== "English" ? co.memoOriginal : undefined,
        },
        `CO-${co.number} · ${job.title}`,
      );

      // The homeowner signed one exact amount, so never send a different one.
      if (draft.totalCents !== co.totalCents) {
        await deleteInvoice(draft.id);
        throw new WorkflowError("The invoice total didn't match the signed amount, so it wasn't sent.", 500);
      }
      invoiceId = draft.id;
      await saveInvoiceId(id, invoiceId);
    }

    if (needsSending) await sendInvoice(invoiceId);
    const sent = await getInvoice(invoiceId); // fetch again: the payer link is only final after sending
    await markInvoiceSent(id, invoiceId, sent.payerUrl);
    return (await getChangeOrder(id))!;
  } finally {
    issuing.delete(id);
  }
}

/** Ask PayPal directly whether a signed change order is paid. Returns true if this call marked it paid. */
export async function syncPaymentStatus(co: Pick<OrderSummary, "id" | "status" | "invoiceId">, source = "PayPal status check"): Promise<boolean> {
  if (co.status !== "approved" || !co.invoiceId) return false;
  const inv = await getInvoice(co.invoiceId);
  if (!PAID.has(inv.status)) return false;
  await markPaid(co.id, source);
  return true;
}

/** Catches payments on every open change order, in case a webhook was missed. Returns true if anything changed. */
export async function syncOpenOrders(orders: OrderSummary[]): Promise<boolean> {
  const results = await Promise.allSettled(orders.map((o) => syncPaymentStatus(o)));
  return results.some((r) => r.status === "fulfilled" && r.value);
}

export async function remindHomeowner(co: OrderSummary): Promise<void> {
  if (co.status !== "approved" || !co.payerUrl || !co.invoiceId) {
    throw new WorkflowError("Only a sent, unpaid invoice can get a reminder.", 409);
  }
  await sendReminder(co.invoiceId, `Reminder: change order #${co.number}, "${co.title}", is approved and ready to pay.`);
  await addEvent(co.id, "reminder_sent");
}
