import { NextResponse } from 'next/server';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';
import { listRecentUsageEvents } from '@/lib/server/store';

export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'usage', 120, 60_000);
  if (limited) return limited;

  const du_lieu = await listRecentUsageEvents(100);
  return NextResponse.json({ ok: true, du_lieu });
}
