import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit } from '@/lib/server/rateLimit';
import { requireAdmin } from '@/lib/server/roles';
import { listAudit } from '@/lib/users/audit';

export const runtime = 'nodejs';

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: Request) {
  const limited = rateLimit(request, 'admin-audit-get', 60, 60_000);
  if (limited) return limited;
  const denied = requireAdmin(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries([...url.searchParams].filter(([, v]) => v !== '')));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Tham số không hợp lệ.' }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await listAudit(parsed.data)) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[admin/audit] failed:', err);
    return NextResponse.json({ ok: false, error: 'Không đọc được nhật ký.' }, { status: 500 });
  }
}
