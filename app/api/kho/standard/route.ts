import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStandardLesson } from '@/lib/kho';
import { getOrgId } from '@/lib/server/org';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';

const querySchema = z.object({ atomId: z.string().min(1).max(100) });

export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'kho-standard', 60, 60_000);
  if (limited) return limited;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ atomId: url.searchParams.get('atomId') ?? '' });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Thiếu hoặc sai mã bài (atomId).' }, { status: 400 });
  }
  try {
    const lesson = await getStandardLesson(getOrgId(request), parsed.data.atomId);
    return NextResponse.json({ ok: true, lesson });
  } catch (err) {
    console.error('[kho standard GET] failed:', err);
    return NextResponse.json({ ok: false, error: 'Không thể tải bản chuẩn.' }, { status: 500 });
  }
}
