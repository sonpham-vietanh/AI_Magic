import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';
import { AssessmentError } from './exam';

export function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Guard + rate limit + JSON/zod validation + lỗi chung cho các route POST. */
export async function handlePost<T>(
  request: Request,
  bucket: string,
  limit: number,
  schema: ZodType<T>,
  run: (body: T) => Promise<Record<string, unknown>>,
): Promise<Response> {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, bucket, limit, 60_000);
  if (limited) return limited;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail(400, 'Dữ liệu gửi lên không phải JSON hợp lệ.');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return fail(400, 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại các trường bắt buộc.');
  try {
    return NextResponse.json({ ok: true, ...(await run(parsed.data)) });
  } catch (err) {
    return handleError(err, bucket);
  }
}

export function handleError(err: unknown, tag: string): Response {
  if (err instanceof AssessmentError) return fail(err.status, err.message);
  console.error(`[assessment ${tag}] failed:`, err);
  return fail(500, 'Có lỗi xảy ra khi xử lý. Vui lòng thử lại sau.');
}

/** Tên người thao tác (CHƯA phải xác thực thật): header x-actor hoặc tham số actor. */
export function actorOf(request: Request, url: URL): string {
  return (request.headers.get('x-actor') || url.searchParams.get('actor') || '').trim().slice(0, 100);
}

export function guardGet(request: Request, bucket: string, limit = 60): Response | null {
  return requireAccess(request) || rateLimit(request, bucket, limit, 60_000);
}
