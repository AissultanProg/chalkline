import { createInvoice, getInvoiceQr, PayPalError, sendInvoice } from "@/lib/paypal";
import type { ChangeOrder } from "@/lib/types";

/**
 * POST /api/invoices
 * Turns an approved change order into a PayPal invoice, sends it to the homeowner,
 * and returns the pay link + a QR code to show on the contractor's phone.
 */
export async function POST(req: Request) {
  const co = (await req.json()) as ChangeOrder;

  if (!co?.items?.length) return Response.json({ error: "Change order has no line items" }, { status: 400 });
  if (co.items.some((i) => !(i.unitPriceCents > 0) || !(i.quantity > 0)))
    return Response.json({ error: "Every line needs a quantity and a price above $0" }, { status: 400 });

  // Sandbox demo: when no homeowner email is given, bill the sandbox personal (buyer) account.
  co.homeowner = {
    name: co.homeowner?.name || "Homeowner",
    email: co.homeowner?.email || process.env.PAYPAL_SANDBOX_PERSONAL_EMAIL!,
  };

  // The invoicer must be the PayPal account that owns our API credentials.
  co.contractor = {
    businessName: co.contractor?.businessName || "SiteTab Contractor",
    email: process.env.PAYPAL_SANDBOX_BUSINESS_EMAIL!,
  };

  try {
    const draft = await createInvoice(co);
    await sendInvoice(draft.id);
    const qr = await getInvoiceQr(draft.id);
    return Response.json({ ...draft, status: "SENT", qr });
  } catch (e) {
    if (e instanceof PayPalError) {
      console.error(e.message, JSON.stringify(e.details));
      return Response.json({ error: e.message, details: e.details }, { status: 502 });
    }
    throw e;
  }
}
