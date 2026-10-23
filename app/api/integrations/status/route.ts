import { NextResponse } from 'next/server';
import { computeStatuses } from '@/lib/integrations/catalog';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';
import { isSsoEnabled } from '@/lib/server/googleAuth';

export const dynamic = 'force-dynamic';

const has = (name: string) => (process.env[name] ?? '').trim().length > 0;

/**
 * Chỉ trả có/không, KHÔNG bao giờ trả tên hay giá trị biến môi trường.
 * Giao diện dùng để hiện thẻ "Đã nối / Chưa nối" cho cô/thầy.
 */
export async function GET(request: Request) {
  const denied = await requireAccess(request);
  if (denied) return denied;
  const limited = await rateLimit(request, 'integrations-status', 60, 60_000);
  if (limited) return limited;
  try {
    const services = computeStatuses(process.env).map((s) => ({
      id: s.id,
      name: s.name,
      purpose: s.purpose,
      products: s.products,
      configured: s.configured,
      wired: s.wired,
      state: s.state,
      fallback: s.fallback,
    }));
    const ai = {
      openrouter: has('OPENROUTER_API_KEY') || has('OPENROUTER_API_KEYS'),
      gemini: has('GEMINI_API_KEY') || has('GEMINI_API_KEYS'),
      groq: has('GROQ_API_KEY') || has('GROQ_API_KEYS'),
      openai: has('OPENAI_API_KEY') || has('OPENAI_API_KEYS'),
    };
    return NextResponse.json({
      ok: true,
      services,
      ai: { ...ai, any: Object.values(ai).some(Boolean) },
      login: { google: isSsoEnabled() },
      cloud: { configured: has('NEXT_PUBLIC_SUPABASE_URL') && has('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') },
    });
  } catch (err) {
    console.error('[integrations status] failed:', err);
    return NextResponse.json({ ok: false, error: 'Không thể kiểm tra trạng thái dịch vụ.' }, { status: 500 });
  }
}
