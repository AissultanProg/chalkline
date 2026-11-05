import "server-only";
import { clientIp } from "./http";

/**
 * Small in-memory limits for the public demo, which has no login.
 * The daily total is the real spending cap, because per-visitor limits can be dodged by changing IP address.
 * Counters reset on restart, which is fine for a single demo server.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type Rule = { perVisitorPerHour: number; totalPerDay: number };

const RULES = {
  transcribe: { perVisitorPerHour: 40, totalPerDay: 500 },
  draft: { perVisitorPerHour: 30, totalPerDay: 300 },
  save: { perVisitorPerHour: 30, totalPerDay: 300 },
  paypal: { perVisitorPerHour: 30, totalPerDay: 200 },
} satisfies Record<string, Rule>;

const windows = new Map<string, { count: number; resetAt: number }>();

function hit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || now >= entry.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

/** Returns a 429 response when a limit is reached, otherwise null. */
export function rateLimit(req: Request, action: keyof typeof RULES): Response | null {
  const rule = RULES[action];
  if (!hit(`${action}:${clientIp(req)}`, rule.perVisitorPerHour, HOUR)) {
    return Response.json({ error: "That's a lot of requests. Please try again in a little while." }, { status: 429 });
  }
  if (!hit(`${action}:all`, rule.totalPerDay, DAY)) {
    return Response.json({ error: "The demo has reached its daily limit. Please try again tomorrow." }, { status: 429 });
  }
  return null;
}
