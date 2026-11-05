import "server-only";
import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";

/**
 * libSQL: a local SQLite file in dev (zero setup), Turso in production (set DATABASE_URL + DATABASE_AUTH_TOKEN).
 */
const url = process.env.DATABASE_URL ?? "file:data/chalkline.db";
if (url.startsWith("file:")) mkdirSync("data", { recursive: true });

const globalForDb = globalThis as unknown as { chalklineDb?: Client; chalklineReady?: Promise<void> };

export const db: Client = globalForDb.chalklineDb ?? createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
globalForDb.chalklineDb = db;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    scope TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    homeowner_name TEXT NOT NULL,
    homeowner_email TEXT NOT NULL DEFAULT '',
    business_name TEXT NOT NULL,
    labor_rate_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS change_orders (
    id TEXT PRIMARY KEY,                -- unguessable token, used in the homeowner's link
    job_id TEXT NOT NULL REFERENCES jobs(id),
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    items_json TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    memo_original TEXT NOT NULL,
    memo_language TEXT NOT NULL,
    memo_english TEXT NOT NULL,
    audio_data_url TEXT,
    photos_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL,               -- awaiting_approval | approved | paid | declined
    signer_name TEXT,
    signature_png TEXT,
    signed_at TEXT,
    signer_ip TEXT,
    signer_agent TEXT,
    invoice_id TEXT,
    payer_url TEXT,
    paid_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_co_job ON change_orders(job_id)`,
  `CREATE INDEX IF NOT EXISTS idx_co_invoice ON change_orders(invoice_id)`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    change_order_id TEXT NOT NULL REFERENCES change_orders(id),
    type TEXT NOT NULL,                 -- created | viewed | signed | invoice_sent | paid | declined
    at TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
  )`,
];

async function migrate() {
  await db.batch(SCHEMA, "write");
  const { rows } = await db.execute("SELECT COUNT(*) AS n FROM jobs");
  if (Number(rows[0].n) === 0) {
    await db.execute({
      sql: `INSERT INTO jobs (id, title, scope, address, homeowner_name, homeowner_email, business_name, labor_rate_cents, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "miller-kitchen",
        "Miller kitchen remodel",
        "Original contract: replace cabinets and countertops.",
        "412 Alder St, Portland, OR",
        "Dana Miller",
        process.env.PAYPAL_SANDBOX_PERSONAL_EMAIL ?? "",
        "Reyes Carpentry",
        6500,
        new Date().toISOString(),
      ],
    });
  }

  // Keep the demo homeowner on the current sandbox buyer account if that setting changes.
  const buyer = process.env.PAYPAL_SANDBOX_PERSONAL_EMAIL;
  if (buyer) {
    await db.execute({ sql: "UPDATE jobs SET homeowner_email = ? WHERE id = 'miller-kitchen'", args: [buyer] });
  }
}

/** Await before any query; runs migrations + demo seed once per process. */
export function ready(): Promise<void> {
  globalForDb.chalklineReady ??= migrate();
  return globalForDb.chalklineReady;
}
