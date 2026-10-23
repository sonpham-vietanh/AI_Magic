import { NextResponse } from 'next/server';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';
import { SAVINGS_DISCLAIMER, summarizeSavings } from '@/lib/stats/savings';
import { myVersions, sessionOf } from '@/lib/users/me';

export const runtime = 'nodejs';

/** Số phút ước tính đã tiết kiệm của RIÊNG người trong phiên (theo email/tên trong phiên, không nhận tham số người khác). */
export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'me-savings', 60, 60_000);
  if (limited) return limited;

  const session = sessionOf(request);
  if (!session) return NextResponse.json({ ok: false, error: 'Cần đăng nhập.' }, { status: 401 });
  try {
    const versions = await myVersions(request, session, 200);
    const summary = summarizeSavings(versions);
    return NextResponse.json(
      { ok: true, estimate: true, note: SAVINGS_DISCLAIMER, ...summary },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[me/savings GET] failed:', err);
    return NextResponse.json({ ok: false, error: 'Không tải được số liệu tiết kiệm.' }, { status: 500 });
  }
}
