"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OrderStatus } from "@/lib/labels";

const button =
  "rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold transition hover:border-brass hover:bg-brass-wash/50 disabled:cursor-not-allowed disabled:opacity-50";

/** The things a contractor can do with one change order, depending on where it stands. */
export default function OrderActions({ id, status, invoiceSent }: { id: string; status: OrderStatus; invoiceSent: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);

  async function post(path: string, done: string) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/change-orders/${id}/${path}`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "That didn't work. Try again.");
      setNote({ text: done });
      router.refresh();
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : "That didn't work. Try again.", bad: true });
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    const url = `${window.location.origin}/a/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setNote({ text: "Link copied. Send it to the homeowner." });
    } catch {
      setNote({ text: url }); // clipboard is unavailable outside https, so show it instead
    }
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2">
        {status === "approved" && invoiceSent && (
          <button className={button} disabled={busy} onClick={() => post("remind", "Reminder sent through PayPal.")}>
            {busy ? "Sending…" : "Send reminder"}
          </button>
        )}
        {status === "approved" && !invoiceSent && (
          <button className={button} disabled={busy} onClick={() => post("invoice", "Invoice sent through PayPal.")}>
            {busy ? "Sending…" : "Send invoice"}
          </button>
        )}
        {status === "awaiting_approval" && (
          <button className={button} onClick={copyLink}>
            Copy approval link
          </button>
        )}
        <a className={button} href={`/a/${id}?preview=1`} target="_blank" rel="noreferrer">
          {status === "awaiting_approval" ? "Preview" : "View record"}
        </a>
      </div>
      {note && (
        <p role="status" className={`mt-2 break-all text-sm ${note.bad ? "text-warn" : "text-muted"}`}>
          {note.text}
        </p>
      )}
    </div>
  );
}
