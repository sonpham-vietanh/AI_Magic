import { NextResponse } from 'next/server';
import { getOrgId } from '@/lib/server/org';
import { loadBank } from '@/lib/assessment';
import { lockedQuestionIds } from '@/lib/assessment/locks';
import { now, readOrg } from '@/lib/assessment/store';
import { fail, guardGet, handleError } from '@/lib/assessment/http';

/**
 * Xem MỘT câu. Đáp án và lời giải CHỈ trả khi câu không bị khoá; câu đang khoá chống trùng hoặc thuộc đề chưa công bố
 * thì chỉ trả đề bài (không trả đáp án/lời giải).
 */
export async function GET(request: Request) {
  const denied = guardGet(request, 'assessment-bank-item');
  if (denied) return denied;
  const url = new URL(request.url);
  const atomId = url.searchParams.get('atomId') || '';
  const id = url.searchParams.get('id') || '';
  if (!atomId || atomId.length > 100 || !id || id.length > 100) return fail(400, 'Thiếu mã nguyên tử hoặc mã câu hỏi.');
  try {
    const orgId = getOrgId(request);
    const [bank, org] = await Promise.all([loadBank(orgId, atomId), readOrg(orgId)]);
    const q = bank.items.find((i) => i.id === id);
    if (!q) return fail(404, 'Không tìm thấy câu hỏi trong ngân hàng.');
    if (lockedQuestionIds(org, now()).has(q.id)) {
      return NextResponse.json({
        ok: true,
        item: {
          id: q.id,
          noiDung: q.noiDung,
          options: q.options,
          locked: true,
          lockedReason: 'Câu này đang bị khoá (đã dùng gần đây hoặc thuộc đề chưa công bố) nên chưa hiện đáp án và lời giải.',
        },
      });
    }
    return NextResponse.json({
      ok: true,
      item: { id: q.id, noiDung: q.noiDung, options: q.options, dapAn: q.dapAn, loiGiai: q.loiGiai },
    });
  } catch (err) {
    return handleError(err, 'bank-item');
  }
}
