import { NextResponse } from 'next/server';
import { z } from 'zod';
import { KhoValidationError, submitReview } from '@/lib/kho';
import { getOrgId } from '@/lib/server/org';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';

const bodySchema = z.object({
  atomId: z.string().min(1).max(100),
  reviewer: z.string().max(200),
  scores: z.record(z.string().max(60), z.number()),
  decision: z.enum(['approve', 'reject']),
  note: z.string().max(5_000).optional(),
});

export async function POST(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'kho-review', 30, 60_000);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Dữ liệu gửi lên không phải JSON hợp lệ.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Dữ liệu duyệt không hợp lệ.' }, { status: 400 });
  }
  try {
    const review = await submitReview(getOrgId(request), parsed.data);
    return NextResponse.json({ ok: true, review });
  } catch (err) {
    if (err instanceof KhoValidationError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 422 });
    }
    console.error('[kho review POST] failed:', err);
    return NextResponse.json({ ok: false, error: 'Không thể lưu kết quả duyệt.' }, { status: 500 });
  }
}
