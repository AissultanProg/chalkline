import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import AppHeader from "@/components/AppHeader";
import AutoRefresh from "@/components/AutoRefresh";
import { StatTiles, StatusPill } from "@/components/Money";
import OrderActions from "@/components/OrderActions";
import { EVENT_LABEL } from "@/lib/labels";
import { usd } from "@/lib/money";
import { getJob, listEventsForJob, listOrderSummaries } from "@/lib/repo";
import { totalsFor } from "@/lib/totals";
import { syncOpenOrders } from "@/lib/workflow";

export const metadata: Metadata = { title: "Job — Chalkline" };
// Always render on request: this page shows live money from the database and PayPal.
export const instant = false;

const when = (iso: string, withYear = false) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  });

export default async function JobPage(props: PageProps<"/jobs/[id]">) {
  await connection();
  const { id } = await props.params;
  const job = await getJob(id);
  if (!job) notFound();

  let orders = await listOrderSummaries(id);
  if (await syncOpenOrders(orders)) orders = await listOrderSummaries(id);
  const events = await listEventsForJob(id);
  const open = orders.some((o) => o.status === "approved" || o.status === "awaiting_approval");

  return (
    <div className="min-h-dvh">
      <AppHeader active="dashboard" />
      <AutoRefresh active={open} />

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-12">
        <div className="rise flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <Link href="/dashboard" className="text-sm font-semibold text-muted underline-offset-4 hover:underline">
              ← All jobs
            </Link>
            <h1 className="mt-2 font-display text-[34px] font-medium leading-[1.05] sm:text-[42px]">{job.title}</h1>
            <p className="mt-2 text-[15px] text-muted">
              {job.homeownerName} · {job.address}
            </p>
            <p className="text-[15px] text-muted">{job.scope}</p>
          </div>
          <Link href={`/?job=${job.id}`} className="rounded-full bg-ink px-6 py-3 font-semibold text-bone transition hover:bg-ink-2">
            New change order
          </Link>
        </div>

        <StatTiles totals={totalsFor(orders)} />

        <section className="sheet overflow-hidden">
          <h2 className="border-b border-line px-5 py-4 font-display text-2xl font-medium sm:px-7">Change orders</h2>

          {orders.length === 0 ? (
            <div className="px-5 py-12 text-center sm:px-7">
              <p className="font-display text-xl font-medium">Nothing here yet.</p>
              <p className="mt-1 text-sm text-muted">When the job changes, say what changed and it will show up here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {orders.map((o) => (
                <li key={o.id}>
                  <details className="group">
                    <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-5 py-4 transition hover:bg-bone/40 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] sm:gap-x-5 sm:px-7">
                      <span className="font-mono text-sm text-muted">Nº {o.number}</span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 block font-medium">{o.title}</span>
                        <span className="block text-xs text-muted">{when(o.createdAt)}</span>
                      </span>
                      <span className="col-start-2 row-start-2 sm:col-start-auto sm:row-start-auto">
                        <StatusPill status={o.status} />
                      </span>
                      <span className="text-right font-mono font-semibold">{usd(o.totalCents)}</span>
                      <span className="col-start-3 row-start-2 justify-self-end text-lg leading-none text-brass-deep transition group-open:rotate-90 sm:col-start-auto sm:row-start-auto" aria-hidden>
                        ›
                      </span>
                    </summary>

                    <div className="border-t border-line bg-bone/30 px-5 py-5 sm:px-7">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Paper trail</p>
                      <ol className="mt-3 flex flex-col gap-3">
                        {(events[o.id] ?? []).map((e, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm">
                            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${e.type === "paid" || e.type === "webhook_verified" ? "bg-chart-paid" : "bg-brass"}`} aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium">{EVENT_LABEL[e.type] ?? e.type}</span>
                              {e.detail && <span className="block break-words text-xs text-muted">{e.detail}</span>}
                            </span>
                            <span className="shrink-0 text-right font-mono text-xs text-muted">{when(e.at)}</span>
                          </li>
                        ))}
                      </ol>
                      <OrderActions id={o.id} status={o.status} invoiceSent={Boolean(o.payerUrl)} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
