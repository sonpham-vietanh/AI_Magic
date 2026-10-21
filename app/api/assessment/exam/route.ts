import { z } from 'zod';
import { getOrgId } from '@/lib/server/org';
import { draftExam, getExam } from '@/lib/assessment';
import { actorOf, guardGet, handleError, handlePost } from '@/lib/assessment/http';
import { NextResponse } from 'next/server';
import { fail } from '@/lib/assessment/http';

const schema = z.object({
  atomIds: z.array(z.string().min(1).max(100)).min(1).max(20),
  bloomLevels: z.array(z.string().max(30)).max(6).default([]),
  language: z.enum(['vi', 'en', 'song_ngu']).default('vi'),
  examDate: z.string().max(10).optional(),
  createdBy: z.string().trim().min(1).max(100),
});

export async function POST(request: Request) {
  return handlePost(request, 'assessment-exam', 10, schema, async (b) => ({
    exam: await draftExam({ orgId: getOrgId(request), ...b }),
  }));
}

export async function GET(request: Request) {
  const denied = guardGet(request, 'assessment-exam-get');
  if (denied) return denied;
  const url = new URL(request.url);
  const examId = url.searchParams.get('examId') || '';
  if (!/^DT-[A-Za-z0-9-]{3,40}$/.test(examId)) return fail(400, 'Mã đề không hợp lệ.');
  try {
    const exam = await getExam({ orgId: getOrgId(request), examId, actor: actorOf(request, url) });
    return NextResponse.json({ ok: true, exam });
  } catch (err) {
    return handleError(err, 'exam-get');
  }
}
