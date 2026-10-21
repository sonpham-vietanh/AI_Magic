import { z } from 'zod';
import { getBaseline, setBaseline } from '@/lib/eval/store';
import { getOrgId } from '@/lib/server/org';
import { gate, parseBody, serverError } from '@/lib/signals/http';

const minutes = z.number().finite().min(0, 'số phút không âm').max(10_000).nullable();
const schema = z.object({
  baselineMinutes: minutes,
  targetMinutes: minutes,
  measuredWith: z.string().max(300).optional(),
});

export async function GET(request: Request) {
  const denied = gate(request, 'eval-baseline', 120);
  if (denied) return denied;
  try {
    return Response.json({ ok: true, baseline: await getBaseline(getOrgId(request)) });
  } catch (err) {
    return serverError('eval/baseline', err);
  }
}

export async function POST(request: Request) {
  const denied = gate(request, 'eval-baseline-w', 30);
  if (denied) return denied;
  const body = await parseBody(request, schema);
  if ('error' in body) return body.error;
  try {
    const baseline = await setBaseline(getOrgId(request), body.data);
    return Response.json({ ok: true, baseline });
  } catch (err) {
    return serverError('eval/baseline', err);
  }
}
