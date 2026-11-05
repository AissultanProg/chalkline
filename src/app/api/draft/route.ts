import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { draftChangeOrder } from "@/lib/ai";
import { parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { getJob } from "@/lib/repo";

export const maxDuration = 60;

const Body = z.object({
  jobId: z.string().min(1, "Unknown job"),
  transcript: z.string().trim().min(1, "Say or type what changed first.").max(4000, "That memo is too long."),
  photos: z
    .array(z.object({ mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]), base64: z.string().min(1).max(900_000, "A photo is too large.") }))
    .max(3, "Up to 3 photos.")
    .default([]),
});

/** POST /api/draft — voice memo transcript + photos → structured, priced change order draft. */
export async function POST(req: Request) {
  const limited = rateLimit(req, "draft");
  if (limited) return limited;

  const { data, error } = await parseJson(req, Body);
  if (error) return error;

  const job = await getJob(data.jobId);
  if (!job) return Response.json({ error: "Unknown job" }, { status: 404 });

  try {
    const draft = await draftChangeOrder({
      transcript: data.transcript,
      photos: data.photos,
      jobContext: `${job.title}. ${job.scope}`,
      laborRateCents: job.laborRateCents,
    });
    return Response.json(draft);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: "The AI is busy. Try again in a moment." }, { status: 429 });
    if (e instanceof Anthropic.APIError) {
      console.error("Anthropic error", e.status, e.message);
      return Response.json({ error: "The AI service had a problem. Try again." }, { status: 502 });
    }
    return Response.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
