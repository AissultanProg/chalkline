import Link from "next/link";
import { Wordmark } from "./Brand";

/** Top bar for the contractor's screens. */
export default function AppHeader({ active }: { active: "new" | "dashboard" }) {
  const link = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-semibold transition sm:px-4 ${on ? "bg-ink text-bone" : "text-muted hover:text-ink"}`;
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-bone/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
        <Link href="/" aria-label="Chalkline home">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1" aria-label="Main">
          <Link href="/" className={link(active === "new")} aria-current={active === "new" ? "page" : undefined}>
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">New change order</span>
          </Link>
          <Link href="/dashboard" className={link(active === "dashboard")} aria-current={active === "dashboard" ? "page" : undefined}>
            Dashboard
          </Link>
          <span className="ml-2 hidden rounded-full border border-brass/40 px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-brass-deep sm:inline">
            Sandbox
          </span>
        </nav>
      </div>
    </header>
  );
}
