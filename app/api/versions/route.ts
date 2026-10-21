import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAccess } from '@/lib/server/guard';
import { getOrgId } from '@/lib/server/org';
import { rateLimit } from '@/lib/server/rateLimit';
import { getVersion, listVersions, saveVersion, VersionLimitError } from '@/lib/versions/store';
import type { VersionInput } from '@/lib/versions/types';

const bodySchema = z.object({
  runId: z.string().min(1).max(100),
  title: z.string().min(1).max(300),
  format: z.string().min(1).max(60),
  workflow: z.string().min(1).max(60),
  lessonKey: z.string().min(1).max(200),
  lessonTitle: z.string().max(300).optional(),
  // Giới hạn byte thực tế được kiểm tra lại trong store (100KB).
  text: z.string().max(110_000),
  // Hình dạng chi tiết từng sản phẩm do bộ hiển thị kiểm tra khi mở; ở đây chỉ chặn kiểu cơ bản.
  artifacts: z
    .array(z.object({ kind: z.string().max(30), title: z.string().max(300), data: z.unknown() }))
    .max(20)
    .optional(),
  actor: z.string().trim().min(1).max(100),
  basedOnVersion: z.string().max(100).optional(),
});

const querySchema = z.object({
  id: z.string().min(1).max(100).optional(),
  actor: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'versions-post', 30, 60_000);
  if (limited) return limited;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Dữ liệu gửi lên không phải JSON hợp lệ.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Dữ liệu phiên bản không hợp lệ.' }, { status: 400 });
  }
  try {
    const version = await saveVersion(getOrgId(request), parsed.data as unknown as VersionInput);
    return NextResponse.json({ ok: true, version });
  } catch (err) {
    if (err instanceof VersionLimitError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 413 });
    }
    console.error('[versions POST] failed:', err);
    return NextResponse.json({ ok: false, error: 'Không thể lưu phiên bản.' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'versions-get', 120, 60_000);
  if (limited) return limited;

  const sp = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    id: sp.get('id') || undefined,
    actor: sp.get('actor') || undefined,
    limit: sp.get('limit') || undefined,
  });
  if (!parsed.success || (!parsed.data.id && !parsed.data.actor)) {
    return NextResponse.json({ ok: false, error: 'Cần tham số id hoặc actor hợp lệ.' }, { status: 400 });
  }
  try {
    const org = getOrgId(request);
    if (parsed.data.id) {
      const v = await getVersion(org, parsed.data.id);
      if (!v) return NextResponse.json({ ok: false, error: 'Không tìm thấy phiên bản.' }, { status: 404 });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { orgId: _orgId, ...rest } = v;
      return NextResponse.json({ ok: true, version: { ...rest, artifacts: v.artifacts ?? [] } });
    }
    const versions = await listVersions(org, parsed.data.actor!, parsed.data.limit ?? 100);
    return NextResponse.json({ ok: true, versions });
  } catch (err) {
    console.error('[versions GET] failed:', err);
    return NextResponse.json({ ok: false, error: 'Không thể tải phiên bản.' }, { status: 500 });
  }
}
