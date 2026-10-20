import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getClassById } from '@/lib/classes';
import { answerPedagogicalAssistant } from '@/lib/engine/smartGenerator';
import { getNodeById } from '@/lib/knowledge-graph';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';
import { recordUsageEvent } from '@/lib/server/store';
import type { GeneratedResource } from '@/lib/types';

const idRegex = /^[A-Za-z0-9_.:-]{1,64}$/;

const bodySchema = z.object({
  question: z.string().max(4000),
  classId: z.string().regex(idRegex).optional(),
  knowledgeNodeId: z.string().regex(idRegex).optional(),
  teacherEmail: z.string().email().max(200).optional(),
  teacherName: z.string().max(100).optional(),
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

    const result = await answerPedagogicalAssistant({
      question,
      classProfile,
      primaryNode,
      currentResource: body.currentResource as unknown as GeneratedResource | undefined,
    });

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
      ...result,
    });
  } catch (err) {
    console.error('[assistant] error:', err);
    return NextResponse.json(
      { ok: false, error: 'Lỗi kết nối Trợ lý Sư phạm. Vui lòng thử lại sau.' },
      { status: 500 },
    );
  }
}
