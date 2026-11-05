import { PayPalError, verifyWebhook } from "@/lib/paypal";
import { addEventOnce, findOrderByInvoiceId } from "@/lib/repo";
import { syncPaymentStatus } from "@/lib/workflow";

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
    const invoiceId = event.resource?.invoice?.id ?? event.resource?.id;
    const co = invoiceId ? await findOrderByInvoiceId(invoiceId) : null;
    if (co) {
      try {
        // PayPal also sends this event for partial and pending payments, so confirm the real status.
        await syncPaymentStatus(co, "PayPal webhook");
      } catch (e) {
        if (e instanceof PayPalError) return Response.json({ error: "Try again" }, { status: 503 }); // PayPal will retry
        throw e;
      }
      await addEventOnce(co.id, "webhook_verified", "Signature verified with PayPal");
    }
  }
  // Always 200 for verified events so PayPal doesn't retry ones we don't handle.
  return Response.json({ ok: true });
}
