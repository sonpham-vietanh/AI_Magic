import { NextResponse } from 'next/server';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';
import { myVersions, sessionOf, statsOf } from '@/lib/users/me';

export const runtime = 'nodejs';

/** Thống kê hoạt động của riêng người trong phiên (số bản đã soạn, lần soạn gần nhất, theo dạng đầu ra, 5 bản mới nhất). */
export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'me-activity', 60, 60_000);
  if (limited) return limited;

  const session = sessionOf(request);
  if (!session) return NextResponse.json({ ok: false, error: 'Cần đăng nhập.' }, { status: 401 });
  try {
    const versions = await myVersions(request, session, 200);
    const recent = versions.slice(0, 5).map((v) => ({
      id: v.id,
      title: v.title,
      format: v.format,
      lessonTitle: v.lessonTitle,
      number: v.number,
      createdAt: v.createdAt,
    }));
    return NextResponse.json({ ok: true, stats: statsOf(versions), recent }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[me/activity GET] failed:', err);
    return NextResponse.json({ ok: false, error: 'Không tải được thống kê hoạt động.' }, { status: 500 });
  }
}
