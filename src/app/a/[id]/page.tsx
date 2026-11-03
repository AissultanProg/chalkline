import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import ApprovalForm from "@/components/ApprovalForm";
import { Wordmark } from "@/components/Brand";
import { usd } from "@/lib/client-utils";
import { getChangeOrder, getJob, markViewedOnce } from "@/lib/repo";
import { syncPaymentStatus } from "@/lib/workflow";

export const metadata: Metadata = { title: "Change order for your approval — Chalkline", robots: { index: false } };
// Always render on request: this page shows live signature/payment state from the DB and PayPal.
export const instant = false;

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" });

/** The homeowner's view: review the extra work, sign, then pay via PayPal. */
export default async function ApprovalPage(props: PageProps<"/a/[id]">) {
  await connection();
  const { id } = await props.params;
  let co = await getChangeOrder(id);
  if (!co) notFound();
  const job = (await getJob(co.jobId))!;
  await markViewedOnce(co.id);
  co = await syncPaymentStatus(co).catch(() => co!);

  const translated = co.memoLanguage !== "English";

  return (
    <main className="min-h-dvh px-4 pb-14 pt-6 sm:px-6 sm:pt-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Wordmark />
          <span className="font-mono text-xs text-muted">Nº {co.number}</span>
        </div>

        <article className="sheet rise overflow-hidden">
          {/* Letterhead */}
          <header className="px-6 pb-5 pt-7 sm:px-10 sm:pt-10">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass-deep">Change order for your approval</p>
                <p className="mt-1 text-sm text-muted">
                  From <span className="font-medium text-ink">{job.businessName}</span> · {job.address}
                </p>
              </div>
              <p className="text-sm text-muted">{fmt(co.createdAt)}</p>
            </div>
            <div className="chalk mt-5" />
          </header>

          <div className="flex flex-col gap-8 px-6 pb-8 sm:px-10 sm:pb-10">
            <div>
              <p className="text-sm text-muted">
                For {job.homeownerName} · {job.title}
              </p>
              <h1 className="mt-2 font-display text-[32px] font-medium leading-[1.08] sm:text-[40px]">{co.title}</h1>
              <p className="mt-4 text-[16px] leading-relaxed">{co.summary}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted">{job.scope} This change is in addition to that contract.</p>
            </div>

            <table className="w-full text-[15px]">
              <thead>
                <tr className="border-b border-ink/80 text-left text-[11px] uppercase tracking-[0.16em] text-muted">
                  <th className="pb-2 font-semibold">Item</th>
                  <th className="pb-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {co.items.map((it, i) => (
                  <tr key={i} className="border-b border-line align-top">
                    <td className="py-3.5 pr-4">
                      <p className="font-medium">{it.description}</p>
                      {it.unit === "HOURS" && (
                        <p className="mt-0.5 font-mono text-xs text-muted">
                          {it.quantity} hr × {usd(it.unitPriceCents)}
                        </p>
                      )}
                    </td>
                    <td className="py-3.5 text-right font-mono">{usd(it.quantity * it.unitPriceCents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-4 font-display text-lg font-medium">Total for this change</td>
                  <td className="pt-4 text-right font-mono text-2xl font-semibold">{usd(co.totalCents)}</td>
                </tr>
              </tfoot>
            </table>

            {co.photos.length > 0 && (
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Photos from the job</p>
                <div className="grid grid-cols-3 gap-3">
                  {co.photos.map((p, i) => (
                    <figure key={i}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.dataUrl} alt={p.caption || `Job photo ${i + 1}`} className="aspect-square w-full rounded-xl object-cover" />
                      {p.caption && <figcaption className="mt-1.5 text-[11px] leading-tight text-muted">{p.caption}</figcaption>}
                    </figure>
                  ))}
                </div>
              </div>
            )}

            <details className="group rounded-2xl border border-line bg-bone/50 p-4 text-sm">
              <summary className="cursor-pointer list-none font-semibold">
                <span className="mr-2 inline-block text-brass transition group-open:rotate-90">›</span>
                {translated ? `Contractor's original note, in ${co.memoLanguage}` : "Contractor's original note"}
              </summary>
              <p className="mt-3 italic leading-relaxed">“{co.memoOriginal}”</p>
              {translated && (
                <p className="mt-2 text-muted">Translated to English by Chalkline AI and reviewed by {job.businessName} before sending.</p>
              )}
              {co.audioDataUrl && <audio src={co.audioDataUrl} controls className="mt-3 h-9 w-full" />}
            </details>

            <div className="h-px bg-line" />

            {co.status === "awaiting_approval" && <ApprovalForm id={co.id} totalCents={co.totalCents} defaultName={job.homeownerName} />}

            {co.status !== "awaiting_approval" && co.signaturePng && (
              <section className="flex flex-col gap-4">
                <div className="rounded-2xl border border-line bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={co.signaturePng} alt={`Signature of ${co.signerName}`} className="h-24 w-full object-contain" />
                  <p className="border-t border-line pt-3 text-sm">
                    Approved by <strong>{co.signerName}</strong> · {fmt(co.signedAt!)}
                  </p>
                </div>

                {co.status === "approved" && co.payerUrl && (
                  <>
                    <a
                      href={co.payerUrl}
                      className="block w-full rounded-full bg-ink py-4 text-center text-lg font-semibold text-bone shadow-[0_14px_30px_-16px_rgb(31_30_28/0.55)] transition hover:bg-ink-2"
                    >
                      Pay {usd(co.totalCents)} with PayPal →
                    </a>
                    <p className="text-center text-xs text-muted">The invoice was also emailed to you, so you can pay whenever you&apos;re ready.</p>
                  </>
                )}

                {co.status === "paid" && (
                  <div className="rounded-2xl bg-moss-wash p-5 text-center">
                    <p className="font-display text-4xl font-semibold italic text-moss">Paid</p>
                    <p className="mt-1 text-sm text-moss">Thank you. Payment received {co.paidAt ? fmt(co.paidAt) : ""}.</p>
                  </div>
                )}
              </section>
            )}
          </div>
        </article>
        <p className="mt-5 text-center font-mono text-[11px] text-muted">Record {co.id} · kept with signature, time and device</p>
      </div>
    </main>
  );
}
