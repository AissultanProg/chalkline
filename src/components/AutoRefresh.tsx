"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the server page on a timer while something is still changing, so payments appear by themselves. */
export default function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 10_000);
    return () => clearInterval(t);
  }, [active, router]);

  return null;
}
