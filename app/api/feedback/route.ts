import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  addFeedback,
  FEEDBACK_KINDS,
  FEEDBACK_MAX_EXCERPT,
  FEEDBACK_MAX_MESSAGE,
} from '@/lib/stats/feedbackStore';
import { readJsonLimited } from '@/lib/server/body';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';
import { actorOf, sessionOf } from '@/lib/users/me';

export const runtime = 'nodejs';

const bodySchema = z.object({
  kind: z.enum(FEEDBACK_KINDS.map((k) => k.id) as [string, ...string[]]),
  message: z.string().trim().min(3).max(FEEDBACK_MAX_MESSAGE),
  excerpt: z.string().max(FEEDBACK_MAX_EXCERPT).optional(),
  teacherName: z.string().max(100).optional(),
  context: z
    .object({
      workflow: z.string().max(60).optional(),
      format: z.string().max(60).optional(),
      lessonTitle: z.string().max(200).optional(),
      runId: z.string().max(80).optional(),
      page: z.string().max(200).optional(),
    })
    .optional(),
});

/** Giáo viên báo một bản soạn của AI có lỗi. Lưu vào .data/feedback.json để nhóm phát triển xem. */
export async function POST(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'feedback', 10, 60_000);
  if (limited) return limited;

  const read = await readJsonLimited(request, 16 * 1024);
  if (!read.ok) return read.response;
  const parsed = bodySchema.safeParse(read.data);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Cô/thầy mô tả giúp lỗi bằng vài chữ (tối đa 1000 ký tự) rồi gửi lại.' },
      { status: 400 },
    );
  }
  const b = parsed.data;
  const session = sessionOf(request);
  const actor = (session ? actorOf(session) : b.teacherName?.trim()) || 'khách';
  try {
    await addFeedback({
      actor,
      kind: b.kind,
      message: b.message,
      ...(b.excerpt ? { excerpt: b.excerpt } : {}),
      context: b.context ?? {},
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[feedback POST] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'Chưa gửi được phản hồi. Cô/thầy thử lại sau ít giây.' }, { status: 500 });
  }
}
