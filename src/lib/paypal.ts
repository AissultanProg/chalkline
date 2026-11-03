import "server-only";
import type { ChangeOrder, InvoiceStatus, InvoiceSummary } from "./types";

/**
 * Thin, typed client for the PayPal REST APIs SiteTab uses.
 * Sandbox by default; set PAYPAL_ENVIRONMENT=PRODUCTION to switch.
 */

const BASE =
  process.env.PAYPAL_ENVIRONMENT === "PRODUCTION"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

export class PayPalError extends Error {
  constructor(
    message: string,
    public status: number,
    public details: unknown,
  ) {
    super(message);
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set");

  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new PayPalError("PayPal auth failed", res.status, json);

  // Refresh a minute before PayPal's expiry.
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 };
  return cachedToken.value;
}

async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(BASE + path, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let details: unknown = text;
    try {
      details = JSON.parse(text);
    } catch {}
    throw new PayPalError(`PayPal ${init.method ?? "GET"} ${path} failed`, res.status, details);
  }
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

const money = (cents: number) => ({ currency_code: "USD", value: (cents / 100).toFixed(2) });
const toCents = (value?: string) => Math.round(parseFloat(value ?? "0") * 100);

// ---- Invoicing -------------------------------------------------------------

type RawInvoice = {
  id: string;
  status: InvoiceStatus;
  amount?: { value: string };
  detail?: { metadata?: { recipient_view_url?: string } };
};

function summarize(inv: RawInvoice): InvoiceSummary {
  return {
    id: inv.id,
    status: inv.status,
    totalCents: toCents(inv.amount?.value),
    payerUrl: inv.detail?.metadata?.recipient_view_url ?? null,
  };
}

/** Create a draft invoice from a change order. */
export async function createInvoice(co: ChangeOrder, reference?: string): Promise<InvoiceSummary> {
  const [given, ...rest] = co.homeowner.name.trim().split(/\s+/);
  const inv = await request<RawInvoice>("/v2/invoicing/invoices", {
    method: "POST",
    body: JSON.stringify({
      detail: {
        currency_code: "USD",
        reference: reference?.slice(0, 120),
        note: co.summary.slice(0, 4000),
        memo: co.originalTranscript ? `Original memo: ${co.originalTranscript}`.slice(0, 500) : undefined,
        payment_term: { term_type: "DUE_ON_RECEIPT" },
      },
      invoicer: { email_address: co.contractor.email, business_name: co.contractor.businessName },
      primary_recipients: [
        {
          billing_info: {
            email_address: co.homeowner.email,
            name: { given_name: given ?? co.homeowner.name, surname: rest.join(" ") || undefined },
          },
        },
      ],
      items: co.items.map((it) => ({
        name: it.description.slice(0, 200),
        quantity: String(it.quantity),
        unit_amount: money(it.unitPriceCents),
        unit_of_measure: it.unit,
      })),
    }),
  });
  return summarize(inv);
}

/** Send a draft invoice to the homeowner (PayPal emails them a pay link). */
export async function sendInvoice(id: string): Promise<void> {
  await request(`/v2/invoicing/invoices/${id}/send`, {
    method: "POST",
    body: JSON.stringify({ send_to_invoicer: false }),
  });
}

export async function getInvoice(id: string): Promise<InvoiceSummary> {
  return summarize(await request<RawInvoice>(`/v2/invoicing/invoices/${id}`));
}

export async function sendReminder(id: string, note?: string): Promise<void> {
  await request(`/v2/invoicing/invoices/${id}/remind`, {
    method: "POST",
    body: JSON.stringify({ note, send_to_invoicer: false }),
  });
}

/**
 * QR code the homeowner can scan on the contractor's phone screen.
 * PayPal returns a multipart body; we pull out the base64 PNG and return a data: URL.
 */
export async function getInvoiceQr(id: string, size = 400): Promise<string> {
  const body = await request<string>(`/v2/invoicing/invoices/${id}/generate-qr-code`, {
    method: "POST",
    body: JSON.stringify({ width: size, height: size }),
  });
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const base64 =
    raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^[A-Za-z0-9+/=]{40,}$/.test(l))
      .join("") || raw.trim();
  return `data:image/png;base64,${base64}`;
}
