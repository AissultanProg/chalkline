import { PayPalError } from "@/lib/paypal";
import { rateLimit } from "@/lib/rate-limit";
import { getOrderSummary } from "@/lib/repo";
import { remindHomeowner, WorkflowError } from "@/lib/workflow";

/** POST /api/change-orders/:id/remind — sends the homeowner a PayPal payment reminder. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, "paypal");
  if (limited) return limited;

  const { id } = await params;
  const co = await getOrderSummary(id);
  if (!co) return Response.json({ error: "Change order not found" }, { status: 404 });

  try {
    await remindHomeowner(co);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof WorkflowError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof PayPalError) {
      console.error(e.message, JSON.stringify(e.details));
      return Response.json({ error: "PayPal didn't accept the reminder. Try again later." }, { status: 502 });
    }
    throw e;
  }
}
