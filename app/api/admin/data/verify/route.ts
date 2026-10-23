// Kiểm tra một tệp sao lưu đã tải lên: chỉ xác thực cấu trúc và checksum. KHÔNG khôi phục, KHÔNG ghi vào kho.
import { appendOpsLog } from '@/lib/ops/log';
import { verifyBundle } from '@/lib/ops/exportBundle';
import { readSessionFromRequest } from '@/lib/server/auth';
import { readJsonLimited } from '@/lib/server/body';
import { rateLimit } from '@/lib/server/rateLimit';
import { requireAdmin } from '@/lib/server/roles';
import { STORE_KEYS } from '@/lib/server/supabaseStore';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'admin-verify', 20, 60_000);
  if (limited) return limited;
  const body = await readJsonLimited(request, MAX_BYTES);
  if (!body.ok) return body.response;
  const report = verifyBundle(body.data, STORE_KEYS);
  const session = readSessionFromRequest(request);
  const actor = session?.email || session?.name || 'admin';
  await appendOpsLog({
    actor,
    action: 'verify',
    detail: report.ok ? `hợp lệ, ${report.checks.length} kho` : `không hợp lệ (${report.errors.length} lỗi)`,
  }).catch((e) => console.error('[ops] không ghi được nhật ký kiểm tra:', e));
  return Response.json({ ok: true, report }, { headers: { 'Cache-Control': 'no-store' } });
}
