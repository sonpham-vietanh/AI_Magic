import { RUBRIC_6 } from '@/lib/eval';
import { report } from '@/lib/eval/store';
import { getOrgId } from '@/lib/server/org';
import { gate, serverError } from '@/lib/signals/http';

export async function GET(request: Request) {
  const denied = gate(request, 'eval-report', 60);
  if (denied) return denied;
  try {
    const version = new URL(request.url).searchParams.get('version')?.trim() || undefined;
    const rows = await report(getOrgId(request), version);
    return Response.json({
      ok: true,
      rubric: RUBRIC_6.map((c) => ({ id: c.id, name: c.name })),
      versions: rows,
    });
  } catch (err) {
    return serverError('eval/report', err);
  }
}
