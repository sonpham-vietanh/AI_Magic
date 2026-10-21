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
import { routeWorkflow, resourceKindsFor } from '@/lib/workflows/router';
import { generateArtifact, generateAllResources, artifactToText, checkArtifact, type GenContext } from '@/lib/resources';
import { ARTIFACT_LABELS, type Artifact, type ArtifactKind, type ResourceKind, type StructureCheck } from '@/lib/resources/types';
import { approvedArtifacts, canUseStandardAsIs, baseForUpgrade } from '@/lib/workflows/khoFirst';
import { ensureKhbdStructure } from '@/lib/workflows/khbdFix';
import { checkKhbdStructure, checkExamStructure, checkQuizStructure } from '@/lib/workflows/validators';
import { reflect } from '@/lib/workflows/reflection';
import { buildPrompts, markdownToSections, groundingBlock } from '@/lib/workflows/prompts';
import {
  WorkflowParamsSchema,
  bloomLevelsFor,
  PHONG_CACH,
  type Reflection,
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
    let artifacts: Artifact[] = [];
    let structure: StructureCheck[] = [];
    let fromKho: ArtifactKind[] = [];
    let allFromKho = false;

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
      structure = checkQuizStructure(q.questionIds ?? [], bloomLevels);
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
      structure = checkExamStructure(d.matrix, d.markdown);
      requiresApproval = true;
    } else {
      const profile = getClassById(params.classId);
      const classContext = profile ? buildClassPedagogicalContext(profile) : undefined;
      if (workflow === 'khbd') {
        const { system, user } = buildPrompts({
          workflow,
          params,
          bloomLevels,
          standard: std as unknown as Record<string, unknown>,
          classContext,
          news: params.suKienThoiSu,
          linked: linkedStd as unknown as Record<string, unknown> | undefined,
        });
        const llm = await callLiveLlm(system, user, undefined, { maxTokens: 6000, timeoutMs: 90_000 });
        if (llm.ok && llm.content) {
          markdown = cleanPedagogicalText(llm.content);
          const fix = await ensureKhbdStructure(markdown, bloomLevels);
          markdown = fix.markdown;
          structure = fix.structure;
          if (fix.attempted) {
            const left = structure.filter((c) => !c.ok);
            warnings.push(
              fix.fixed
                ? left.length
                  ? `Kế hoạch bài dạy thiếu thành phần nên hệ thống đã tự sửa 1 lần, nhưng còn ${left.length} mục chưa đạt: ${left.map((c) => c.label).join('; ')}`
                  : 'Kế hoạch bài dạy ban đầu thiếu thành phần bắt buộc; hệ thống đã tự bổ sung 1 lần và hiện đủ cấu trúc.'
                : `Kế hoạch bài dạy còn thiếu ${left.length} mục bắt buộc và lần tự sửa chưa cải thiện được: ${left.map((c) => c.label).join('; ')}`,
            );
          }
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
          structure = checkKhbdStructure(markdown, bloomLevels);
        }
      } else {
        // slide / worksheet / tai_nguyen_6_dang: sản phẩm có cấu trúc, Kho-trước.
        const kinds: ArtifactKind[] =
          workflow === 'slide'
            ? ['slides']
            : workflow === 'worksheet'
              ? ['worksheet']
              : resourceKindsFor(params.formatDauRa, params.dangTaiNguyen);
        const base = approvedArtifacts(std, kinds);
        const asIs = canUseStandardAsIs(params, Boolean(linkedStd));
        const direct = asIs ? kinds.filter((k) => base.has(k)) : [];
        const toMake = kinds.filter((k) => !direct.includes(k));
        const got = new Map<ArtifactKind, Artifact>();
        for (const k of direct) got.set(k, base.get(k)!);
        if (direct.length) {
          fromKho = direct;
          warnings.push(
            `Lấy trực tiếp từ bản chuẩn đã duyệt trong Kho (không gọi AI): ${direct.map((k) => ARTIFACT_LABELS[k]).join(', ')}`,
          );
        }

        const errors: { kind: ArtifactKind; error: string }[] = [];
        if (toMake.length) {
          const upgrade = baseForUpgrade(base);
          const extra = [
            upgrade,
            linkedStd
              ? `<bai_lien_ket>\n${groundingBlock(linkedStd as unknown as Record<string, unknown>, 7000)}\n</bai_lien_ket>\nBài thứ hai cần TÍCH HỢP LIÊN MÔN với bài chính; kiến thức bài liên kết chỉ lấy từ khối này.`
              : '',
            params.suKienThoiSu
              ? `Sự kiện thời sự đã qua kiểm tra (dữ liệu): ${params.suKienThoiSu.tieuDe} (${params.suKienThoiSu.url}, đăng ${params.suKienThoiSu.ngayDang}). ${(params.suKienThoiSu.noiDung ?? '').slice(0, 2000)}`
              : '',
          ]
            .filter(Boolean)
            .join('\n\n');
          const ctx: GenContext = {
            title: std.title ?? params.baiDayId,
            grade: std.grade,
            subject: std.subject,
            language: params.ngonNgu,
            style: PHONG_CACH.find((p) => p.id === params.phongCach)?.label ?? params.phongCach,
            bloomLevels,
            grounding: groundingBlock(std as unknown as Record<string, unknown>),
            ...(extra ? { extra } : {}),
            ...(classContext ? { classContext } : {}),
          };
          if (workflow === 'tai_nguyen_6_dang') {
            const r = await generateAllResources(ctx, toMake as ResourceKind[]);
            for (const a of r.artifacts) got.set(a.kind, a);
            errors.push(...r.errors);
          } else {
            const kind = toMake[0];
            const r = await generateArtifact(kind, ctx);
            if (r.ok) got.set(kind, r.value as Artifact);
            else errors.push({ kind, error: r.error });
          }
        }
        for (const e of errors) {
          warnings.push(`Không sinh được ${ARTIFACT_LABELS[e.kind]}: ${e.error}`);
        }
        artifacts = kinds.filter((k) => got.has(k)).map((k) => got.get(k)!);
        if (!artifacts.length) {
          return fail(
            502,
            `Không sinh được sản phẩm: ${errors.map((e) => `${ARTIFACT_LABELS[e.kind]} (${e.error})`).join('; ') || 'AI không phản hồi'}`,
          );
        }
        structure = artifacts.flatMap((a) =>
          checkArtifact(a).map((c) =>
            artifacts.length > 1 ? { ...c, id: `${a.kind}.${c.id}`, label: `${ARTIFACT_LABELS[a.kind]}: ${c.label}` } : c,
          ),
        );
        for (const e of errors) {
          structure.push({ id: `${e.kind}.sinh`, label: `${ARTIFACT_LABELS[e.kind]}: sinh được`, ok: false, note: e.error });
        }
        sections = artifacts.map((a) => ({ heading: ARTIFACT_LABELS[a.kind], body: artifactToText(a) }));
        markdown = sections.map((x) => `## ${x.heading}\n${x.body}`).join('\n\n');
        allFromKho = errors.length === 0 && toMake.length === 0;
      }
    }

    // Mọi sản phẩm lấy thẳng từ bản chuẩn đã duyệt thì không tự chấm lại (đã qua người duyệt).
    const reflection: Reflection = allFromKho
      ? { scores: [], average: 0, issues: [], skipped: true }
      : await reflect(markdown);

    try {
      await recordGeneration({
        orgId,
        lessonKey: `${params.baiDayId}`,
        teacher: teacherName,
        workflow,
        runId,
        regenerationOf: params.regenerationOf,
        requiresApproval,
        // Bản gốc để so sánh phải giống HỆT văn bản giao diện hiển thị/gửi lại (mục ghép từ tiêu đề + thân bài).
        text:
          sections.length > 0
            ? sections
                .map((x) => (x.heading ? `${x.heading}\n${x.body}` : x.body))
                .join('\n\n')
                .trim()
            : markdown,
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
      artifacts,
      structure,
      ...(fromKho.length ? { fromKho } : {}),
    };
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error('workflows/run failed', e);
    return fail(502, 'Không xử lý được yêu cầu, vui lòng thử lại.');
  }
}
