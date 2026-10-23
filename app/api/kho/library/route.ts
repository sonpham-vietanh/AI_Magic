import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LIBRARY_DEFAULT_LIMIT, LIBRARY_MAX_LIMIT, searchLibrary } from '@/lib/kho';
import { getOrgId } from '@/lib/server/org';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';

const gradeParam = z.union([z.literal('all'), z.string().regex(/^(?:[1-9]|1[0-2])$/)]);

const librarySchema = z.object({
  /** Mã môn (toan, vat_ly...) hoặc 'all' để tìm chéo mọi môn. */
  subject: z.union([z.literal('all'), z.string().regex(/^[a-z0-9_]{1,40}$/)]).optional(),
  /** Khối 1-12 hoặc 'all' để tìm chéo mọi khối. */
  grade: gradeParam.optional(),
  /** Từ khoá tự do, không dấu cũng được. */
  q: z.string().trim().max(100).optional(),
  /** Khối ưu tiên khi xếp theo độ khớp (cộng điểm nhẹ). */
  preferGrade: z.string().regex(/^(?:[1-9]|1[0-2])$/).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
  limit: z.coerce.number().int().min(1).max(LIBRARY_MAX_LIMIT).optional(),
});

export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'kho-library', 60, 60_000);
  if (limited) return limited;

  const sp = new URL(request.url).searchParams;
  const raw: Record<string, string> = {};
  for (const k of ['subject', 'grade', 'q', 'preferGrade', 'offset', 'limit']) {
    const v = sp.get(k);
    if (v !== null && v !== '') raw[k] = v;
  }
  const parsed = librarySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Tham số lọc không hợp lệ.' }, { status: 400 });
  }
  try {
    const page = await searchLibrary(getOrgId(request), {
      ...parsed.data,
      limit: parsed.data.limit ?? LIBRARY_DEFAULT_LIMIT,
    });
    return NextResponse.json({ ok: true, ...page });
  } catch (err) {
    console.error('[kho library GET] failed:', err);
    return NextResponse.json({ ok: false, error: 'Không thể tải thư viện tiết học.' }, { status: 500 });
  }
}
