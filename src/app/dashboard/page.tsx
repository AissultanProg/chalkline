import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import AppHeader from "@/components/AppHeader";
import AutoRefresh from "@/components/AutoRefresh";
import { BarLegend, MoneyBar, StatTiles } from "@/components/Money";
import { usd } from "@/lib/money";
import { listJobs, listOrderSummaries } from "@/lib/repo";
import { totalsFor } from "@/lib/totals";
import { syncOpenOrders } from "@/lib/workflow";

export const metadata: Metadata = { title: "Dashboard — Chalkline" };
// Always render on request: this page shows live money from the database and PayPal.
export const instant = false;

export default async function DashboardPage() {
  await connection();
  let orders = await listOrderSummaries();
  if (await syncOpenOrders(orders)) orders = await listOrderSummaries();
  // Orders are newest first, so this puts the most recently active jobs at the top.
  const lastActive = (jobId: string) => {
    const i = orders.findIndex((o) => o.jobId === jobId);
    return i === -1 ? Infinity : i;
  };
  const jobs = (await listJobs()).sort((a, b) => lastActive(a.id) - lastActive(b.id));
  const totals = totalsFor(orders);
  const open = orders.some((o) => o.status === "approved" || o.status === "awaiting_approval");

  return (
    <div className="min-h-dvh">
      <AppHeader active="dashboard" />
      <AutoRefresh active={open} />

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-12">
        <div className="rise">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass-deep">Dashboard</p>
          <h1 className="mt-2 font-display text-[34px] font-medium leading-[1.05] sm:text-[42px] lg:text-[46px]">What&apos;s paid, what&apos;s owed.</h1>
          <div className="chalk mt-4 w-24 lg:w-40" />
        </div>

        <StatTiles totals={totals} />

        <section className="sheet overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-line px-5 py-4 sm:px-7">
            <h2 className="font-display text-2xl font-medium">Jobs</h2>
            <BarLegend />
          </div>
          <ul className="divide-y divide-line">
            {jobs.map((job) => {
              const t = totalsFor(orders.filter((o) => o.jobId === job.id));
              return (
                <li key={job.id} className="grid gap-4 px-5 py-5 sm:px-7 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-8">
                  <div className="min-w-0">
                    <Link href={`/jobs/${job.id}`} className="font-display text-xl font-medium underline-offset-4 hover:underline">
                      {job.title}
                    </Link>
                    <p className="mt-0.5 text-sm text-muted">
                      {job.homeownerName} · {job.address}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <MoneyBar totals={t} />
                    <p className="mt-2 text-sm text-muted">
                      {t.orderCount === 0 ? (
                        "No change orders yet"
                      ) : (
                        <>
                          <span className="font-mono text-ink">{usd(t.paidCents)}</span> collected · <span className="font-mono text-ink">{usd(t.owedCents)}</span> owed
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/jobs/${job.id}`} className="rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold transition hover:border-brass hover:bg-brass-wash/50">
                      Open job
                    </Link>
                    <Link href={`/?job=${job.id}`} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-bone transition hover:bg-ink-2">
                      New change order
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
