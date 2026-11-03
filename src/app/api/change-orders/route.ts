import QRCode from "qrcode";
import { originOf } from "@/lib/http";
import { createChangeOrder, getJob, type NewChangeOrder } from "@/lib/repo";

const MAX_AUDIO_CHARS = 4_000_000; // ~3 MB of base64 audio
const MAX_PHOTO_CHARS = 600_000; // per photo (~450 KB JPEG)

/**
 * POST /api/change-orders — contractor saves a reviewed change order.
 * Returns the homeowner's approval link + a QR code to show on the contractor's phone.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as NewChangeOrder;

  const job = await getJob(body.jobId);
  if (!job) return Response.json({ error: "Unknown job" }, { status: 404 });
  if (!body.title?.trim() || !body.summary?.trim()) return Response.json({ error: "Title and summary are required" }, { status: 400 });
  if (!Array.isArray(body.items) || body.items.length === 0) return Response.json({ error: "Add at least one line item" }, { status: 400 });
  if (body.items.some((i) => !(i.quantity > 0) || !(i.unitPriceCents > 0) || !i.description?.trim()))
    return Response.json({ error: "Every line needs a description, quantity and price above $0" }, { status: 400 });
  if (body.audioDataUrl && (body.audioDataUrl.length > MAX_AUDIO_CHARS || !body.audioDataUrl.startsWith("data:audio/")))
    return Response.json({ error: "Audio recording is too large or invalid" }, { status: 413 });
  const photos = (body.photos ?? []).slice(0, 3);
  if (photos.some((p) => !p.dataUrl?.startsWith("data:image/") || p.dataUrl.length > MAX_PHOTO_CHARS))
    return Response.json({ error: "A photo is too large or invalid" }, { status: 413 });

  const co = await createChangeOrder({
    jobId: job.id,
    title: body.title.trim().slice(0, 120),
    summary: body.summary.trim().slice(0, 2000),
    items: body.items.map((i) => ({
      kind: String(i.kind ?? "labor"),
      description: i.description.trim().slice(0, 200),
      quantity: Number(i.quantity),
      unit: i.unit,
      unitPriceCents: Math.round(Number(i.unitPriceCents)),
    })),
    memoOriginal: String(body.memoOriginal ?? "").slice(0, 4000),
    memoLanguage: String(body.memoLanguage ?? "English"),
    memoEnglish: String(body.memoEnglish ?? "").slice(0, 4000),
    audioDataUrl: body.audioDataUrl ?? null,
    photos: photos.map((p) => ({ dataUrl: p.dataUrl, caption: String(p.caption ?? "").slice(0, 300) })),
  });

  const approvalUrl = `${originOf(req)}/a/${co.id}`;
  const qr = await QRCode.toDataURL(approvalUrl, { margin: 1, width: 480, color: { dark: "#1c1a17", light: "#fffdf8" } });
  return Response.json({ id: co.id, number: co.number, totalCents: co.totalCents, approvalUrl, qr });
}
