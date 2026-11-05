import { z } from "zod";
import { clientIp, parseJson } from "@/lib/http";
import { PayPalError } from "@/lib/paypal";
import { approveAndInvoice, WorkflowError } from "@/lib/workflow";

const Body = z.object({
  agree: z.literal(true, "Please confirm you approve the work and price."),
  name: z.string("Please type your full name.").trim().min(2, "Please type your full name.").max(100),
  signaturePng: z.string("Please sign in the box.").startsWith("data:image/png;base64,", "Please sign in the box.").max(300_000, "That signature is too large."),
});

/** POST /api/change-orders/:id/approve — homeowner signs; we then create + send the PayPal invoice. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await parseJson(req, Body);
  if (error) return error;

  try {
    const co = await approveAndInvoice(id, {
      name: data.name,
      png: data.signaturePng,
      ip: clientIp(req),
      agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
    });
    return Response.json({ status: co.status, payerUrl: co.payerUrl, invoiceId: co.invoiceId });
  } catch (e) {
    if (e instanceof WorkflowError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof PayPalError) {
      console.error(e.message, JSON.stringify(e.details));
      return Response.json({ error: "Your approval is saved, but PayPal didn't respond. The contractor can resend the invoice." }, { status: 502 });
    }
    throw e;
  }
}
