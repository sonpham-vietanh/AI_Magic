/**
 * In-memory fixed-window rate limiter keyed by `${bucket}:${clientIp}`.
 * NOTE: state is per server instance/process (not shared across serverless
 * instances or restarts), so limits are best-effort only. The client IP comes
 * from proxy headers (see clientIp); it is only trustworthy behind Cloudflare/Traefik.
 */
type Entry = { count: number; resetAt: number };

const hits = new Map<string, Entry>();
const MAX_ENTRIES = 10_000;
let lastSweep = 0;

/**
 * Xác định IP client. GIẢ ĐỊNH triển khai: Cloudflare -> Traefik (Coolify) -> app.
 *  1. `cf-connecting-ip`: do Cloudflare đặt (ghi đè giá trị client gửi). Chỉ đáng tin nếu origin
 *     chỉ nhận traffic qua Cloudflare/Traefik.
 *  2. `x-forwarded-for`: KHÔNG lấy phần tử đầu (client tự giả mạo được). Lấy phần tử thứ
 *     TRUSTED_PROXY_HOPS tính từ cuối (mặc định 1 = địa chỉ do proxy tin cậy gần nhất thêm vào).
 *  3. `x-real-ip`, rồi "unknown".
 */
export function clientIp(request: Request): string {
  const h = request.headers;
  const cf = h.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const parts = (h.get('x-forwarded-for') ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length > 0) {
    const hops = Math.max(1, Math.floor(Number(process.env.TRUSTED_PROXY_HOPS) || 1));
    return parts[Math.max(0, parts.length - hops)];
  }
  return h.get('x-real-ip')?.trim() || 'unknown';
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
