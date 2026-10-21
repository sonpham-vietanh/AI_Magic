import { z } from 'zod';
import { MAX_EVAL_CASES, coverage } from '@/lib/eval';
import { CaseLimitError, addCase, listCases } from '@/lib/eval/store';
import { getOrgId } from '@/lib/server/org';
import { fail, gate, parseBody, serverError } from '@/lib/signals/http';

const nonEmpty = (label: string) =>
  z.string().trim().min(1, `${label} không được để trống`).max(200);

const schema = z.object({
  subject: nonEmpty('môn'),
  grade: nonEmpty('khối'),
  title: nonEmpty('tiêu đề'),
  text: z.string().trim().min(1, 'nội dung đề không được để trống').max(60_000),
  // Đề phải thu nguyên văn từ giáo viên: bắt buộc nguồn + giáo viên.
  source: nonEmpty('nguồn'),
  teacher: nonEmpty('giáo viên'),
});

export async function GET(request: Request) {
  const denied = gate(request, 'eval-cases', 120);
  if (denied) return denied;
  try {
    const cases = await listCases(getOrgId(request));
    return Response.json({ ok: true, max: MAX_EVAL_CASES, cases, coverage: coverage(cases) });
  } catch (err) {
    return serverError('eval/cases', err);
  }
}

export async function POST(request: Request) {
  const denied = gate(request, 'eval-cases-w', 60);
  if (denied) return denied;
  const body = await parseBody(request, schema);
  if ('error' in body) return body.error;
  try {
    const orgId = getOrgId(request);
    const created = await addCase(orgId, body.data);
    const cases = await listCases(orgId);
    return Response.json({ ok: true, case: created, coverage: coverage(cases) }, { status: 201 });
  } catch (err) {
    if (err instanceof CaseLimitError) return fail(409, `Bộ đề đã đủ ${MAX_EVAL_CASES} đề.`);
    return serverError('eval/cases', err);
  }
}
