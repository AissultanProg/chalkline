import { PayPalError } from "@/lib/paypal";
import { rateLimit } from "@/lib/rate-limit";
import { issueInvoice, WorkflowError } from "@/lib/workflow";

/** POST /api/change-orders/:id/invoice — contractor retries a signed order's invoice after a PayPal failure. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, "paypal");
  if (limited) return limited;

  const { id } = await params;
  try {
    const co = await issueInvoice(id);
    return Response.json({ status: co.status, invoiceId: co.invoiceId });
  } catch (e) {
    if (e instanceof WorkflowError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof PayPalError) {
      console.error(e.message, JSON.stringify(e.details));
      return Response.json({ error: "PayPal didn't respond. Try again in a moment." }, { status: 502 });
    }
    throw e;
  }
}
