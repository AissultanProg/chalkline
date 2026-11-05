import "server-only";
import type { z } from "zod";

/** Public origin of this app (for links/QR codes), honoring proxies like Render. */
export function originOf(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? "unknown";
}

type Parsed<T> = { data: T; error?: never } | { data?: never; error: Response };

/** Reads and validates a JSON body. Bad input becomes a 400 with a readable message, never a crash. */
export async function parseJson<S extends z.ZodType>(req: Request, schema: S): Promise<Parsed<z.infer<S>>> {
  const body = await req.json().catch(() => undefined);
  const result = schema.safeParse(body);
  if (result.success) return { data: result.data };
  const message = body === undefined ? "That request wasn't valid." : (result.error.issues[0]?.message ?? "That request wasn't valid.");
  return { error: Response.json({ error: message }, { status: 400 }) };
}
