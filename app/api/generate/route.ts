import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccess } from "@/lib/server/guard";
import { rateLimit } from "@/lib/server/rateLimit";
import { getToolById } from "@/lib/catalog";
import { getClassById } from "@/lib/classes";
import { withLlmDeltaSink } from "@/lib/engine/llmClient";
import { generatePedagogicalResource } from "@/lib/engine/smartGenerator";
import {
  buildAtomContextBlock,
  resolveLessonTopic,
} from "@/lib/engine/promptBuilder";
import { getConnectedNodes, getNodeById } from "@/lib/knowledge-graph";
import { recordUsageEvent, saveGeneratedResource } from "@/lib/server/store";
import {
  fetchSupabaseAtomDetail,
  mapSupabaseSubjectToCode,
  saveResourceToSupabase,
} from "@/lib/supabase";
import type {
  GenerationRequest,
  GradeLevel,
  KnowledgeNode,
  SubjectCode,
} from "@/lib/types";

const idRegex = /^[A-Za-z0-9_.:-]{1,64}$/;

const bodySchema = z.object({
  toolId: z.string().regex(idRegex).optional(),
  grade: z.string().max(10).optional(),
  subject: z
    .string()
    .regex(/^[a-z_]{1,32}$/)
    .optional(),
  classId: z.string().regex(idRegex).optional(),
  atomId: z.string().regex(idRegex).optional(),
  knowledgeNodeId: z.string().regex(idRegex).optional(),
  linkedNodeIds: z.array(z.string().regex(idRegex)).max(10).optional(),
  inputs: z
    .record(
      z.string().max(100),
      z.union([z.string().max(10000), z.number(), z.boolean()]),
    )
    .refine((v) => JSON.stringify(v).length <= 20000, "inputs quá lớn")
    .optional(),
  postAction: z
    .enum([
      "rut_ngan",
      "tang_do_kho",
      "giam_do_kho",
      "tao_rubric",
      "tao_phieu_hoc_tap",
      "song_ngu_anh_viet",
      "them_hoat_dong_vui_ve",
    ])
    .optional(),
  previousContent: z.string().max(60000).optional(),
  preferredModel: z.string().max(80).optional(),
  teacherEmail: z.string().email().max(200).optional(),
  teacherName: z.string().max(100).optional(),
  autoSave: z.boolean().optional(),
  stream: z.boolean().optional(),
});

type ParsedBody = z.infer<typeof bodySchema>;
type GenerateResult = { status: number; payload: Record<string, unknown> };

async function executeGenerate(
  parsedData: ParsedBody,
): Promise<GenerateResult> {
  const parsed = { data: parsedData };
  const body = parsed.data as Partial<GenerationRequest> & {
    autoSave?: boolean;
    atomId?: string;
    preferredModel?: string;
  };

  const tool = getToolById(body.toolId || "khbd-5512");
  if (!tool) {
    return {
      status: 404,
      payload: { ok: false, error: "Không tìm thấy công cụ sư phạm yêu cầu." },
    };
  }

  const grade = (body.grade || "7") as GradeLevel;
  const subject = (body.subject || "toan") as SubjectCode;
  const classProfile = getClassById(body.classId);

  const requestedNodeId = body.atomId || body.knowledgeNodeId;
  let primaryNode = getNodeById(requestedNodeId);

  // Check if requestedNodeId is a real Supabase Atom (e.g. KC-...)
  const supabaseDetail =
    requestedNodeId && (requestedNodeId.startsWith("KC-") || !primaryNode)
      ? await fetchSupabaseAtomDetail(requestedNodeId)
      : {
          atom: null,
          packages: [],
          factoryAssets: [],
          edges: [],
          questions: [],
          socratic: [],
          tainguyen: [],
        };

  if (!primaryNode && supabaseDetail.atom) {
    const a = supabaseDetail.atom;
    const pkg = supabaseDetail.packages?.[0];
    const pkgHookParts = [
      pkg?.fields.explanation
        ? `Giải thích cốt lõi từ Factory: ${pkg.fields.explanation}`
        : "",
      pkg?.fields.example ? `Ví dụ chuẩn Factory: ${pkg.fields.example}` : "",
      pkg?.fields.counterExample
        ? `Phản ví dụ từ Factory: ${pkg.fields.counterExample}`
        : "",
      pkg?.fields.strategy
        ? `Chiến lược dẫn dắt Socratic từ Factory: ${pkg.fields.strategy}`
        : "",
      a.quan_niem_sai || pkg?.fields.commonMistake
        ? `Lưu ý khắc phục quan niệm sai phổ biến của học sinh: ${a.quan_niem_sai || pkg?.fields.commonMistake}`
        : "",
    ].filter(Boolean);

    primaryNode = {
      id: a.id,
      grade: String(a.grade) as GradeLevel,
      subject: mapSupabaseSubjectToCode(a.subject),
      subjectName: a.subject,
      semester: 1,
      weekRange: [1, 2],
      title: `[${a.code}] ${a.title}`,
      moetRequiredOutcomes: [
        ...(a.yeu_cau ? [a.yeu_cau] : []),
        ...supabaseDetail.packages
          .map((p) =>
            p.fields.objective
              ? `Mức L${p.level} (${p.bloom}): ${p.fields.objective}`
              : "",
          )
          .filter(Boolean),
        ...(!a.yeu_cau && supabaseDetail.packages.length === 0
          ? [`Nắm vững và vận dụng được: ${a.title} (${a.chapter})`]
          : []),
      ],
      coreCompetencies: a.nang_luc
        ? [a.nang_luc]
        : ["Năng lực tự chủ và tự học", "Năng lực giải quyết vấn đề"],
      coreQualities: ["Chăm chỉ", "Trách nhiệm"],
      vietAnhPracticalHook:
        pkgHookParts.length > 0
          ? pkgHookParts.join(" | ")
          : `Bài học thuộc ${a.chapter} — ${a.lesson} (Mức độ tư duy: ${a.bloom}, DOK ${a.dok}).`,
      keywords: [a.code, a.chapter, a.lesson].filter(Boolean),
    } satisfies KnowledgeNode;
  }

  const connected = primaryNode ? getConnectedNodes(primaryNode.id) : [];
  const requestedLinkedIds = Array.isArray(body.linkedNodeIds)
    ? body.linkedNodeIds
    : [];

  const supabaseLinkedNodes = (supabaseDetail.edges || [])
    .filter((e) => e.linkedAtom)
    .slice(0, 4)
    .map((e) => {
      const la = e.linkedAtom!;
      const node: KnowledgeNode = {
        id: la.id,
        grade: String(la.grade) as GradeLevel,
        subject: mapSupabaseSubjectToCode(la.subject),
        subjectName: la.subject,
        semester: 1,
        weekRange: [1, 2],
        title: `[${la.code}] ${la.title}`,
        moetRequiredOutcomes: la.yeu_cau ? [la.yeu_cau] : [la.title],
        coreCompetencies: la.nang_luc
          ? [la.nang_luc]
          : ["Năng lực giải quyết vấn đề"],
        coreQualities: ["Chăm chỉ"],
        vietAnhPracticalHook:
          e.remediation_hint ||
          e.quan_niem_sai ||
          `${la.chapter} · ${la.lesson}`,
        keywords: [la.code, la.subject],
      };
      return {
        node,
        edge: {
          id: e.id,
          sourceNodeId: e.from_id,
          targetNodeId: e.to_id,
          relation:
            e.relation === "prerequisite"
              ? ("tien_quyet" as const)
              : ("ung_dung_thuc_te" as const),
          integrationIdea:
            e.remediation_hint ||
            e.quan_niem_sai ||
            `Liên kết kiến thức (${e.relation}) giữa ${supabaseDetail.atom?.code || ""} và ${la.code} (${la.subject}).`,
          suggestedSharedActivity: e.cross_subject
            ? `Hoạt động tích hợp liên môn (${e.cross_subject}): Kết nối trực tiếp với bài [${la.code}] ${la.title}.`
            : `Ôn tập kết nối với bài [${la.code}] ${la.title} (${la.subject} Khối ${la.grade}).`,
        },
      };
    });

  const linkedNodes =
    supabaseLinkedNodes.length > 0
      ? requestedLinkedIds.length > 0
        ? supabaseLinkedNodes.filter((l) =>
            requestedLinkedIds.includes(l.node.id),
          )
        : supabaseLinkedNodes.slice(0, 3)
      : requestedLinkedIds.length > 0
        ? requestedLinkedIds
            .map((id) => {
              const found = connected.find((c) => c.node.id === id);
              if (found) return { node: found.node, edge: found.edge };
              const rawNode = getNodeById(id);
              return rawNode ? { node: rawNode } : null;
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
        : connected.slice(0, 2).map((c) => ({ node: c.node, edge: c.edge }));

  // Ưu tiên chủ đề: khi đã chọn atom/node, tên atom là chủ đề bài học; topic mặc định
  // của form (= sampleInput.topic) không được đè lên atom. Topic người dùng gõ khác
  // mặc định được giữ như ghi chú trọng tâm bổ sung.
  const baseInputs = (body.inputs || tool.sampleInput) as Record<
    string,
    string | number | boolean
  >;
  const resolvedInputs = { ...baseInputs };
  if (primaryNode) {
    const { topic, extraFocus } = resolveLessonTopic({
      inputTopic: baseInputs.topic,
      defaultTopic: tool.sampleInput.topic,
      atomTitle: primaryNode.title,
    });
    resolvedInputs.topic = topic;
    if (extraFocus) resolvedInputs.trong_tam_bo_sung = extraFocus;
  }

  // Dữ liệu thật Supabase đưa thẳng vào prompt (không chỉ phụ lục sau khi sinh).
  const atomContext =
    supabaseDetail.atom && !body.postAction
      ? buildAtomContextBlock(supabaseDetail) || undefined
      : undefined;

  const genRequest: GenerationRequest = {
    toolId: tool.id,
    teacherEmail:
      body.teacherEmail ||
      classProfile?.homeroomTeacher.email ||
      "son.nguyen@truongvietanh.com",
    teacherName:
      body.teacherName || classProfile?.homeroomTeacher.name || "Nguyễn Sơn",
    grade,
    subject,
    classId: classProfile?.id,
    knowledgeNodeId: primaryNode?.id || requestedNodeId,
    linkedNodeIds: linkedNodes.map((l) => l.node.id),
    inputs: resolvedInputs,
    postAction: body.postAction,
    previousContent: body.previousContent,
  };

  const resource = await generatePedagogicalResource({
    tool,
    request: genRequest,
    classProfile,
    primaryNode,
    linkedNodes,
    preferredModel: body.preferredModel,
    atomContext,
  });

  // Ghi nhận việc tích hợp dữ liệu thật Supabase vào checklist.
  if (
    supabaseDetail.atom &&
    (supabaseDetail.questions.length > 0 ||
      supabaseDetail.socratic.length > 0) &&
    !body.postAction
  ) {
    const a = supabaseDetail.atom;
    // Dữ liệu đã được đưa vào prompt (atomContext) nên không nối phụ lục nữa để tránh trùng lặp.
    resource.moetComplianceChecklist.push({
      criterion: `Tích hợp dữ liệu thực Supabase (${a.code})`,
      passed: true,
      note: `${supabaseDetail.questions.length} câu hỏi & ${supabaseDetail.socratic.length} kịch bản Socratic`,
    });
  }

  let saved: { local: boolean; supabase: boolean } | undefined;
  let warning: string | undefined;
  if (body.autoSave !== false) {
    const [localRes, sbRes] = await Promise.allSettled([
      saveGeneratedResource(resource),
      saveResourceToSupabase(resource),
    ]);
    if (localRes.status === "rejected") {
      console.error("[generate] local save failed:", localRes.reason);
    }
    if (sbRes.status === "rejected") {
      console.error("[generate] supabase save failed:", sbRes.reason);
    }
    saved = {
      local: localRes.status === "fulfilled",
      supabase: sbRes.status === "fulfilled" && sbRes.value === true,
    };
    if (!saved.local || !saved.supabase) {
      warning = `Học liệu đã được tạo nhưng chưa lưu đầy đủ (${[
        !saved.local ? "bộ nhớ cục bộ" : "",
        !saved.supabase ? "Supabase" : "",
      ]
        .filter(Boolean)
        .join(", ")}). Hãy sao chép nội dung để không bị mất.`;
    }
  }

  await recordUsageEvent({
    nguoi: {
      email: resource.teacher.email,
      ten: resource.teacher.name,
    },
    tinh_nang: body.postAction ? "tinh_chinh_hau_ky" : "sinh_hoc_lieu",
    so_lan: 1,
    so_phut: Math.max(5, Math.round(tool.estimatedMinutesSaved / 4)),
    cong_cu_id: tool.id,
    mon_hoc: subject,
    khoi_lop: grade,
    lop_hoc: classProfile?.className,
  });

  return {
    status: 200,
    payload: {
      ok: true,
      resource,
      ...(saved ? { saved } : {}),
      ...(warning ? { warning } : {}),
    },
  };
}

const encoder = new TextEncoder();
const GENERIC_ERROR =
  "Lỗi trong quá trình sinh học liệu. Vui lòng thử lại sau.";

/**
 * Streaming (opt-in qua header `Accept: text/event-stream` hoặc body `stream:true`).
 * Cách làm: giữ nguyên pipeline generatePedagogicalResource (không sửa smartGenerator),
 * chạy nó trong withLlmDeltaSink. callLiveLlm (đúng MỘT lần gọi LLM) đẩy từng delta
 * qua sink này -> route phát SSE `delta`; khi pipeline xong phát `done` với resource
 * đã dựng đầy đủ (sections, checklist, Supabase, lưu trữ). Không gọi LLM hai lần.
 */
export async function POST(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, "generate", 20, 60_000);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Dữ liệu gửi lên không phải JSON hợp lệ." },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Dữ liệu yêu cầu không hợp lệ. Vui lòng kiểm tra lại các trường nhập.",
      },
      { status: 400 },
    );
  }

  const wantsStream =
    parsed.data.stream === true ||
    (request.headers.get("accept") || "").includes("text/event-stream");

  if (!wantsStream) {
    try {
      const result = await executeGenerate(parsed.data);
      return NextResponse.json(result.payload, { status: result.status });
    } catch (err) {
      console.error("[generate] error:", err);
      return NextResponse.json(
        { ok: false, error: GENERIC_ERROR },
        { status: 500 },
      );
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(obj)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };
      try {
        const result = await withLlmDeltaSink(
          (text) => send({ type: "delta", text }),
          () => executeGenerate(parsed.data),
        );
        if (result.status === 200 && result.payload.ok) {
          const { ok: _ok, ...rest } = result.payload;
          void _ok;
          send({ type: "done", ...rest });
        } else {
          send({
            type: "error",
            error: String(result.payload.error || GENERIC_ERROR),
          });
        }
      } catch (err) {
        console.error("[generate] stream error:", err);
        send({ type: "error", error: GENERIC_ERROR });
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // đã đóng
          }
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
