import { NextResponse } from 'next/server';
import { getOrgId } from '@/lib/server/org';
import { listExams } from '@/lib/assessment';
import { guardGet, handleError } from '@/lib/assessment/http';

/** Chỉ metadata + ma trận; không bao giờ trả nội dung câu hỏi. */
export async function GET(request: Request) {
  const denied = guardGet(request, 'assessment-exams');
  if (denied) return denied;
  try {
    return NextResponse.json({ ok: true, exams: await listExams(getOrgId(request)) });
  } catch (err) {
    return handleError(err, 'exams');
  }
}
