"use client";
import { useEffect } from "react";
import { Wordmark } from "@/components/Brand";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="sheet w-full max-w-md p-8 text-center">
        <div className="flex justify-center">
          <Wordmark />
        </div>
        <h1 className="mt-6 font-display text-3xl font-medium">Something went wrong.</h1>
        <p className="mt-2 text-muted">Your saved change orders are safe. Try loading this again.</p>
        <button onClick={() => retry()} className="mt-6 rounded-full bg-ink px-6 py-3 font-semibold text-bone transition hover:bg-ink-2">
          Try again
        </button>
      </div>
    </main>
  );
}
