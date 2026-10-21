import { z } from 'zod';
import { RUBRIC_6 } from '@/lib/eval';
import { UnknownBlindLabelError, addScore } from '@/lib/eval/store';
import { getOrgId } from '@/lib/server/org';
import { fail, gate, parseBody, serverError } from '@/lib/signals/http';

const point = z.number().int('điểm phải là số nguyên').min(1, 'điểm từ 1 đến 5').max(5, 'điểm từ 1 đến 5');
const schema = z
  .object({
    caseId: z.string().min(1).max(200).optional(),
    runId: z.string().min(1).max(200).optional(),
    blindLabel: z.string().min(1).max(100),
    rater: z.string().trim().min(1, 'thiếu tên người chấm').max(200),
    scores: z.object(
      Object.fromEntries(RUBRIC_6.map((c) => [c.id, point])) as Record<(typeof RUBRIC_6)[number]['id'], typeof point>,
    ),
  })
  .refine((v) => v.caseId || v.runId, { message: 'cần caseId hoặc runId' });

export async function POST(request: Request) {
  const denied = gate(request, 'eval-score', 120);
  if (denied) return denied;
  const body = await parseBody(request, schema);
  if ('error' in body) return body.error;
  try {
    await addScore(getOrgId(request), body.data);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof UnknownBlindLabelError) return fail(404, 'Nhãn chấm mù không tồn tại.');
    return serverError('eval/score', err);
  }
}
