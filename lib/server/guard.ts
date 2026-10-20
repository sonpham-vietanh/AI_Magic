/**
 * Access guard for /api/* route handlers.
 *
 * Allowed if EITHER:
 *  (a) `Authorization: Bearer <APP_API_TOKEN>` matches env APP_API_TOKEN
 *      (timing-safe compare) - for external callers (Major OS, scripts), or
 *  (b) the request looks like a same-origin browser call:
 *      `Sec-Fetch-Site: same-origin`, or (header absent) `Origin` host equals
 *      `x-forwarded-host` / `Host`.
 *
 * WARNING: (b) is NOT real authentication. These headers are set by browsers
 * but can be forged trivially by any non-browser client. It only blocks
 * cross-site browser requests (CSRF / drive-by use). Real per-user login is a
 * follow-up. In production without APP_API_TOKEN, only (b) is available.
 * Tokens are never logged.
 */
import { timingSafeEqual } from "node:crypto";

export function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    // Compare against self to keep timing roughly constant, then fail.
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

function deny(status: 401 | 403, error: string): Response {
  return Response.json({ ok: false, error }, { status });
}

function bearerOk(request: Request): boolean {
  const expected = process.env.APP_API_TOKEN;
  if (!expected) return false;
  const auth = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return !!m && timingSafeEqualStr(m[1].trim(), expected);
}

function sameOriginBrowser(request: Request): boolean {
  const h = request.headers;
  const site = h.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = h.get("origin");
  if (!origin) return false;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.split(",")[0].trim().toLowerCase();
  } catch {
    return false;
  }
}

/** Returns null if allowed, otherwise a 401/403 JSON Response. */
export function requireAccess(request: Request): Response | null {
  if (bearerOk(request)) return null;
  if (sameOriginBrowser(request)) return null;
  return deny(401, "Unauthorized");
}
