import type { ZodType } from 'zod';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';

export function fail(status: number, error: string): Response {
  return Response.json({ ok: false, error }, { status });
}

/** requireAccess + rateLimit; trả về Response nếu bị chặn. */
export function gate(request: Request, bucket: string, limit = 120): Response | null {
  return requireAccess(request) ?? rateLimit(request, bucket, limit, 60_000);
}

export async function parseBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ data: T } | { error: Response }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { error: fail(400, 'Dữ liệu gửi lên không phải JSON hợp lệ.') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.';
    return { error: fail(400, `Dữ liệu không hợp lệ: ${msg}`) };
  }
  return { data: parsed.data };
}

export function serverError(tag: string, err: unknown): Response {
  console.error(`[${tag}]`, err);
  return fail(500, 'Có lỗi phía máy chủ, vui lòng thử lại sau.');
}
