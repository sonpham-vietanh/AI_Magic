import { NextResponse } from 'next/server';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';
import { inspectCloudStoreStatus, syncAllLocalStoresToCloud } from '@/lib/server/supabaseStore';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = await requireAccess(request);
  if (denied) return denied;
  const status = await inspectCloudStoreStatus();
  return NextResponse.json({ ok: true, status });
}

export async function POST(request: Request) {
  const denied = await requireAccess(request);
  if (denied) return denied;
  const limited = await rateLimit(request, 'supabase-app-store-sync', 10, 60_000);
  if (limited) return limited;

  const sync = await syncAllLocalStoresToCloud();
  const status = await inspectCloudStoreStatus();
  return NextResponse.json(
    {
      ok: sync.ok,
      sync,
      status,
    },
    { status: sync.ok ? 200 : 502 },
  );
}
