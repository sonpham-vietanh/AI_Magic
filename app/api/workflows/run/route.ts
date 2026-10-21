import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callLiveLlm } from '@/lib/engine/llmClient';
import { cleanPedagogicalText } from '@/lib/text/clean';
import { getClassById, buildClassPedagogicalContext } from '@/lib/classes';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';
import { getOrgId } from '@/lib/server/org';
import { getStandardLesson } from '@/lib/kho';
import { generateQuiz, draftExam } from '@/lib/assessment';
import { checkNewsEvent } from '@/lib/guardrails/news';
import { recordGeneration } from '@/lib/signals';
import { routeWorkflow } from '@/lib/workflows/router';
import { reflect } from '@/lib/workflows/reflection';
import { buildPrompts, markdownToSections } from '@/lib/workflows/prompts';
import {
  WorkflowParamsSchema,
  bloomLevelsFor,
  type Section,
  type WorkflowResult,
} from '@/lib/workflows/types';

export const runtime = 'nodejs';

const bodySchema = z.object({ params: WorkflowParamsSchema });

const fail = (status: number, error: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ ok: false, error, ...extra }, { status });

export async function POST(request: Request) {
  const denied = await requireAccess(request);
  if (denied) return denied;
  const limited = await rateLimit(request, 'workflows', 30, 60_000);
  if (limited) return limited;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return fail(400, 'Dữ liệu JSON không hợp lệ.');
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return fail(400, `Tham số không hợp lệ: ${parsed.error.issues[0]?.message ?? 'sai định dạng'}`);
  }
  const params = parsed.data.params;
  const orgId = getOrgId(request);
  const warnings: string[] = [];
  let requiresApproval = false;
  const teacherName = params.teacher?.name ?? 'Giáo viên';

  try {
    const std = await getStandardLesson(orgId, params.baiDayId);
    if (std.status === 'khong_co') return fail(404, 'Không tìm thấy bài dạy trong Kho.');
    if (std.status === 'chua_duyet') {
      warnings.push('Bản chuẩn chưa qua người duyệt: nội dung chỉ là bản nháp');
      requiresApproval = true;
    }

    // Bài liên kết (tích hợp liên môn): chỉ dùng cho các quy trình soạn bằng AI.
    let linkedStd: Awaited<ReturnType<typeof getStandardLesson>> | undefined;
    if (params.lienKetId) {
      const wf = routeWorkflow(params.formatDauRa);
      if (wf === 'quiz' || wf === 'de_kiem_tra') {
        warnings.push('Sản phẩm này chưa hỗ trợ ghép bài liên kết nên mình bỏ qua bài liên kết.');
      } else {
        const l = await getStandardLesson(orgId, params.lienKetId);
        if (l.status === 'khong_co') {
          warnings.push('Không tìm thấy bài liên kết trong Kho nên mình chỉ soạn theo bài chính.');
        } else {
          linkedStd = l;
          if (l.status === 'chua_duyet') {
            warnings.push('Bài liên kết chưa qua người duyệt: phần tích hợp chỉ là bản nháp.');
            requiresApproval = true;
          }
        }
      }
    }

    let guardrail: { ok: boolean; reasons: string[] } | undefined;
    if (params.suKienThoiSu) {
      const g = checkNewsEvent(params.suKienThoiSu);
      guardrail = { ok: g.ok, reasons: g.reasons };
      if (!g.ok) return fail(422, 'Sự kiện thời sự không đạt kiểm tra an toàn.', { reasons: g.reasons });
      requiresApproval = true;
      warnings.push('Tiết có gắn thời sự → bắt buộc người duyệt');
    }

    const workflow = routeWorkflow(params.formatDauRa);
    const bloomLevels = bloomLevelsFor(params.bloomThapNhat);
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const reviewedBy = (std.review as { reviewedBy?: string } | undefined)?.reviewedBy;

    let sections: Section[];
    let markdown: string;

    if (workflow === 'quiz') {
      const q = await generateQuiz({
        orgId,
        atomId: params.baiDayId,
        bloomLevels,
        language: params.ngonNgu,
        style: params.phongCach,
      });
      sections = q.sections;
      markdown = q.markdown;
    } else if (workflow === 'de_kiem_tra') {
      const d = await draftExam({
        orgId,
        atomIds: [params.baiDayId],
        bloomLevels,
        language: params.ngonNgu,
        examDate: params.ngayDay,
        createdBy: teacherName,
      });
      sections = d.sections;
      markdown = d.markdown;
      requiresApproval = true;
    } else {
      const profile = getClassById(params.classId);
      const { system, user } = buildPrompts({
        workflow,
        params,
        bloomLevels,
        standard: std as unknown as Record<string, unknown>,
        classContext: profile ? buildClassPedagogicalContext(profile) : undefined,
        news: params.suKienThoiSu,
        linked: linkedStd as unknown as Record<string, unknown> | undefined,
      });
      const llm = await callLiveLlm(system, user, undefined, { maxTokens: 6000, timeoutMs: 90_000 });
      if (llm.ok && llm.content) {
        markdown = cleanPedagogicalText(llm.content);
        sections = markdownToSections(markdown);
      } else {
        warnings.push('AI không phản hồi, hiển thị bản chuẩn gốc');
        const pkgs = (std.packages ?? []) as unknown[];
        markdown = pkgs
          .map((p) => (typeof p === 'string' ? p : JSON.stringify(p, null, 2)))
          .join('\n\n')
          .trim();
        if (!markdown) return fail(502, 'AI không phản hồi');
        sections = [{ heading: std.title ?? 'Bản chuẩn', body: markdown }];
      }
    }

    const reflection = await reflect(markdown);

    try {
      await recordGeneration({
        orgId,
        lessonKey: `${params.baiDayId}`,
        teacher: teacherName,
        workflow,
        runId,
        regenerationOf: params.regenerationOf,
        requiresApproval,
        text: markdown,
      });
    } catch (e) {
      console.error('recordGeneration failed', e);
    }

    const result: WorkflowResult = {
      runId,
      workflow,
      bloomLevels,
      standard: { status: std.status, atomId: std.atomId, title: std.title, reviewedBy },
      warnings,
      content: { sections, markdown },
      reflection,
      ...(guardrail ? { guardrail } : {}),
      requiresApproval,
    };
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error('workflows/run failed', e);
    return fail(502, 'Không xử lý được yêu cầu, vui lòng thử lại.');
  }
}
