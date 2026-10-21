import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listLibrary } from '@/lib/kho';
import { getOrgId } from '@/lib/server/org';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';

const querySchema = z.object({
  subject: z.string().max(60).optional(),
  grade: z.string().max(10).optional(),
});

export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'kho-library', 60, 60_000);
  if (limited) return limited;

  const sp = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    subject: sp.get('subject') || undefined,
    grade: sp.get('grade') || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Tham số lọc không hợp lệ.' }, { status: 400 });
  }
  try {
    const items = await listLibrary(getOrgId(request), parsed.data);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error('[kho library GET] failed:', err);
    return NextResponse.json({ ok: false, error: 'Không thể tải thư viện tiết học.' }, { status: 500 });
  }
}
