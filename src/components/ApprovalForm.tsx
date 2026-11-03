"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SignaturePad, { type SignaturePadHandle } from "./SignaturePad";
import { usd } from "@/lib/client-utils";

export default function ApprovalForm({ id, totalCents, defaultName }: { id: string; totalCents: number; defaultName: string }) {
  const router = useRouter();
  const pad = useRef<SignaturePadHandle>(null);
  const [name, setName] = useState(defaultName);
  const [agree, setAgree] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/change-orders/${id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, agree, signaturePng: pad.current?.toPng() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      router.refresh(); // server page re-renders into the "signed — pay now" state
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-2xl font-medium">Approve this change</h2>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Your full name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          className="field px-3.5 py-3 text-base font-normal"
        />
      </label>
      <SignaturePad ref={pad} onChange={setHasInk} />
      <div className="flex justify-end">
        <button onClick={() => pad.current?.clear()} className="text-sm font-semibold text-muted underline">
          Clear signature
        </button>
      </div>
      <label className="flex items-start gap-3 rounded-2xl border border-line bg-bone/50 p-4 text-sm leading-snug">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-5 accent-[#1f1e1c]" />
        <span>
          I approve the additional work described above for <strong>{usd(totalCents)}</strong>, added to my original contract.
        </span>
      </label>
      <button
        onClick={submit}
        disabled={busy || !agree || !hasInk || name.trim().length < 2}
        className="w-full rounded-full bg-brass py-4 text-lg font-semibold text-ink shadow-[0_14px_30px_-16px_rgb(31_30_28/0.55)] transition hover:bg-[#c09a59] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Saving signature & creating invoice…" : "Sign & approve"}
      </button>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <p className="text-center text-xs text-muted">
        Your signature, the time, and this device are recorded with the change order. Payment is handled securely by PayPal.
      </p>
    </section>
  );
}
