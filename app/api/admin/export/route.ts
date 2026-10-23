// Tải bản sao lưu (JSON) các kho dữ liệu. Chỉ quản trị viên. Đã loại token/mã/khóa; kèm manifest checksum.
import { buildExportFromStores } from '@/lib/ops/export';
import { appendOpsLog } from '@/lib/ops/log';
import { readSessionFromRequest } from '@/lib/server/auth';
import { rateLimit } from '@/lib/server/rateLimit';
import { requireAdmin } from '@/lib/server/roles';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'admin-export', 6, 60_000);
  if (limited) return limited;
  const session = readSessionFromRequest(request);
  const actor = session?.email || session?.name || 'admin';
  try {
    const bundle = await buildExportFromStores(actor);
    const names = Object.keys(bundle.manifest.stores);
    await appendOpsLog({ actor, action: 'export', detail: `${names.length} kho: ${names.join(', ')}` }).catch((e) => {
      console.error('[ops] không ghi được nhật ký xuất:', e);
    });
    const stamp = bundle.manifest.createdAt.replace(/[:.]/g, '-').slice(0, 19);
    return new Response(JSON.stringify(bundle, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="va-sao-luu-${stamp}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[admin export] failed:', err);
    return Response.json({ ok: false, error: 'Không dựng được bản sao lưu. Kiểm tra nhật ký máy chủ.' }, { status: 500 });
  }
}
