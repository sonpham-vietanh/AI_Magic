import { NextResponse } from 'next/server';
import { computeStatuses } from '@/lib/integrations/catalog';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'integrations-status', 60, 60_000);
  if (limited) return limited;
  try {
    return NextResponse.json({
      ok: true,
      services: computeStatuses(process.env).map(
        // Không lộ tên biến môi trường (envNames để mảng rỗng cho khớp kiểu phía giao diện; note có nhắc tên biến nên bỏ).
        ({ note: _note, ...rest }) => ({ ...rest, envNames: [] as string[] }),
      ),
    });
  } catch (err) {
    console.error('[integrations status] failed:', err);
    return NextResponse.json({ ok: false, error: 'Không thể kiểm tra trạng thái dịch vụ.' }, { status: 500 });
  }
}
