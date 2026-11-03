import { getInvoice, PayPalError } from "@/lib/paypal";

/** GET /api/invoices/:id — live status from PayPal (SENT → PAID). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return Response.json(await getInvoice(id));
  } catch (e) {
    if (e instanceof PayPalError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
