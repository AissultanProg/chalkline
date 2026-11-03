import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import ApprovalForm from "@/components/ApprovalForm";
import { usd } from "@/lib/client-utils";
import { getChangeOrder, getJob, markViewedOnce } from "@/lib/repo";
import { syncPaymentStatus } from "@/lib/workflow";

export const metadata: Metadata = { title: "Change order for your approval — SiteTab", robots: { index: false } };
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
    <main className="min-h-dvh bg-paper px-4 py-6">
      <article className="mx-auto max-w-lg overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
        {/* Letterhead */}
        <header className="flex items-start justify-between gap-3 border-b-4 border-safety bg-ink px-5 py-4 text-paper">
          <div>
            <p className="text-lg font-extrabold">{job.businessName}</p>
            <p className="text-sm text-paper/70">{job.address}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-paper/60">Change order</p>
            <p className="font-mono text-2xl font-bold">#{co.number}</p>
          </div>
        </header>

        <div className="flex flex-col gap-5 p-5">
          <div>
            <p className="text-sm text-muted">
              For {job.homeownerName} · {job.title} · {fmt(co.createdAt)}
            </p>
            <h1 className="mt-1 text-2xl font-extrabold leading-tight">{co.title}</h1>
            <p className="mt-2 leading-relaxed">{co.summary}</p>
            <p className="mt-2 text-sm text-muted">{job.scope} This change is in addition to that contract.</p>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
                <th className="py-2 font-semibold">Item</th>
                <th className="py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {co.items.map((it, i) => (
                <tr key={i} className="border-b border-line align-top">
                  <td className="py-2.5 pr-3">
                    <p className="font-medium">{it.description}</p>
                    {it.unit === "HOURS" && (
                      <p className="font-mono text-xs text-muted">
                        {it.quantity} hr × {usd(it.unitPriceCents)}
                      </p>
                    )}
                  </td>
                  <td className="py-2.5 text-right font-mono">{usd(it.quantity * it.unitPriceCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-3 font-bold">Total for this change</td>
                <td className="pt-3 text-right font-mono text-xl font-bold">{usd(co.totalCents)}</td>
              </tr>
            </tfoot>
          </table>

          {co.photos.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Photos from the job</p>
              <div className="grid grid-cols-3 gap-2">
                {co.photos.map((p, i) => (
                  <figure key={i}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.dataUrl} alt={p.caption || `Job photo ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
                    {p.caption && <figcaption className="mt-1 text-[11px] leading-tight text-muted">{p.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            </div>
          )}

          <details className="rounded-xl bg-paper p-3 text-sm">
            <summary className="cursor-pointer font-semibold">
              {translated ? `Contractor's original note (in ${co.memoLanguage})` : "Contractor's original note"}
            </summary>
            <p className="mt-2 italic">“{co.memoOriginal}”</p>
            {translated && (
              <p className="mt-2 text-muted">
                Translated to English by SiteTab AI and reviewed by {job.businessName} before sending.
              </p>
            )}
            {co.audioDataUrl && <audio src={co.audioDataUrl} controls className="mt-2 h-9 w-full" />}
          </details>

          <hr className="border-line" />

          {co.status === "awaiting_approval" && <ApprovalForm id={co.id} totalCents={co.totalCents} defaultName={job.homeownerName} />}

          {co.status !== "awaiting_approval" && co.signaturePng && (
            <section className="flex flex-col gap-3">
              <div className="rounded-xl border border-line p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={co.signaturePng} alt={`Signature of ${co.signerName}`} className="h-24 w-full object-contain" />
                <p className="border-t border-line pt-2 text-sm">
                  Approved by <strong>{co.signerName}</strong> · {fmt(co.signedAt!)}
                </p>
              </div>

              {co.status === "approved" && co.payerUrl && (
                <a
                  href={co.payerUrl}
                  className="block w-full rounded-2xl bg-ink py-4 text-center text-lg font-bold text-paper shadow-md"
                >
                  Pay {usd(co.totalCents)} with PayPal →
                </a>
              )}
              {co.status === "approved" && <p className="text-center text-xs text-muted">The invoice was also emailed to you — pay whenever you&apos;re ready.</p>}

              {co.status === "paid" && (
                <div className="rounded-xl bg-paid/10 p-4 text-center">
                  <p className="font-mono text-2xl font-black tracking-widest text-paid">PAID</p>
                  <p className="text-sm text-paid">Thank you — payment received {co.paidAt ? fmt(co.paidAt) : ""}.</p>
                </div>
              )}
            </section>
          )}
        </div>
      </article>
      <p className="mt-4 text-center text-xs text-muted">Sent with SiteTab · Record {co.id}</p>
    </main>
  );
}
