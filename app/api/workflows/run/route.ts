import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callLiveLlm, callLiveLlmStream } from '@/lib/engine/llmClient';
import { codeFromErrorText, llmErrorMessage, type LlmErrorCode } from '@/lib/engine/llmErrors';
import { newVariationNonce, withVariation, getVariation } from '@/lib/engine/variation';
import { getClassById, buildClassPedagogicalContext } from '@/lib/classes';
import { buildClassBrief } from '@/lib/classes/brief';
import { listClassNotes } from '@/lib/server/classNotes';
import { requireAccess } from '@/lib/server/guard';
import { effectiveActor } from '@/lib/server/identity';
import { rateLimit } from '@/lib/server/rateLimit';
import { withUsage } from '@/lib/usage/quota';
import { getOrgId } from '@/lib/server/org';
import { getStandardLesson } from '@/lib/kho';
import { generateQuiz, draftExam } from '@/lib/assessment';
import { checkNewsEvent } from '@/lib/guardrails/news';
import { recordGeneration } from '@/lib/signals';
import { routeWorkflow, resourceKindsFor } from '@/lib/workflows/router';
import { generateArtifact, generateAllResources, artifactToText, checkArtifact, type GenContext } from '@/lib/resources';
import { buildKhbdFromStandard, hasRichFactorySource } from '@/lib/resources/factoryTransform';
import { ARTIFACT_LABELS, type Artifact, type ArtifactKind, type ResourceKind, type StructureCheck } from '@/lib/resources/types';
import { approvedArtifacts, canUseStandardAsIs, baseForUpgrade, factoryFallbackArtifacts } from '@/lib/workflows/khoFirst';
import { ensureKhbdStructure } from '@/lib/workflows/khbdFix';
import { checkKhbdStructure, checkExamStructure, checkQuizStructure } from '@/lib/workflows/validators';
import { reflect } from '@/lib/workflows/reflection';
import { cleanKeepMath, mapStrings, toVnDates } from '@/lib/workflows/mathSafe';
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

export type RunStageId = 'kho' | 'guardrail' | 'route' | 'generate' | 'reflect';

/** Một phần của kết quả đã xong (Bộ tiết dạy, Trọn bộ tài nguyên): phát ngay để giao diện hiện từng thẻ. */
export interface PartEvent {
  /** 'khbd' | 'slides' | 'worksheet' | 'quiz' hoặc tên dạng tài nguyên. */
  key: string;
  label: string;
  ok: boolean;
  section?: Section;
  artifact?: Artifact;
  error?: string;
  code?: LlmErrorCode;
  draft?: boolean;
}

interface RunHooks {
  onStage?: (stage: RunStageId, message: string) => void;
  onDelta?: (delta: string) => void;
  onPart?: (part: PartEvent) => void;
  /** true (kênh SSE): trả kết quả ngay khi đủ dùng, bước AI tự soát chạy nền rồi gửi qua onReview. */
  deferReview?: boolean;
  /** Gọi khi kết quả đủ dùng đã sẵn sàng (chỉ khi deferReview). */
  onResult?: (result: WorkflowResult) => void;
  onReview?: (reflection: Reflection) => void;
  /** Lượt đã bị từ chối vì hết hạn mức thì không được phát kết quả sớm. */
  isExceeded?: () => boolean;
}

type RunOutcome =
  | { ok: true; result: WorkflowResult; delivered?: boolean }
  | { ok: false; status: number; error: string; extra?: Record<string, unknown> };

const SKIPPED: Reflection = { scores: [], average: 0, issues: [], skipped: true };

/** Câu lỗi AI thân thiện: lỗi kỹ thuật được đổi sang lời giải thích đúng nguyên nhân. */
function friendlyAiError(error: string, code?: LlmErrorCode): string {
  if (/^Chưa gọi được AI/.test(error)) return llmErrorMessage(code ?? codeFromErrorText(error));
  return error;
}

/** Ngữ cảnh lớp đưa vào lời nhắc: tóm tắt ngắn (sĩ số, mức độ, ghi chú giáo viên) đứng TRƯỚC hồ sơ chi tiết. */
async function loadClassContext(classId: string | undefined): Promise<{ pedagogical?: string; prompt?: string }> {
  if (!classId) return {};
  const profile = getClassById(classId);
  let notes: { note: string; teacherName?: string }[] = [];
  try {
    notes = await listClassNotes(profile?.id ?? classId);
  } catch (e) {
    console.error('[workflows] không đọc được ghi chú lớp:', e instanceof Error ? e.message : e);
  }
  const pedagogical = profile ? buildClassPedagogicalContext(profile) : undefined;
  const brief = buildClassBrief(profile, notes);
  const prompt = [brief, pedagogical].filter(Boolean).join('\n\n');
  return { pedagogical, prompt: prompt || undefined };
}

async function executeWorkflow(
  params: z.infer<typeof WorkflowParamsSchema>,
  orgId: string,
  hooks?: RunHooks,
): Promise<RunOutcome> {
  const warnings: string[] = [];
  let requiresApproval = false;
  const approvalReasons: string[] = [];
  const draftReasons: string[] = [];
  const markDraft = (why: string) => {
    if (!draftReasons.includes(why)) draftReasons.push(why);
  };
  let aiCode: LlmErrorCode | undefined;
  let examId: string | undefined;
  const teacherName = params.teacher?.name ?? 'Giáo viên';
  const nonce = getVariation();

  try {
    hooks?.onStage?.('kho', 'Đang tra bản chuẩn trong Kho học liệu…');
    const std = await getStandardLesson(orgId, params.baiDayId);
    if (std.status === 'khong_co') return { ok: false, status: 404, error: 'Không tìm thấy bài dạy trong Kho.' };
    const stdDraft = std.status === 'chua_duyet';
    if (stdDraft) {
      warnings.push(
        'Bản nháp, chưa duyệt: bản chuẩn của bài này trong Kho chưa qua người duyệt. Cô/thầy vẫn dùng và tải được, nhớ xem lại nội dung trước khi lên lớp.',
      );
      markDraft('Bản chuẩn của bài này trong Kho chưa qua người duyệt.');
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
            warnings.push('Bài liên kết chưa qua người duyệt: phần tích hợp là bản nháp, cô/thầy xem lại trước khi dùng.');
            markDraft('Bài liên kết chưa qua người duyệt.');
          }
        }
      }
    }

    let guardrail: { ok: boolean; reasons: string[] } | undefined;
    if (params.suKienThoiSu) {
      hooks?.onStage?.('guardrail', 'Đang kiểm tra an toàn sự kiện thời sự…');
      const g = checkNewsEvent(params.suKienThoiSu);
      guardrail = { ok: g.ok, reasons: g.reasons };
      if (!g.ok) {
        return {
          ok: false,
          status: 422,
          error: 'Sự kiện thời sự không đạt kiểm tra an toàn.',
          extra: { reasons: g.reasons },
        };
      }
      // Nội dung thời sự: BẮT BUỘC người duyệt trước khi dùng/tải.
      requiresApproval = true;
      approvalReasons.push('Tiết có gắn sự kiện thời sự.');
      warnings.push('Tiết có gắn thời sự → bắt buộc người duyệt');
      markDraft('Tiết có gắn sự kiện thời sự cần người duyệt.');
    }

    hooks?.onStage?.('route', 'Đang chọn quy trình soạn và khung tư duy Bloom…');
    const workflow = routeWorkflow(params.formatDauRa);
    const bloomLevels = bloomLevelsFor(params.bloomThapNhat);
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // Chỉ lần duyệt 'approve' của người duyệt Việt Anh mới tính; trạng thái 'approved' của Factory thì không.
    const reviewedBy = std.review?.decision === 'approve' ? std.review.reviewer : undefined;

    let sections: Section[] = [];
    let markdown = '';
    /** Văn bản đưa cho bước tự soát (với Bộ tiết dạy: chỉ giáo án). */
    let reviewText = '';
    let artifacts: Artifact[] = [];
    let structure: StructureCheck[] = [];
    let fromKho: ArtifactKind[] = [];
    let allFromKho = false;
    let parts: NonNullable<WorkflowResult['parts']> | undefined;

    const cls = workflow === 'quiz' || workflow === 'de_kiem_tra' ? {} : await loadClassContext(params.classId);
    const classContext = cls.pedagogical;
    const classPrompt = cls.prompt;
    const styleLabel = PHONG_CACH.find((p) => p.id === params.phongCach)?.label ?? params.phongCach;

    // ---- Các khối dựng sản phẩm, dùng chung cho từng workflow và cho Bộ tiết dạy ----

    type KhbdOut =
      | { ok: true; markdown: string; sections: Section[]; structure: StructureCheck[] }
      | { ok: false; status: number; error: string; extra?: Record<string, unknown> };

    const makeKhbd = async (prefix: string, stream: boolean): Promise<KhbdOut> => {
      const note = (w: string) => warnings.push(prefix + w);
      const { system, user } = buildPrompts({
        workflow: 'khbd',
        params,
        bloomLevels,
        standard: std as unknown as Record<string, unknown>,
        classContext: classPrompt,
        news: params.suKienThoiSu,
        linked: linkedStd as unknown as Record<string, unknown> | undefined,
      });
      const llm =
        stream && hooks?.onDelta
          ? await callLiveLlmStream(system, user, undefined, { maxTokens: 6000, timeoutMs: 90_000 }, hooks.onDelta)
          : await callLiveLlm(system, user, undefined, { maxTokens: 6000, timeoutMs: 90_000 });
      if (llm.ok && llm.content) {
        let md = cleanKeepMath(llm.content);
        const fix = await ensureKhbdStructure(md, bloomLevels);
        md = fix.markdown;
        if (fix.attempted) {
          const left = fix.structure.filter((c) => !c.ok);
          note(
            fix.fixed
              ? left.length
                ? `Kế hoạch bài dạy thiếu thành phần nên hệ thống đã tự sửa 1 lần, nhưng còn ${left.length} mục chưa đạt: ${left.map((c) => c.label).join('; ')}`
                : 'Kế hoạch bài dạy ban đầu thiếu thành phần bắt buộc; hệ thống đã tự bổ sung 1 lần và hiện đủ cấu trúc.'
              : `Kế hoạch bài dạy còn thiếu ${left.length} mục bắt buộc và lần tự sửa chưa cải thiện được: ${left.map((c) => c.label).join('; ')}`,
          );
        }
        return { ok: true, markdown: md, sections: markdownToSections(md), structure: fix.structure };
      }
      const code = llm.code ?? codeFromErrorText(llm.error);
      aiCode ??= code;
      note('AI không phản hồi, hiển thị bản chuẩn gốc');
      if (code === 'ai_auth' || code === 'ai_busy' || code === 'ai_timeout') note(llmErrorMessage(code));
      const pkgs = (std.packages ?? []) as unknown[];
      if (!pkgs.length && !hasRichFactorySource(std)) {
        return { ok: false, status: 502, error: llmErrorMessage(code), extra: { code } };
      }
      markDraft('AI chưa soạn được nên đây là bản dựng thẳng từ dữ liệu chuẩn của bài.');
      const md = buildKhbdFromStandard(std, bloomLevels, classContext);
      return { ok: true, markdown: md, sections: markdownToSections(md), structure: checkKhbdStructure(md, bloomLevels) };
    };

    type QuizOut = { sections: Section[]; markdown: string; structure: StructureCheck[] };
    const makeQuiz = async (): Promise<QuizOut> => {
      const q = await generateQuiz({
        orgId,
        atomId: params.baiDayId,
        bloomLevels,
        language: params.ngonNgu,
        // Phong cách chỉ dùng làm hạt giống chọn câu: thêm nonce để "Sinh lại" ra bộ câu khác.
        style: nonce ? `${params.phongCach}#${nonce}` : params.phongCach,
      });
      return { sections: q.sections, markdown: q.markdown, structure: checkQuizStructure(q.questionIds ?? [], bloomLevels) };
    };

    type ArtOut = {
      artifacts: Artifact[];
      errors: { kind: ArtifactKind; error: string; code?: LlmErrorCode }[];
      structure: StructureCheck[];
      fromKho: ArtifactKind[];
      allFromKho: boolean;
    };
    /** Slide / phiếu / 6 dạng tài nguyên: Kho-trước, AI chạy SONG SONG, từng dạng xong là phát ngay. */
    const makeArtifacts = async (
      kinds: ArtifactKind[],
      opts: { all6: boolean; emit?: (kind: ArtifactKind, a: Artifact, draft: boolean) => void },
    ): Promise<ArtOut> => {
      const base = approvedArtifacts(std, kinds);
      const asIs = canUseStandardAsIs(params, Boolean(linkedStd));
      const direct = asIs ? kinds.filter((k) => base.has(k)) : [];
      const toMake = kinds.filter((k) => !direct.includes(k));
      const got = new Map<ArtifactKind, Artifact>();
      const emitted = new Set<ArtifactKind>();
      const emitOnce = (k: ArtifactKind, a: Artifact, draft: boolean) => {
        if (emitted.has(k)) return;
        emitted.add(k);
        opts.emit?.(k, a, draft);
      };
      for (const k of direct) {
        got.set(k, base.get(k)!);
        emitOnce(k, base.get(k)!, stdDraft);
      }
      if (direct.length) {
        warnings.push(
          `Lấy trực tiếp từ bản chuẩn đã duyệt trong Kho (không gọi AI): ${direct.map((k) => ARTIFACT_LABELS[k]).join(', ')}`,
        );
      }

      const errors: { kind: ArtifactKind; error: string; code?: LlmErrorCode }[] = [];
      const upgrade = baseForUpgrade(base);
      // Dạng nào có bản chuẩn đã duyệt để nâng cấp thì không tính là "AI soạn từ dữ liệu cơ bản".
      const aiDraft = (k: ArtifactKind) => stdDraft || !base.has(k);
      if (toMake.length) {
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
          style: styleLabel,
          bloomLevels,
          grounding: groundingBlock(std as unknown as Record<string, unknown>),
          ...(extra ? { extra } : {}),
          ...(classPrompt ? { classContext: classPrompt } : {}),
        };
        if (opts.all6) {
          const r = await generateAllResources(ctx, toMake as ResourceKind[], {
            onArtifact: (a) => {
              got.set(a.kind, a);
              emitOnce(a.kind, a, aiDraft(a.kind));
            },
          });
          for (const a of r.artifacts) got.set(a.kind, a);
          errors.push(...r.errors);
        } else {
          await Promise.all(
            toMake.map(async (kind) => {
              try {
                const r = await generateArtifact(kind, ctx);
                if (r.ok) {
                  got.set(kind, r.value as Artifact);
                  emitOnce(kind, r.value as Artifact, aiDraft(kind));
                } else errors.push({ kind, error: r.error, code: (r as { code?: LlmErrorCode }).code });
              } catch (e) {
                errors.push({ kind, error: e instanceof Error ? e.message : 'Lỗi không xác định.' });
              }
            }),
          );
        }

        // Nếu AI lỗi ở một số dạng nhưng bài có sẵn gói tài nguyên gốc Factory, tự động chế biến từ Factory (0 token)
        if (errors.length && hasRichFactorySource(std)) {
          const fb = factoryFallbackArtifacts(
            std,
            errors.map((e) => e.kind),
          );
          if (fb.size > 0) {
            const rescued: ArtifactKind[] = [];
            for (let idx = errors.length - 1; idx >= 0; idx--) {
              const k = errors[idx].kind;
              const a = fb.get(k);
              if (a) {
                got.set(k, a);
                rescued.unshift(k);
                errors.splice(idx, 1);
                emitOnce(k, a, true);
              }
            }
            if (rescued.length) {
              markDraft('Một số dạng được chế biến từ gói tài nguyên gốc, chưa qua người duyệt.');
              warnings.push(
                `Chế biến trực tiếp từ gói tài nguyên gốc Factory (không tốn token AI): ${rescued.map((k) => ARTIFACT_LABELS[k]).join(', ')}`,
              );
            }
          }
        }
      }
      for (const k of toMake) {
        if (got.has(k) && aiDraft(k)) {
          markDraft(`${ARTIFACT_LABELS[k]} do AI soạn từ dữ liệu cơ bản của bài, chưa có bản chuẩn đã duyệt.`);
        }
      }
      for (const e of errors) {
        const code = e.code ?? codeFromErrorText(e.error);
        aiCode ??= /^Chưa gọi được AI/.test(e.error) ? code : aiCode;
        warnings.push(`Không sinh được ${ARTIFACT_LABELS[e.kind]}: ${friendlyAiError(e.error, e.code)}`);
      }
      const list = kinds.filter((k) => got.has(k)).map((k) => mapStrings(got.get(k)!));
      const st = list.flatMap((a) =>
        checkArtifact(a).map((c) =>
          kinds.length > 1 || list.length > 1 ? { ...c, id: `${a.kind}.${c.id}`, label: `${ARTIFACT_LABELS[a.kind]}: ${c.label}` } : c,
        ),
      );
      for (const e of errors) {
        st.push({ id: `${e.kind}.sinh`, label: `${ARTIFACT_LABELS[e.kind]}: sinh được`, ok: false, note: e.error });
      }
      return {
        artifacts: list,
        errors,
        structure: st,
        fromKho: direct,
        allFromKho: errors.length === 0 && toMake.length === 0,
      };
    };

    // ---- Chạy theo quy trình ----

    hooks?.onStage?.('generate', 'Đang soạn nội dung theo các bậc tư duy…');
    if (workflow === 'quiz') {
      // Quiz từ ngân hàng câu hỏi: kiểm cấu trúc xác định, KHÔNG gọi AI tự soát.
      const q = await makeQuiz();
      sections = q.sections;
      markdown = q.markdown;
      structure = q.structure;
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
      // Đề kiểm tra: BẮT BUỘC người duyệt trước khi dùng/tải.
      requiresApproval = true;
      examId = d.examId;
      approvalReasons.push('Đề kiểm tra phải được người duyệt phê duyệt trước khi dùng.');
      markDraft('Đề kiểm tra đang ở trạng thái nháp, cần người duyệt.');
      warnings.push(`Đề đã lưu với mã ${d.examId}, đang ở trạng thái nháp: gửi duyệt và xem đề tại /kiem-tra. Chưa được dùng hay tải về trước khi được duyệt.`);
    } else if (workflow === 'khbd') {
      const k = await makeKhbd('', true);
      if (!k.ok) return k;
      markdown = k.markdown;
      sections = k.sections;
      structure = k.structure;
    } else if (workflow === 'bo_tiet_day') {
      // Bộ tiết dạy: giáo án + slide + phiếu học tập + quiz chạy SONG SONG, phần nào xong hiện phần đó.
      const labels = {
        khbd: 'Kế hoạch bài dạy',
        slides: ARTIFACT_LABELS.slides,
        worksheet: ARTIFACT_LABELS.worksheet,
        quiz: 'Quiz củng cố trong tiết',
      } as const;
      const done: Record<string, { section?: Section; artifact?: Artifact; structure: StructureCheck[]; error?: string; code?: LlmErrorCode; markdown?: string }> = {};
      const emitPart = (p: PartEvent) => {
        try {
          hooks?.onPart?.(p);
        } catch (e) {
          console.error('[workflows] onPart lỗi', e);
        }
      };
      const khbdFail: { v?: Extract<KhbdOut, { ok: false }> } = {};
      await Promise.all([
        (async () => {
          try {
            const k = await makeKhbd('Kế hoạch bài dạy: ', true);
            if (!k.ok) {
              khbdFail.v = k;
              done.khbd = { structure: [], error: k.error, code: k.extra?.code as LlmErrorCode | undefined };
              emitPart({ key: 'khbd', label: labels.khbd, ok: false, error: k.error, code: k.extra?.code as LlmErrorCode | undefined });
              return;
            }
            const sec = { heading: labels.khbd, body: toVnDates(k.markdown) };
            done.khbd = { section: sec, structure: k.structure, markdown: k.markdown };
            emitPart({ key: 'khbd', label: labels.khbd, ok: true, section: sec, draft: stdDraft || draftReasons.length > 0 });
          } catch (e) {
            console.error('bo_tiet_day khbd', e);
            done.khbd = { structure: [], error: 'Chưa soạn được giáo án.' };
            emitPart({ key: 'khbd', label: labels.khbd, ok: false, error: 'Chưa soạn được giáo án.' });
          }
        })(),
        ...(['slides', 'worksheet'] as const).map(async (kind) => {
          try {
            const r = await makeArtifacts([kind], {
              all6: false,
              emit: (_k, a, d) => {
                emitPart({
                  key: kind,
                  label: labels[kind],
                  ok: true,
                  artifact: mapStrings(a),
                  section: { heading: labels[kind], body: toVnDates(artifactToText(a)) },
                  draft: d,
                });
              },
            });
            const a = r.artifacts[0];
            if (a) {
              done[kind] = { artifact: a, section: { heading: labels[kind], body: toVnDates(artifactToText(a)) }, structure: r.structure };
              if (r.fromKho.length) fromKho = [...fromKho, ...r.fromKho];
            } else {
              const e = r.errors[0];
              const msg = friendlyAiError(e?.error ?? 'Chưa soạn được.', e?.code);
              done[kind] = { structure: r.structure, error: msg, code: e?.code };
              emitPart({ key: kind, label: labels[kind], ok: false, error: msg, code: e?.code });
            }
          } catch (e) {
            console.error(`bo_tiet_day ${kind}`, e);
            done[kind] = { structure: [], error: 'Chưa soạn được.' };
            emitPart({ key: kind, label: labels[kind], ok: false, error: 'Chưa soạn được.' });
          }
        }),
        (async () => {
          try {
            const q = await makeQuiz();
            const sec = { heading: labels.quiz, body: toVnDates(q.sections.map((s) => `${s.heading}\n${s.body}`).join('\n\n')) };
            done.quiz = { section: sec, structure: q.structure };
            emitPart({ key: 'quiz', label: labels.quiz, ok: true, section: sec, draft: stdDraft });
          } catch (e) {
            console.error('bo_tiet_day quiz', e);
            done.quiz = { structure: [], error: 'Chưa dựng được quiz.' };
            emitPart({ key: 'quiz', label: labels.quiz, ok: false, error: 'Chưa dựng được quiz.' });
          }
        })(),
      ]);

      const order = ['khbd', 'slides', 'worksheet', 'quiz'] as const;
      parts = order.map((k) => ({ key: k, label: labels[k], ok: !done[k]?.error && Boolean(done[k]?.section), ...(done[k]?.error ? { error: done[k]?.error } : {}) }));
      if (!parts.some((p) => p.ok)) {
        const code = (khbdFail.v?.extra?.code as LlmErrorCode | undefined) ?? aiCode ?? 'ai_unavailable';
        return { ok: false, status: 502, error: llmErrorMessage(code), extra: { code } };
      }
      for (const p of parts) {
        if (!p.ok) warnings.push(`Chưa có phần "${p.label}": ${p.error ?? 'chưa soạn được'}`);
      }
      sections = order.flatMap((k) => (done[k]?.section ? [done[k]!.section!] : []));
      markdown = sections.map((x) => `## ${x.heading}\n${x.body}`).join('\n\n');
      artifacts = (['slides', 'worksheet'] as const).flatMap((k) => (done[k]?.artifact ? [done[k]!.artifact!] : []));
      structure = order.flatMap((k) =>
        (done[k]?.structure ?? []).map((c) => (k === 'khbd' || k === 'quiz' ? { ...c, id: `${k}.${c.id}`, label: `${labels[k]}: ${c.label}` } : c)),
      );
      for (const p of parts) {
        if (!p.ok) structure.push({ id: `${p.key}.sinh`, label: `${p.label}: sinh được`, ok: false, note: p.error });
      }
      reviewText = done.khbd?.markdown ?? markdown;
    } else {
      // slide / worksheet / tai_nguyen_6_dang: sản phẩm có cấu trúc, Kho-trước.
      const kinds: ArtifactKind[] =
        workflow === 'slide'
          ? ['slides']
          : workflow === 'worksheet'
            ? ['worksheet']
            : resourceKindsFor(params.formatDauRa, params.dangTaiNguyen);
      const r = await makeArtifacts(kinds, {
        all6: workflow === 'tai_nguyen_6_dang',
        emit: (kind, a, d) =>
          hooks?.onPart?.({
            key: kind,
            label: ARTIFACT_LABELS[kind],
            ok: true,
            artifact: mapStrings(a),
            section: { heading: ARTIFACT_LABELS[kind], body: toVnDates(artifactToText(a)) },
            draft: d,
          }),
      });
      if (!r.artifacts.length) {
        const code = r.errors.map((e) => e.code ?? codeFromErrorText(e.error)).find((c) => c !== 'ai_unavailable') ?? 'ai_unavailable';
        const isAi = r.errors.some((e) => /^Chưa gọi được AI/.test(e.error));
        return {
          ok: false,
          status: 502,
          error: isAi
            ? llmErrorMessage(code)
            : `Không sinh được sản phẩm: ${r.errors.map((e) => `${ARTIFACT_LABELS[e.kind]} (${e.error})`).join('; ') || 'AI không phản hồi'}`,
          extra: { code },
        };
      }
      artifacts = r.artifacts;
      fromKho = r.fromKho;
      structure = r.structure;
      allFromKho = r.allFromKho;
      sections = artifacts.map((a) => ({ heading: ARTIFACT_LABELS[a.kind], body: artifactToText(a) }));
      markdown = sections.map((x) => `## ${x.heading}\n${x.body}`).join('\n\n');
    }

    // Ngày trong văn bản hiển thị luôn dạng dd/mm/yyyy.
    sections = sections.map((s) => ({ heading: toVnDates(s.heading), body: toVnDates(s.body) }));
    markdown = toVnDates(markdown);
    reviewText = reviewText ? toVnDates(reviewText) : markdown;

    // Tự soát bằng AI: quiz/đề từ ngân hàng không cần (kiểm cấu trúc xác định là đủ); sản phẩm lấy thẳng từ bản đã duyệt cũng không.
    const needsReview = !(workflow === 'quiz' || workflow === 'de_kiem_tra' || allFromKho);

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
        // Riêng đề kiểm tra: KHÔNG ghi toàn văn đề (bảo mật đến ngày thi), chỉ ghi mã đề.
        text:
          workflow === 'de_kiem_tra'
            ? `[Đề kiểm tra ${examId ?? ''}: nội dung được bảo mật, xem tại /kiem-tra]`
            : sections.length > 0
            ? sections
                .map((x) => (x.heading ? `${x.heading}\n${x.body}` : x.body))
                .join('\n\n')
                .trim()
            : markdown,
      });
    } catch (e) {
      console.error('recordGeneration failed', e);
    }

    const defer = Boolean(hooks?.deferReview && needsReview && hooks.onResult && !hooks.isExceeded?.());
    const build = (reflection: Reflection): WorkflowResult => ({
      runId,
      workflow,
      bloomLevels,
      standard: { status: std.status, atomId: std.atomId, title: std.title, reviewedBy },
      warnings,
      content: { sections, markdown },
      reflection,
      ...(guardrail ? { guardrail } : {}),
      draft: draftReasons.length > 0,
      ...(draftReasons.length ? { draftReasons } : {}),
      requiresApproval,
      ...(requiresApproval
        ? {
            approvalReasons,
            // Chỉ đề kiểm tra và nội dung thời sự: giao diện KHÔNG được cho chấp nhận/tải về khi cờ này bật.
            blockAcceptDownload: true,
            approvalUrl: examId ? '/kiem-tra' : '/duyet',
          }
        : {}),
      ...(examId ? { examId } : {}),
      artifacts,
      structure,
      ...(fromKho.length ? { fromKho } : {}),
      ...(parts ? { parts } : {}),
      ...(aiCode ? { aiCode } : {}),
    });

    if (!needsReview) return { ok: true, result: build({ ...SKIPPED }) };

    if (defer) {
      // Trả bản đủ dùng NGAY; nhận xét tự soát đến sau qua sự kiện 'review'.
      const pending = build({ ...SKIPPED, pending: true });
      hooks!.onResult!(pending);
      hooks!.onStage?.('reflect', 'Đang tự soi chất lượng theo 6 tiêu chí sư phạm…');
      const refl = await reflect(reviewText);
      hooks!.onReview?.(refl);
      return { ok: true, result: build(refl), delivered: true };
    }

    hooks?.onStage?.('reflect', 'Đang tự soi chất lượng theo 6 tiêu chí sư phạm…');
    return { ok: true, result: build(await reflect(reviewText)) };
  } catch (e) {
    console.error('workflows/run failed', e);
    return { ok: false, status: 502, error: 'Không xử lý được yêu cầu, vui lòng thử lại.' };
  }
}

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
  // Khi bật đăng nhập Google, tên người soạn lấy từ phiên đã ký, không tin tên client gửi lên.
  const signedActor = effectiveActor(request, '');
  const params = signedActor
    ? { ...parsed.data.params, teacher: { ...(parsed.data.params.teacher ?? {}), name: signedActor } }
    : parsed.data.params;
  const orgId = getOrgId(request);
  const wantsStream = (request.headers.get('accept') ?? '').includes('text/event-stream');
  // "Sinh lại": mỗi lượt có nonce riêng nên không bao giờ trả lại đúng bản cũ từ bộ nhớ đệm.
  const nonce = params.regenerationOf ? newVariationNonce() : undefined;

  // Đo token/chi phí theo người dùng + hạn mức ngày; chỉ chặn khi thật sự cần gọi AI (lượt lấy từ Kho không tính).
  const runMetered = (hooks?: RunHooks): Promise<RunOutcome> =>
    withUsage(
      request,
      { workflow: `wf:${routeWorkflow(params.formatDauRa)}`, declaredUser: params.teacher?.email || params.teacher?.name },
      async (h) => {
        const o = await withVariation(nonce, () =>
          executeWorkflow(params, orgId, hooks ? { ...hooks, isExceeded: () => Boolean(h.exceeded()) } : undefined),
        );
        const ex = h.exceeded();
        return ex
          ? ({ ok: false, status: 429, error: ex.message, extra: { code: 'ai_quota', quota: { used: ex.used, limit: ex.limit } } } as RunOutcome)
          : o;
      },
    );

  if (!wantsStream) {
    const out = await runMetered();
    if (!out.ok) return fail(out.status, out.error, out.extra);
    return NextResponse.json({ ok: true, result: out.result });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // client đã đóng kết nối
        }
      };

      const out = await runMetered({
        deferReview: true,
        onStage(stage, message) {
          send({ type: 'stage', stage, message });
        },
        onDelta(delta) {
          if (delta) send({ type: 'delta', delta });
        },
        onPart(part) {
          send({ type: 'part', ...part });
        },
        onResult(result) {
          send({ type: 'done', ok: true, result });
        },
        onReview(reflection) {
          send({ type: 'review', reflection });
        },
      });

      if (out.ok) {
        // Nếu kết quả chưa được phát sớm (không có bước soát nền) thì phát ở đây.
        if (!out.delivered) send({ type: 'done', ok: true, result: out.result });
      } else {
        send({
          type: 'error',
          ok: false,
          status: out.status,
          error: out.error,
          ...(out.extra || {}),
        });
      }
      try {
        controller.close();
      } catch {
        // đã đóng
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
