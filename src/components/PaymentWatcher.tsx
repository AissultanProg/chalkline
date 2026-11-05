"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Waits for a signed change order to be paid, then refreshes the homeowner's page.
 * It checks a tiny status endpoint, because reloading the page would re-download its photos and audio.
 */
export default function PaymentWatcher({ id }: { id: string }) {
  const router = useRouter();

  useEffect(() => {
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/change-orders/${id}`, { cache: "no-store" });
        const json = await res.json();
        if (res.ok && json.status !== "approved") router.refresh();
      } catch {
        // Weak signal. Try again on the next tick.
      }
    }, 5000);
    return () => clearInterval(t);
  }, [id, router]);

  return null;
}
