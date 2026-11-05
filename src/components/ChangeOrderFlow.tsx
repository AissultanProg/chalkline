"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { compressPhoto, usd, type Photo } from "@/lib/client-utils";
import type { Draft } from "@/lib/ai";
import type { Segment, Transcript } from "@/lib/transcribe";
import { useRecorder } from "./useRecorder";
import { Wordmark } from "./Brand";

type Item = Draft["lineItems"][number];
type Sent = { id: string; number: number; totalCents: number; approvalUrl: string; qr: string };
type Step = "capture" | "review" | "sent";
export type JobInfo = { id: string; title: string; scope: string; homeowner: string; rateCents: number };

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(b);
  });

const COPY: Record<Step, { title: string; body: string }> = {
  capture: {
    title: "Say what changed.",
    body: "Talk the way you would to your crew, in any language. Chalkline writes the change order and prices it at your rate.",
  },
  review: {
    title: "Check the paperwork.",
    body: "Every line is editable. Nothing reaches the homeowner until you send it, and no invoice exists until they sign.",
  },
  sent: {
    title: "Signed on site. Paid on site.",
    body: "The homeowner scans the code, then reviews, signs and pays with PayPal on their own phone. You'll see each step land here, live.",
  },
};

export default function ChangeOrderFlow({ job }: { job: JobInfo }) {
  const [step, setStep] = useState<Step>("capture");
  const [memo, setMemo] = useState("");
  const [heard, setHeard] = useState<Transcript | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [summary, setSummary] = useState("");
  const [title, setTitle] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);

  const onRecorded = useCallback(
    async (audio: Blob) => {
      setAudioUrl(URL.createObjectURL(audio));
      setAudioBlob(audio);
      setTranscribing(true);
      setError(null);
      try {
        const form = new FormData();
        form.append("audio", audio);
        form.append("context", `${job.title}. Homeowner ${job.homeowner}. ${job.scope}`);
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Couldn't transcribe");
        setHeard(json);
        setMemo((m) => (m ? `${m} ${json.text}` : json.text));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setTranscribing(false);
      }
    },
    [job],
  );
  const mic = useRecorder(onRecorded);

  const total = items.reduce((s, i) => s + i.quantity * i.unitPriceCents, 0);
  const unpriced = items.some((i) => !(i.unitPriceCents > 0) || !(i.quantity > 0));
  const first = job.homeowner.split(" ")[0];

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const next = await Promise.all([...files].slice(0, 3 - photos.length).map((f) => compressPhoto(f)));
    setPhotos((p) => [...p, ...next].slice(0, 3));
  }

  async function makeDraft() {
    mic.stop();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transcript: memo,
          photos: photos.map(({ base64, mediaType }) => ({ base64, mediaType })),
          jobContext: `${job.title}. ${job.scope}`,
          laborRateCents: job.rateCents,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't draft the change order");
      setDraft(json);
      setItems(json.lineItems);
      setSummary(json.homeownerSummary);
      setTitle(json.title);
      setStep("review");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/change-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          title,
          summary,
          items: items.map(({ kind, description, quantity, unit, unitPriceCents }) => ({ kind, description, quantity, unit, unitPriceCents })),
          memoOriginal: memo,
          memoLanguage: draft?.detectedLanguage ?? "English",
          memoEnglish: draft?.englishTranscript ?? memo,
          audioDataUrl: audioBlob ? await blobToDataUrl(audioBlob) : null,
          photos: photos.map((p, i) => ({ dataUrl: p.preview, caption: draft?.photoEvidence[i] ?? "" })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't save the change order");
      setSent(json);
      setStep("sent");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep("capture");
    setMemo("");
    setHeard(null);
    setAudioUrl(null);
    setAudioBlob(null);
    setPhotos([]);
    setDraft(null);
    setItems([]);
    setSent(null);
    setError(null);
  }

  return (
    <div className="min-h-dvh">
      <TopBar job={job} />

      <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-14 lg:px-10 lg:pt-12 xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* ── Left rail: what's happening + where you are ── */}
        <aside className="lg:self-start lg:[@media(min-height:860px)]:sticky lg:[@media(min-height:860px)]:top-24 lg:rounded-[26px] lg:border lg:border-line/80 lg:bg-card/72 lg:p-8 lg:shadow-[var(--shadow-sheet)] lg:backdrop-blur-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass-deep">Change order</p>
          <h1 key={step} className="rise mt-2 font-display text-[34px] font-medium leading-[1.05] sm:text-[42px] lg:text-[46px]">
            {COPY[step].title}
          </h1>
          <div key={`chalk-${step}`} className="chalk mt-4 w-24 lg:mt-6 lg:w-40" />
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted lg:mt-6">{COPY[step].body}</p>

          <Stepper step={step} />
          <JobFacts job={job} />
        </aside>

        {/* ── Work area ── */}
        <main className="min-w-0">
          {step === "capture" && (
            <div className="flex flex-col gap-5">
              <section className="sheet rise p-5 sm:p-7" style={{ ["--d" as string]: "60ms" }}>
                <div className="grid items-center gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:gap-8">
                  <div className="flex flex-col items-center gap-3 md:px-2">
                    <button
                      onClick={() => (mic.recording ? mic.stop() : mic.start())}
                      disabled={transcribing}
                      aria-label={mic.recording ? "Stop recording" : "Start recording"}
                      className={`grid size-28 place-items-center rounded-full bg-ink text-bone shadow-[0_18px_40px_-16px_rgb(31_30_28/0.6)] ring-1 ring-brass/40 transition hover:bg-ink-2 active:scale-95 disabled:opacity-60 sm:size-32 ${
                        mic.recording ? "recording" : ""
                      }`}
                    >
                      {mic.recording ? <StopIcon /> : <MicIcon />}
                    </button>
                    <div className="h-6">
                      {mic.recording ? (
                        <div className="flex items-center gap-3">
                          <LevelMeter level={mic.level} />
                          <span className="font-mono text-sm">
                            {Math.floor(mic.seconds / 60)}:{String(mic.seconds % 60).padStart(2, "0")}
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm text-muted">{transcribing ? "Transcribing…" : "Tap to record"}</p>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <label htmlFor="memo" className="font-display text-xl font-medium">
                        The memo
                      </label>
                      <span className="text-xs text-muted">English · Español · any language</span>
                    </div>
                    {heard && heard.segments.some((s) => s.lowConfidence) && <HeardPreview segments={heard.segments} />}
                    <textarea
                      id="memo"
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      rows={5}
                      placeholder="“Homeowner asked for two extra pantry shelves, about three hours, eighty bucks in oak…”"
                      className="field w-full resize-none p-3.5 text-[15px] leading-relaxed placeholder:text-muted/70"
                    />
                    {heard && (
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                        <span>
                          Heard {heard.language} · {heard.durationSec}s · edit anything that&apos;s off
                        </span>
                        {audioUrl && <audio src={audioUrl} controls className="h-8 max-w-full" />}
                      </div>
                    )}
                    {mic.error && <p className="mt-2 text-sm text-warn">{mic.error}</p>}
                    {!heard && (
                      <p className="mt-2 text-xs text-muted">
                        Labor is priced at your rate of {usd(job.rateCents)}/hr. Materials only at prices you say.
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <PhotoPicker photos={photos} onAdd={addPhotos} onRemove={(i) => setPhotos((p) => p.filter((_, j) => j !== i))} />

              <div className="rise flex justify-end" style={{ ["--d" as string]: "180ms" }}>
                <PrimaryButton onClick={makeDraft} disabled={busy || transcribing || mic.recording || !memo.trim()}>
                  {busy ? "Writing it up…" : "Write the change order"}
                </PrimaryButton>
              </div>
            </div>
          )}

          {step === "review" && draft && (
            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
              {/* The document */}
              <section className="sheet rise overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 sm:px-7">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Draft · for {job.homeowner}</span>
                  {draft.detectedLanguage !== "English" && (
                    <span className="rounded-full bg-brass-wash px-2.5 py-1 text-[11px] font-semibold text-brass-deep">
                      Translated from {draft.detectedLanguage}
                    </span>
                  )}
                </div>
                <div className="p-5 sm:p-7">
                  <textarea
                    value={title}
                    onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
                    rows={2}
                    aria-label="Change order title"
                    className="field-sizing-content w-full resize-none rounded-md bg-transparent font-display text-[28px] font-medium leading-[1.12] outline-none focus:bg-bone/60 sm:text-[34px]"
                  />
                  <textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    rows={5}
                    aria-label="Summary for the homeowner"
                    className="field field-sizing-content mt-3 min-h-28 w-full resize-none p-3.5 text-[15px] leading-relaxed"
                  />

                  <ul className="mt-5 divide-y divide-line border-y border-line">
                    {items.map((it, i) => (
                      <LineRow
                        key={i}
                        item={it}
                        onChange={(patch) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
                        onRemove={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                      />
                    ))}
                  </ul>
                  <div className="mt-4 flex items-end justify-between gap-4">
                    <span className="text-sm text-muted">Labor at {usd(job.rateCents)}/hr</span>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted">Total</p>
                      <p className="font-mono text-3xl font-semibold">{usd(total)}</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Side: checks + evidence. Under the document on laptops, beside it on wide screens. */}
              <div className="grid content-start gap-5 md:grid-cols-2 2xl:grid-cols-1">
                {(draft.needsClarification.length > 0 || unpriced) && (
                  <section className="rise self-start rounded-[18px] border border-warn/25 bg-warn-wash p-5 text-sm" style={{ ["--d" as string]: "80ms" }}>
                    <p className="font-display text-lg font-medium text-warn">Check before sending</p>
                    <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-snug text-ink/80">
                      {unpriced && <li>Some lines have no price yet. Fill them in.</li>}
                      {draft.needsClarification.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </section>
                )}

                <section className="sheet rise p-5 text-sm" style={{ ["--d" as string]: "140ms" }}>
                  <p className="font-display text-lg font-medium">Evidence on file</p>
                  <p className="mt-3 text-xs uppercase tracking-[0.14em] text-muted">Original · {draft.detectedLanguage}</p>
                  <p className="mt-1 italic leading-relaxed">“{memo}”</p>
                  {audioUrl && <audio src={audioUrl} controls className="mt-2 h-9 w-full" />}
                  {draft.detectedLanguage !== "English" && (
                    <>
                      <p className="mt-4 text-xs uppercase tracking-[0.14em] text-muted">Translation</p>
                      <p className="mt-1 italic leading-relaxed">“{draft.englishTranscript}”</p>
                    </>
                  )}
                  {photos.length > 0 && (
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {photos.map((p, i) => (
                        <figure key={i}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.preview} alt={draft.photoEvidence[i] ?? "Job photo"} className="aspect-square w-full rounded-lg object-cover" />
                          <figcaption className="mt-1 text-[11px] leading-tight text-muted">{draft.photoEvidence[i]}</figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                </section>

                <div className="flex flex-col items-stretch gap-3 md:col-span-2 md:flex-row-reverse md:items-center md:justify-between 2xl:col-span-1 2xl:flex-col 2xl:items-stretch">
                  <PrimaryButton onClick={send} disabled={busy || unpriced || items.length === 0} brass>
                    {busy ? "Saving…" : `Get ${first}'s signature · ${usd(total)}`}
                  </PrimaryButton>
                  <button onClick={() => setStep("capture")} className="text-sm font-semibold text-muted underline-offset-4 hover:underline">
                    ← Back to the memo
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "sent" && sent && <SentPanel sent={sent} homeowner={job.homeowner} onNew={reset} />}

          {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        </main>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── chrome */

function TopBar({ job }: { job: JobInfo }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-bone/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <Wordmark />
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden min-w-0 truncate text-sm text-muted sm:block">
            <span className="font-medium text-ink">{job.title}</span> · {job.homeowner}
          </span>
          <span className="shrink-0 rounded-full border border-brass/40 px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-brass-deep">
            Sandbox
          </span>
        </div>
      </div>
    </header>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: [Step, string, string][] = [
    ["capture", "Say it", "Voice or text, any language"],
    ["review", "Review", "AI draft, your numbers"],
    ["sent", "Sign & pay", "Signature, then PayPal"],
  ];
  const at = steps.findIndex(([s]) => s === step);
  return (
    <ol className="mt-6 grid grid-cols-3 gap-3 lg:mt-10 lg:grid-cols-1 lg:gap-0">
      {steps.map(([s, label, hint], i) => {
        const done = i < at;
        const active = i === at;
        return (
          <li key={s} className="flex flex-col gap-2 lg:flex-row lg:items-start lg:gap-4 lg:py-3">
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-full font-mono text-xs font-semibold transition ${
                active ? "bg-ink text-bone" : done ? "bg-brass text-ink" : "border border-line text-muted"
              }`}
            >
              {done ? "✓" : `0${i + 1}`}
            </span>
            <span className="min-w-0">
              <span className={`block text-sm font-semibold ${i <= at ? "text-ink" : "text-muted"}`}>{label}</span>
              <span className="hidden text-xs text-muted lg:block">{hint}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function JobFacts({ job }: { job: JobInfo }) {
  return (
    <dl className="mt-8 hidden border-t border-line pt-5 text-sm lg:block">
      {[
        ["Job", job.title],
        ["Homeowner", job.homeowner],
        ["Contract", capitalize(job.scope.replace(/^Original contract:\s*/i, "").replace(/\.$/, ""))],
        ["Labor rate", `${usd(job.rateCents)} / hr`],
      ].map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 py-1.5">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ───────────────────────────────────────────────────────────── pieces */

function LevelMeter({ level }: { level: number }) {
  return (
    <div className="flex h-6 items-end gap-1" aria-hidden>
      {[0.1, 0.25, 0.45, 0.65, 0.85].map((t, i) => (
        <span
          key={i}
          className={`w-1.5 rounded-full transition-all duration-75 ${level > t ? "bg-brass" : "bg-line"}`}
          style={{ height: `${30 + i * 17}%` }}
        />
      ))}
    </div>
  );
}

function HeardPreview({ segments }: { segments: Segment[] }) {
  return (
    <div className="mb-3 rounded-xl border border-warn/25 bg-warn-wash p-3 text-[15px] leading-relaxed">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-warn">Double-check the underlined part</p>
      {segments.map((s, i) => (
        <span key={i} className={s.lowConfidence ? "underline decoration-warn decoration-2 underline-offset-4" : ""}>
          {s.text}{" "}
        </span>
      ))}
    </div>
  );
}

function PhotoPicker({ photos, onAdd, onRemove }: { photos: Photo[]; onAdd: (f: FileList | null) => void; onRemove: (i: number) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <section className="sheet rise p-5 sm:p-7" style={{ ["--d" as string]: "120ms" }}>
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-medium">
          Photos <span className="font-sans text-sm font-normal text-muted">proof of work</span>
        </h2>
        <span className="font-mono text-xs text-muted">{photos.length}/3</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-md">
        {photos.map((p, i) => (
          <div key={i} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.preview} alt={`Photo ${i + 1}`} className="aspect-square w-full rounded-xl object-cover" />
            <button
              onClick={() => onRemove(i)}
              aria-label="Remove photo"
              className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-ink/85 text-xs text-bone"
            >
              ✕
            </button>
          </div>
        ))}
        {photos.length < 3 && (
          <button
            onClick={() => input.current?.click()}
            className="grid aspect-square place-items-center rounded-xl border border-dashed border-brass/50 bg-bone/50 text-muted transition hover:border-brass hover:bg-brass-wash/60 hover:text-ink"
          >
            <span className="text-center text-sm font-medium">
              <CameraIcon />
              Add photo
            </span>
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => {
          onAdd(e.target.files);
          e.target.value = "";
        }}
      />
    </section>
  );
}

function LineRow({ item, onChange, onRemove }: { item: Item; onChange: (p: Partial<Item>) => void; onRemove: () => void }) {
  const missing = !(item.unitPriceCents > 0);
  return (
    <li className="py-4">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 rounded-md px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ${
            item.kind === "labor" ? "bg-ink text-bone" : "bg-brass-wash text-brass-deep"
          }`}
        >
          {item.kind}
        </span>
        <textarea
          value={item.description}
          onChange={(e) => onChange({ description: e.target.value.replace(/\n/g, " ") })}
          rows={1}
          aria-label="Line description"
          className="field-sizing-content min-w-0 flex-1 resize-none rounded bg-transparent font-medium leading-snug outline-none focus:bg-bone/60"
        />
        <button onClick={onRemove} aria-label="Remove line" className="text-muted transition hover:text-ink">
          ✕
        </button>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 font-mono text-sm sm:pl-[60px]">
        {item.unit === "HOURS" && (
          <>
            <input
              type="number"
              min={0}
              step={0.25}
              value={item.quantity}
              onChange={(e) => onChange({ quantity: Number(e.target.value) })}
              aria-label="Hours"
              className="field w-20 px-2 py-1.5"
            />
            <span className="text-muted">hr ×</span>
          </>
        )}
        <span className="text-muted">$</span>
        <input
          type="number"
          min={0}
          step={1}
          value={item.unitPriceCents ? item.unitPriceCents / 100 : ""}
          placeholder="price?"
          onChange={(e) => onChange({ unitPriceCents: Math.round(Number(e.target.value) * 100) })}
          aria-label="Price"
          className={`field w-24 px-2 py-1.5 ${missing ? "!border-warn !bg-warn-wash" : ""}`}
        />
        <span className="ml-auto text-base font-semibold">{usd(item.quantity * item.unitPriceCents)}</span>
      </div>
    </li>
  );
}

type Live = {
  status: "awaiting_approval" | "approved" | "paid" | "declined";
  signerName: string | null;
  events: { type: string; at: string; detail: string }[];
};

const EVENT_LABEL: Record<string, string> = {
  created: "Change order written",
  viewed: "Homeowner opened it",
  signed: "Signed",
  invoice_sent: "PayPal invoice sent",
  paid: "Paid",
  webhook_verified: "PayPal confirmed payment",
};

function SentPanel({ sent, homeowner, onNew }: { sent: Sent; homeowner: string; onNew: () => void }) {
  const [live, setLive] = useState<Live>({ status: "awaiting_approval", signerName: null, events: [] });
  const paid = live.status === "paid";
  const first = homeowner.split(" ")[0];

  useEffect(() => {
    if (paid) return;
    let alive = true;
    const poll = async () => {
      const r = await fetch(`/api/change-orders/${sent.id}`, { cache: "no-store" });
      if (r.ok && alive) setLive(await r.json());
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [sent.id, paid]);

  const headline =
    live.status === "awaiting_approval"
      ? `Have ${first} scan this code`
      : live.status === "approved"
        ? `${live.signerName ?? first} signed. Waiting on PayPal.`
        : "Paid in full.";

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="sheet rise relative overflow-hidden p-6 text-center sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Change order Nº {sent.number}</p>
        <p className="mt-2 font-display text-2xl font-medium">{headline}</p>
        <p className="mt-1 font-mono text-4xl font-semibold">{usd(sent.totalCents)}</p>

        <div className={`mx-auto mt-6 w-56 rounded-2xl border border-line bg-card p-3 transition sm:w-64 ${live.status !== "awaiting_approval" ? "opacity-15" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sent.qr} alt="QR code to the change order approval page" className="w-full" />
        </div>
        {paid && (
          <div className="stamp pointer-events-none absolute inset-0 grid place-items-center">
            <span className="rounded-2xl border-[5px] border-moss bg-card/80 px-7 py-2 font-display text-6xl font-semibold italic text-moss">
              Paid
            </span>
          </div>
        )}

        {live.status === "awaiting_approval" && (
          <p className="mt-5 text-sm text-muted">
            {first} reviews, signs and pays on their own phone.{" "}
            <a href={sent.approvalUrl} target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-4">
              Testing on one device? Open the approval page
            </a>
          </p>
        )}
      </section>

      <section className="sheet rise p-6 sm:p-8" style={{ ["--d" as string]: "100ms" }}>
        <p className="font-display text-xl font-medium">Paper trail</p>
        <p className="mt-1 text-sm text-muted">Every step is time-stamped and kept with the change order.</p>
        <ol className="mt-5 flex flex-col">
          {live.events.map((e, i) => (
            <li key={i} className="relative flex items-start gap-3 pb-5 last:pb-0">
              <span className={`mt-1 size-2.5 shrink-0 rounded-full ${e.type === "paid" ? "bg-moss" : "bg-brass"}`} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{EVENT_LABEL[e.type] ?? e.type}</span>
                <span className="block truncate text-xs text-muted">{e.detail}</span>
              </span>
              <span className="font-mono text-xs text-muted">
                {new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}
              </span>
            </li>
          ))}
          {!paid && (
            <li className="flex items-center gap-3 pt-5 text-sm text-muted">
              <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-brass/60" />
              {live.status === "awaiting_approval" ? "Waiting for signature…" : "Waiting for payment…"}
            </li>
          )}
        </ol>
        <div className="mt-8">
          <PrimaryButton onClick={onNew}>New change order</PrimaryButton>
        </div>
      </section>
    </div>
  );
}

function PrimaryButton({ brass, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { brass?: boolean }) {
  return (
    <button
      {...props}
      className={`w-full whitespace-nowrap rounded-full px-7 py-4 text-base font-semibold sm:shrink-0 shadow-[0_14px_30px_-16px_rgb(31_30_28/0.55)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto ${
        brass ? "bg-brass text-ink hover:bg-[#c09a59]" : "bg-ink text-bone hover:bg-ink-2"
      } ${className}`}
    />
  );
}

const MicIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
    <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21.5M9 21.5h6" />
  </svg>
);
const StopIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="#b08a4a" aria-hidden>
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
  </svg>
);
const CameraIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="mx-auto mb-1.5" aria-hidden>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
