import { NextResponse } from 'next/server';
import { timingSafeEqualStr } from '@/lib/server/guard';
import { queryMajorOsEvents } from '@/lib/server/store';

// Nguồn dữ liệu: chỉ các sự kiện do chính ứng dụng này ghi (recordUsageEvent).
// Không trộn Supabase activity vì không đủ trường để ánh xạ trung thực.
export async function GET(request: Request) {
  const expectedKey = process.env.MAJOR_OS_API_KEY?.trim();
  if (!expectedKey) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token || !timingSafeEqualStr(token, expectedKey)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const tu = params.get('tu');
  const den = params.get('den');
  if ((tu && Number.isNaN(Date.parse(tu))) || (den && Number.isNaN(Date.parse(den)))) {
    return NextResponse.json({ error: 'tu/den phải là ngày ISO hợp lệ' }, { status: 400 });
  }

  const { du_lieu, trang_sau } = await queryMajorOsEvents({
    tu,
    den,
    trangSau: params.get('trang_sau'),
    limit: 500,
  });

  return NextResponse.json({ du_lieu, con_nua: trang_sau !== null, trang_sau });
}
