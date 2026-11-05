import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { LineItem } from "./types";

const client = new Anthropic();
const MODEL = "claude-opus-5-5";

/** What Claude extracts. Note: no prices it invented — only prices the contractor said out loud. */
const ExtractionSchema = z.object({
  detectedLanguage: z.string().describe("Language of the memo, e.g. 'Spanish', 'English'"),
  englishTranscript: z.string().describe("Faithful English translation of the memo (or the memo itself if already English)"),
  title: z.string().describe("Short change-order title, max 8 words, e.g. 'Two extra pantry shelves'"),
  homeownerSummary: z
    .string()
    .describe("2-3 plain-English sentences for the homeowner: what extra work was done/requested and why it costs extra. No jargon."),
  items: z.array(
    z.object({
      kind: z.enum(["labor", "material", "fee"]),
      description: z.string().describe("Short line-item name in English"),
      hours: z.number().nullable().describe("For labor only: hours stated or clearly implied. null otherwise"),
      quantity: z.number().nullable().describe("For materials: count if stated, else null"),
      statedPriceDollars: z
        .number()
        .nullable()
        .describe("TOTAL price in USD for this line ONLY if the contractor explicitly said it. Never guess. null otherwise"),
    }),
  ),
  photoEvidence: z
    .array(z.string())
    .describe("One short factual sentence per photo describing what it shows, useful as proof of work. Empty if no photos."),
  needsClarification: z
    .array(z.string())
    .describe("Anything missing or ambiguous the contractor must confirm before sending (e.g. 'Material cost for oak not stated'). Empty if none."),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

export type DraftInput = {
  transcript: string;
  photos: { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string }[];
  jobContext: string; // e.g. "Miller kitchen remodel. Original contract: replace cabinets and countertops."
  laborRateCents: number;
};

export type Draft = Extraction & { lineItems: (LineItem & { kind: string })[] };

const SYSTEM = `You turn a tradesperson's quick on-site voice memo (any language) into a clear change order for a homeowner.
The memo is speech-to-text from a job site: expect filler words, slang, rough numbers, and mixed languages.
Rules:
- Translate to clear English; keep trade terms accurate (e.g. "repisas" = shelves, "tablaroca" = drywall).
- Split labor from materials. Labor hours: use what was said ("como tres horas" = about 3 hours → 3).
- NEVER invent prices. Only fill statedPriceDollars when the contractor said an amount for that line.
- Photos are evidence of the work; describe only what is visible.
- Labor is priced automatically at the contractor's saved hourly rate, so never ask about the rate.
- If something needed to bill fairly is missing, add it to needsClarification instead of guessing. Keep it to the 1-3 most important points; don't flag missing photos.`;

export async function draftChangeOrder(input: DraftInput): Promise<Draft> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...input.photos.map(
      (p): Anthropic.Beta.BetaImageBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: p.mediaType, data: p.base64 },
      }),
    ),
    {
      type: "text",
      text: `Job: ${input.jobContext}\n\nContractor's voice memo (speech-to-text):\n"""${input.transcript}"""`,
    },
  ];

  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(ExtractionSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });

  if (res.stop_reason === "refusal") throw new Error("The AI declined to process this memo.");
  const x = res.parsed_output;
  if (!x) throw new Error("Could not read the memo into a change order — try rephrasing.");

  return { ...x, lineItems: priceItems(x, input.laborRateCents) };
}

/**
 * Deterministic pricing. A price the contractor said out loud always wins.
 * Otherwise labor uses their hourly rate. Anything unknown is left at 0 for them to fill in.
 */
function priceItems(x: Extraction, laborRateCents: number) {
  return x.items.map((it) => {
    const statedCents = it.statedPriceDollars == null ? null : Math.round(it.statedPriceDollars * 100);

    if (it.kind === "labor" && statedCents == null) {
      return { kind: it.kind, description: it.description, quantity: it.hours ?? 0, unit: "HOURS" as const, unitPriceCents: laborRateCents };
    }
    const count = it.kind !== "labor" && it.quantity && it.quantity > 1 ? ` (×${it.quantity})` : "";
    return { kind: it.kind, description: `${it.description}${count}`, quantity: 1, unit: "AMOUNT" as const, unitPriceCents: statedCents ?? 0 };
  });
}
