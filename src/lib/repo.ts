import "server-only";
import { randomBytes } from "node:crypto";
import { db, ready } from "./db";
import { orderTotalCents } from "./money";
import type { LineItem } from "./types";

export type Job = {
  id: string;
  title: string;
  scope: string;
  address: string;
  homeownerName: string;
  homeownerEmail: string;
  businessName: string;
  laborRateCents: number;
};

export type COStatus = "awaiting_approval" | "approved" | "paid" | "declined";
export type StoredItem = LineItem & { kind: string };
export type StoredPhoto = { dataUrl: string; caption: string };

/** The light columns of a change order: everything except the memo, photos, audio and signature. */
export type OrderSummary = {
  id: string;
  jobId: string;
  number: number;
  title: string;
  totalCents: number;
  status: COStatus;
  signerName: string | null;
  signedAt: string | null;
  invoiceId: string | null;
  payerUrl: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type ChangeOrderRecord = OrderSummary & {
  summary: string;
  items: StoredItem[];
  memoOriginal: string;
  memoLanguage: string;
  memoEnglish: string;
  audioDataUrl: string | null;
  photos: StoredPhoto[];
  signaturePng: string | null;
  signerIp: string | null;
  signerAgent: string | null;
};

export type EventRecord = { type: string; at: string; detail: string };

const SUMMARY_COLUMNS = "id, job_id, number, title, total_cents, status, signer_name, signed_at, invoice_id, payer_url, paid_at, created_at";

const now = () => new Date().toISOString();

/* eslint-disable @typescript-eslint/no-explicit-any */
const toJob = (r: any): Job => ({
  id: r.id,
  title: r.title,
  scope: r.scope,
  address: r.address,
  homeownerName: r.homeowner_name,
  homeownerEmail: r.homeowner_email,
  businessName: r.business_name,
  laborRateCents: Number(r.labor_rate_cents),
});

const toSummary = (r: any): OrderSummary => ({
  id: r.id,
  jobId: r.job_id,
  number: Number(r.number),
  title: r.title,
  totalCents: Number(r.total_cents),
  status: r.status,
  signerName: r.signer_name,
  signedAt: r.signed_at,
  invoiceId: r.invoice_id,
  payerUrl: r.payer_url,
  paidAt: r.paid_at,
  createdAt: r.created_at,
});

const toRecord = (r: any): ChangeOrderRecord => ({
  ...toSummary(r),
  summary: r.summary,
  items: JSON.parse(r.items_json),
  memoOriginal: r.memo_original,
  memoLanguage: r.memo_language,
  memoEnglish: r.memo_english,
  audioDataUrl: r.audio_data_url,
  photos: JSON.parse(r.photos_json),
  signaturePng: r.signature_png,
  signerIp: r.signer_ip,
  signerAgent: r.signer_agent,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getJob(id: string): Promise<Job | null> {
  await ready();
  const { rows } = await db.execute({ sql: "SELECT * FROM jobs WHERE id = ?", args: [id] });
  return rows[0] ? toJob(rows[0]) : null;
}

export async function listJobs(): Promise<Job[]> {
  await ready();
  const { rows } = await db.execute("SELECT * FROM jobs ORDER BY title");
  return rows.map(toJob);
}

export async function getChangeOrder(id: string): Promise<ChangeOrderRecord | null> {
  await ready();
  const { rows } = await db.execute({ sql: "SELECT * FROM change_orders WHERE id = ?", args: [id] });
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function getOrderSummary(id: string): Promise<OrderSummary | null> {
  await ready();
  const { rows } = await db.execute({ sql: `SELECT ${SUMMARY_COLUMNS} FROM change_orders WHERE id = ?`, args: [id] });
  return rows[0] ? toSummary(rows[0]) : null;
}

/** Newest first. Pass a job id to limit it to one job. */
export async function listOrderSummaries(jobId?: string): Promise<OrderSummary[]> {
  await ready();
  const { rows } = await db.execute({
    sql: `SELECT ${SUMMARY_COLUMNS} FROM change_orders ${jobId ? "WHERE job_id = ?" : ""} ORDER BY created_at DESC`,
    args: jobId ? [jobId] : [],
  });
  return rows.map(toSummary);
}

export async function findOrderByInvoiceId(invoiceId: string): Promise<OrderSummary | null> {
  await ready();
  const { rows } = await db.execute({ sql: `SELECT ${SUMMARY_COLUMNS} FROM change_orders WHERE invoice_id = ?`, args: [invoiceId] });
  return rows[0] ? toSummary(rows[0]) : null;
}

export async function listEvents(changeOrderId: string): Promise<EventRecord[]> {
  await ready();
  const { rows } = await db.execute({
    sql: "SELECT type, at, detail FROM events WHERE change_order_id = ? ORDER BY id",
    args: [changeOrderId],
  });
  return rows.map((r) => ({ type: String(r.type), at: String(r.at), detail: String(r.detail) }));
}

/** Paper trails for every change order on a job, keyed by change order id. */
export async function listEventsForJob(jobId: string): Promise<Record<string, EventRecord[]>> {
  await ready();
  const { rows } = await db.execute({
    sql: `SELECT e.change_order_id, e.type, e.at, e.detail FROM events e
          JOIN change_orders c ON c.id = e.change_order_id
          WHERE c.job_id = ? ORDER BY e.id`,
    args: [jobId],
  });
  const byOrder: Record<string, EventRecord[]> = {};
  for (const r of rows) {
    (byOrder[String(r.change_order_id)] ??= []).push({ type: String(r.type), at: String(r.at), detail: String(r.detail) });
  }
  return byOrder;
}

export async function addEvent(changeOrderId: string, type: string, detail = "") {
  await ready();
  await db.execute({
    sql: "INSERT INTO events (change_order_id, type, at, detail) VALUES (?, ?, ?, ?)",
    args: [changeOrderId, type, now(), detail],
  });
}

export async function addEventOnce(changeOrderId: string, type: string, detail = "") {
  await ready();
  const { rows } = await db.execute({
    sql: "SELECT 1 FROM events WHERE change_order_id = ? AND type = ? LIMIT 1",
    args: [changeOrderId, type],
  });
  if (!rows.length) await addEvent(changeOrderId, type, detail);
}

export type NewChangeOrder = {
  jobId: string;
  title: string;
  summary: string;
  items: StoredItem[];
  memoOriginal: string;
  memoLanguage: string;
  memoEnglish: string;
  audioDataUrl: string | null;
  photos: StoredPhoto[];
};

export async function createChangeOrder(input: NewChangeOrder): Promise<OrderSummary> {
  await ready();
  const id = randomBytes(9).toString("base64url");
  // The number is worked out inside the insert so two saves at once can't get the same one.
  await db.execute({
    sql: `INSERT INTO change_orders (id, job_id, number, title, summary, items_json, total_cents, memo_original, memo_language,
            memo_english, audio_data_url, photos_json, status, created_at)
          VALUES (?, ?, (SELECT COALESCE(MAX(number), 0) + 1 FROM change_orders WHERE job_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_approval', ?)`,
    args: [
      id,
      input.jobId,
      input.jobId,
      input.title,
      input.summary,
      JSON.stringify(input.items),
      orderTotalCents(input.items),
      input.memoOriginal,
      input.memoLanguage,
      input.memoEnglish,
      input.audioDataUrl,
      JSON.stringify(input.photos),
      now(),
    ],
  });
  await addEvent(id, "created", `${input.items.length} line items`);
  return (await getOrderSummary(id))!;
}

/** Record the homeowner's signature. Returns false if it was already answered (prevents double-approval). */
export async function markSigned(id: string, s: { name: string; png: string; ip: string; agent: string }): Promise<boolean> {
  await ready();
  const res = await db.execute({
    sql: `UPDATE change_orders SET status = 'approved', signer_name = ?, signature_png = ?, signed_at = ?, signer_ip = ?, signer_agent = ?
          WHERE id = ? AND status = 'awaiting_approval'`,
    args: [s.name, s.png, now(), s.ip, s.agent, id],
  });
  if (res.rowsAffected === 0) return false;
  await addEvent(id, "signed", `By ${s.name}`);
  return true;
}

/** Record the homeowner saying no. Returns false if it was already answered. */
export async function markDeclined(id: string, reason: string): Promise<boolean> {
  await ready();
  const res = await db.execute({
    sql: "UPDATE change_orders SET status = 'declined' WHERE id = ? AND status = 'awaiting_approval'",
    args: [id],
  });
  if (res.rowsAffected === 0) return false;
  await addEvent(id, "declined", reason || "No reason given");
  return true;
}

/** Saved as soon as PayPal creates the draft, so a retry never makes a second invoice. */
export async function saveInvoiceId(id: string, invoiceId: string) {
  await ready();
  await db.execute({ sql: "UPDATE change_orders SET invoice_id = ? WHERE id = ?", args: [invoiceId, id] });
}

export async function markInvoiceSent(id: string, invoiceId: string, payerUrl: string | null) {
  await ready();
  await db.execute({ sql: "UPDATE change_orders SET payer_url = ? WHERE id = ?", args: [payerUrl, id] });
  await addEvent(id, "invoice_sent", invoiceId);
}

/** Idempotent: webhook and status sync may both report the payment. */
export async function markPaid(id: string, source: string) {
  await ready();
  const res = await db.execute({
    sql: "UPDATE change_orders SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'approved'",
    args: [now(), id],
  });
  if (res.rowsAffected > 0) await addEvent(id, "paid", `Confirmed by ${source}`);
}
