import QRCode from "qrcode";
import { z } from "zod";
import { originOf, parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { createChangeOrder, getJob } from "@/lib/repo";

const MAX_AUDIO_CHARS = 6_000_000; // about 4.5 MB of base64 audio
const MAX_PHOTO_CHARS = 900_000;

const Item = z.object({
  kind: z.enum(["labor", "material", "fee"]),
  description: z.string().trim().min(1, "Every line needs a description.").max(200),
  quantity: z.number("Every line needs a quantity above 0.").positive("Every line needs a quantity above 0.").max(10_000),
  unit: z.enum(["HOURS", "QUANTITY", "AMOUNT"]),
  unitPriceCents: z.number("Every line needs a price above $0.").int().positive("Every line needs a price above $0.").max(10_000_000),
});

const Body = z.object({
  jobId: z.string().min(1, "Unknown job"),
  title: z.string().trim().min(1, "Give the change order a title.").max(120),
  summary: z.string().trim().min(1, "Add a summary for the homeowner.").max(2000),
  items: z.array(Item).min(1, "Add at least one line item.").max(40),
  memoOriginal: z.string().max(4000).default(""),
  memoLanguage: z.string().max(40).default("English"),
  memoEnglish: z.string().max(8000).default(""),
  audioDataUrl: z.string().startsWith("data:audio/", "Audio recording is invalid.").max(MAX_AUDIO_CHARS, "The audio recording is too large.").nullable().default(null),
  photos: z
    .array(z.object({ dataUrl: z.string().startsWith("data:image/", "A photo is invalid.").max(MAX_PHOTO_CHARS, "A photo is too large."), caption: z.string().max(300).default("") }))
    .max(3, "Up to 3 photos.")
    .default([]),
});

/**
 * POST /api/change-orders — contractor saves a reviewed change order.
 * Returns the homeowner's approval link + a QR code to show on the contractor's phone.
 */
export async function POST(req: Request) {
  const limited = rateLimit(req, "save");
  if (limited) return limited;

  const { data, error } = await parseJson(req, Body);
  if (error) return error;

  const job = await getJob(data.jobId);
  if (!job) return Response.json({ error: "Unknown job" }, { status: 404 });

  const co = await createChangeOrder(data);
  const approvalUrl = `${originOf(req)}/a/${co.id}`;
  const qr = await QRCode.toDataURL(approvalUrl, { margin: 1, width: 480, color: { dark: "#1c1a17", light: "#fffdf8" } });
  return Response.json({ id: co.id, number: co.number, totalCents: co.totalCents, approvalUrl, qr });
}
