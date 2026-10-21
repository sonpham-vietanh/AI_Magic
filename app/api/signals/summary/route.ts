import { getOrgId } from '@/lib/server/org';
import { lessonStats, summary } from '@/lib/signals';
import { gate, serverError } from '@/lib/signals/http';

export async function GET(request: Request) {
  const denied = gate(request, 'signals-summary', 120);
  if (denied) return denied;
  try {
    const orgId = getOrgId(request);
    const [s, lessons] = await Promise.all([summary(orgId), lessonStats(orgId)]);
    return Response.json({ ok: true, summary: s, lessons });
  } catch (err) {
    return serverError('signals/summary', err);
  }
}
