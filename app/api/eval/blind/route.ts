import { z } from 'zod';
import { listBlindForRater, registerBlind } from '@/lib/eval/store';
import { getOrgId } from '@/lib/server/org';
import { gate, parseBody, serverError } from '@/lib/signals/http';

const schema = z.object({
  items: z
    .array(
      z.object({
        version: z.string().trim().min(1).max(100),
        caseId: z.string().max(200).optional(),
        runId: z.string().max(200).optional(),
        text: z.string().min(1).max(60_000),
      }),
    )
    .min(1)
    .max(500),
  seed: z.number().int().optional(),
});

/** Người chấm chỉ nhận nhãn mờ + nội dung, KHÔNG có phiên bản. */
export async function GET(request: Request) {
  const denied = gate(request, 'eval-blind', 120);
  if (denied) return denied;
  try {
    return Response.json({ ok: true, items: await listBlindForRater(getOrgId(request)) });
  } catch (err) {
    return serverError('eval/blind', err);
  }
}

/** Quản trị đăng ký các bản (kèm phiên bản) để chấm mù; phản hồi không chứa phiên bản. */
export async function POST(request: Request) {
  const denied = gate(request, 'eval-blind-w', 30);
  if (denied) return denied;
  const body = await parseBody(request, schema);
  if ('error' in body) return body.error;
  try {
    const seed = body.data.seed ?? Math.floor(Math.random() * 2 ** 31);
    const items = await registerBlind(getOrgId(request), body.data.items, seed);
    return Response.json({ ok: true, items });
  } catch (err) {
    return serverError('eval/blind', err);
  }
}
