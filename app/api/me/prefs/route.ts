import { NextResponse } from 'next/server';
import { readJsonLimited } from '@/lib/server/body';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';
import { sessionOf } from '@/lib/users/me';
import { prefsSchema, setPrefs, userKey } from '@/lib/users/prefs';

export const runtime = 'nodejs';

export async function PUT(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'me-prefs', 20, 60_000);
  if (limited) return limited;

  // Chỉ ghi cho CHÍNH người trong phiên; không nhận email/định danh từ nội dung gửi lên.
  const session = sessionOf(request);
  if (!session) return NextResponse.json({ ok: false, error: 'Cần đăng nhập để lưu tuỳ chọn.' }, { status: 401 });
  const key = userKey(session);
  if (!key) return NextResponse.json({ ok: false, error: 'Không xác định được tài khoản.' }, { status: 400 });

  const body = await readJsonLimited(request, 4 * 1024);
  if (!body.ok) return body.response;
  const parsed = prefsSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Tuỳ chọn không hợp lệ.' }, { status: 400 });
  }
  try {
    const prefs = await setPrefs(key, parsed.data);
    return NextResponse.json({ ok: true, prefs });
  } catch (err) {
    console.error('[me/prefs PUT] failed:', err);
    return NextResponse.json({ ok: false, error: 'Không lưu được tuỳ chọn. Cô/thầy thử lại.' }, { status: 500 });
  }
}
