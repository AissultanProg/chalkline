import "server-only";

/**
 * Speech-to-text via Groq-hosted Whisper large-v3.
 * We transcribe the whole memo at once (no flickering live guesses), bias Whisper with job vocabulary,
 * drop likely hallucinations on silence, and flag low-confidence segments for the contractor to check.
 */

const ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3";

// Trade vocabulary in both languages so Whisper spells job-site words correctly.
const TRADE_VOCAB =
  "Change order. Drywall, tablaroca, shelves, repisas, pantry, despensa, oak, roble, outlet, enchufe, trim, moldura, " +
  "cabinet, gabinete, countertop, cubierta, baseboard, zoclo, tile, azulejo, plywood, triplay, studs, polines, caulk.";

// Phrases Whisper is known to hallucinate on silence/noise (from subtitle training data).
const HALLUCINATIONS = [
  /gracias por ver/i,
  /suscr[ií]bete/i,
  /subt[ií]tulos (realizados|por)/i,
  /thanks? (you )?for watching/i,
  /please subscribe/i,
  /amara\.org/i,
];

type WhisperSegment = {
  text: string;
  avg_logprob: number;
  no_speech_prob: number;
  compression_ratio: number;
};

export type Segment = { text: string; lowConfidence: boolean };
export type Transcript = { text: string; language: string; segments: Segment[]; durationSec: number };

export async function transcribe(audio: Blob, filename: string, context: string): Promise<Transcript> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");

  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", MODEL);
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  // Whisper's prompt is limited (~224 tokens); context first, then vocabulary.
  form.append("prompt", `${context} ${TRADE_VOCAB}`.slice(0, 800));

  const res = await fetch(ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { text: string; language?: string; duration?: number; segments?: WhisperSegment[] };

  const segments: Segment[] = (json.segments ?? [])
    // OpenAI's own heuristic: high "no speech" + low confidence ⇒ silence, not words.
    .filter((s) => !(s.no_speech_prob > 0.6 && s.avg_logprob < -1))
    .filter((s) => !HALLUCINATIONS.some((re) => re.test(s.text)))
    .map((s) => ({
      text: s.text.trim(),
      lowConfidence: s.avg_logprob < -0.7 || s.compression_ratio > 2.4,
    }))
    .filter((s) => s.text.length > 0);

  return {
    text: segments.map((s) => s.text).join(" "),
    language: capitalize(json.language ?? "unknown"),
    segments,
    durationSec: Math.round(json.duration ?? 0),
  };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
