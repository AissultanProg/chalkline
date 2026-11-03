import "server-only";
import { createInvoice, getInvoice, sendInvoice } from "./paypal";
import { getChangeOrder, getJob, markInvoiced, markPaid, markSigned, type ChangeOrderRecord } from "./repo";

const PAID = new Set(["PAID", "MARKED_AS_PAID"]);

/**
 * Homeowner approves: store signature + audit data, THEN create and send the PayPal invoice.
 * No signature, no invoice.
 */
export async function approveAndInvoice(
  id: string,
  signer: { name: string; png: string; ip: string; agent: string },
): Promise<ChangeOrderRecord> {
  const co = await getChangeOrder(id);
  if (!co) throw new WorkflowError("Change order not found", 404);
  const job = await getJob(co.jobId);
  if (!job) throw new WorkflowError("Job not found", 404);

  const signed = await markSigned(id, signer);
  if (!signed) throw new WorkflowError("This change order was already answered.", 409);

  const signedOn = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" });
  const invoice = await createInvoice(
    {
      jobTitle: job.title,
      summary:
        `Change order #${co.number}: ${co.title}\n\n${co.summary}\n\n` +
        `Approved and signed by ${signer.name} on ${signedOn} (PT) via Chalkline. Signed record: ${co.id}`,
      items: co.items,
      homeowner: { name: job.homeownerName, email: job.homeownerEmail || process.env.PAYPAL_SANDBOX_PERSONAL_EMAIL! },
      contractor: { businessName: job.businessName, email: process.env.PAYPAL_SANDBOX_BUSINESS_EMAIL! },
      originalTranscript: co.memoLanguage !== "English" ? co.memoOriginal : undefined,
    },
    `CO-${co.number} · ${job.title}`,
  );
  await sendInvoice(invoice.id);
  const sent = await getInvoice(invoice.id); // fetch again: payer link is only final after sending
  await markInvoiced(id, invoice.id, sent.payerUrl);
  return (await getChangeOrder(id))!;
}

/** Fallback for when webhooks can't reach us (e.g. localhost): ask PayPal directly. */
export async function syncPaymentStatus(co: ChangeOrderRecord): Promise<ChangeOrderRecord> {
  if (co.status !== "approved" || !co.invoiceId) return co;
  const inv = await getInvoice(co.invoiceId);
  if (PAID.has(inv.status)) {
    await markPaid(co.id, "PayPal status check");
    return (await getChangeOrder(co.id))!;
  }
  return co;
}

export class WorkflowError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
