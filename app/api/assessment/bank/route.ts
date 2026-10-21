import { NextResponse } from 'next/server';
import { getOrgId } from '@/lib/server/org';
import { loadBank, toPublicBankItem } from '@/lib/assessment';
import { usedRecently } from '@/lib/assessment/exam';
import { now, readOrg } from '@/lib/assessment/store';
import { fail, guardGet, handleError } from '@/lib/assessment/http';

/** Danh sách ngân hàng câu hỏi: KHÔNG trả đáp án/lời giải (chỉ xem trước đề). */
export async function GET(request: Request) {
  const denied = guardGet(request, 'assessment-bank');
  if (denied) return denied;
  const atomId = new URL(request.url).searchParams.get('atomId') || '';
  if (!atomId || atomId.length > 100) return fail(400, 'Thiếu hoặc sai mã nguyên tử (atomId).');
  try {
    const orgId = getOrgId(request);
    const [bank, org] = await Promise.all([loadBank(orgId, atomId), readOrg(orgId)]);
    const blocked = usedRecently(org, now());
    return NextResponse.json({
      ok: true,
      atomCode: bank.atomCode,
      atomTitle: bank.atomTitle,
      found: bank.found,
      items: bank.items.map((i) => toPublicBankItem(i, { blocked: blocked.has(i.id), atomTitle: bank.atomTitle })),
    });
  } catch (err) {
    return handleError(err, 'bank');
  }
}
