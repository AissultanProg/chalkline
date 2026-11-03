import { clientIp } from "@/lib/http";
import { PayPalError } from "@/lib/paypal";
import { approveAndInvoice, WorkflowError } from "@/lib/workflow";

const MAX_SIGNATURE_CHARS = 300_000;

/** POST /api/change-orders/:id/approve — homeowner signs; we then create + send the PayPal invoice. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { name?: string; signaturePng?: string; agree?: boolean };

  const name = body.name?.trim() ?? "";
  if (!body.agree) return Response.json({ error: "Please confirm you approve the work and price." }, { status: 400 });
  if (name.length < 2) return Response.json({ error: "Please type your full name." }, { status: 400 });
  if (!body.signaturePng?.startsWith("data:image/png;base64,") || body.signaturePng.length > MAX_SIGNATURE_CHARS)
    return Response.json({ error: "Please sign in the box." }, { status: 400 });

  try {
    const co = await approveAndInvoice(id, {
      name: name.slice(0, 100),
      png: body.signaturePng,
      ip: clientIp(req),
      agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
    });
    return Response.json({ status: co.status, payerUrl: co.payerUrl, invoiceId: co.invoiceId });
  } catch (e) {
    if (e instanceof WorkflowError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof PayPalError) {
      console.error(e.message, JSON.stringify(e.details));
      return Response.json(
        { error: "Your approval is saved, but PayPal didn't respond. The contractor will resend the invoice." },
        { status: 502 },
      );
    }
    throw e;
  }
}
