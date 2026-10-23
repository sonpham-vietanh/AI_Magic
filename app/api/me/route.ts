import { NextResponse } from 'next/server';
import { requireAccess } from '@/lib/server/guard';
import { isSsoEnabled } from '@/lib/server/googleAuth';
import { rateLimit } from '@/lib/server/rateLimit';
import { loadMe, sessionOf } from '@/lib/users/me';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'me-get', 120, 60_000);
  if (limited) return limited;

  const ssoEnabled = isSsoEnabled();
  const session = sessionOf(request);
  const headers = { 'Cache-Control': 'no-store' };
  if (!session) {
    return NextResponse.json({ ok: true, ssoEnabled, user: null, prefs: {} }, { headers });
  }
  try {
    const me = await loadMe(session);
    return NextResponse.json({ ok: true, ssoEnabled, user: me.user, prefs: me.prefs }, { headers });
  } catch (err) {
    console.error('[me GET] failed:', err);
    return NextResponse.json({ ok: false, error: 'Không tải được thông tin tài khoản.' }, { status: 500 });
  }
}
