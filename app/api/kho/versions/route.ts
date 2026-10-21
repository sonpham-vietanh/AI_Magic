import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listVersions } from '@/lib/kho';
import { getOrgId } from '@/lib/server/org';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';

const querySchema = z.object({ atomId: z.string().min(1).max(100) });

export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'kho-versions', 60, 60_000);
  if (limited) return limited;

  const parsed = querySchema.safeParse({ atomId: new URL(request.url).searchParams.get('atomId') ?? '' });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Thiếu hoặc sai mã bài (atomId).' }, { status: 400 });
  }
  try {
    const versions = await listVersions(getOrgId(request), parsed.data.atomId);
    // Chỉ trả tóm tắt; nội dung đầy đủ lấy qua /api/kho/standard.
    return NextResponse.json({
      ok: true,
      versions: versions.map((v) => ({
        version: v.version,
        approvedAt: v.approvedAt,
        reviewer: v.reviewer,
        average: v.average,
        kinds: v.artifacts.map((a) => a.kind),
        packageCount: v.packageCount,
      })),
    });
  } catch (err) {
    console.error('[kho versions GET] failed:', err);
    return NextResponse.json({ ok: false, error: 'Không thể tải các phiên bản.' }, { status: 500 });
  }
}
