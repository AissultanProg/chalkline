import { transcribe } from "@/lib/transcribe";

export const maxDuration = 60;
const MAX_BYTES = 20 * 1024 * 1024;

/** POST /api/transcribe — multipart { audio: Blob, context?: string } → transcript with confidence flags. */
export async function POST(req: Request) {
  const form = await req.formData();
  const audio = form.get("audio");
  const context = String(form.get("context") ?? "");

  if (!(audio instanceof Blob) || audio.size === 0) return Response.json({ error: "No audio received." }, { status: 400 });
  if (audio.size > MAX_BYTES) return Response.json({ error: "Recording is too long — keep memos under 2 minutes." }, { status: 413 });

  // Whisper infers the codec from the filename extension.
  const ext = audio.type.includes("mp4") ? "mp4" : audio.type.includes("ogg") ? "ogg" : audio.type.includes("wav") ? "wav" : "webm";

  try {
    const t = await transcribe(audio, `memo.${ext}`, context);
    if (!t.text) return Response.json({ error: "Didn't catch any speech — try again a bit closer to the mic." }, { status: 422 });
    return Response.json(t);
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Couldn't transcribe the memo. Try again or type it." }, { status: 502 });
  }
}
