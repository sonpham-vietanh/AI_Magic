/**
 * In-memory fixed-window rate limiter keyed by `${bucket}:${clientIp}`.
 * NOTE: state is per server instance/process (not shared across serverless
 * instances or restarts), so limits are best-effort only. The client IP comes
 * from proxy headers and can be spoofed if not behind a trusted proxy.
 */
type Entry = { count: number; resetAt: number };

const hits = new Map<string, Entry>();
const MAX_ENTRIES = 10_000;
let lastSweep = 0;

function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function sweep(now: number): void {
  if (now - lastSweep < 30_000 && hits.size < MAX_ENTRIES) return;
  lastSweep = now;
  for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  // Still over cap: drop oldest-inserted entries.
  if (hits.size >= MAX_ENTRIES) {
    let drop = hits.size - MAX_ENTRIES + 1;
    for (const k of hits.keys()) {
      if (drop-- <= 0) break;
      hits.delete(k);
    }
  }
}

/** Returns null if allowed, otherwise a 429 JSON Response with Retry-After. */
export function rateLimit(
  request: Request,
  bucket: string,
  limit: number,
  windowMs: number,
): Response | null {
  const now = Date.now();
  sweep(now);
  const key = `${bucket}:${clientIp(request)}`;
  const e = hits.get(key);
  if (!e || e.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (e.count < limit) {
    e.count++;
    return null;
  }
  const retryAfter = Math.max(1, Math.ceil((e.resetAt - now) / 1000));
  return Response.json(
    { ok: false, error: "Too many requests" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
