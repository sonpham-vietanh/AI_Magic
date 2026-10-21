import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listAssets, listVersions } from '@/lib/kho';
import { getOrgId } from '@/lib/server/org';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';

const querySchema = z.object({ atomId: z.string().min(1).max(100) });

export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'kho-resources', 90, 60_000);
  if (limited) return limited;

  const parsed = querySchema.safeParse({ atomId: new URL(request.url).searchParams.get('atomId') ?? '' });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Thiếu hoặc sai mã bài (atomId).' }, { status: 400 });
  }
  try {
    const orgId = getOrgId(request);
    const [assets, versions] = await Promise.all([listAssets(orgId, parsed.data.atomId), listVersions(orgId, parsed.data.atomId)]);
    const latest = versions.length ? versions[versions.length - 1].version : null;
    return NextResponse.json({ ok: true, assets, latestVersion: latest });
  } catch (err) {
    console.error('[kho resources GET] failed:', err);
    return NextResponse.json({ ok: false, error: 'Không thể tải tài nguyên của bài.' }, { status: 500 });
  }
}
