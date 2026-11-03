import Anthropic from "@anthropic-ai/sdk";
import { draftChangeOrder, type DraftInput } from "@/lib/ai";

export const maxDuration = 60;

/** POST /api/draft — voice memo transcript + photos → structured, priced change order draft. */
export async function POST(req: Request) {
  const body = (await req.json()) as DraftInput;

  if (!body.transcript?.trim()) return Response.json({ error: "Say or type what changed first." }, { status: 400 });
  if ((body.photos?.length ?? 0) > 3) return Response.json({ error: "Up to 3 photos." }, { status: 400 });

  try {
    const draft = await draftChangeOrder({
      transcript: body.transcript.slice(0, 4000),
      photos: body.photos ?? [],
      jobContext: body.jobContext ?? "",
      laborRateCents: body.laborRateCents > 0 ? body.laborRateCents : 6500,
    });
    return Response.json(draft);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: "AI is busy — try again in a moment." }, { status: 429 });
    if (e instanceof Anthropic.APIError) {
      console.error("Anthropic error", e.status, e.message);
      return Response.json({ error: "AI service error." }, { status: 502 });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
