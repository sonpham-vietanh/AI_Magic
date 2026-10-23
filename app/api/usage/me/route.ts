import { NextResponse } from 'next/server';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';
import { readLedger } from '@/lib/usage/ledger';
import { dailyLimit, resolveUsageUser, summarizeMine } from '@/lib/usage/quota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lượt dùng AI của chính người đang đăng nhập (không lộ dữ liệu người khác). */
export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'usage-me', 60, 60_000);
  if (limited) return limited;
  try {
    const user = resolveUsageUser(request, new URL(request.url).searchParams.get('user'));
    const mine = summarizeMine(await readLedger(), user);
    return NextResponse.json({ ok: true, ...mine }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[usage/me]', e instanceof Error ? e.message : e);
    // Giao diện không được vỡ: trả số 0 kèm hạn mức hiện hành.
    return NextResponse.json({ ok: true, today: { used: 0, limit: dailyLimit() }, month: { runs: 0, tokens: 0 } });
  }
}
