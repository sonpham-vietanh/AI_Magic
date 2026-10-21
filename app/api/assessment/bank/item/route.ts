import { NextResponse } from 'next/server';
import { getOrgId } from '@/lib/server/org';
import { loadBank } from '@/lib/assessment';
import { fail, guardGet, handleError } from '@/lib/assessment/http';

/** Xem đầy đủ MỘT câu (kèm đáp án) khi người dùng bấm xem. Chưa có đăng nhập thật nên chưa phân quyền theo người. */
export async function GET(request: Request) {
  const denied = guardGet(request, 'assessment-bank-item');
  if (denied) return denied;
  const url = new URL(request.url);
  const atomId = url.searchParams.get('atomId') || '';
  const id = url.searchParams.get('id') || '';
  if (!atomId || atomId.length > 100 || !id || id.length > 100) return fail(400, 'Thiếu mã nguyên tử hoặc mã câu hỏi.');
  try {
    const bank = await loadBank(getOrgId(request), atomId);
    const q = bank.items.find((i) => i.id === id);
    if (!q) return fail(404, 'Không tìm thấy câu hỏi trong ngân hàng.');
    return NextResponse.json({
      ok: true,
      item: { id: q.id, noiDung: q.noiDung, options: q.options, dapAn: q.dapAn, loiGiai: q.loiGiai },
    });
  } catch (err) {
    return handleError(err, 'bank-item');
  }
}
