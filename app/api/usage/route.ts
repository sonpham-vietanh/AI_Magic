import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';
import { listRecentUsageEvents } from '@/lib/server/store';

export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'usage', 120, 60_000);
  if (limited) return limited;

  // Ẩn danh hoá: không trả email/tên thật, chỉ mã băm ngắn để phân biệt người dùng.
  const events = await listRecentUsageEvents(100);
  const du_lieu = events.map((e) => {
    if (!e.nguoi) return e;
    const id = createHash('sha256').update(`${e.nguoi.email}|${e.nguoi.ten}`).digest('hex').slice(0, 6);
    return { ...e, nguoi: { email: '', ten: `Giáo viên ${id}` } };
  });
  return NextResponse.json({ ok: true, du_lieu });
}
