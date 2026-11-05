import { PayPalError } from "@/lib/paypal";
import { getOrderSummary, listEvents } from "@/lib/repo";
import { syncPaymentStatus } from "@/lib/workflow";

/** GET /api/change-orders/:id — live status for the contractor's screen (approval → payment). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let co = await getOrderSummary(id);
  if (!co) return Response.json({ error: "Not found" }, { status: 404 });

  try {
    if (await syncPaymentStatus(co)) co = (await getOrderSummary(id))!;
  } catch (e) {
    // A PayPal hiccup shouldn't break the status screen; the webhook or next poll will catch up.
    if (!(e instanceof PayPalError)) throw e;
  }

  return Response.json({
    id: co.id,
    number: co.number,
    status: co.status,
    totalCents: co.totalCents,
    signerName: co.signerName,
    signedAt: co.signedAt,
    invoiceId: co.invoiceId,
    paidAt: co.paidAt,
    events: await listEvents(co.id),
  });
}
