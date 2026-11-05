import { z } from "zod";
import { parseJson } from "@/lib/http";
import { getOrderSummary, markDeclined } from "@/lib/repo";

const Body = z.object({ reason: z.string().trim().max(500, "Please keep the reason under 500 characters.").default("") });

/** POST /api/change-orders/:id/decline — homeowner says no. No invoice is ever created. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await parseJson(req, Body);
  if (error) return error;

  if (!(await getOrderSummary(id))) return Response.json({ error: "Change order not found" }, { status: 404 });
  if (!(await markDeclined(id, data.reason))) return Response.json({ error: "This change order was already answered." }, { status: 409 });
  return Response.json({ status: "declined" });
}
