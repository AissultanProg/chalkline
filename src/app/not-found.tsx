import Link from "next/link";
import { Wordmark } from "@/components/Brand";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="sheet w-full max-w-md p-8 text-center">
        <div className="flex justify-center">
          <Wordmark />
        </div>
        <h1 className="mt-6 font-display text-3xl font-medium">We can&apos;t find that page.</h1>
        <p className="mt-2 text-muted">The link may be mistyped, or this change order may no longer exist.</p>
        <Link href="/dashboard" className="mt-6 inline-block rounded-full bg-ink px-6 py-3 font-semibold text-bone transition hover:bg-ink-2">
          Go to the dashboard
        </Link>
      </div>
    </main>
  );
}
