import { readOpsLog } from '@/lib/ops/log';
import { inspectStores } from '@/lib/ops/stores';
import { requireAdmin } from '@/lib/server/roles';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const [status, log] = await Promise.all([inspectStores(), readOpsLog(10).catch(() => [])]);
    return Response.json({ ok: true, ...status, log }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[admin data status] failed:', err);
    return Response.json({ ok: false, error: 'Không đọc được trạng thái kho dữ liệu.' }, { status: 500 });
  }
}
