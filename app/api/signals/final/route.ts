import { z } from 'zod';
import { getOrgId } from '@/lib/server/org';
import { UnknownRunError, recordFinalVersion } from '@/lib/signals';
import { fail, gate, parseBody, serverError } from '@/lib/signals/http';

const schema = z.object({
  runId: z.string().min(1, 'thiếu runId').max(200),
  finalText: z.string().max(200_000, 'văn bản quá dài'),
  accepted: z.boolean(),
});

export async function POST(request: Request) {
  const denied = gate(request, 'signals-final', 120);
  if (denied) return denied;
  const body = await parseBody(request, schema);
  if ('error' in body) return body.error;
  try {
    const r = await recordFinalVersion({ orgId: getOrgId(request), ...body.data });
    return Response.json({ ok: true, diffRatio: r.diffRatio, editedAtAll: r.editedAtAll });
  } catch (err) {
    if (err instanceof UnknownRunError) return fail(404, 'Không tìm thấy lượt sinh tương ứng.');
    return serverError('signals/final', err);
  }
}
