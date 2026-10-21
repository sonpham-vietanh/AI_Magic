import { NextResponse } from 'next/server';
import { getOrgId } from '@/lib/server/org';
import { listExams } from '@/lib/assessment';
import { guardGet, handleError } from '@/lib/assessment/http';
import { requireReviewer } from '@/lib/server/roles';

/** Chỉ metadata + ma trận; không bao giờ trả nội dung câu hỏi. Tên người soạn/duyệt chỉ hiện cho người có mã người duyệt. */
export async function GET(request: Request) {
  const denied = guardGet(request, 'assessment-exams');
  if (denied) return denied;
  try {
    return NextResponse.json({ ok: true, exams: await listExams(getOrgId(request), { showPeople: requireReviewer(request) === null }) });
  } catch (err) {
    return handleError(err, 'exams');
  }
}
