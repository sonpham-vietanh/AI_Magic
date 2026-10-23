import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getClassById } from '@/lib/classes';
import { callLiveLlm } from '@/lib/engine/llmClient';
import { codeFromErrorText } from '@/lib/engine/llmErrors';
import { ASSISTANT_FOLLOWUPS, ASSISTANT_SYSTEM, buildAssistantUserPrompt } from '@/lib/agent/assistantPrompt';
import { getNodeById } from '@/lib/knowledge-graph';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';
import { cleanPedagogicalText } from '@/lib/text/clean';
import { isAiAuthError } from '@/lib/ui/soanBai';
import { withUsage } from '@/lib/usage/quota';
import { recordUsageEvent } from '@/lib/server/store';

const idRegex = /^[A-Za-z0-9_.:-]{1,64}$/;

const bodySchema = z.object({
  question: z.string().max(4000),
  classId: z.string().regex(idRegex).optional(),
  knowledgeNodeId: z.string().regex(idRegex).optional(),
  teacherEmail: z.string().email().max(200).optional(),
  teacherName: z.string().max(100).optional(),
  /** Ngữ cảnh từ ô chat hợp nhất: bài, môn, khối đang mở, vài lượt trước, trích đoạn bản soạn. */
  lessonTitle: z.string().max(300).optional(),
  subject: z.string().max(60).optional(),
  grade: z.string().max(10).optional(),
  currentText: z.string().max(60000).optional(),
  history: z
    .array(z.object({ role: z.enum(['teacher', 'assistant']), text: z.string().max(4000) }))
    .max(12)
    .optional(),
  currentResource: z
    .object({
      id: z.string().max(100).optional(),
      title: z.string().max(300).optional(),
      markdownContent: z.string().max(60000).optional(),
    })
    .loose()
    .refine((v) => JSON.stringify(v).length <= 150000, 'currentResource quá lớn')
    .optional(),
});

export async function POST(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'assistant', 30, 60_000);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Dữ liệu gửi lên không phải JSON hợp lệ.' },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Dữ liệu yêu cầu không hợp lệ (câu hỏi tối đa 4000 ký tự).' },
      { status: 400 },
    );
  }
  const body = parsed.data;

  try {
    const question = body.question.trim();
    if (!question) {
      return NextResponse.json(
        { ok: false, error: 'Vui lòng nhập câu hỏi cho Trợ lý Sư phạm.' },
        { status: 400 },
      );
    }

    const classProfile = getClassById(body.classId);
    const primaryNode = getNodeById(body.knowledgeNodeId);
    const resource = body.currentResource as { title?: string; markdownContent?: string } | undefined;
    const userPrompt = buildAssistantUserPrompt({
      question,
      className: classProfile?.className,
      campus: classProfile?.campus,
      studentCount: classProfile?.studentCount,
      lessonTitle: body.lessonTitle || primaryNode?.title,
      subject: body.subject || primaryNode?.subjectName,
      grade: body.grade || (primaryNode?.grade ? String(primaryNode.grade) : undefined),
      resourceTitle: resource?.title,
      currentText: body.currentText || resource?.markdownContent,
      history: body.history,
    });

    const metered = await withUsage(
      request,
      { workflow: 'assistant', declaredUser: body.teacherEmail || body.teacherName },
      async (h) => ({
        live: await callLiveLlm(ASSISTANT_SYSTEM, userPrompt, undefined, { maxTokens: 1800, timeoutMs: 60_000, useCache: false }),
        exceeded: h.exceeded(),
      }),
    );
    if (metered.exceeded) {
      return NextResponse.json(
        { ok: false, error: metered.exceeded.message, quota: { used: metered.exceeded.used, limit: metered.exceeded.limit } },
        { status: 429 },
      );
    }
    const live = metered.live;
    if (!live.ok || !live.content) {
      if (codeFromErrorText(live.error) === 'ai_auth' || isAiAuthError(502, live.error)) {
        return NextResponse.json(
          {
            ok: false,
            code: 'ai_auth',
            error: 'AI đang tạm không đăng nhập. Cô/thầy báo quản trị viên; bản nháp của cô/thầy vẫn được giữ.',
          },
          { status: 502 },
        );
      }
      return NextResponse.json(
        { ok: false, error: 'AI chưa phản hồi nên mình chưa trả lời được. Cô/thầy bấm Thử lại sau ít phút nhé.' },
        { status: 502 },
      );
    }

    await recordUsageEvent({
      nguoi: {
        email: body.teacherEmail || classProfile?.homeroomTeacher.email || 'son.nguyen@truongvietanh.com',
        ten: body.teacherName || classProfile?.homeroomTeacher.name || 'Nguyễn Sơn',
      },
      tinh_nang: 'hoi_tro_ly_su_pham',
      so_lan: 1,
      so_phut: 4,
      khoi_lop: classProfile?.grade || primaryNode?.grade,
      lop_hoc: classProfile?.className,
    });

    return NextResponse.json({
      ok: true,
      reply: cleanPedagogicalText(live.content),
      suggestions: ASSISTANT_FOLLOWUPS,
      mode: 'llm_live',
    });
  } catch (err) {
    console.error('[assistant] error:', err);
    return NextResponse.json(
      { ok: false, error: 'Lỗi kết nối Trợ lý Sư phạm. Vui lòng thử lại sau.' },
      { status: 500 },
    );
  }
}
