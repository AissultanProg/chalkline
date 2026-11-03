"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { compressPhoto, usd, type Photo } from "@/lib/client-utils";
import type { Draft } from "@/lib/ai";
import { useSpeech } from "./useSpeech";

type Item = Draft["lineItems"][number];
type Sent = { id: string; totalCents: number; payerUrl: string | null; qr: string; status: string };
type Step = "capture" | "review" | "sent";

const JOB = {
  title: "Miller kitchen remodel",
  scope: "Original contract: replace cabinets and countertops.",
  homeowner: "Dana Miller",
  business: "Reyes Carpentry",
  rateCents: 6500,
};

const LANGS = [
  { code: "es-US", label: "Español" },
  { code: "en-US", label: "English" },
];

export default function ChangeOrderFlow() {
  const [step, setStep] = useState<Step>("capture");
  const [lang, setLang] = useState(LANGS[0].code);
  const [memo, setMemo] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [summary, setSummary] = useState("");
  const [title, setTitle] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);

  const appendPhrase = useCallback((t: string) => setMemo((m) => (m ? `${m} ${t}` : t)), []);
  const speech = useSpeech(appendPhrase);

  const total = items.reduce((s, i) => s + i.quantity * i.unitPriceCents, 0);
  const unpriced = items.some((i) => !(i.unitPriceCents > 0) || !(i.quantity > 0));

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const next = await Promise.all([...files].slice(0, 3 - photos.length).map((f) => compressPhoto(f)));
    setPhotos((p) => [...p, ...next].slice(0, 3));
  }

  async function makeDraft() {
    speech.stop();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transcript: memo,
          photos: photos.map(({ base64, mediaType }) => ({ base64, mediaType })),
          jobContext: `${JOB.title}. ${JOB.scope}`,
          laborRateCents: JOB.rateCents,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't draft the change order");
      setDraft(json);
      setItems(json.lineItems);
      setSummary(json.homeownerSummary);
      setTitle(json.title);
      setStep("review");
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
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobTitle: JOB.title,
          summary: `${title}\n\n${summary}`,
          items: items.map(({ description, quantity, unit, unitPriceCents }) => ({ description, quantity, unit, unitPriceCents })),
          homeowner: { name: JOB.homeowner, email: "" },
          contractor: { businessName: JOB.business, email: "" },
          originalTranscript: draft?.detectedLanguage !== "English" ? memo : undefined,
          originalLanguage: draft?.detectedLanguage,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "PayPal couldn't create the invoice");
      setSent(json);
      setStep("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep("capture");
    setMemo("");
    setPhotos([]);
    setDraft(null);
    setItems([]);
    setSent(null);
    setError(null);
  }

  return (
    <main className="grid-bg min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-10 pt-5">
        <Header />
        <JobCard />
        <Progress step={step} />

        {step === "capture" && (
          <section className="mt-4 flex flex-col gap-4">
            <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">What changed?</h2>
                <div className="flex rounded-full border border-line p-0.5 text-sm">
                  {LANGS.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => setLang(l.code)}
                      className={`rounded-full px-3 py-1 font-semibold transition ${lang === l.code ? "bg-ink text-paper" : "text-muted"}`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="my-6 flex flex-col items-center gap-3">
                <button
                  onClick={() => (speech.listening ? speech.stop() : speech.start(lang))}
                  aria-label={speech.listening ? "Stop recording" : "Start recording"}
                  className={`grid size-28 place-items-center rounded-full text-white shadow-lg transition active:scale-95 ${
                    speech.listening ? "recording bg-safety-dark" : "bg-safety hover:bg-safety-dark"
                  }`}
                >
                  {speech.listening ? <StopIcon /> : <MicIcon />}
                </button>
                <p className="text-sm text-muted">
                  {speech.listening ? "Listening… tap to stop" : "Tap and describe the extra work"}
                </p>
              </div>

              <textarea
                value={memo + (speech.interim ? ` ${speech.interim}` : "")}
                onChange={(e) => setMemo(e.target.value)}
                rows={4}
                placeholder={lang.startsWith("es") ? "Ej: La señora me pidió dos repisas más en la despensa, como tres horas, ochenta en roble…" : "e.g. Homeowner asked for two extra pantry shelves, about 3 hours, $80 in oak…"}
                className="w-full resize-none rounded-xl border border-line bg-paper/60 p-3 text-[15px] leading-relaxed outline-none focus:border-ink"
              />
              {speech.error && <p className="mt-2 text-sm text-warn">{speech.error}</p>}
            </div>

            <PhotoPicker photos={photos} onAdd={addPhotos} onRemove={(i) => setPhotos((p) => p.filter((_, j) => j !== i))} />

            <PrimaryButton onClick={makeDraft} disabled={busy || !memo.trim()}>
              {busy ? "Writing change order…" : "Write change order"}
            </PrimaryButton>
          </section>
        )}

        {step === "review" && draft && (
          <section className="mt-4 flex flex-col gap-4">
            <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Change order · AI draft
                {draft.detectedLanguage !== "English" && (
                  <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] text-paper">translated from {draft.detectedLanguage}</span>
                )}
              </div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-transparent text-xl font-bold outline-none"
              />
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={4}
                className="mt-2 w-full resize-none rounded-lg bg-paper/50 p-2 text-[15px] leading-relaxed outline-none focus:ring-1 focus:ring-ink"
              />

              <ul className="mt-3 divide-y divide-line border-y border-line">
                {items.map((it, i) => (
                  <LineRow
                    key={i}
                    item={it}
                    onChange={(patch) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
                    onRemove={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                  />
                ))}
              </ul>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-sm text-muted">Labor at {usd(JOB.rateCents)}/hr</span>
                <span className="font-mono text-2xl font-bold">{usd(total)}</span>
              </div>
            </div>

            {(draft.needsClarification.length > 0 || unpriced) && (
              <div className="rounded-2xl border border-warn/30 bg-warn-bg p-4 text-sm">
                <p className="mb-1 font-bold text-warn">Check before sending</p>
                <ul className="list-disc space-y-1 pl-5 text-ink/80">
                  {unpriced && <li>Some lines have no price yet — fill them in.</li>}
                  {draft.needsClarification.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}

            <details className="rounded-2xl border border-line bg-card p-4 text-sm">
              <summary className="cursor-pointer font-semibold">Evidence on file</summary>
              <p className="mt-2 text-muted">Original memo ({draft.detectedLanguage}):</p>
              <p className="italic">“{memo}”</p>
              {draft.detectedLanguage !== "English" && (
                <>
                  <p className="mt-2 text-muted">Translation:</p>
                  <p className="italic">“{draft.englishTranscript}”</p>
                </>
              )}
              {photos.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {photos.map((p, i) => (
                    <figure key={i}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.preview} alt={draft.photoEvidence[i] ?? "Job photo"} className="aspect-square w-full rounded-lg object-cover" />
                      <figcaption className="mt-1 text-[11px] leading-tight text-muted">{draft.photoEvidence[i]}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </details>

            <PrimaryButton onClick={send} disabled={busy || unpriced || items.length === 0}>
              {busy ? "Creating PayPal invoice…" : `Send ${usd(total)} to ${JOB.homeowner.split(" ")[0]}`}
            </PrimaryButton>
            <button onClick={() => setStep("capture")} className="text-sm font-semibold text-muted underline">
              Back to memo
            </button>
          </section>
        )}

        {step === "sent" && sent && <SentCard sent={sent} onNew={reset} />}

        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      </div>
    </main>
  );
}

/* ---------------------------------------------------------------- pieces */

function Header() {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="grid size-8 place-items-center rounded-md bg-ink font-mono text-sm font-bold text-safety">ST</div>
        <span className="text-xl font-extrabold tracking-tight">SiteTab</span>
      </div>
      <span className="font-mono text-xs text-muted">{JOB.business}</span>
    </header>
  );
}

function JobCard() {
  return (
    <div className="mt-4 rounded-2xl bg-ink p-4 text-paper">
      <p className="text-xs uppercase tracking-wider text-paper/60">On site now</p>
      <p className="text-lg font-bold">{JOB.title}</p>
      <p className="text-sm text-paper/70">
        {JOB.homeowner} · {JOB.scope}
      </p>
    </div>
  );
}

function Progress({ step }: { step: Step }) {
  const steps: [Step, string][] = [
    ["capture", "Say it"],
    ["review", "Review"],
    ["sent", "Get paid"],
  ];
  const at = steps.findIndex(([s]) => s === step);
  return (
    <ol className="mt-4 grid grid-cols-3 gap-2 text-xs font-semibold">
      {steps.map(([s, label], i) => (
        <li key={s} className="flex flex-col gap-1">
          <span className={`h-1 rounded-full ${i <= at ? "bg-safety" : "bg-line"}`} />
          <span className={i <= at ? "text-ink" : "text-muted"}>{label}</span>
        </li>
      ))}
    </ol>
  );
}

function PhotoPicker({ photos, onAdd, onRemove }: { photos: Photo[]; onAdd: (f: FileList | null) => void; onRemove: (i: number) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Photos <span className="font-normal text-muted">(proof of work)</span></h2>
        <span className="font-mono text-xs text-muted">{photos.length}/3</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {photos.map((p, i) => (
          <div key={i} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.preview} alt={`Photo ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
            <button onClick={() => onRemove(i)} aria-label="Remove photo" className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-ink/80 text-xs text-paper">
              ✕
            </button>
          </div>
        ))}
        {photos.length < 3 && (
          <button
            onClick={() => input.current?.click()}
            className="grid aspect-square place-items-center rounded-lg border-2 border-dashed border-line text-muted transition hover:border-ink hover:text-ink"
          >
            <span className="text-center text-sm font-semibold">
              <CameraIcon />
              Add
            </span>
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { onAdd(e.target.files); e.target.value = ""; }} />
    </div>
  );
}

function LineRow({ item, onChange, onRemove }: { item: Item; onChange: (p: Partial<Item>) => void; onRemove: () => void }) {
  const missing = !(item.unitPriceCents > 0);
  return (
    <li className="py-3">
      <div className="flex items-start gap-2">
        <span className={`mt-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${item.kind === "labor" ? "bg-ink text-paper" : "bg-line text-ink"}`}>
          {item.kind}
        </span>
        <input
          value={item.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className="flex-1 bg-transparent font-medium outline-none"
        />
        <button onClick={onRemove} aria-label="Remove line" className="text-muted hover:text-ink">✕</button>
      </div>
      <div className="mt-2 flex items-center gap-2 pl-1 font-mono text-sm">
        {item.unit === "HOURS" && (
          <>
            <input
              type="number"
              min={0}
              step={0.25}
              value={item.quantity}
              onChange={(e) => onChange({ quantity: Number(e.target.value) })}
              className="w-16 rounded border border-line bg-paper/60 px-2 py-1"
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
          className={`w-24 rounded border px-2 py-1 ${missing ? "border-warn bg-warn-bg" : "border-line bg-paper/60"}`}
        />
        <span className="ml-auto font-bold">{usd(item.quantity * item.unitPriceCents)}</span>
      </div>
    </li>
  );
}

function SentCard({ sent, onNew }: { sent: Sent; onNew: () => void }) {
  const [status, setStatus] = useState(sent.status);
  const paid = status === "PAID" || status === "MARKED_AS_PAID";

  useEffect(() => {
    if (paid) return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/invoices/${sent.id}`);
      if (r.ok) setStatus((await r.json()).status);
    }, 4000);
    return () => clearInterval(t);
  }, [sent.id, paid]);

  return (
    <section className="mt-4 flex flex-col items-center gap-4">
      <div className="relative w-full rounded-2xl border border-line bg-card p-6 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{paid ? "Paid via PayPal" : "Hand your phone to the homeowner"}</p>
        <p className="mt-1 font-mono text-4xl font-bold">{usd(sent.totalCents)}</p>

        <div className={`relative mx-auto mt-4 w-64 transition ${paid ? "opacity-20" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sent.qr} alt="PayPal invoice QR code" className="w-full rounded-lg" />
        </div>
        {paid && (
          <div className="stamp absolute inset-0 grid place-items-center">
            <span className="rounded-xl border-[6px] border-paid px-6 py-2 font-mono text-5xl font-black tracking-widest text-paid">PAID</span>
          </div>
        )}

        <p className="mt-4 text-sm text-muted">
          {paid ? "Money's in your PayPal. Change order closed." : "Scan to review & pay with PayPal. Also emailed to the homeowner."}
        </p>
        <div className="mt-3 flex items-center justify-center gap-2 text-sm">
          <span className={`size-2 rounded-full ${paid ? "bg-paid" : "animate-pulse bg-safety"}`} />
          <span className="font-mono">{status}</span>
          <span className="text-muted">· {sent.id}</span>
        </div>
        {sent.payerUrl && !paid && (
          <a href={sent.payerUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold underline">
            Open pay link
          </a>
        )}
      </div>
      <PrimaryButton onClick={onNew}>New change order</PrimaryButton>
    </section>
  );
}

function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="w-full rounded-2xl bg-ink py-4 text-lg font-bold text-paper shadow-md transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

const MicIcon = () => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
  </svg>
);
const StopIcon = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);
const CameraIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mx-auto mb-1" aria-hidden>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);
