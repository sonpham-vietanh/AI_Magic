import { NextResponse } from 'next/server';
import { z } from 'zod';
import { KhoGenerateError, generateDraftsForAtom } from '@/lib/kho/generate';
import { RESOURCE_KINDS } from '@/lib/resources/types';
import { getOrgId } from '@/lib/server/org';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';

const bodySchema = z.object({
  atomId: z.string().min(1).max(100),
  kinds: z.array(z.enum(RESOURCE_KINDS)).min(1).max(6).optional(),
});

export async function POST(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'kho-generate', 24, 60_000);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Dữ liệu gửi lên không phải JSON hợp lệ.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Yêu cầu sinh tài nguyên không hợp lệ.' }, { status: 400 });
  }
  try {
    const r = await generateDraftsForAtom(getOrgId(request), parsed.data.atomId, parsed.data.kinds, request.signal);
    return NextResponse.json({ ok: true, saved: r.saved, errors: r.errors });
  } catch (err) {
    if (err instanceof KhoGenerateError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 422 });
    }
    console.error('[kho generate POST] failed:', err);
    return NextResponse.json({ ok: false, error: 'Không thể sinh tài nguyên lúc này.' }, { status: 500 });
  }
}
