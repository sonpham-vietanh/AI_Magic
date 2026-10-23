import { NextResponse } from 'next/server';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';
import { buildExport, sessionOf } from '@/lib/users/me';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'me-export', 10, 60_000);
  if (limited) return limited;

  const session = sessionOf(request);
  if (!session) return NextResponse.json({ ok: false, error: 'Cần đăng nhập để tải dữ liệu của mình.' }, { status: 401 });
  try {
    const data = await buildExport(request, session);
    const day = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="du-lieu-cua-toi-${day}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[me/export GET] failed:', err);
    return NextResponse.json({ ok: false, error: 'Không tạo được tệp dữ liệu.' }, { status: 500 });
  }
}
