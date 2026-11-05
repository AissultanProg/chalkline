import { STATUS_LABEL, type OrderStatus } from "@/lib/labels";
import { usd } from "@/lib/money";
import type { Totals } from "@/lib/totals";

/* Colors validated together for contrast and color-blind separation. Text stays in ink; the dot carries identity. */
const PARTS = [
  { key: "paid", label: "Paid", color: "bg-chart-paid" },
  { key: "owed", label: "Waiting on payment", color: "bg-chart-owed" },
  { key: "unsigned", label: "Waiting on signature", color: "bg-chart-unsigned" },
] as const;

const count = (n: number) => `${n} change order${n === 1 ? "" : "s"}`;

export function StatTiles({ totals }: { totals: Totals }) {
  const tiles = [
    { label: "Collected", cents: totals.paidCents, n: totals.paidCount, color: "bg-chart-paid" },
    { label: "Waiting on payment", cents: totals.owedCents, n: totals.owedCount, color: "bg-chart-owed" },
    { label: "Waiting on signature", cents: totals.unsignedCents, n: totals.unsignedCount, color: "bg-chart-unsigned" },
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-3 sm:gap-4">
      {tiles.map((t) => (
        <div key={t.label} className="sheet px-5 py-4 sm:p-6">
          <dt className="flex items-center gap-2 text-sm text-muted">
            <span className={`size-2.5 rounded-full ${t.color}`} aria-hidden />
            {t.label}
          </dt>
          <dd className="mt-1.5 font-sans text-[30px] font-semibold leading-tight sm:text-[34px]">{usd(t.cents)}</dd>
          <dd className="mt-0.5 text-sm text-muted">{count(t.n)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function BarLegend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted" aria-label="Bar colors">
      {PARTS.map((p) => (
        <li key={p.key} className="flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${p.color}`} aria-hidden />
          {p.label}
        </li>
      ))}
    </ul>
  );
}

/** One job's money as a single thin bar. Each part shows its name and amount on hover or keyboard focus. */
export function MoneyBar({ totals }: { totals: Totals }) {
  const cents = { paid: totals.paidCents, owed: totals.owedCents, unsigned: totals.unsignedCents };
  const whole = cents.paid + cents.owed + cents.unsigned;
  if (whole === 0) return <div className="h-2 rounded-full bg-line/70" aria-label="No money on this job yet" role="img" />;

  const parts = PARTS.filter((p) => cents[p.key] > 0).map((p) => ({ ...p, cents: cents[p.key], share: Math.round((cents[p.key] / whole) * 100) }));
  const name = parts.map((p) => `${p.label}: ${usd(p.cents)}, ${p.share}%`).join("; ");

  return (
    <div className="flex h-2 gap-0.5" role="img" aria-label={name}>
      {parts.map((p) => (
        <span
          key={p.key}
          tabIndex={0}
          className={`group relative h-full min-w-1.5 rounded-full outline-offset-2 ${p.color}`}
          style={{ flexGrow: p.cents, flexBasis: 0 }}
        >
          <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs text-bone shadow-lg group-hover:block group-focus:block">
            {p.label}: {usd(p.cents)} ({p.share}%)
          </span>
        </span>
      ))}
    </div>
  );
}

export function StatusPill({ status }: { status: OrderStatus }) {
  const style: Record<OrderStatus, { dot: string; icon: string }> = {
    paid: { dot: "text-chart-paid", icon: "✓" },
    approved: { dot: "text-chart-owed", icon: "●" },
    awaiting_approval: { dot: "text-chart-unsigned", icon: "●" },
    declined: { dot: "text-muted", icon: "✕" },
  };
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-bone/60 px-2.5 py-1 text-xs font-semibold">
      <span className={`text-[10px] leading-none ${style[status].dot}`} aria-hidden>
        {style[status].icon}
      </span>
      {STATUS_LABEL[status]}
    </span>
  );
}
