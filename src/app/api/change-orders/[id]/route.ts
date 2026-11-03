import { PayPalError } from "@/lib/paypal";
import { getChangeOrder, listEvents } from "@/lib/repo";
import { syncPaymentStatus } from "@/lib/workflow";

/** GET /api/change-orders/:id — live status for the contractor's screen (approval → payment). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let co = await getChangeOrder(id);
  if (!co) return Response.json({ error: "Not found" }, { status: 404 });

  try {
    co = await syncPaymentStatus(co);
  } catch (e) {
    // PayPal hiccup shouldn't break the status screen; webhook or next poll will catch up.
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
