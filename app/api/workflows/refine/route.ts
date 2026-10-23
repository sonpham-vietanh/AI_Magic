import { NextResponse } from 'next/server';
import { requireAccess } from '@/lib/server/guard';
import { effectiveActor } from '@/lib/server/identity';
import { rateLimit } from '@/lib/server/rateLimit';
import { withUsage } from '@/lib/usage/quota';
import { RefineBodySchema, refineText } from '@/lib/workflows/refine';

export const runtime = 'nodejs';

const fail = (status: number, error: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ ok: false, error, ...extra }, { status });

/** Chỉnh bản soạn bằng lời: một lượt gọi AI nhỏ, tính hạn mức như một lượt soạn. */
export async function POST(request: Request) {
  const denied = await requireAccess(request);
  if (denied) return denied;
  const limited = await rateLimit(request, 'workflows-refine', 30, 60_000);
  if (limited) return limited;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return fail(400, 'Dữ liệu gửi lên không hợp lệ.');
  }
  const parsed = RefineBodySchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    const msg =
      field === 'instruction'
        ? issue?.code === 'too_big'
          ? 'Yêu cầu chỉnh tối đa 500 ký tự. Cô/thầy nói ngắn gọn hơn nhé.'
          : 'Cô/thầy chưa nói muốn chỉnh gì.'
        : field === 'text'
          ? issue?.code === 'too_big'
            ? 'Bản soạn dài quá mức chỉnh một lần (tối đa 60.000 ký tự). Cô/thầy chỉnh từng phần giúp mình nhé.'
            : 'Chưa có nội dung để chỉnh.'
          : 'Thông tin gửi lên chưa hợp lệ.';
    return fail(400, msg);
  }

  const signed = effectiveActor(request, '');
  const metered = await withUsage(
    request,
    { workflow: 'wf:refine', declaredUser: signed || undefined },
    async (h) => {
      const out = await refineText(parsed.data);
      return { out, exceeded: h.exceeded() };
    },
  );
  // Hết hạn mức ngày: lượt AI bị chặn trước khi gọi.
  if (metered.exceeded) {
    const ex = metered.exceeded;
    return fail(429, ex.message, { quota: { used: ex.used, limit: ex.limit } });
  }
  const out = metered.out;
  if (!out.ok) return fail(out.status, out.error, out.code ? { code: out.code } : undefined);
  return NextResponse.json({ ok: true, text: out.text, ...(out.modelUsed ? { modelUsed: out.modelUsed } : {}) });
}
