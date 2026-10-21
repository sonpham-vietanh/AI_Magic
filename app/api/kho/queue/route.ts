import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listReviewQueue } from '@/lib/kho';
import { getOrgId } from '@/lib/server/org';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';

const querySchema = z.object({
  subject: z.string().max(60).optional(),
  grade: z.string().max(10).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'kho-queue', 60, 60_000);
  if (limited) return limited;

  const sp = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    subject: sp.get('subject') || undefined,
    grade: sp.get('grade') || undefined,
    limit: sp.get('limit') || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Tham số lọc không hợp lệ.' }, { status: 400 });
  }
  try {
    const items = await listReviewQueue(getOrgId(request), parsed.data);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error('[kho queue GET] failed:', err);
    return NextResponse.json({ ok: false, error: 'Không thể tải hàng chờ duyệt.' }, { status: 500 });
  }
}
