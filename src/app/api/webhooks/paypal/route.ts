import { verifyWebhook } from "@/lib/paypal";
import { addEventOnce, findByInvoiceId, markPaid } from "@/lib/repo";

/**
 * POST /api/webhooks/paypal — PayPal pushes invoice events here (configure in the developer dashboard).
 * Every event is verified with PayPal before we trust it.
 */
export async function POST(req: Request) {
  if (!process.env.PAYPAL_WEBHOOK_ID) {
    return Response.json({ error: "Webhook is not configured" }, { status: 503 });
  }

  const raw = await req.text();
  if (!(await verifyWebhook(req.headers, raw))) {
    return Response.json({ error: "Webhook could not be verified" }, { status: 401 });
  }

  const event = JSON.parse(raw) as { event_type: string; resource?: { id?: string; invoice?: { id?: string } } };
  if (event.event_type === "INVOICING.INVOICE.PAID") {
    const invoiceId = event.resource?.id ?? event.resource?.invoice?.id;
    const co = invoiceId ? await findByInvoiceId(invoiceId) : null;
    if (co) {
      await markPaid(co.id, "PayPal webhook");
      await addEventOnce(co.id, "webhook_verified", "Signature verified with PayPal");
    }
  }
  // Always 200 for verified events so PayPal doesn't retry ones we don't handle.
  return Response.json({ ok: true });
}
