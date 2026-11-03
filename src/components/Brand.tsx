/** Chalkline mark: a chalk-line reel with its line pulled taut. */
export function Mark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#1f1e1c" />
      <circle cx="11" cy="16" r="5.2" fill="none" stroke="#b08a4a" strokeWidth="2" />
      <circle cx="11" cy="16" r="1.6" fill="#b08a4a" />
      <path d="M16.2 16 H26" stroke="#f2eee6" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="26.2" cy="16" r="1.4" fill="#f2eee6" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <Mark />
      <span className="font-display text-[22px] font-semibold leading-none">Chalkline</span>
    </span>
  );
}
