import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonLimited } from '@/lib/server/body';
import { rateLimit } from '@/lib/server/rateLimit';
import { readSessionFromRequest } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/roles';
import { AdminRuleError, listUsers, updateUser } from '@/lib/users/directory';
import { StoreReadError, StoreWriteError } from '@/lib/server/safeJson';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' };

const roleEnum = z.enum(['teacher', 'reviewer', 'admin']);

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: roleEnum.optional(),
  status: z.enum(['active', 'blocked']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const updateSchema = z
  .object({
    email: z.string().trim().min(3).max(120),
    role: roleEnum.optional(),
    blocked: z.boolean().optional(),
  })
  .refine((v) => v.role !== undefined || v.blocked !== undefined, { message: 'Cần chọn vai trò hoặc trạng thái.' });

function failure(err: unknown): Response {
  if (err instanceof AdminRuleError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
  if (err instanceof StoreReadError || err instanceof StoreWriteError) {
    console.error('[admin/users] store error:', err);
    return NextResponse.json({ ok: false, error: 'Không đọc hoặc ghi được kho dữ liệu, vui lòng thử lại.' }, { status: 500 });
  }
  console.error('[admin/users] failed:', err);
  return NextResponse.json({ ok: false, error: 'Có lỗi máy chủ.' }, { status: 500 });
}

export async function GET(request: Request) {
  const limited = rateLimit(request, 'admin-users-get', 60, 60_000);
  if (limited) return limited;
  const denied = requireAdmin(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries([...url.searchParams].filter(([, v]) => v !== '')));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Tham số tìm kiếm không hợp lệ.' }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await listUsers(parsed.data)) }, { headers: NO_STORE });
  } catch (err) {
    return failure(err);
  }
}

export async function PUT(request: Request) {
  const limited = rateLimit(request, 'admin-users-put', 30, 60_000);
  if (limited) return limited;
  const denied = requireAdmin(request);
  if (denied) return denied;
  const body = await readJsonLimited(request, 8 * 1024);
  if (!body.ok) return body.response;
  const parsed = updateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.' }, { status: 400 });
  }
  const session = readSessionFromRequest(request);
  const actor = session?.email || session?.name || 'admin';
  try {
    const user = await updateUser(actor, parsed.data);
    return NextResponse.json({ ok: true, user }, { headers: NO_STORE });
  } catch (err) {
    return failure(err);
  }
}
