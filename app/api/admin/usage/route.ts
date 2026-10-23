import { NextResponse } from 'next/server';
import { requireAccess } from '@/lib/server/guard';
import { requireAdmin } from '@/lib/server/roles';
import { rateLimit } from '@/lib/server/rateLimit';
import { readLedger } from '@/lib/usage/ledger';
import { dailyLimit, monthlyBudgetUsd } from '@/lib/usage/quota';
import { buildReport, parseRange, reportToCsv } from '@/lib/usage/report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Báo cáo sử dụng AI và chi phí cho quản trị viên. ?range=7d|30d|month, ?format=csv để tải về. */
export async function GET(request: Request) {
  const denied = requireAccess(request) ?? requireAdmin(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'admin-usage', 60, 60_000);
  if (limited) return limited;

  const url = new URL(request.url);
  const range = parseRange(url.searchParams.get('range'));
  try {
    const store = await readLedger();
    if (url.searchParams.get('format') === 'csv') {
      return new Response(reportToCsv(store, range), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="su-dung-ai-${range}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    const report = buildReport(store, range, monthlyBudgetUsd());
    return NextResponse.json(
      { ok: true, ...report, dailyLimit: dailyLimit(), note: 'Chi phí là ước tính theo bảng giá tham khảo, có thể lệch so với hoá đơn thật.' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('[admin/usage]', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'Không đọc được sổ sử dụng AI. Vui lòng thử lại.' }, { status: 500 });
  }
}
