import "server-only";
import { randomBytes } from "node:crypto";
import { db, ready } from "./db";
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

export type ChangeOrderRecord = {
  id: string;
  jobId: string;
  number: number;
  title: string;
  summary: string;
  items: StoredItem[];
  totalCents: number;
  memoOriginal: string;
  memoLanguage: string;
  memoEnglish: string;
  audioDataUrl: string | null;
  photos: StoredPhoto[];
  status: COStatus;
  signerName: string | null;
  signaturePng: string | null;
  signedAt: string | null;
  signerIp: string | null;
  signerAgent: string | null;
  invoiceId: string | null;
  payerUrl: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type EventRecord = { type: string; at: string; detail: string };

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

const toCO = (r: any): ChangeOrderRecord => ({
  id: r.id,
  jobId: r.job_id,
  number: Number(r.number),
  title: r.title,
  summary: r.summary,
  items: JSON.parse(r.items_json),
  totalCents: Number(r.total_cents),
  memoOriginal: r.memo_original,
  memoLanguage: r.memo_language,
  memoEnglish: r.memo_english,
  audioDataUrl: r.audio_data_url,
  photos: JSON.parse(r.photos_json),
  status: r.status,
  signerName: r.signer_name,
  signaturePng: r.signature_png,
  signedAt: r.signed_at,
  signerIp: r.signer_ip,
  signerAgent: r.signer_agent,
  invoiceId: r.invoice_id,
  payerUrl: r.payer_url,
  paidAt: r.paid_at,
  createdAt: r.created_at,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getJob(id: string): Promise<Job | null> {
  await ready();
  const { rows } = await db.execute({ sql: "SELECT * FROM jobs WHERE id = ?", args: [id] });
  return rows[0] ? toJob(rows[0]) : null;
}

export async function listJobs(): Promise<Job[]> {
  await ready();
  const { rows } = await db.execute("SELECT * FROM jobs ORDER BY created_at DESC");
  return rows.map(toJob);
}

export async function getChangeOrder(id: string): Promise<ChangeOrderRecord | null> {
  await ready();
  const { rows } = await db.execute({ sql: "SELECT * FROM change_orders WHERE id = ?", args: [id] });
  return rows[0] ? toCO(rows[0]) : null;
}

export async function listChangeOrders(jobId: string): Promise<ChangeOrderRecord[]> {
  await ready();
  const { rows } = await db.execute({ sql: "SELECT * FROM change_orders WHERE job_id = ? ORDER BY number DESC", args: [jobId] });
  return rows.map(toCO);
}

export async function listEvents(changeOrderId: string): Promise<EventRecord[]> {
  await ready();
  const { rows } = await db.execute({
    sql: "SELECT type, at, detail FROM events WHERE change_order_id = ? ORDER BY id",
    args: [changeOrderId],
  });
  return rows.map((r) => ({ type: String(r.type), at: String(r.at), detail: String(r.detail) }));
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

export async function createChangeOrder(input: NewChangeOrder): Promise<ChangeOrderRecord> {
  await ready();
  const id = randomBytes(9).toString("base64url");
  const total = input.items.reduce((s, i) => s + Math.round(i.quantity * i.unitPriceCents), 0);
  const { rows } = await db.execute({
    sql: "SELECT COALESCE(MAX(number), 0) + 1 AS n FROM change_orders WHERE job_id = ?",
    args: [input.jobId],
  });
  await db.execute({
    sql: `INSERT INTO change_orders (id, job_id, number, title, summary, items_json, total_cents, memo_original, memo_language,
            memo_english, audio_data_url, photos_json, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_approval', ?)`,
    args: [
      id,
      input.jobId,
      Number(rows[0].n),
      input.title,
      input.summary,
      JSON.stringify(input.items),
      total,
      input.memoOriginal,
      input.memoLanguage,
      input.memoEnglish,
      input.audioDataUrl,
      JSON.stringify(input.photos),
      now(),
    ],
  });
  await addEvent(id, "created", `${input.items.length} line items`);
  return (await getChangeOrder(id))!;
}

/** Record the homeowner's signature. Returns false if it was already signed (prevents double-approval). */
export async function markSigned(id: string, s: { name: string; png: string; ip: string; agent: string }): Promise<boolean> {
  await ready();
  const res = await db.execute({
    sql: `UPDATE change_orders SET status = 'approved', signer_name = ?, signature_png = ?, signed_at = ?, signer_ip = ?, signer_agent = ?
          WHERE id = ? AND status = 'awaiting_approval'`,
    args: [s.name, s.png, now(), s.ip, s.agent, id],
  });
  if (res.rowsAffected === 0) return false;
  await addEvent(id, "signed", `Signed by ${s.name}`);
  return true;
}

export async function markInvoiced(id: string, invoiceId: string, payerUrl: string | null) {
  await ready();
  await db.execute({ sql: "UPDATE change_orders SET invoice_id = ?, payer_url = ? WHERE id = ?", args: [invoiceId, payerUrl, id] });
  await addEvent(id, "invoice_sent", `PayPal invoice ${invoiceId}`);
}

/** Idempotent: webhook and status sync may both report the payment. */
export async function markPaid(id: string, source: string) {
  await ready();
  const res = await db.execute({
    sql: "UPDATE change_orders SET status = 'paid', paid_at = ? WHERE id = ? AND status != 'paid'",
    args: [now(), id],
  });
  if (res.rowsAffected > 0) await addEvent(id, "paid", `Confirmed by ${source}`);
}

export async function findByInvoiceId(invoiceId: string): Promise<ChangeOrderRecord | null> {
  await ready();
  const { rows } = await db.execute({ sql: "SELECT * FROM change_orders WHERE invoice_id = ?", args: [invoiceId] });
  return rows[0] ? toCO(rows[0]) : null;
}

export async function markViewedOnce(id: string) {
  await ready();
  const { rows } = await db.execute({
    sql: "SELECT 1 FROM events WHERE change_order_id = ? AND type = 'viewed' LIMIT 1",
    args: [id],
  });
  if (!rows.length) await addEvent(id, "viewed", "Homeowner opened the change order");
}
