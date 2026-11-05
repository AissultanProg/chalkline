# Chalkline

**Change orders, signed and paid on site.**

Small contractors lose money on extra work that gets agreed verbally mid-job and never written down. With Chalkline, the contractor speaks a short memo in any language. AI writes it up as an itemized change order, the homeowner signs it on the spot, and a PayPal invoice goes out for payment.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/).

## How it works

1. **Say it.** The contractor records a voice memo (or types one) and can add up to 3 photos.
2. **Review.** Claude turns the memo into a change order with an English summary for the homeowner. The contractor can edit everything.
3. **Sign.** The homeowner opens the approval page by QR code or on the contractor's device, reviews the work, and signs with a finger.
4. **Pay.** Only after signing does Chalkline create and send the PayPal invoice. The homeowner pays through PayPal, and the contractor's screen updates to Paid.

**No signature, no invoice.** Each change order keeps its original memo, translation, audio, photos, signature, and a time-stamped audit trail.

## How PayPal is used

All PayPal calls use the sandbox REST APIs, in [`src/lib/paypal.ts`](src/lib/paypal.ts):

- **Invoicing API v2:** create, send and read invoices. The client also includes reminder and QR code helpers.
- **Webhooks:** `INVOICING.INVOICE.PAID` events are checked with PayPal's signature verification API before they're trusted.
- **Status check:** the app also asks PayPal for the invoice status, so payment still appears if a webhook is delayed or not configured.

## AI tools used

| Tool | Used for |
|---|---|
| **Claude Opus 5.5** (Anthropic API) | Reads the memo and photos, translates to English, splits labor from materials, writes the homeowner summary, describes photo evidence, and flags missing details. Uses structured outputs validated with Zod. |
| **Whisper large-v3** (hosted by Groq) | Speech-to-text. The whole memo is transcribed at once with a job-specific vocabulary prompt. Likely silence and known false phrases are dropped, and low-confidence parts are flagged for review. |

**The AI doesn't set prices.** Code calculates labor from the contractor's hourly rate, and materials are only priced if the contractor stated an amount. Anything else is flagged for the contractor to fill in. See [`src/lib/ai.ts`](src/lib/ai.ts).

## Run it locally

You need Node.js 20.9 or newer, a [PayPal Developer](https://developer.paypal.com) sandbox app with invoicing enabled, an [Anthropic API key](https://console.anthropic.com), and a [Groq API key](https://console.groq.com).

```bash
git clone https://github.com/AissultanProg/chalkline.git
cd chalkline
npm ci
cp .env.example .env.local   # then fill in your keys
npm run dev
```

Open http://localhost:3000. The database is a local SQLite file, created and seeded with a demo job on first run.

To test the full flow:

1. Type or record a memo, then choose **Write the change order**.
2. Review it and choose **Get Dana's signature**.
3. Choose **Open approval page**, then sign and approve.
4. Pay the invoice while logged in as your PayPal sandbox personal account.

Browsers only allow microphone access on `localhost` or over https.

## Configuration

See [`.env.example`](.env.example). For a hosted deployment, also set:

| Variable | Purpose |
|---|---|
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | Hosted libSQL database such as [Turso](https://turso.tech). Without them, the app uses a local file. |
| `APP_URL` | Public URL, used in approval links and QR codes. |
| `PAYPAL_WEBHOOK_ID` | ID of the webhook registered in the PayPal developer dashboard, pointing to `/api/webhooks/paypal`. |

## Tech stack

Next.js 16, React 19, TypeScript, Tailwind CSS 4, libSQL.

## Current limitations

This is a hackathon prototype:

- It runs on the PayPal sandbox only, so no real money moves.
- It has one seeded demo job and no contractor login.
- It isn't legal advice, and signatures haven't been reviewed for legal enforceability.

## License

[MIT](LICENSE)
